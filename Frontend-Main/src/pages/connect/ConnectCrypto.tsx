import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Plus,
  Trash2,
  Check,
  X,
  Loader2,
  UploadCloud,
  Lock,
  ArrowRight,
  Bitcoin,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui';
import { ConnectionSetupLayout } from '../../components/layout';
import { ROUTES } from '../../constants';
import { useAuthStore } from '../../store';
import { platformService } from '../../services';
import { portfolioKeys } from '../../hooks/queries/usePortfolio';
import { ConnectionSuccessNotice } from './ConnectionSuccessNotice';

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

interface ExchangeEntry {
  id: string;
  exchange: string;
  file: File | null;
  status: UploadStatus;
  errorMsg: string | null;
  holdingsParsed?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeId() { return Math.random().toString(36).slice(2); }
function emptyEntry(): ExchangeEntry {
  return { id: makeId(), exchange: '', file: null, status: 'idle', errorMsg: null };
}

const inputCls =
  'w-full bg-transparent border-2 border-dark-border rounded-lg h-11 px-3.5 ' +
  'text-text-primary text-sm focus:outline-none transition-all duration-200 ' +
  'hover:border-dark-border-hover focus:border-altrion-500 placeholder:text-text-subtle ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

// ─── EntryRow ─────────────────────────────────────────────────────────────────

interface EntryRowProps {
  entry: ExchangeEntry;
  index: number;
  duplicateError: boolean;
  onExchangeChange: (id: string, value: string) => void;
  onFileChange: (id: string, file: File | null) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}

function EntryRow({ entry, index, duplicateError, onExchangeChange, onFileChange, onRemove, canRemove }: EntryRowProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = entry.status === 'uploading' || entry.status === 'success';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFileChange(entry.id, e.target.files?.[0] ?? null);
    e.target.value = '';
  };

  const StatusIcon = () => {
    if (entry.status === 'uploading') return (
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
        <Loader2 size={14} className="flex-none text-altrion-400" />
      </motion.div>
    );
    if (entry.status === 'success') return <Check size={14} className="flex-none text-green-400" />;
    if (entry.status === 'error')   return <X    size={14} className="flex-none text-red-400" />;
    return null;
  };

  const hasError = duplicateError || (entry.status === 'error' && !!entry.errorMsg);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.22 }}
    >
      <div className="relative overflow-hidden rounded-xl border border-dark-border bg-dark-card">
        {/* Top accent */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-altrion-500/30 to-transparent" />

        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">

          {/* Index badge + exchange input */}
          <div className="flex flex-1 items-start gap-3 min-w-0">
            <span className="mt-[30px] flex h-6 w-6 flex-none items-center justify-center rounded-full bg-altrion-500/15 text-[11px] font-bold text-altrion-400">
              {index + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Exchange Name
              </p>
              <input
                type="text"
                placeholder="e.g. Coinbase, Kraken, Binance…"
                value={entry.exchange}
                onChange={(e) => onExchangeChange(entry.id, e.target.value)}
                disabled={busy}
                className={`${inputCls} ${hasError ? 'border-red-500 focus:border-red-500' : ''}`}
              />
              {duplicateError && (
                <p className="mt-1.5 text-xs text-red-400">Exchange already added. Each exchange must be unique.</p>
              )}
              {entry.errorMsg && !duplicateError && entry.status !== 'error' && (
                <p className="mt-1.5 text-xs text-red-400">{entry.errorMsg}</p>
              )}
            </div>
          </div>

          {/* PDF picker */}
          <div className="sm:w-52">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
              Statement PDF
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => !busy && fileInputRef.current?.click()}
              disabled={busy}
              className={[
                'flex h-11 w-full items-center gap-2.5 rounded-lg border-2 px-3.5 text-sm transition-all duration-200',
                'disabled:cursor-not-allowed disabled:opacity-50',
                entry.file
                  ? 'border-altrion-500 bg-altrion-500/8 text-text-primary'
                  : 'border-dashed border-dark-border text-text-muted hover:border-altrion-500/50 hover:bg-altrion-500/5',
              ].join(' ')}
            >
              {entry.file ? (
                <>
                  <FileText size={14} className="flex-none text-altrion-400" />
                  <span className="flex-1 truncate text-left text-xs">{entry.file.name}</span>
                  <StatusIcon />
                </>
              ) : (
                <>
                  <UploadCloud size={14} className="flex-none" />
                  <span>Choose PDF</span>
                </>
              )}
            </button>
          </div>

          {/* Remove */}
          {canRemove && !busy && (
            <div className="flex items-end pb-0.5">
              <button
                type="button"
                onClick={() => onRemove(entry.id)}
                aria-label="Remove entry"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-all hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Inline feedback */}
        <AnimatePresence>
          {entry.status === 'success' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mx-5 mb-4"
            >
              <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-400">
                <Check size={12} />
                {entry.holdingsParsed
                  ? `Parsed ${entry.holdingsParsed} holding${entry.holdingsParsed === 1 ? '' : 's'} — your dashboard is updated.`
                  : 'Uploaded — your dashboard is updated.'}
              </div>
            </motion.div>
          )}
          {entry.status === 'error' && entry.errorMsg && !duplicateError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mx-5 mb-4"
            >
              <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                <X size={12} />
                {entry.errorMsg}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ConnectCrypto() {
  const navigate      = useNavigate();
  const queryClient   = useQueryClient();
  const { completeOnboarding } = useAuthStore();
  const isOnboarding  = sessionStorage.getItem('altrion:onboardingFlow') === 'true';
  const [uploadComplete, setUploadComplete] = useState(false);

  const finishConnectionStep = async (showSuccess = false) => {
    // Bust the portfolio cache so the dashboard fetches fresh data that includes
    // the newly parsed holdings.
    await queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
    if (showSuccess) {
      setUploadComplete(true);
      return;
    }
    if (isOnboarding) { navigate(ROUTES.ONBOARDING_PAYMENT); return; }
    completeOnboarding();
    navigate(ROUTES.DASHBOARD);
  };

  const [entries, setEntries]     = useState<ExchangeEntry[]>([emptyEntry()]);
  const [isUploading, setUploading] = useState(false);

  useEffect(() => {
    if (!uploadComplete) return;

    const timer = window.setTimeout(() => {
      if (isOnboarding) {
        navigate(ROUTES.ONBOARDING_PAYMENT, { replace: true });
        return;
      }
      completeOnboarding();
      navigate(ROUTES.DASHBOARD, { replace: true });
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [completeOnboarding, isOnboarding, navigate, uploadComplete]);

  const exchangeNames = entries.map((e) => e.exchange.trim().toLowerCase());
  const duplicateIds  = new Set<string>();
  exchangeNames.forEach((name, i) => {
    if (name && exchangeNames.indexOf(name) !== i) {
      duplicateIds.add(entries[i].id);
      duplicateIds.add(entries[exchangeNames.indexOf(name)].id);
    }
  });
  const hasDuplicates = duplicateIds.size > 0;

  const handleExchangeChange = (id: string, value: string) =>
    setEntries((p) => p.map((e) => e.id === id ? { ...e, exchange: value, errorMsg: null } : e));

  const handleFileChange = (id: string, file: File | null) =>
    setEntries((p) => p.map((e) => e.id === id ? { ...e, file, errorMsg: null } : e));

  const handleRemove = (id: string) =>
    setEntries((p) => p.filter((e) => e.id !== id));

  const handleDone = async () => {
    const uploadable = entries.filter((e) => e.exchange.trim() && e.file && e.status !== 'success');
    if (uploadable.length === 0) { await finishConnectionStep(); return; }
    if (hasDuplicates) return;

    setUploading(true);
    setEntries((p) => p.map((e) => uploadable.find((u) => u.id === e.id) ? { ...e, status: 'uploading', errorMsg: null } : e));

    let hadError = false;

    for (const entry of uploadable) {
      try {
        const result = await platformService.uploadPortfolioStatement(entry.exchange.trim(), entry.file!);
        const parsed  = result.holdings_parsed ?? 0;
        setEntries((p) => p.map((e) =>
          e.id === entry.id
            ? { ...e, status: 'success', errorMsg: null, holdingsParsed: parsed }
            : e
        ));
      } catch (err) {
        hadError = true;
        const message = err instanceof Error ? err.message : 'Upload failed. Please try again.';
        setEntries((p) => p.map((e) => e.id === entry.id ? { ...e, status: 'error', errorMsg: message } : e));
      }
    }

    setUploading(false);

    // Only navigate if every upload succeeded — stay on page to show errors otherwise.
    if (!hadError) {
      await finishConnectionStep(true);
    }
  };

  const hasAnythingToUpload = entries.some((e) => e.exchange.trim() && e.file);
  const isDoneDisabled = isUploading || hasDuplicates || entries.some((e) => e.status === 'uploading');

  return (
    <ConnectionSetupLayout backTo={ROUTES.CONNECT_SELECT} backLabel="Back to account options">
      {uploadComplete && (
        <div className="mb-6">
          <ConnectionSuccessNotice
            title="Portfolio connected"
            message="Your statement was imported successfully and your dashboard data is being refreshed."
            destinationLabel={isOnboarding ? 'the next setup step' : 'your dashboard'}
          />
        </div>
      )}

      {/* ── Page header ── */}
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-altrion-500/15">
          <Bitcoin size={20} className="text-altrion-400" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          Add your crypto holdings
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary sm:text-base">
          Upload your latest exchange statement so all your assets appear in one dashboard.
          One PDF per exchange — use your most recent statement.
        </p>
      </motion.div>

      {/* ── Security note ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="relative mb-6 overflow-hidden rounded-xl border border-altrion-500/20 bg-altrion-500/5 px-4 py-3"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-altrion-500/40 to-transparent" />
        <div className="flex items-start gap-2.5">
          <Lock size={14} className="mt-0.5 flex-none text-altrion-400" />
          <p className="text-xs leading-5 text-text-secondary">
            Files are stored with AES-256 encryption and are only used to calculate your portfolio.
            They are never shared with third parties.
          </p>
        </div>
      </motion.div>

      {/* ── Entry rows ── */}
      <div className="mb-4 space-y-3">
        <AnimatePresence initial={false}>
          {entries.map((entry, i) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              index={i}
              duplicateError={duplicateIds.has(entry.id)}
              onExchangeChange={handleExchangeChange}
              onFileChange={handleFileChange}
              onRemove={handleRemove}
              canRemove={entries.length > 1}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* ── Add another ── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="mb-8">
        <button
          type="button"
          onClick={() => setEntries((p) => [...p, emptyEntry()])}
          disabled={isUploading}
          className="inline-flex items-center gap-2 rounded-lg border border-dashed border-dark-border px-4 py-2 text-sm text-text-muted transition-all hover:border-altrion-500/50 hover:text-altrion-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={14} />
          Add another exchange
        </button>
      </motion.div>

      {/* ── Actions ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex items-center justify-between gap-4"
      >
        {/* Skip is always muted/secondary so it never looks like the primary CTA */}
        <button
          type="button"
          onClick={() => void finishConnectionStep()}
          disabled={isUploading}
          className="text-sm text-text-muted underline-offset-2 transition-colors hover:text-text-primary hover:underline disabled:opacity-50"
        >
          {isOnboarding ? 'Skip PDF import' : 'Skip for now'}
        </button>

        {hasAnythingToUpload ? (
          /* Upload CTA — only shown when exchange name + file are both present */
          <Button onClick={() => void handleDone()} disabled={isDoneDisabled} loading={isUploading} size="lg">
            {isUploading ? (
              <><Loader2 size={17} className="animate-spin" /> Parsing & uploading…</>
            ) : (
              <>Upload &amp; continue <ArrowRight size={17} /></>
            )}
          </Button>
        ) : (
          /* No file selected — nudge the user rather than offering a green primary button */
          <p className="text-sm text-text-muted">
            Enter an exchange name and choose a PDF to upload.
          </p>
        )}
      </motion.div>

    </ConnectionSetupLayout>
  );
}
