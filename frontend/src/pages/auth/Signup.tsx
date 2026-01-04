import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff, Check, Shield, Users, Zap } from 'lucide-react';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button, Input } from '../../components/ui';
import { useForm, usePasswordToggle } from '../../hooks';
import { getPasswordRequirements } from '../../utils';
import { ROUTES } from '../../constants';
import type { SignupFormData } from '../../types';

export function Signup() {
  const navigate = useNavigate();
  const { showPassword, togglePassword, inputType } = usePasswordToggle();
  const { mutate: signup, isPending: loading } = useSignup();
  const { values: form, updateValue } = useForm<SignupFormData>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const passwordRequirements = getPasswordRequirements(
    form.password,
    form.confirmPassword
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    setLoading(false);
    navigate(ROUTES.ONBOARDING);
  };

  // Calculate progress for Zeigarnik effect (encourages completion)
  const completionProgress = [
    form.name.length > 0,
    form.email.length > 0,
    passwordRequirements.every(r => r.met),
  ].filter(Boolean).length;
  const totalFields = 3;
  const progressPercentage = (completionProgress / totalFields) * 100;

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start managing your unified portfolio today"
    >
      {/* Social Proof - Anchoring effect */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex items-center justify-center gap-6 mb-4 pb-4 border-b border-dark-border/50"
      >
        <div className="flex items-center gap-2 text-xs">
          <Users className="w-3.5 h-3.5 text-altrion-400" />
          <span className="text-text-secondary">
            <span className="text-altrion-400 font-bold">10,000+</span> users
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Shield className="w-3.5 h-3.5 text-altrion-400" />
          <span className="text-text-secondary font-medium">Bank-level security</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Zap className="w-3.5 h-3.5 text-altrion-400" />
          <span className="text-text-secondary"><span className="font-bold">2</span>-min setup</span>
        </div>
      </motion.div>

      {/* Progress indicator - Zeigarnik effect to encourage completion */}
      {completionProgress > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mb-5"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-text-muted">
              {completionProgress === totalFields ? 'Ready to sign up!' : `${completionProgress} of ${totalFields} steps completed`}
            </span>
            <span className="text-xs font-bold text-altrion-400">{Math.round(progressPercentage)}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${progressPercentage}%` }} />
          </div>
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Staggered animations for form fields */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <Input
            label="Full Name"
            type="text"
            value={form.name}
            onChange={(e) => updateValue('name', e.target.value)}
            icon={<User size={18} />}
            required
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => updateValue('email', e.target.value)}
            icon={<Mail size={18} />}
            required
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="relative"
        >
          <div className="relative">
            <Input
              label="Password"
              type={inputType}
              value={form.password}
              onChange={(e) => updateValue('password', e.target.value)}
              icon={<Lock size={18} />}
              required
            />
            <button
              type="button"
              onClick={togglePassword}
              className="absolute right-12 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors z-20"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <Input
            label="Confirm Password"
            type={inputType}
            value={form.confirmPassword}
            onChange={(e) => updateValue('confirmPassword', e.target.value)}
            icon={<Lock size={18} />}
            required
          />
        </motion.div>

        {/* Password requirements */}
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: form.password ? 1 : 0, height: form.password ? 'auto' : 0 }}
          className="space-y-1.5 overflow-hidden pb-3"
        >
          {passwordRequirements.map((req, index) => (
            <motion.div
              key={req.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center gap-2 text-xs"
            >
              <div
                className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${
                  req.met ? 'bg-altrion-500' : 'bg-dark-border'
                }`}
              >
                {req.met && <Check size={10} className="text-text-primary" />}
              </div>
              <span className={req.met ? 'text-text-primary' : 'text-text-muted'}>
                {req.label}
              </span>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="py-0.5 -mt-[0.8125rem]"
        >
          <div className="flex items-center justify-center gap-2">
            <input
              type="checkbox"
              id="terms"
              required
              className="w-3.5 h-3.5 rounded border-dark-border bg-dark-input text-altrion-500 focus:ring-altrion-500 flex-shrink-0"
            />
            <label htmlFor="terms" className="text-xs text-text-secondary cursor-pointer leading-snug">
              I agree to the{' '}
              <a href="#" className="text-altrion-400 hover:text-altrion-300 underline-offset-2 hover:underline transition-all">Terms of Service</a>
              {' '}and{' '}
              <a href="#" className="text-altrion-400 hover:text-altrion-300 underline-offset-2 hover:underline transition-all">Privacy Policy</a>
            </label>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.5 }}
        >
          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={loading}
            disabled={!passwordRequirements.every(r => r.met)}
          >
            Create Account
          </Button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.5 }}
          className="text-center text-text-secondary text-sm pt-2"
        >
          Already have an account?{' '}
          <Link to={ROUTES.LOGIN} className="text-altrion-400 hover:text-altrion-300 transition-colors font-semibold">
            Sign in
          </Link>
        </motion.p>
      </form>

      {/* Trust indicators at bottom */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.6 }}
        className="mt-4 pt-3 border-t border-dark-border/50 text-center text-xs text-text-muted"
      >
        <p>Protected by 256-bit SSL encryption • GDPR Compliant</p>
      </motion.div>
    </AuthLayout>
  );
}
