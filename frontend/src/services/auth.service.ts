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
    displayName: response.data.user.name?.split(' ')[0] || response.data.user.email.split('@')[0],
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
  displayName: data.user.name?.split(' ')[0] || data.user.email.split('@')[0],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const authService = {
  /**
   * Login with email and password
   */
  async login(credentials: LoginFormData): Promise<AuthResponse> {
    try {
      const { data } = await api.post<BackendAuthResponse>('/auth/signin', {
        email: credentials.email,
        password: credentials.password,
      });
      return transformAuthResponse(data);
    } catch (error) {
      if (error instanceof ApiError) {
        const errorData = error.data as { message?: string };
        const message = errorData?.message || 'Invalid credentials';
        throw new ApiError(error.status, message);
      }
      throw error;
    }
  },

  /**
   * Register a new user
   */
  async signup(data: SignupFormData): Promise<AuthResponse> {
    try {
      const { data: response } = await api.post<BackendAuthResponse>('/auth/signup', {
        email: data.email,
        password: data.password,
        name: data.name,
      });
      return transformAuthResponse(response);
    } catch (error) {
      if (error instanceof ApiError) {
        const errorData = error.data as { message?: string };
        const message = errorData?.message || 'Registration failed';
        throw new ApiError(error.status, message);
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
};

export default authService;
