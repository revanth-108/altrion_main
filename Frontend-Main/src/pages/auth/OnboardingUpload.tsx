import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud,
  X,
  ArrowRight,
  CheckCircle2,
  FileText,
  TrendingUp,
  Shield,
  Zap,
  Layers,
} from 'lucide-react';
import { Button } from '../../components/ui';
import { OnboardingHeader } from '../../components/onboarding';
import { ROUTES } from '../../constants';

const SUPPORTED = [
  { name: 'Coinbase', tag: 'Crypto' },
  { name: 'Kraken',   tag: 'Crypto' },
  { name: 'Binance',  tag: 'Crypto' },
  { name: 'Fidelity', tag: 'Brokerage' },
  { name: 'Schwab',   tag: 'Brokerage' },
  { name: 'Vanguard', tag: 'Brokerage' },
];

const BENEFITS = [
  { icon: Zap,       color: 'text-yellow-400', bg: 'bg-yellow-500/10', title: 'Instant parsing', desc: 'Holdings populate your dashboard the moment you continue.' },
  { icon: TrendingUp, color: 'text-altrion-400', bg: 'bg-altrion-500/10', title: 'Unified portfolio', desc: 'Crypto + equities combined into one net-worth view.' },
  { icon: Shield,    color: 'text-emerald-400', bg: 'bg-emerald-500/10', title: 'Encrypted at rest', desc: 'Your PDF is stored under AES-256 and only used for parsing.' },
] as const;

export function OnboardingUpload() {
  const navigate    = useNavigate();
  const inputRef    = useRef<HTMLInputElement>(null);
  const [file, setFile]         = useState<File | null>(null);
  const [isDragging, setIsDrag] = useState(false);

  const accept = (f: File | null) => {
    if (!f || f.type !== 'application/pdf') return;
    setFile(f);
  };

  const onDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDrag(true);  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDrag(false); }, []);
  const onDrop      = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDrag(false);
    accept(e.dataTransfer.files[0] ?? null);
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    accept(e.target.files?.[0] ?? null);
    e.target.value = '';
  };

  const handleContinue = () => {
    if (file) sessionStorage.setItem('onboarding-pdf-name', file.name);
    navigate(ROUTES.ONBOARDING_TERMS);
  };

  return (
    <div className="min-h-screen bg-dark-bg text-text-primary">
      <OnboardingHeader currentStep={4} />

      <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[5fr_7fr] lg:items-start lg:gap-16">

          {/* ── LEFT: Context ── */}
          <motion.aside
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45 }}
            className="lg:sticky lg:top-28"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-altrion-500/30 bg-altrion-500/10 px-3 py-1 text-xs font-semibold text-altrion-400">
              <Layers size={12} />
              Optional · Skip anytime
            </span>

            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.15] text-text-primary lg:text-[2.6rem]">
              Import your<br />
              <span className="text-gradient-altrion">portfolio</span><br />
              instantly.
            </h1>

            <p className="mt-5 text-base leading-7 text-text-secondary">
              Drop your most recent brokerage or crypto statement PDF. We'll parse your
              holdings automatically — no manual entry, no spreadsheets.
            </p>

            <ul className="mt-8 space-y-4">
              {BENEFITS.map(({ icon: Icon, color, bg, title, desc }, i) => (
                <motion.li
                  key={title}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: 0.15 + i * 0.07 }}
                  className="flex items-start gap-3"
                >
                  <span className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg ${bg}`}>
                    <Icon size={15} className={color} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-text-primary">{title}</span>
                    <span className="block text-xs leading-5 text-text-muted">{desc}</span>
                  </span>
                </motion.li>
              ))}
            </ul>

            {/* Supported platforms */}
            <div className="mt-8">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Supported platforms
              </p>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED.map(({ name, tag }) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1.5 rounded-full border border-dark-border bg-dark-elevated px-3 py-1 text-xs text-text-secondary"
                  >
                    {name}
                    <span className="rounded-full bg-altrion-500/15 px-1.5 py-0.5 text-[10px] font-medium text-altrion-400">
                      {tag}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </motion.aside>

          {/* ── RIGHT: Upload card ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={onInputChange}
            />

            <div className="overflow-hidden rounded-2xl border border-dark-border bg-dark-card shadow-[0_24px_64px_-16px_rgba(0,0,0,0.5)]">
              {/* Top accent */}
              <div className="h-px w-full bg-gradient-to-r from-transparent via-altrion-500/50 to-transparent" />

              <div className="p-7">
                <p className="mb-5 text-[10px] font-semibold uppercase tracking-widest text-altrion-400">
                  Upload Statement · PDF only
                </p>

                {/* Drop zone */}
                <AnimatePresence mode="wait">
                  {file ? (
                    <motion.div
                      key="selected"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      className="relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-altrion-500 bg-altrion-500/8 py-12 text-center"
                    >
                      <div className="absolute inset-x-0 top-0 h-px rounded-t-xl bg-gradient-to-r from-transparent via-altrion-400/60 to-transparent" />
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 300, delay: 0.05 }}
                        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-altrion-500/20 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                      >
                        <CheckCircle2 size={28} className="text-altrion-400" />
                      </motion.div>
                      <div>
                        <p className="max-w-xs truncate px-4 text-base font-semibold text-text-primary">
                          {file.name}
                        </p>
                        <p className="mt-1 text-sm text-text-muted">
                          {(file.size / 1024).toFixed(1)} KB · PDF ready to upload
                        </p>
                      </div>
                      <button
                        onClick={() => setFile(null)}
                        className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full border border-dark-border bg-dark-elevated text-text-muted transition-all hover:border-red-500/50 hover:text-red-400"
                        aria-label="Remove file"
                      >
                        <X size={13} />
                      </button>
                      <button
                        onClick={() => inputRef.current?.click()}
                        className="text-xs text-altrion-400 underline-offset-2 hover:underline"
                      >
                        Replace file
                      </button>
                    </motion.div>
                  ) : (
                    <motion.button
                      key="dropzone"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      onDrop={onDrop}
                      className={[
                        'flex w-full flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed py-14 text-center transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-altrion-500/40',
                        isDragging
                          ? 'scale-[1.01] border-altrion-400 bg-altrion-500/8'
                          : 'border-dark-border bg-dark-elevated/30 hover:border-altrion-500/50 hover:bg-altrion-500/5',
                      ].join(' ')}
                    >
                      <motion.div
                        animate={isDragging ? { scale: 1.12, y: -4 } : { scale: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 400 }}
                        className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-colors ${
                          isDragging ? 'bg-altrion-500/20' : 'bg-dark-elevated'
                        }`}
                      >
                        <UploadCloud
                          size={28}
                          className={isDragging ? 'text-altrion-400' : 'text-text-muted'}
                        />
                      </motion.div>
                      <div>
                        <p className="text-sm font-semibold text-text-primary">
                          {isDragging ? 'Release to upload' : 'Drag & drop your PDF here'}
                        </p>
                        <p className="mt-1 text-xs text-text-muted">
                          or{' '}
                          <span className="font-medium text-altrion-400">click to browse</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-text-subtle">
                        <FileText size={11} />
                        PDF files only · one at a time
                      </div>
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              {/* Card footer */}
              <div className="flex items-center justify-between border-t border-dark-border bg-dark-elevated/30 px-7 py-4">
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.ONBOARDING_TERMS)}
                  className="text-sm text-text-muted underline-offset-2 transition-colors hover:text-text-primary hover:underline"
                >
                  Skip for now
                </button>
                <Button size="lg" onClick={handleContinue}>
                  {file ? 'Upload & Continue' : 'Continue'}
                  <ArrowRight size={17} />
                </Button>
              </div>
            </div>
          </motion.div>

        </div>
      </main>
    </div>
  );
}
