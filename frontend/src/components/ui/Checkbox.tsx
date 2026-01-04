import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Check, Minus } from 'lucide-react';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  indeterminate?: boolean;
  disabled?: boolean;
  label?: string;
  id?: string;
}

export function Checkbox({
  checked,
  onChange,
  indeterminate = false,
  disabled = false,
  label,
  id,
}: CheckboxProps) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  // Set indeterminate state (can't be set via HTML attribute)
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const handleChange = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <motion.div
        whileTap={{ scale: disabled ? 1 : 0.9 }}
        className="inline-flex items-center"
      >
        <div className="relative">
          <input
            ref={checkboxRef}
            type="checkbox"
            id={id}
            checked={checked}
            onChange={handleChange}
            disabled={disabled}
            className="sr-only"
          />
          <motion.div
            onClick={handleChange}
            className={`
              w-5 h-5 rounded-md border-2 flex items-center justify-center cursor-pointer transition-all
              ${
                checked || indeterminate
                  ? 'bg-altrion-500 border-altrion-500'
                  : 'bg-transparent border-dark-border hover:border-altrion-400'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {indeterminate ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.15 }}
              >
                <Minus size={14} className="text-text-primary" strokeWidth={3} />
              </motion.div>
            ) : checked ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.15 }}
              >
                <Check size={14} className="text-text-primary" strokeWidth={3} />
              </motion.div>
            ) : null}
          </motion.div>
        </div>
      </motion.div>
      {label && (
        <label
          htmlFor={id}
          className={`text-sm text-text-primary ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          onClick={handleChange}
        >
          {label}
        </label>
      )}
    </div>
  );
}
