export interface LoginFormData {
  email: string;
  password: string;
}

export interface SignupFormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface OnboardingFormData {
  displayName: string;
}

export interface PasswordRequirement {
  label: string;
  met: boolean;
}

export interface FormErrors {
  [key: string]: string;
}
