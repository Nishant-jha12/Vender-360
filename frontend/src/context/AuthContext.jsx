import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearStoredAuth, readStoredAuth, setUnauthorizedHandler, storeAuth } from '../lib/api';

/**
 * Session state in one place.
 *
 * getAuthData() used to be copy-pasted into ten files, each parsing localStorage
 * by hand, and nothing ever checked whether the stored token was still valid.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => readStoredAuth());
  const [vendor, setVendor] = useState(null);
  const [checking, setChecking] = useState(Boolean(readStoredAuth()));

  const logout = useCallback(() => {
    clearStoredAuth();
    setAuth(null);
    setVendor(null);
  }, []);

  const login = useCallback((payload, remember) => {
    const record = {
      token: payload.token,
      vendor_id: payload.vendor_id,
      name: payload.name,
      store_name: payload.store_name,
    };
    storeAuth(record, remember);
    setAuth(record);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuth(null);
      setVendor(null);
    });
  }, []);

  // Confirm a stored token still works before trusting it. Previously any
  // string in localStorage was treated as a valid session.
  useEffect(() => {
    let cancelled = false;
    if (!auth?.token) {
      setVendor(null);
      setChecking(false);
      return undefined;
    }

    setChecking(true);
    api
      .get('/auth/me')
      .then((res) => {
        if (!cancelled) setVendor(res.data);
      })
      .catch((error) => {
        // A 401 is handled by the interceptor. Anything else (backend down)
        // shouldn't sign the shopkeeper out mid-shift.
        if (!cancelled && error?.response?.status !== 401) setVendor(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [auth?.token]);

  const refreshVendor = useCallback(async () => {
    const res = await api.get('/vendor/me');
    setVendor(res.data);
    return res.data;
  }, []);

  const value = useMemo(
    () => ({
      auth,
      vendor,
      checking,
      isAuthenticated: Boolean(auth?.token),
      login,
      logout,
      refreshVendor,
      setVendor,
      // Falls back to the name captured at login so the header has something
      // to show before /auth/me returns.
      displayName: vendor?.name || auth?.name || '',
      storeName: vendor?.store_name || auth?.store_name || 'Your Store',
    }),
    [auth, vendor, checking, login, logout, refreshVendor],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
