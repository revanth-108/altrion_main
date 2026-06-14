import { z } from 'zod';

export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Please enter a valid email address');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const signupSchema = z
  .object({
    name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(50, 'Name must be less than 50 characters'),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const onboardingNameSchema = z.object({
  displayName: z
    .string()
    .min(2, 'Display name must be at least 2 characters')
    .max(30, 'Display name must be less than 30 characters'),
});

export const onboardingDetailsSchema = z.object({
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  phoneNumber: z
    .string()
    .min(10, 'Phone number must be 10 digits')
    .max(10, 'Phone number must be 10 digits')
    .regex(/^\d{10}$/, 'Phone number must be 10 digits'),
  zipCode: z
    .string()
    .min(5, 'ZIP code must be at least 5 digits')
    .max(10, 'ZIP code is too long')
    .regex(/^\d{5}(-\d{4})?$/, 'Enter a valid ZIP code'),
  employmentStatus: z.string().min(1, 'Please select your employment status'),
  annualIncome: z.string().min(1, 'Please select your annual income range'),
});

export const onboardingSchema = onboardingNameSchema.merge(onboardingDetailsSchema);

const today = new Date();
const oldestAllowedDate = new Date(today.getFullYear() - 120, today.getMonth(), today.getDate());
const youngestAllowedDate = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate());

export const onboardingDateOfBirthSchema = z.object({
  dateOfBirth: z
    .string()
    .min(1, 'Date of birth is required')
    .refine((value) => {
      const date = new Date(`${value}T00:00:00`);
      return !Number.isNaN(date.getTime()) && date >= oldestAllowedDate && date <= youngestAllowedDate;
    }, 'Enter a valid date of birth. You must be at least 13.'),
});

export const onboardingAnnualIncomeSchema = z.object({
  annualIncome: z
    .string()
    .min(1, 'Annual income is required')
    .refine((value) => {
      const normalized = value.replace(/[$,\s]/g, '');
      const amount = Number(normalized);
      return Number.isFinite(amount) && amount >= 0 && amount <= 1000000000;
    }, 'Enter a valid annual income.'),
});

export const onboardingIncomeSourceSchema = z.object({
  incomeSource: z.enum(['employment', 'self_employed', 'investment', 'retirement', 'other'], {
    message: 'Select an income source',
  }),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

// Type exports
export type LoginFormData = z.infer<typeof loginSchema>;
export type SignupFormData = z.infer<typeof signupSchema>;
export type OnboardingNameFormData = z.infer<typeof onboardingNameSchema>;
export type OnboardingDetailsFormData = z.infer<typeof onboardingDetailsSchema>;
export type OnboardingFormData = z.infer<typeof onboardingSchema>;
export type OnboardingDateOfBirthFormData = z.infer<typeof onboardingDateOfBirthSchema>;
export type OnboardingAnnualIncomeFormData = z.infer<typeof onboardingAnnualIncomeSchema>;
export type OnboardingIncomeSourceFormData = z.infer<typeof onboardingIncomeSourceSchema>;
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
