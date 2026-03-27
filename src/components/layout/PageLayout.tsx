import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageLayoutProps {
  children: ReactNode;
  /** Remove max-width constraint (e.g. for conversations full-width layout) */
  fluid?: boolean;
  className?: string;
}

/**
 * PageLayout — standard page content wrapper.
 * Provides consistent padding, max-width, and overflow-x protection.
 */
export function PageLayout({ children, fluid = false, className }: PageLayoutProps) {
  return (
    <div
      className={cn(
        'w-full px-4 py-6 sm:px-6 lg:px-8 overflow-x-hidden',
        !fluid && 'max-w-screen-2xl mx-auto',
        className,
      )}
    >
      {children}
    </div>
  );
}
