import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, FileCheck } from 'lucide-react';
import { Button, Logo } from '../../components/ui';
import { ROUTES } from '../../constants';
import { authService } from '@/services';

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
• Stripe: Processes subscription payments. Altrion does not store your payment card details; all billing data is handled directly by Stripe.
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleProceed = async () => {
    if (!agreed) {
      return;
    }

    setIsSubmitting(true);
    try {
      await authService.updateProfile({ data_storage_consent: true });
      // Small artificial delay for UX polish
      await new Promise(r => setTimeout(r, 600));
      navigate(ROUTES.CONNECT_SELECT);
    } catch (error) {
      console.error('Failed to record data storage consent', error);
      setIsSubmitting(false);
    }
  };

  const canProceed = agreed;

  return (
    <div className="min-h-screen bg-dark-bg flex flex-col">
      {/* Header with progress */}
      <div className="p-6 border-b border-dark-border bg-dark-surface/50 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <Logo size="sm" />
            <span className="text-sm text-text-muted">Step 6 of 6 · Terms & Conditions</span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: '100%' }} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center p-6 py-10">
        <div className="w-full max-w-3xl">

          {/* Page heading */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-6"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-altrion-500/10 flex items-center justify-center">
                <FileCheck size={20} className="text-altrion-400" />
              </div>
              <h1 className="font-display text-3xl font-bold text-text-primary tracking-tight">
                Terms &amp; Conditions
              </h1>
            </div>
            <p className="text-text-secondary text-sm leading-relaxed">
              Please read these terms carefully before proceeding. By continuing you confirm you have read and understood
              Altrion's terms and agree to how we collect, store, and protect your data.
            </p>
          </motion.div>

          {/* T&C document — white PDF-viewer style */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div
              ref={scrollRef}
              className="rounded-2xl overflow-hidden border border-dark-border shadow-2xl"
              style={{ maxHeight: '520px' }}
            >
              {/* Document chrome bar */}
              <div className="bg-[#e8e8e8] border-b border-[#d0d0d0] px-5 py-2.5 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                  <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                  <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                </div>
                <span className="ml-3 text-xs text-[#555] font-medium select-none">
                  Altrion.ai — Terms and Conditions.pdf
                </span>
              </div>

              {/* Document body */}
              <div
                className="overflow-y-auto bg-white"
                style={{ maxHeight: '472px' }}
              >
                <div className="px-10 py-10 max-w-2xl mx-auto">
                  {/* Document title */}
                  <div className="text-center mb-8 pb-6 border-b border-gray-200">
                    <h2 className="text-2xl font-bold text-gray-900 mb-1">Altrion.ai</h2>
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">Terms and Conditions</h3>
                    <p className="text-sm text-gray-500">Effective Date: June 1, 2025 · Version 1.0</p>
                  </div>

                  {/* Sections */}
                  <div className="space-y-7">
                    {TERMS_SECTIONS.map(({ title, body }) => (
                      <section key={title}>
                        <h4 className="text-sm font-bold text-gray-900 mb-2">{title}</h4>
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{body}</p>
                      </section>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="mt-10 pt-6 border-t border-gray-200 text-center">
                    <p className="text-xs text-gray-400">© 2025 Altrion.ai, Inc. All rights reserved.</p>
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
            {/* Security badge */}
            <div className="flex items-center gap-3 bg-altrion-500/5 border border-altrion-500/20 rounded-xl p-4">
              <ShieldCheck size={20} className="text-altrion-400 flex-shrink-0" />
              <p className="text-sm text-text-secondary">
                By accepting these terms you agree to Altrion.ai's data collection, storage, and processing practices as
                described above. Your data is encrypted and never sold to third parties.
              </p>
            </div>

            {/* Checkbox */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative mt-0.5 flex-shrink-0">
                <input
                  type="checkbox"
                  id="terms-agree"
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                  className="sr-only"
                />
                <div
                  onClick={() => setAgreed(v => !v)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all cursor-pointer
                    ${agreed
                      ? 'bg-altrion-500 border-altrion-500'
                      : 'border-dark-border bg-dark-card group-hover:border-altrion-500/50'
                    }`}
                >
                  {agreed && (
                    <motion.svg
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      viewBox="0 0 12 10"
                      className="w-3 h-3"
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
              <span className="text-sm text-text-secondary leading-relaxed">
                I have read and agree to Altrion.ai's{' '}
                <span className="text-altrion-400 font-medium">Terms and Conditions</span>{' '}
                and{' '}
                <span className="text-altrion-400 font-medium">Privacy Policy</span>.
                I understand how my financial data is collected, stored, and used.
              </span>
            </label>
          </motion.div>

          {/* Action row */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="flex items-center justify-between mt-8"
          >
            <button
              type="button"
              onClick={() => navigate(ROUTES.ONBOARDING_UPLOAD)}
              className="text-sm text-text-muted hover:text-text-primary transition-colors underline-offset-2 hover:underline"
            >
              ← Back
            </button>

            <Button
              size="lg"
              onClick={() => void handleProceed()}
              disabled={!canProceed || isSubmitting}
              loading={isSubmitting}
            >
              {isSubmitting ? 'Confirming…' : 'Proceed to Connect Accounts'}
              {!isSubmitting && <ArrowRight size={18} />}
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
