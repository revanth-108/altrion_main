import { memo } from 'react';
import { Bell, Settings, LogOut } from 'lucide-react';
import { Button, Logo, ThemeToggle } from '@/components/ui';
import { useLogout } from '@/hooks';

export const DashboardNav = memo(function DashboardNav() {
  const logoutMutation = useLogout();

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <nav className="border-b border-dark-border bg-dark-card/80 backdrop-blur-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-5 py-3">
        <div className="flex items-center justify-between">
          <Logo size="sm" />

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" aria-label="Notifications">
              <Bell size={18} />
            </Button>
            <Button variant="ghost" size="sm" aria-label="Settings">
              <Settings size={18} />
            </Button>
            <div className="w-px h-6 bg-dark-border" />
            <ThemeToggle />
            <div className="w-px h-6 bg-dark-border" />
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleLogout}
              aria-label="Logout"
            >
              <LogOut size={18} />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
});
