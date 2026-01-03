import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button, Card, Logo } from '../../components/ui';

const steps = [
  {
    id: 1,
    title: 'Nickname',
    description: 'Help us personalize your experience',
  },
];

export function Onboarding() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    displayName: '',
  });

  const handleNext = () => {
    // Store displayName in localStorage for use in celebration screen
    localStorage.setItem('altrion-displayName', form.displayName);
    navigate('/connect/select');
  };

  const canProceed = () => {
    return form.displayName.length >= 2;
  };

  // Calculate progress for Zeigarnik effect
  const progressPercentage = 100;

  return (
    <div className="min-h-screen bg-dark-bg flex flex-col">
      {/* Header with progress */}
      <div className="p-6 border-b border-dark-border bg-dark-surface/50 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <Logo size="sm" />
            <span className="text-sm text-text-muted">
              {steps[0].title}
            </span>
          </div>
          {/* Progress bar */}
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${progressPercentage}%` }} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Step Header */}
            <div className="mb-8">
              <h1 className="font-display text-3xl font-bold text-text-primary mb-2 tracking-tight">
                {steps[0].title}
              </h1>
              <p className="text-text-secondary">
                {steps[0].description}
              </p>
            </div>

            {/* Display Name */}
            <Card variant="bordered" className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  What should we call you?
                </label>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder="Enter your name or nickname"
                  className="w-full bg-dark-input border border-dark-border rounded-xl px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-altrion-500 focus:ring-1 focus:ring-altrion-500/50 transition-all"
                  autoFocus
                />
              </div>
              <p className="text-sm text-text-muted">
                This is how you'll appear in the app. You can change it later.
              </p>
            </Card>
          </motion.div>

          {/* Navigation */}
          <div className="flex justify-end mt-8">
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
            >
              Continue
              <ArrowRight size={18} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
