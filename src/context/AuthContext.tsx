import React, { createContext, useContext, useEffect, useState } from 'react';
import { getMeApi, loginApi, logoutApi } from '../api/auth';
import { setOnUnauthenticated } from '../api/client';
import { LoginCredentials, User } from '../types/auth';
import {
  clearSessionExpired,
  getStoredUser,
  getToken,
  hasSessionExpired,
  removeStoredUser,
  removeToken,
  setStoredUser,
  setToken as saveToken,
} from '../utils/authStorage';
import { hasPermission as checkPermission, hasRole as checkRole } from '../utils/permissions';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionExpired: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (roleSlug: string) => boolean;
  hasPermission: (permissionSlug: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => getStoredUser<User>());
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(getToken() && !getStoredUser()));
  const [sessionExpired, setSessionExpired] = useState<boolean>(hasSessionExpired());

  const handleUnauthenticated = () => {
    setUser(null);
    setTokenState(null);
    removeToken();
    removeStoredUser();
    setSessionExpired(hasSessionExpired());
  };

  useEffect(() => {
    setOnUnauthenticated(handleUnauthenticated);

    const initAuth = async () => {
      const storedToken = getToken();
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const currentUser = await getMeApi();
        setUser(currentUser);
        setStoredUser(currentUser);
        setTokenState(storedToken);
      } catch (err: any) {
        // ONLY log out if the backend explicitly returned a 401 Unauthorized (token deleted / revoked in DB)
        if (err?.response?.status === 401) {
          handleUnauthenticated();
        }
        // If it's a network drop, offline, timeout, or server reboot:
        // KEEP USER LOGGED IN using stored session!
      } finally {
        setSessionExpired(hasSessionExpired());
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (credentials: LoginCredentials): Promise<void> => {
    setIsLoading(true);
    try {
      const response = await loginApi(credentials);
      saveToken(response.token);
      setStoredUser(response.user);
      clearSessionExpired();
      setSessionExpired(false);
      setTokenState(response.token);
      setUser(response.user);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      if (token) {
        await logoutApi();
      }
    } catch {
      // Ignore network errors during logout
    } finally {
      clearSessionExpired();
      setSessionExpired(false);
      handleUnauthenticated();
      setIsLoading(false);
    }
  };

  const userHasRole = (roleSlug: string): boolean => {
    return checkRole(user, roleSlug);
  };

  const userHasPermission = (permissionSlug: string): boolean => {
    return checkPermission(user, permissionSlug);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        sessionExpired,
        login,
        logout,
        hasRole: userHasRole,
        hasPermission: userHasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useOptionalAuth = (): AuthContextType | undefined => {
  return useContext(AuthContext);
};

