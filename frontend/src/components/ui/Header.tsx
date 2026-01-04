import { Bell, Settings, LogOut } from 'lucide-react';
import { Button } from './Button';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { useLogout } from '../../hooks';

export function Header() {
  const logoutMutation = useLogout();

  return (
    <nav className="header-nav border-b border-dark-border bg-dark-card/80 backdrop-blur-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-5 py-1.5">
        <div className="flex items-center justify-between">
          <Logo size="md" variant="icon" />

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm">
              <Bell size={18} />
            </Button>
            <Button variant="ghost" size="sm">
              <Settings size={18} />
            </Button>
            <div className="w-px h-6 bg-dark-border" />
            <ThemeToggle />
            <div className="w-px h-6 bg-dark-border" />
            <Button variant="ghost" size="sm" onClick={() => logoutMutation.mutate()}>
              <LogOut size={18} />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
