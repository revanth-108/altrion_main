import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, FileCheck, Database, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui';
import { OnboardingHeader } from '../../components/onboarding';
import { useAuthStore, selectUser } from '../../store';
import { authService } from '../../services';
import { ROUTES } from '../../constants';

const TERMS_SECTIONS = [
  {
    title: '1. Introduction',
    body: `Welcome to Altrion.ai ("Altrion", "we", "our", or "us"). These Terms and Conditions ("Terms") govern your access to and use of the Altrion platform, including our website, mobile applications, and all related services (collectively, the "Services"). By creating an account and proceeding through this onboarding flow, you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy.

If you do not agree to these Terms, you must not use the Services. These Terms constitute a legally binding agreement between you and Altrion.ai, Inc.`,
  },
  {
    title: '2. Data We Collect',
    body: `To provide you with a holistic view of your financial life, Altrion collects and processes the following categories of information:

a) Identity & Contact Information: Your full name, email address, and display name you provide during registration.

b) Financial Account Data: When you connect bank or brokerage accounts via Plaid, we receive read-only access to account balances, transaction history, investment holdings, and account metadata. We never receive or store your banking credentials — Plaid handles authentication and issues us an access token.

c) Portfolio Documents: PDF statements you voluntarily upload (crypto exchange statements, brokerage reports, etc.) are stored in an encrypted Supabase Storage bucket. These files are used solely to parse and display your asset holdings.

d) Usage & Analytics: Page views, feature engagement, session duration, and error logs collected to improve the product. This data is aggregated and anonymised before analysis.

e) Device & Technical Data: Browser type, IP address, and operating system, used for security, fraud prevention, and debugging.`,
  },
  {
    title: '3. How We Use Your Data',
    body: `We use the information we collect to:

• Provide, operate, and improve the Altrion Services, including portfolio aggregation, net worth tracking, Monte Carlo simulations, and financial analysis.
• Display personalised financial insights, budget summaries, cash-flow overviews, and investment research within your dashboard.
• Process bank connections via Plaid and crypto uploads to calculate your overall portfolio value.
• Send transactional notifications (e.g., account connection status, subscription receipts) and, with your consent, product updates.
• Detect, investigate, and prevent fraudulent transactions and other illegal activities.
• Comply with applicable laws and regulations, including financial data handling requirements.

We do not sell your personal data to third parties, and we do not use your financial data to serve you third-party advertisements.`,
  },
  {
    title: '4. Data Storage & Encryption',
    body: `Altrion takes the security of your data seriously and implements industry-standard safeguards:

a) Encryption in Transit: All data transmitted between your browser and Altrion's servers is encrypted using TLS 1.2 or higher. Plaid connections are additionally secured by Plaid's bank-grade encryption layer.

b) Encryption at Rest: Database records and uploaded files are encrypted at rest using AES-256 encryption. Supabase Storage, which holds your uploaded PDFs, applies server-side encryption to all objects.

c) Access Control: Your data is accessible only to you and, where strictly necessary for service delivery, to authorised Altrion engineering personnel subject to strict access controls and audit logs.

d) Plaid Token Security: Bank access tokens issued by Plaid are stored in encrypted form and are never exposed client-side. We request only "read" permissions — we cannot move money or modify your accounts.

e) Data Retention: You may delete your account at any time from the Profile page. Upon deletion, your personal data, linked account tokens, and uploaded files are permanently purged within 30 days, except where retention is required by law.`,
  },
  {
    title: '5. Third-Party Services',
    body: `Altrion integrates with the following third-party services to deliver the platform:

• Plaid Technologies: Handles bank account authentication and data aggregation. Plaid's Privacy Policy and End User Privacy Policy govern the data you share with Plaid during the connection process.
• Supabase: Provides the underlying database and file storage infrastructure. Data is hosted on servers located in the United States.
• Bank of America Secure Acceptance: Processes subscription payments. Altrion does not store your payment card details; billing data is handled by the hosted payment page.
• WalletConnect: Optional integration for connecting cryptocurrency wallets via QR code. Only your public wallet address is shared with Altrion.

By using Altrion, you also agree to be bound by the applicable terms of these third-party providers insofar as they relate to your use of their services through Altrion.`,
  },
  {
    title: '6. Your Rights',
    body: `Depending on your jurisdiction, you may have the following rights regarding your personal data:

• Access: Request a copy of the personal data Altrion holds about you.
• Rectification: Correct inaccurate or incomplete data.
• Erasure: Request deletion of your account and associated data (the "right to be forgotten").
• Portability: Receive your data in a machine-readable format.
• Objection: Object to certain types of processing, such as direct marketing.
• Withdrawal of Consent: Withdraw consent for optional data processing at any time without affecting the lawfulness of prior processing.

To exercise any of these rights, contact us at privacy@altrion.ai. We will respond within 30 days.`,
  },
  {
    title: '7. Subscription & Billing',
    body: `Altrion offers both free and paid subscription tiers. Paid features are billed monthly or annually as displayed at checkout. Subscriptions renew automatically unless cancelled before the next billing cycle.

You may manage or cancel your subscription at any time from the Subscription settings page. Refunds are issued at Altrion's discretion and in accordance with applicable consumer protection laws. Altrion reserves the right to modify pricing with 30 days' notice to existing subscribers.`,
  },
  {
    title: '8. Disclaimers & Limitation of Liability',
    body: `Altrion provides financial data aggregation and analytical tools for informational purposes only. Nothing on the platform constitutes financial, investment, tax, or legal advice. You are solely responsible for any financial decisions you make based on information displayed in Altrion.

To the maximum extent permitted by law, Altrion shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Services, including but not limited to inaccurate portfolio data, service outages, or third-party data provider errors.`,
  },
  {
    title: '9. Changes to These Terms',
    body: `We may update these Terms from time to time. When we do, we will notify you via email and in-app notification at least 14 days before changes take effect. Continued use of the Services after the effective date constitutes acceptance of the revised Terms. If you disagree with the changes, you may close your account before they take effect.`,
  },
  {
    title: '10. Contact Us',
    body: `If you have any questions about these Terms or how Altrion handles your data, please reach out:

Altrion.ai, Inc.
Email: legal@altrion.ai
Privacy enquiries: privacy@altrion.ai

Last updated: June 2025`,
  },
];

export function OnboardingTerms() {
  const navigate = useNavigate();
  const user = useAuthStore(selectUser);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [agreed, setAgreed] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [readProgress, setReadProgress] = useState(0);

  const handleDocScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const scrollable = el.scrollHeight - el.clientHeight;
    if (scrollable <= 0) return;
    setReadProgress(Math.round(Math.min(1, el.scrollTop / scrollable) * 100));
  }, []);

  const handleProceed = async () => {
    setSubmitError('');
    setIsSubmitting(true);
    try {
      await authService.updateNickname(
        user?.displayName || user?.nickname || user?.name || 'Altrion user',
        true,
      );
      sessionStorage.setItem('altrion:onboardingFlow', 'true');
      navigate(ROUTES.CONNECT_SELECT);
    } catch (submitError) {
      console.error('Failed to save data consent', submitError);
      setSubmitError('We could not save your consent. Please try again.');
      setIsSubmitting(false);
    }
  };

  const canProceed = agreed;

  return (
    <div className="flex min-h-screen flex-col bg-dark-bg">
      <OnboardingHeader currentStep={3} />

      <div className="flex flex-1 items-start justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-3xl">

          {/* Page heading */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-7"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-altrion-500/30 bg-altrion-500/10 px-3 py-1 text-xs font-semibold text-altrion-400">
              <FileCheck size={12} />
              Step 3 of 5 · Data Consent
            </span>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
              Before we proceed
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-text-secondary">
              We believe in radical transparency. Here's exactly what you're agreeing to — no legalese.
            </p>
          </motion.div>

          {/* Key commitments — 3-up summary */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.07 }}
            className="mb-6 grid gap-3 sm:grid-cols-3"
          >
            {[
              {
                icon: Database,
                title: 'What we collect',
                body: 'Account balances, transactions, and holdings via read-only bank connections. No passwords — ever.',
              },
              {
                icon: ShieldCheck,
                title: 'How it\'s protected',
                body: 'AES-256 encryption at rest, TLS 1.2+ in transit. Your data is never sold to third parties.',
              },
              {
                icon: Trash2,
                title: 'Your control',
                body: 'Delete your account and all data at any time from Profile settings. No questions asked.',
              },
            ].map(({ icon: Icon, title, body }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.12 + i * 0.07 }}
                className="relative overflow-hidden rounded-xl border border-dark-border bg-dark-card p-4"
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-altrion-500/30 to-transparent" />
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-altrion-500/10">
                  <Icon size={15} className="text-altrion-400" />
                </div>
                <p className="mb-1 text-sm font-semibold text-text-primary">{title}</p>
                <p className="text-xs leading-5 text-text-muted">{body}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* T&C document */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div
              ref={scrollRef}
              className="overflow-hidden rounded-2xl border border-dark-border bg-dark-surface shadow-[0_20px_60px_-16px_rgba(0,0,0,0.5)]"
            >
              {/* Document header */}
              <div className="border-b border-dark-border bg-dark-elevated/60 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <FileCheck size={15} className="flex-none text-altrion-400" />
                    <span className="text-sm font-semibold text-text-primary">
                      Terms &amp; Conditions
                    </span>
                    <span className="rounded-full border border-dark-border bg-dark-elevated px-2 py-0.5 text-[10px] text-text-muted">
                      v1.0 · June 2025
                    </span>
                  </div>

                  {readProgress > 0 ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-2"
                    >
                      <div className="h-1 w-20 overflow-hidden rounded-full bg-dark-border">
                        <motion.div
                          className="h-full origin-left bg-gradient-to-r from-altrion-600 to-altrion-400"
                          animate={{ scaleX: readProgress / 100 }}
                          transition={{ duration: 0.15 }}
                        />
                      </div>
                      <span className="text-[11px] tabular-nums text-text-muted">
                        {readProgress}%
                      </span>
                    </motion.div>
                  ) : (
                    <span className="text-[11px] text-text-muted">Scroll to read</span>
                  )}
                </div>
              </div>

              {/* Document body */}
              <div
                className="overflow-y-auto"
                style={{ maxHeight: '460px' }}
                onScroll={handleDocScroll}
              >
                <div className="px-8 py-8">
                  {/* Document title block */}
                  <div className="mb-8 pb-6 border-b border-dark-border">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-altrion-400 mb-2">
                      Legal Agreement
                    </p>
                    <h2 className="font-display text-xl font-bold text-text-primary">
                      Altrion.ai — Terms and Conditions
                    </h2>
                    <p className="mt-1.5 text-xs text-text-muted">
                      Effective Date: June 1, 2025 &nbsp;·&nbsp; Version 1.0
                    </p>
                  </div>

                  {/* Sections */}
                  <div className="space-y-8">
                    {TERMS_SECTIONS.map(({ title, body }) => (
                      <section key={title}>
                        <div className="mb-3 flex items-center gap-3">
                          <div className="h-3.5 w-0.5 flex-none rounded-full bg-altrion-500" aria-hidden />
                          <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
                        </div>
                        <p className="pl-3.5 text-sm leading-[1.8] text-text-secondary whitespace-pre-line">
                          {body}
                        </p>
                      </section>
                    ))}
                  </div>

                  <div className="mt-10 border-t border-dark-border pt-6 text-center">
                    <p className="text-xs text-text-muted">
                      © 2025 Altrion.ai, Inc. All rights reserved.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Agreement section */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="mt-6 space-y-5"
          >
            {/* Compact consent note */}
            <div className="flex items-center gap-2.5 rounded-xl border border-altrion-500/20 bg-altrion-500/5 px-4 py-3">
              <ShieldCheck size={15} className="flex-none text-altrion-400" />
              <p className="text-xs leading-5 text-text-secondary">
                By checking the box below you confirm you've read the full terms and agree to Altrion's data practices.
              </p>
            </div>

            {/* Checkbox */}
            <label className="group flex cursor-pointer items-start gap-3">
              <div className="relative mt-0.5 flex-shrink-0">
                <input
                  type="checkbox"
                  id="terms-agree"
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                  className="sr-only"
                />
                <div
                  aria-hidden="true"
                  className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all
                    ${agreed
                      ? 'border-altrion-500 bg-altrion-500'
                      : 'border-dark-border bg-dark-card group-hover:border-altrion-500/50'
                    }`}
                >
                  {agreed && (
                    <motion.svg
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      viewBox="0 0 12 10"
                      className="h-3 w-3"
                    >
                      <polyline
                        points="1.5 5.5 4.5 8.5 10.5 1.5"
                        fill="none"
                        stroke="white"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </motion.svg>
                  )}
                </div>
              </div>
              <span className="text-sm leading-relaxed text-text-secondary">
                I have read and agree to Altrion.ai's{' '}
                <span className="font-medium text-altrion-400">Terms and Conditions</span>{' '}
                and{' '}
                <span className="font-medium text-altrion-400">Privacy Policy</span>.
                I understand how my financial data is collected, stored, and used.
              </span>
            </label>

            {submitError && (
              <div
                role="alert"
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
              >
                {submitError}
              </div>
            )}
          </motion.div>

          {/* Action row */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="mt-8 flex items-center justify-between"
          >
            <button
              type="button"
              onClick={() => navigate(ROUTES.ONBOARDING_DETAILS)}
              className="text-sm text-text-muted underline-offset-2 transition-colors hover:text-text-primary hover:underline"
            >
              ← Back
            </button>

            <Button
              size="lg"
              onClick={() => void handleProceed()}
              disabled={!canProceed || isSubmitting}
              loading={isSubmitting}
            >
              {isSubmitting ? 'Confirming…' : 'Continue to bank connection'}
              {!isSubmitting && <ArrowRight size={18} />}
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
