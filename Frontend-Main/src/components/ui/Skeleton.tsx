import { motion } from 'framer-motion';
import type { HTMLAttributes } from 'react';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  variant = 'text',
  width,
  height,
  animation = 'pulse',
  className = '',
  style,
  ...props
}: SkeletonProps) {
  const baseStyles = 'bg-dark-elevated';
  
  const variantStyles = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
    rounded: 'rounded-lg',
  };

  const animationStyles = {
    pulse: 'animate-pulse',
    wave: '',
    none: '',
  };

  const defaultDimensions = {
    text: { width: '100%', height: '1rem' },
    circular: { width: '40px', height: '40px' },
    rectangular: { width: '100%', height: '100px' },
    rounded: { width: '100%', height: '100px' },
  };

  const finalWidth = width ?? defaultDimensions[variant].width;
  const finalHeight = height ?? defaultDimensions[variant].height;

  if (animation === 'wave') {
    return (
      <div
        className={`${baseStyles} ${variantStyles[variant]} ${className} overflow-hidden relative`}
        style={{
          width: finalWidth,
          height: finalHeight,
          ...style,
        }}
        {...props}
      >
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          animate={{ x: ['-100%', '100%'] }}
          transition={{
            repeat: Infinity,
            duration: 1.5,
            ease: 'linear',
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`${baseStyles} ${variantStyles[variant]} ${animationStyles[animation]} ${className}`}
      style={{
        width: finalWidth,
        height: finalHeight,
        ...style,
      }}
      {...props}
    />
  );
}

// Pre-built skeleton compositions
export function CardSkeleton() {
  return (
    <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="space-y-2 flex-1">
          <Skeleton variant="text" width="60%" height={16} />
          <Skeleton variant="text" width="40%" height={12} />
        </div>
      </div>
      <Skeleton variant="rounded" height={120} />
      <div className="space-y-2">
        <Skeleton variant="text" width="100%" />
        <Skeleton variant="text" width="80%" />
      </div>
    </div>
  );
}

export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="border-b border-dark-border/50">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-5 py-4">
          <Skeleton variant="text" width={i === 0 ? '80%' : '60%'} />
        </td>
      ))}
    </tr>
  );
}

export function ChartSkeleton() {
  return (
    <div className="bg-dark-card border border-dark-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Skeleton variant="circular" width={40} height={40} />
          <div className="space-y-2">
            <Skeleton variant="text" width={120} height={16} />
            <Skeleton variant="text" width={80} height={12} />
          </div>
        </div>
        <Skeleton variant="rounded" width={200} height={32} />
      </div>
      <Skeleton variant="rounded" height={200} animation="wave" />
    </div>
  );
}
