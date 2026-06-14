export interface User {
  id: string;
  email: string;
  name: string;
  nickname?: string;
  displayName?: string;
  avatar?: string;
  role?: string;
  createdAt: string;
  updatedAt: string;
  dateOfBirth?: string;       // ISO date string YYYY-MM-DD
  annualIncome?: number;      // USD
  incomeSource?: 'employment' | 'self_employed' | 'investment' | 'retirement' | 'other';
  yearsToRetirement?: number;
  dataStorageConsent?: boolean;
  dataStorageConsentAt?: string;
  dataStorageConsentVersion?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AuthResponse {
  user: User;
  tokens?: AuthTokens;
  emailVerificationRequired?: boolean;
  message?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}
