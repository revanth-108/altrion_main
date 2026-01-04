import { Logo } from './Logo';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer-nav border-t border-dark-border/30 bg-dark-card/50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-5 py-2">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Logo */}
          <div className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity -my-1">
            <Logo size="lg" variant="full" showText={false} />
          </div>

          {/* Copyright */}
          <p className="text-xs text-text-muted/60 order-last sm:order-none">
            © {currentYear} Altrion. All rights reserved.
          </p>

          {/* Links */}
          <div className="flex items-center gap-6 text-xs">
            <a
              href="#"
              className="text-text-muted/60 hover:text-text-secondary transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="#"
              className="text-text-muted/60 hover:text-text-secondary transition-colors"
            >
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
