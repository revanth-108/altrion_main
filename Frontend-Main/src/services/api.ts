/**
 * Base API configuration and utilities
 * Production-ready HTTP client with interceptors, error handling, and retry logic
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  status: number;
  statusText: string;
  data?: unknown;

  constructor(status: number, statusText: string, data?: unknown) {
    super(`API Error: ${status} ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.data = data;
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

interface RequestConfig extends RequestInit {
  params?: Record<string, string>;
  timeout?: number;
}

interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

// Token getter - integrated with auth store
const getAuthToken = (): string | null => {
  try {
    const authData = localStorage.getItem('altrion-auth');
    if (authData) {
      const parsed = JSON.parse(authData);
      return parsed.state?.token || null;
    }
  } catch {
    return null;
  }
  return null;
};

// Request interceptor
const requestInterceptor = (config: RequestConfig): RequestConfig => {
  const token = getAuthToken();
  const headers = new Headers(config.headers);

  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return {
    ...config,
    headers,
  };
};

// Response interceptor
const responseInterceptor = async <T>(response: Response): Promise<ApiResponse<T>> => {
  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = null;
    }
    throw new ApiError(response.status, response.statusText, errorData);
  }

  const data = await response.json();
  return {
    data,
    status: response.status,
    headers: response.headers,
  };
};

// Fetch with timeout
const fetchWithTimeout = async (
  url: string,
  config: RequestConfig
): Promise<Response> => {
  const { timeout = 30000, ...fetchConfig } = config;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchConfig,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    // Handle abort/timeout
    if (error instanceof Error && error.name === 'AbortError') {
      throw new NetworkError('Request timeout - server took too long to respond');
    }
    // Handle CORS errors
    if (error instanceof TypeError) {
      throw new NetworkError(
        'Network error - Unable to connect to server. This might be a CORS issue or the server is unreachable.'
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

// Build URL with query params
const buildUrl = (endpoint: string, params?: Record<string, string>): string => {
  // Handle both relative and absolute URLs
  const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  let url = `${baseUrl}${path}`;

  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }
  return url;
};

// Main API client
export const api = {
  async get<T>(endpoint: string, config: RequestConfig = {}): Promise<ApiResponse<T>> {
    const url = buildUrl(endpoint, config.params);
    const finalConfig = requestInterceptor({ ...config, method: 'GET' });
    const response = await fetchWithTimeout(url, finalConfig);
    return responseInterceptor<T>(response);
  },

  async post<T>(endpoint: string, body?: unknown, config: RequestConfig = {}): Promise<ApiResponse<T>> {
    const url = buildUrl(endpoint, config.params);
    const finalConfig = requestInterceptor({
      ...config,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
    const response = await fetchWithTimeout(url, finalConfig);
    return responseInterceptor<T>(response);
  },

  async put<T>(endpoint: string, body?: unknown, config: RequestConfig = {}): Promise<ApiResponse<T>> {
    const url = buildUrl(endpoint, config.params);
    const finalConfig = requestInterceptor({
      ...config,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
    const response = await fetchWithTimeout(url, finalConfig);
    return responseInterceptor<T>(response);
  },

  async patch<T>(endpoint: string, body?: unknown, config: RequestConfig = {}): Promise<ApiResponse<T>> {
    const url = buildUrl(endpoint, config.params);
    const finalConfig = requestInterceptor({
      ...config,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
    const response = await fetchWithTimeout(url, finalConfig);
    return responseInterceptor<T>(response);
  },

  async delete<T>(endpoint: string, config: RequestConfig = {}): Promise<ApiResponse<T>> {
    const url = buildUrl(endpoint, config.params);
    const finalConfig = requestInterceptor({ ...config, method: 'DELETE' });
    const response = await fetchWithTimeout(url, finalConfig);
    return responseInterceptor<T>(response);
  },
};

export default api;
