import { motion } from 'framer-motion';
import type { ReactNode, ComponentPropsWithoutRef } from 'react';

interface CardProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode;
  variant?: 'default' | 'elevated' | 'bordered';
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({
  children,
  variant = 'default',
  hover = false,
  padding = 'md',
  className = '',
}: CardProps) {
  const variants = {
    default: 'bg-dark-card',
    elevated: 'bg-dark-elevated',
    bordered: 'bg-dark-card border border-dark-border',
  };

  const paddings = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  return (
    <motion.div
      whileHover={hover ? { scale: 1.02, y: -2 } : undefined}
      className={`
        ${variants[variant]}
        ${paddings[padding]}
        rounded-2xl
        transition-shadow duration-200
        ${hover ? 'cursor-pointer hover:shadow-lg hover:shadow-altrion-500/10' : ''}
        ${className}
      `}
    >
      {children}
    </motion.div>
  );
}
