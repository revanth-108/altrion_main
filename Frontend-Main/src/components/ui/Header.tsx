import { Menu } from 'lucide-react';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { TextHoverEffect } from './text-hover-effect';
import { GlobalAssetSearch } from './GlobalAssetSearch';

interface HeaderProps {
  onMenuToggle?: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  return (
    <nav className="relative header-nav border-b border-white/8 bg-dark-bg/70 backdrop-blur-xl">
      <div className="px-4 lg:px-6">
        <div className="flex h-12 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {onMenuToggle && (
              <button
                onClick={onMenuToggle}
                className="lg:hidden p-1.5 rounded-xl text-text-secondary hover:bg-dark-elevated hover:text-text-primary transition-colors"
              >
                <Menu size={18} />
              </button>
            )}
            <Logo size="sm" variant="icon" />
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 hidden md:block" style={{ top: 0, bottom: 0, width: '260px', overflow: 'hidden' }}>
            <TextHoverEffect
              text="ALTRION"
              mainStrokeColor="rgba(229,229,229,0.4)"
              hoverStrokeColor="#00c980"
              fillColor="rgba(0, 201, 128, 0.8)"
              strokeWidth={1.5}
            />
          </div>

          <div className="flex items-center gap-3">
            <GlobalAssetSearch />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}
