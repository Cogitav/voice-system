import { ReactNode, useState, useCallback, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { MobileHeader } from './MobileHeader';
import { useIsMobile } from '@/hooks/use-mobile';

interface AppShellProps {
  children: ReactNode;
}

/**
 * AppShell — the single root layout component.
 * Handles sidebar, mobile overlay with body scroll lock, and a single scroll container.
 */
export function AppShell({ children }: AppShellProps) {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleMobile = useCallback(() => setMobileOpen((v) => !v), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (isMobile && mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobile, mobileOpen]);

  return (
    <div className="min-h-screen bg-background flex overflow-x-hidden">
      {/* Desktop sidebar — fixed */}
      {!isMobile && (
        <aside className="fixed left-0 top-0 z-30 h-screen w-64 flex-shrink-0">
          <Sidebar onNavigate={closeMobile} />
        </aside>
      )}

      {/* Mobile overlay + sidebar */}
      {isMobile && mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={closeMobile}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 animate-slide-in-left overflow-y-auto">
            <Sidebar onNavigate={closeMobile} />
          </aside>
        </>
      )}

      {/* Main content — single scroll container */}
      <div className={`flex flex-1 flex-col min-w-0 ${!isMobile ? 'ml-64' : ''}`}>
        {isMobile && <MobileHeader onMenuToggle={toggleMobile} />}
        <main className="flex-1 min-h-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
