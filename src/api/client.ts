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

/**
 * Safely redirects browser window to the login page if not already there.
 */
export const redirectToLogin = (): void => {
  if (typeof window !== 'undefined' && window.location) {
    try {
      const pathname = window.location.pathname || '';
      if (!pathname.includes('/login')) {
        if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
          return;
        }
        window.location.href = '/login';
      }
    } catch {
      // Safe fallback for testing environments
    }
  }
};

/**
 * Helper to translate common validation messages if received in English.
 */
const translateCommonValidationError = (msg: string): string => {
  if (!msg || typeof msg !== 'string') return '';
  const trimmed = msg.trim();
  if (/[\u0600-\u06FF]/.test(trimmed)) {
    return trimmed;
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes('required')) return 'هذا الحقل مطلوب.';
  if (lower.includes('email')) return 'صيغة البريد الإلكتروني غير صحيحة.';
  if (lower.includes('unique') || lower.includes('taken')) return 'هذه القيمة مستخدمة بالفعل.';
  if (lower.includes('numeric') || lower.includes('must be a number')) return 'يجب أن تكون القيمة رقماً.';
  if (lower.includes('min')) return 'القيمة أقل من الحد الأدنى المسموح.';
  if (lower.includes('max')) return 'القيمة أكبر من الحد الأقصى المسموح.';
  if (lower.includes('invalid')) return 'البيانات المدخلة غير صالحة.';
  return trimmed;
};

/**
 * Extracts and formats validation errors from 422 response data into a single coherent Arabic message.
 */
export const formatValidationErrors = (errors: unknown): string => {
  if (!errors) return '';

  const messages: string[] = [];

  const addMessage = (val: unknown) => {
    if (typeof val === 'string' && val.trim()) {
      messages.push(translateCommonValidationError(val));
    }
  };

  const collect = (target: unknown) => {
    if (!target) return;
    if (typeof target === 'string') {
      addMessage(target);
    } else if (Array.isArray(target)) {
      for (const item of target) {
        collect(item);
      }
    } else if (typeof target === 'object') {
      for (const val of Object.values(target as Record<string, unknown>)) {
        collect(val);
      }
    }
  };

  collect(errors);

  const uniqueMessages = Array.from(new Set(messages.filter(Boolean)));
  return uniqueMessages.join(' • ');
};

/**
 * Translates an API error into a standardized, user-friendly Arabic message based on HTTP status code.
 */
export const translateApiError = (error: any): string => {
  // 1. Internet / Network disconnect (!error.response)
  if (!error || !error.response) {
    return 'انقطع الاتصال بالإنترنت. تأكد من الشبكة وحاول مجدداً.';
  }

  const status = error.response.status;
  const data = error.response.data;

  // 2. Status code mapping
  switch (status) {
    case 401: {
      const isLoginOrPublic =
        error.config?.url?.includes('/auth/login') ||
        error.config?.url?.includes('/auth/demo-accounts');
      if (isLoginOrPublic && typeof data?.message === 'string' && /[\u0600-\u06FF]/.test(data.message)) {
        return data.message;
      }
      return 'انتهت الجلسة. يرجى تسجيل الدخول من جديد.';
    }

    case 403:
      return 'عفواً، لا تملك الصلاحية الكافية لإتمام هذا الإجراء.';

    case 404:
      return 'البيانات المطلوبة غير موجودة أو تم حذفها.';

    case 422: {
      const validationMerged = formatValidationErrors(data?.errors);
      if (validationMerged) {
        return validationMerged;
      }
      if (typeof data?.message === 'string' && /[\u0600-\u06FF]/.test(data.message)) {
        return data.message;
      }
      return 'بيانات غير صالحة. يرجى مراجعة الحقول المطلوبة والتأكد من صحة المدخلات.';
    }

    default:
      if (status >= 500) {
        return 'حدث عطل مؤقت في النظام. يرجى المحاولة بعد قليل.';
      }
      if (typeof data?.message === 'string' && /[\u0600-\u06FF]/.test(data.message)) {
        return data.message;
      }
      return 'حدث خطأ غير متوقع. يرجى المحاولة بعد قليل.';
  }
};

/**
 * Centralized response error interceptor handler.
 * Enriches the error object with the standardized Arabic translation, handles session expiry (401),
 * and enables components to immediately consume `error.message` with `toast.error(error.message)`.
 */
export const handleResponseError = (error: any) => {
  const isLoginOrPublicEndpoint =
    error?.config?.url?.includes('/auth/login') ||
    error?.config?.url?.includes('/auth/demo-accounts');

  if (error?.response && error.response.status === 401 && !isLoginOrPublicEndpoint) {
    markSessionExpired();
    removeToken();
    if (onUnauthenticatedCallback) {
      onUnauthenticatedCallback();
    }
    redirectToLogin();
  }

  const translatedMessage = translateApiError(error);

  if (error && typeof error === 'object') {
    try {
      error.message = translatedMessage;
    } catch {
      try {
        Object.defineProperty(error, 'message', {
          value: translatedMessage,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } catch {
        // Safe fallback
      }
    }

    (error as any).translatedMessage = translatedMessage;

    if (error.response && typeof error.response === 'object') {
      if (!error.response.data || typeof error.response.data !== 'object') {
        error.response.data = { message: translatedMessage };
      } else {
        error.response.data.message = translatedMessage;
      }
    }
  }

  return Promise.reject(error);
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
  handleResponseError
);

export default apiClient;
