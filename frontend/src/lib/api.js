import axios from 'axios';

// One place that knows where the API lives. This used to be hardcoded as
// http://127.0.0.1:8000 in 21 separate files, which meant the app could never
// run anywhere but the machine that built it.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:8000/api';

const AUTH_KEY = 'vendor_auth';

export function readStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Corrupt JSON in storage shouldn't take the whole app down.
    return null;
  }
}

export function storeAuth(auth, remember) {
  const raw = JSON.stringify(auth);
  clearStoredAuth();
  (remember ? localStorage : sessionStorage).setItem(AUTH_KEY, raw);
}

export function clearStoredAuth() {
  localStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(AUTH_KEY);
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const auth = readStoredAuth();
  if (auth?.token) {
    config.headers.Authorization = `Bearer ${auth.token}`;
  }
  return config;
});

// Lets AuthContext react to an expired session without this module importing React.
let onUnauthorized = null;
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearStoredAuth();
      if (onUnauthorized) onUnauthorized();
      else if (!window.location.pathname.startsWith('/auth')) window.location.href = '/auth';
    }
    return Promise.reject(error);
  },
);

/** Turn any axios failure into a sentence worth showing a shopkeeper. */
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  // FastAPI validation errors arrive as a list of {loc, msg}.
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d) => d.msg?.replace(/^Value error, /, '')).filter(Boolean).join('. ');
  }
  if (error?.code === 'ECONNABORTED') return 'The server took too long to respond.';
  if (error?.message === 'Network Error') {
    // A stopped server and a blocked origin are indistinguishable here -- the
    // browser withholds the response either way -- so name both. Saying only
    // "is the backend running?" sends people to check a server that is fine
    // while the real problem is that this page's origin is not allowed.
    const base = api.defaults.baseURL;
    return (
      `Cannot reach ${base} from ${window.location.origin}. ` +
      'Either the backend is not running, or this page\'s address is missing from ' +
      'CORS_ORIGINS in backend/.env (Vite moves to port 5174 when 5173 is taken).'
    );
  }
  return fallback;
}
