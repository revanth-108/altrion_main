import { api, ApiError } from './api';
import type { User, AuthResponse } from '@/types';
import type { LoginFormData, SignupFormData } from '@/schemas';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Backend user shape shared across auth endpoints
interface BackendUser {
  id: string;
  name: string;
  nickname?: string | null;
  email: string;
  avatar: string | null;
  role?: string | null;
  provider: string;
  isEmailVerified: boolean;
  date_of_birth?: string | null;
  annual_income?: number | null;
  income_source?: string | null;
  years_to_retirement?: number | null;
}

// Backend response types (matching actual backend structure)
interface BackendAuthResponse {
  success: boolean;
  message: string;
  data: {
    user: BackendUser;
    accessToken?: string | null;
    refreshToken?: string | null;
    requiresEmailVerification?: boolean;
  };
}

interface BackendUserResponse {
  success: boolean;
  data: {
    user: BackendUser;
  };
}

const mapBackendUser = (u: BackendUser): User => ({
  id: u.id,
  email: u.email,
  name: u.name,
  nickname: u.nickname || undefined,
  role: u.role || undefined,
  displayName: u.nickname || u.name?.split(' ')[0] || u.email.split('@')[0],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  dateOfBirth: u.date_of_birth || undefined,
  annualIncome: u.annual_income ?? undefined,
  incomeSource: (u.income_source as User['incomeSource']) || undefined,
  yearsToRetirement: u.years_to_retirement ?? undefined,
});

// Transform backend response to frontend format
const transformAuthResponse = (response: BackendAuthResponse): AuthResponse => ({
  user: mapBackendUser(response.data.user),
  tokens: response.data.accessToken && response.data.refreshToken ? {
    accessToken: response.data.accessToken,
    refreshToken: response.data.refreshToken,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  } : undefined,
  emailVerificationRequired: !!response.data.requiresEmailVerification || !(response.data.accessToken && response.data.refreshToken),
  message: response.message,
});

const transformUser = (data: BackendUserResponse['data']): User => mapBackendUser(data.user);

const realAuthService = {
  /**
   * Login with email and password
   */
  async login(credentials: LoginFormData): Promise<AuthResponse> {
    try {
      const normalizedEmail = credentials.email.trim().toLowerCase();
      const { data } = await api.post<BackendAuthResponse>('/auth/signin', {
        email: normalizedEmail,
        password: credentials.password,
      });
      return transformAuthResponse(data);
    } catch (error) {
      console.error('[Auth Service] Login error:', error);
      if (error instanceof ApiError) {
        const errorData = error.data as { message?: string; detail?: string; success?: boolean };
        const message = errorData?.detail || errorData?.message || 'Invalid credentials';
        throw new ApiError(error.status, message, errorData);
      }
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Cannot connect to server. Please check your internet connection and try again.');
      }
      throw error;
    }
  },

  /**
   * Register a new user
   */
  async signup(data: SignupFormData): Promise<AuthResponse> {
    try {
      const normalizedEmail = data.email.trim().toLowerCase();
      const { data: response } = await api.post<BackendAuthResponse>('/auth/signup', {
        email: normalizedEmail,
        password: data.password,
        name: data.name.trim(),
      });
      return transformAuthResponse(response);
    } catch (error) {
      console.error('[Auth Service] Signup error:', error);
      if (error instanceof ApiError) {
        const errorData = error.data as { message?: string; detail?: string; success?: boolean };
        const message = errorData?.detail || errorData?.message || 'Registration failed';
        throw new ApiError(error.status, message, errorData);
      }
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Cannot connect to server. Please check your internet connection and try again.');
      }
      throw error;
    }
  },

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      // Ignore logout errors - clear local state anyway
      console.warn('Logout API call failed:', error);
    }
  },

  /**
   * Refresh authentication tokens
   */
  async refreshToken(_refreshToken: string): Promise<AuthResponse> {
    // Backend doesn't have refresh endpoint yet - return current user
    const user = await this.getCurrentUser();
    return {
      user,
      tokens: {
        accessToken: _refreshToken,
        refreshToken: _refreshToken,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      },
      emailVerificationRequired: false,
    };
  },

  /**
   * Get current user profile
   */
  async getCurrentUser(): Promise<User> {
    const { data } = await api.get<BackendUserResponse>('/auth/me');
    return transformUser(data.data);
  },

  /**
   * Request password reset
   */
  async forgotPassword(email: string): Promise<void> {
    await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
  },

  /**
   * Reset password with token
   */
  async resetPassword(tokens: {
    accessToken: string;
    refreshToken: string;
    password: string;
  }): Promise<AuthResponse> {
    const { data } = await api.post<BackendAuthResponse>('/auth/reset-password', {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      password: tokens.password,
    });
    return transformAuthResponse(data);
  },

  /**
   * OAuth login initiation - redirects to backend OAuth URL
   */
  async oauthLogin(provider: 'google'): Promise<string> {
    return `${API_BASE_URL}/auth/${provider}`;
  },

  async exchangeOAuthCode(code: string): Promise<void> {
    const params = new URLSearchParams({ code });
    window.location.replace(`${API_BASE_URL}/auth/callback?${params.toString()}`);
  },

  async completeOAuth(tokens: { accessToken: string; refreshToken: string }): Promise<AuthResponse> {
    const { data } = await api.post<BackendAuthResponse>('/auth/oauth/complete', {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    return transformAuthResponse(data);
  },

  /**
   * Update user nickname
   */
  async updateNickname(nickname: string): Promise<User> {
    const { data } = await api.post<BackendUserResponse>('/auth/nickname', { nickname });
    return transformUser(data.data);
  },

  /**
   * Update user profile (name, date_of_birth, annual_income, etc.)
   */
  async updateProfile(updates: {
    name?: string;
    date_of_birth?: string;
    annual_income?: number;
    income_source?: string;
    years_to_retirement?: number;
    data_storage_consent?: boolean;
  }): Promise<User> {
    const { data } = await api.patch<BackendUserResponse>('/auth/profile', updates);
    return transformUser(data.data);
  },

  async resendVerification(email: string): Promise<void> {
    await api.post('/auth/resend-verification', { email: email.trim().toLowerCase() });
  },
};

// Dev-only mock implementation toggle
const useMockAuth = import.meta.env.VITE_USE_MOCK_AUTH === 'true';

const mockAuthService = {
  async login(credentials: LoginFormData): Promise<AuthResponse> {
    if (!credentials.email) throw new ApiError(400, 'Email required for mock login');
    const mockResponse = {
      data: {
        user: { id: 'mock-id', name: credentials.email.split('@')[0], email: credentials.email, avatar: null, role: 'user', provider: 'mock', isEmailVerified: true },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      },
      success: true,
      message: 'Mock login',
    } as unknown as BackendAuthResponse;
    return transformAuthResponse(mockResponse);
  },

  async signup(data: SignupFormData): Promise<AuthResponse> {
    const mockResponse = {
      data: {
        user: { id: 'mock-id', name: data.name || data.email.split('@')[0], email: data.email, avatar: null, role: 'user', provider: 'mock', isEmailVerified: true },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      },
      success: true,
      message: 'Mock signup',
    } as unknown as BackendAuthResponse;
    return transformAuthResponse(mockResponse);
  },

  async logout(): Promise<void> {
    return;
  },

  async refreshToken(_refreshToken: string): Promise<AuthResponse> {
    const user = await mockAuthService.getCurrentUser();
    return {
      user,
      tokens: {
        accessToken: _refreshToken,
        refreshToken: _refreshToken,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      },
    };
  },

  async getCurrentUser(): Promise<User> {
    return {
      id: 'mock-id',
      email: 'mock@example.com',
      name: 'Mock User',
      displayName: 'Mock',
      role: 'user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as User;
  },

  async forgotPassword(_email: string): Promise<void> {
    throw new ApiError(501, 'Password reset not implemented yet');
  },

  async resetPassword(tokens: {
    accessToken: string;
    refreshToken: string;
    password: string;
  }): Promise<AuthResponse> {
    return realAuthService.resetPassword(tokens);
  },

  async oauthLogin(provider: 'google'): Promise<string> {
    return `${API_BASE_URL}/auth/${provider}`;
  },

  async exchangeOAuthCode(_code: string): Promise<void> {
    const redirectUrl = new URL(window.location.href);
    redirectUrl.search = '';
    redirectUrl.hash = 'access_token=mock-access-token&refresh_token=mock-refresh-token';
    window.location.replace(redirectUrl.toString());
  },

  async completeOAuth(_tokens: { accessToken: string; refreshToken: string }): Promise<AuthResponse> {
    const user = await mockAuthService.getCurrentUser();
    return {
      user,
      tokens: {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      },
    };
  },

  async updateNickname(nickname: string): Promise<User> {
    return {
      id: 'mock-id',
      email: 'mock@example.com',
      name: 'Mock User',
      nickname,
      displayName: nickname,
      role: 'user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as User;
  },

  async updateProfile(_updates: object): Promise<User> {
    return mockAuthService.getCurrentUser();
  },

  async resendVerification(_email: string): Promise<void> {
    return;
  },
};

export const authService = useMockAuth ? mockAuthService : realAuthService;
export default authService;
