import type { PasswordRequirement } from '../types';

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePassword(password: string): boolean {
  return password.length >= 8 &&
         /[A-Z]/.test(password) &&
         /[0-9]/.test(password);
}

export function getPasswordRequirements(
  password: string,
  confirmPassword: string
): PasswordRequirement[] {
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Contains uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Contains number', met: /[0-9]/.test(password) },
    {
      label: 'Passwords match',
      met: password === confirmPassword && password.length > 0,
    },
  ];
}

export function validateName(name: string): boolean {
  return name.trim().length >= 2;
}
