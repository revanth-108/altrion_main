import { forwardRef, useState, useCallback } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Input } from './Input';
import type { InputHTMLAttributes } from 'react';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  showStrength?: boolean;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ label = 'Password', error, showStrength = false, value, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    const toggleVisibility = useCallback(() => {
      setShowPassword((prev) => !prev);
    }, []);

    const password = typeof value === 'string' ? value : '';

    // Calculate password strength
    const getStrength = (pwd: string): { level: number; label: string; color: string } => {
      let score = 0;
      if (pwd.length >= 8) score++;
      if (pwd.length >= 12) score++;
      if (/[A-Z]/.test(pwd)) score++;
      if (/[a-z]/.test(pwd)) score++;
      if (/[0-9]/.test(pwd)) score++;
      if (/[^A-Za-z0-9]/.test(pwd)) score++;

      if (score <= 2) return { level: 1, label: 'Weak', color: 'bg-red-500' };
      if (score <= 4) return { level: 2, label: 'Medium', color: 'bg-yellow-500' };
      return { level: 3, label: 'Strong', color: 'bg-green-500' };
    };

    const strength = showStrength && password ? getStrength(password) : null;

    return (
      <div className="w-full">
        <div className="relative">
          <Input
            ref={ref}
            type={showPassword ? 'text' : 'password'}
            label={label}
            value={value}
            error={error}
            icon={<Lock size={18} />}
            {...props}
          />
          <button
            type="button"
            onClick={toggleVisibility}
            className="absolute right-12 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors z-20 p-1"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {/* Password strength indicator */}
        {strength && (
          <div className="mt-2">
            <div className="flex gap-1 mb-1">
              {[1, 2, 3].map((level) => (
                <div
                  key={level}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    level <= strength.level ? strength.color : 'bg-dark-border'
                  }`}
                />
              ))}
            </div>
            <p className={`text-xs ${
              strength.level === 1 ? 'text-red-400' :
              strength.level === 2 ? 'text-yellow-400' : 'text-green-400'
            }`}>
              {strength.label} password
            </p>
          </div>
        )}
      </div>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';
