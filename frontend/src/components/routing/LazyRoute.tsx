import { Suspense, type ComponentType, type ReactNode } from 'react';
import { motion } from 'framer-motion';

interface LazyRouteProps {
  component: ComponentType;
  fallback?: ReactNode;
}

/**
 * Default loading fallback component
 */
function DefaultLoadingFallback() {
  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4"
      >
        {/* Spinning loader */}
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-dark-border rounded-full" />
          <motion.div
            className="absolute inset-0 border-4 border-transparent border-t-altrion-500 rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
        </div>
        <p className="text-text-secondary text-sm">Loading...</p>
      </motion.div>
    </div>
  );
}

/**
 * Wrapper for lazy-loaded route components with Suspense
 */
export function LazyRoute({
  component: Component,
  fallback = <DefaultLoadingFallback />,
}: LazyRouteProps) {
  return (
    <Suspense fallback={fallback}>
      <Component />
    </Suspense>
  );
}

/**
 * Loading skeleton for page transitions
 */
export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Nav skeleton */}
      <div className="border-b border-dark-border bg-dark-card/80 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="h-8 w-24 bg-dark-elevated rounded animate-pulse" />
            <div className="flex gap-4">
              <div className="h-8 w-8 bg-dark-elevated rounded animate-pulse" />
              <div className="h-8 w-8 bg-dark-elevated rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Content skeleton */}
      <div className="max-w-7xl mx-auto px-5 py-6 space-y-6">
        <div className="h-10 w-48 bg-dark-elevated rounded animate-pulse" />
        <div className="h-48 bg-dark-card rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 gap-5">
          <div className="h-64 bg-dark-card rounded-xl animate-pulse" />
          <div className="h-64 bg-dark-card rounded-xl animate-pulse" />
        </div>
      </div>
    </div>
  );
}
