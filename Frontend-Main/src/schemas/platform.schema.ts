import { z } from 'zod';

export const platformCredentialsSchema = z.object({
  username: z
    .string()
    .min(1, 'Username or email is required'),
  password: z
    .string()
    .min(1, 'Password is required'),
  twoFactorCode: z
    .string()
    .length(6, 'Two-factor code must be 6 digits')
    .optional(),
});

export const apiKeySchema = z.object({
  apiKey: z
    .string()
    .min(10, 'API key is required'),
  apiSecret: z
    .string()
    .min(10, 'API secret is required')
    .optional(),
  passphrase: z
    .string()
    .optional(),
});

// Validate navigation state from SelectWallets to ConnectAPI
export const connectNavigationStateSchema = z.object({
  platforms: z.array(z.string()).min(1, 'At least one platform must be selected'),
});

export type PlatformCredentials = z.infer<typeof platformCredentialsSchema>;
export type ApiKeyCredentials = z.infer<typeof apiKeySchema>;
export type ConnectNavigationState = z.infer<typeof connectNavigationStateSchema>;
