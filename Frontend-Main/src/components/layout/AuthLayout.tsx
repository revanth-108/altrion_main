import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Logo } from '../ui/Logo';
import { ThemeToggle } from '../ui/ThemeToggle';

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Global background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-dark-bg via-dark-bg to-dark-card" />

      {/* Theme Toggle */}
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 p-8 flex-col justify-center items-center relative">
        {/* Atmospheric background effects */}
        <div className="absolute inset-0">
          {/* Gradient orbs */}
          <div className="absolute top-0 left-0 w-96 h-96 bg-altrion-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '4s' }} />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-accent-cyan/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '6s' }} />

          {/* Geometric grid pattern */}
          <div className="absolute inset-0 bg-grid-pattern opacity-30" />
        </div>

        {/* Centered Content Container */}
        <div className="relative z-10 w-full max-w-xl flex flex-col items-center text-center space-y-6">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex justify-center"
          >
            <Logo size="lg" variant="full" showText={false} />
          </motion.div>

          {/* Main Content */}
          <div>
            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.7 }}
              className="font-display text-5xl lg:text-6xl font-black leading-[1.1] tracking-tight"
            >
              Unified Finance.
              <br />
              <span className="text-altrion-400 bg-gradient-to-r from-altrion-400 to-altrion-500 bg-clip-text text-transparent">
                Intelligent Risk.
              </span>
            </motion.h2>
          </div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="flex flex-wrap items-center justify-center gap-8 text-base text-text-muted"
          >
            <span className="flex items-center gap-2.5 group cursor-default">
              <div className="w-2 h-2 rounded-full bg-altrion-500 group-hover:scale-125 transition-transform" />
              <span className="group-hover:text-text-secondary transition-colors">Basel III Compliant</span>
            </span>
            <span className="flex items-center gap-2.5 group cursor-default">
              <div className="w-2 h-2 rounded-full bg-altrion-500 group-hover:scale-125 transition-transform" />
              <span className="group-hover:text-text-secondary transition-colors">AI-Powered</span>
            </span>
            <span className="flex items-center gap-2.5 group cursor-default">
              <div className="w-2 h-2 rounded-full bg-altrion-500 group-hover:scale-125 transition-transform" />
              <span className="group-hover:text-text-secondary transition-colors">Secure Custody</span>
            </span>
          </motion.div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-5 py-6 sm:p-6 lg:p-8 relative">
        {/* Subtle background pattern for form side */}
        <div className="absolute inset-0 bg-dots-pattern opacity-20" />

        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="w-full max-w-md relative z-10"
        >
          {/* Mobile logo */}
          <div className="lg:hidden mb-4">
            <Logo size="sm" />
          </div>

          {/* Form header */}
          <div className="mb-4">
            <h1 className="font-display text-2xl sm:text-3xl lg:text-5xl font-bold text-text-primary mb-2 tracking-tight leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-text-secondary text-base font-light leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>

          {/* Form content */}
          {children}
        </motion.div>
      </div>
    </div>
  );
}
