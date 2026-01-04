import { motion } from 'framer-motion';
import { forwardRef, useState } from 'react';
import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = '', value, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const hasValue = value !== undefined && value !== '';
    const isActive = isFocused || hasValue;

    return (
      <div className="w-full">
        <div className="relative">
          {/* Label on Border */}
          {label && (
            <motion.label
              initial={false}
              animate={{
                top: isActive ? '-1px' : '50%',
                fontSize: isActive ? '12px' : '15px',
                translateY: isActive ? '-50%' : '-50%',
              }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className={`
                absolute left-3 px-2 pointer-events-none z-10
                font-medium transition-colors duration-200
                ${isActive ? 'text-altrion-400' : 'text-text-muted'}
                ${error ? 'text-error' : ''}
              `}
              style={{
                transformOrigin: 'left center',
                backgroundColor: 'var(--color-dark-bg)',
              }}
            >
              {label}
            </motion.label>
          )}

          {/* Icon */}
          {icon && (
            <div className={`
              absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 z-10
              pointer-events-none flex items-center justify-center
              transition-colors duration-200
              ${isFocused ? 'text-altrion-400' : ''}
            `}>
              <div className="w-[18px] h-[18px] flex items-center justify-center">
                {icon}
              </div>
            </div>
          )}

          {/* Input */}
          <input
            ref={ref}
            value={value}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={`
              w-full bg-transparent border-2 rounded-lg
              h-12
              px-3 text-text-primary text-[15px]
              focus:outline-none transition-all duration-200
              ${error
                ? 'border-error focus:border-error'
                : isFocused
                  ? 'border-altrion-500'
                  : 'border-dark-border hover:border-dark-border-hover'
              }
              ${className}
            `}
            style={icon ? { paddingRight: '2.75rem' } : {}}
            {...props}
          />
        </div>

        {/* Error Message */}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-error text-xs mt-1.5 ml-1"
          >
            {error}
          </motion.p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
