import { type ReactNode, useState, useCallback } from 'react';
import { Header, Sidebar } from '../ui';

interface DashboardLayoutProps {
  children: ReactNode;
  padding?: string;
  maxWidth?: string;
}

export function DashboardLayout({
  children,
  padding = 'px-4 py-4 lg:px-6 lg:py-5',
  maxWidth = 'max-w-6xl',
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => setSidebarOpen(prev => !prev), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="h-screen bg-dark-bg/30 relative overflow-hidden">
      {/* Atmospheric background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-altrion-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent-cyan/5 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '10s' }} />
      </div>

      {/* Fixed header - content scrolls behind it */}
      <header className="fixed top-0 left-0 right-0 z-50">
        <Header onMenuToggle={toggleSidebar} />
      </header>

      {/* Sidebar — always visible on lg+, slide-in drawer on smaller screens */}
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />

      {/* Scrollable content area */}
      <main className={`ml-0 lg:ml-56 mt-12 h-[calc(100vh-3rem)] overflow-y-auto relative z-10 ${padding}`}>
        <div className={`${maxWidth} mx-auto`}>
          {children}
        </div>
      </main>
    </div>
  );
}
