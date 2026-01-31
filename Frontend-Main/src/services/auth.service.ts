import { api, ApiError } from './api';
import type { User, AuthResponse } from '@/types';
import type { LoginFormData, SignupFormData } from '@/schemas';

// Backend response types (matching actual backend structure)
interface BackendAuthResponse {
  success: boolean;
  message: string;
  data: {
    user: {
      id: string;
      name: string;
      nickname?: string | null;
      email: string;
      avatar: string | null;
      provider: string;
      isEmailVerified: boolean;
    };
    accessToken: string;
    refreshToken: string;
  };
}

interface BackendUserResponse {
  success: boolean;
  data: {
    user: {
      id: string;
      name: string;
      nickname?: string | null;
      email: string;
      avatar: string | null;
      provider: string;
      isEmailVerified: boolean;
    };
  };
}

// Transform backend response to frontend format
const transformAuthResponse = (response: BackendAuthResponse): AuthResponse => ({
  user: {
    id: response.data.user.id,
    email: response.data.user.email,
    name: response.data.user.name,
    nickname: response.data.user.nickname || undefined,
    displayName: response.data.user.nickname
      || response.data.user.name?.split(' ')[0]
      || response.data.user.email.split('@')[0],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  tokens: {
    accessToken: response.data.accessToken,
    refreshToken: response.data.refreshToken,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  },
});

const transformUser = (data: BackendUserResponse['data']): User => ({
  id: data.user.id,
  email: data.user.email,
  name: data.user.name,
  nickname: data.user.nickname || undefined,
  displayName: data.user.nickname
    || data.user.name?.split(' ')[0]
    || data.user.email.split('@')[0],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const realAuthService = {
  /**
   * Login with email and password
   */
  async login(credentials: LoginFormData): Promise<AuthResponse> {
    try {
      console.log('[Auth Service] Attempting login to:', import.meta.env.VITE_API_URL || '/api');
      const { data } = await api.post<BackendAuthResponse>('/auth/signin', {
        email: credentials.email,
        password: credentials.password,
      });
      console.log('[Auth Service] Login successful');
      return transformAuthResponse(data);
    } catch (error) {
      console.error('[Auth Service] Login error:', error);
      if (error instanceof ApiError) {
        const errorData = error.data as { message?: string; success?: boolean };
        const message = errorData?.message || 'Invalid credentials';
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
      console.log('[Auth Service] Attempting signup to:', import.meta.env.VITE_API_URL || '/api');
      const { data: response } = await api.post<BackendAuthResponse>('/auth/signup', {
        email: data.email,
        password: data.password,
        name: data.name,
      });
      console.log('[Auth Service] Signup successful');
      return transformAuthResponse(response);
    } catch (error) {
      console.error('[Auth Service] Signup error:', error);
      if (error instanceof ApiError) {
        const errorData = error.data as { message?: string; success?: boolean };
        const message = errorData?.message || 'Registration failed';
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
  async forgotPassword(_email: string): Promise<void> {
    // TODO: Implement when backend supports it
    throw new ApiError(501, 'Password reset not implemented yet');
  },

  /**
   * Reset password with token
   */
  async resetPassword(_token: string, _password: string): Promise<void> {
    // TODO: Implement when backend supports it
    throw new ApiError(501, 'Password reset not implemented yet');
  },

  /**
   * OAuth login initiation - redirects to backend OAuth URL
   */
  async oauthLogin(provider: 'google' | 'github'): Promise<string> {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    return `${apiUrl}/auth/${provider}`;
  },

  /**
   * Update user nickname
   */
  async updateNickname(nickname: string): Promise<User> {
    const { data } = await api.post<BackendUserResponse>('/auth/nickname', { nickname });
    return transformUser(data.data);
  },
};

// Dev-only mock implementation toggle
const useMockAuth = import.meta.env.VITE_USE_MOCK_AUTH === 'true';

const mockAuthService = {
  async login(credentials: LoginFormData): Promise<AuthResponse> {
    if (!credentials.email) throw new ApiError(400, 'Email required for mock login');
    const mockResponse = {
      data: {
        user: { id: 'mock-id', name: credentials.email.split('@')[0], email: credentials.email, avatar: null, provider: 'mock', isEmailVerified: true },
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
        user: { id: 'mock-id', name: data.name || data.email.split('@')[0], email: data.email, avatar: null, provider: 'mock', isEmailVerified: true },
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as User;
  },

  async forgotPassword(_email: string): Promise<void> {
    throw new ApiError(501, 'Password reset not implemented yet');
  },

  async resetPassword(_token: string, _password: string): Promise<void> {
    throw new ApiError(501, 'Password reset not implemented yet');
  },

  async oauthLogin(provider: 'google' | 'github'): Promise<string> {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    return `${apiUrl}/auth/${provider}`;
  },
};

export const authService = useMockAuth ? mockAuthService : realAuthService;
export default authService;
