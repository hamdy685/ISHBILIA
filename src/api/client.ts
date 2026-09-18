import axios, { AxiosRequestConfig } from 'axios';
import { getToken, markSessionExpired, removeToken, getStoredUser } from '../utils/authStorage';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const apiClient = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

type CachedGetEntry = {
  expiresAt: number;
  value: unknown;
};

const cachedGets = new Map<string, CachedGetEntry>();
const pendingGets = new Map<string, Promise<unknown>>();

const getCacheKey = (url: string, config?: AxiosRequestConfig) => {
  const token = getToken();
  const authScope = token ? token.slice(-12) : 'guest';
  return `${authScope}:${url}:${JSON.stringify(config?.params ?? {})}`;
};

/**
 * Short-lived, session-scoped GET cache for reference data. Mutations should
 * call invalidateCachedGet with the related URL prefix after they succeed.
 */
export const cachedGetData = async <T>(url: string, config?: AxiosRequestConfig, ttlMs = 15000): Promise<T> => {
  const key = getCacheKey(url, config);
  const now = Date.now();
  const cached = cachedGets.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const pending = pendingGets.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const request = apiClient.get<T>(url, config)
    .then((response) => {
      cachedGets.set(key, { value: response.data, expiresAt: Date.now() + ttlMs });
      return response.data;
    })
    .finally(() => {
      pendingGets.delete(key);
    });

  pendingGets.set(key, request);
  return request;
};

export const invalidateCachedGet = (urlPrefix?: string) => {
  if (!urlPrefix) {
    cachedGets.clear();
    return;
  }

  for (const key of cachedGets.keys()) {
    if (key.includes(`:${urlPrefix}:`)) {
      cachedGets.delete(key);
    }
  }
};

// Request Interceptor: Attach Sanctum Bearer Token
apiClient.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401 & 403 status codes
let onUnauthenticatedCallback: (() => void) | null = null;

export const setOnUnauthenticated = (callback: () => void) => {
  onUnauthenticatedCallback = callback;
};

/**
 * Strips sensitive commercial & financial data (supplier quotes, unit prices, total costs)
 * from API responses when accessed by non-financial operational roles (e.g. Employee, Reviewer).
 *
 * CRITICAL SECURITY NOTE:
 * Commercial confidentiality must be strictly enforced at the Backend layer via API Resources
 * and Policy Authorization checks. This frontend sanitization provides defense-in-depth protection
 * to guarantee that no financial or quote data is leaked into UI state or memory.
 */
export const stripFinancialData = (target: any): void => {
  if (!target || typeof target !== 'object') return;

  if (Array.isArray(target)) {
    for (const item of target) {
      stripFinancialData(item);
    }
    return;
  }

  // Strip specified sensitive financial fields
  delete target.unit_price;
  delete target.total_cost;
  delete target.supplier_quotes;

  for (const key of Object.keys(target)) {
    if (target[key] && typeof target[key] === 'object') {
      stripFinancialData(target[key]);
    }
  }
};

apiClient.interceptors.response.use(
  (response) => {
    // Defense-in-depth: strip sensitive financial data for operational roles (employee, reviewer)
    const user = getStoredUser();
    if (user && user.roles) {
      const roleSlugs = Array.isArray(user.roles)
        ? user.roles.map((r: any) => (typeof r === 'string' ? r : r.slug))
        : [];
      const isPrivilegedFinancialRole = roleSlugs.some((r: string) =>
        ['procurement_manager', 'accountant', 'site_accountant', 'licenses_accountant', 'buffet_accountant', 'general_manager', 'admin'].includes(r)
      );
      if (!isPrivilegedFinancialRole && response.data) {
        stripFinancialData(response.data);
      }
    }
    return response;
  },
  (error) => {
    const isLoginOrPublicEndpoint =
      error.config?.url?.includes('/auth/login') ||
      error.config?.url?.includes('/auth/demo-accounts');

    if (error.response && error.response.status === 401 && !isLoginOrPublicEndpoint) {
      markSessionExpired();
      removeToken();
      if (!getToken() && onUnauthenticatedCallback) {
        onUnauthenticatedCallback();
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
