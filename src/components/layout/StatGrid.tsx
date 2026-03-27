import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatGridProps {
  children: ReactNode;
  className?: string;
}

/**
 * StatGrid — unified responsive grid for stat/metric cards.
 * Mobile: 2 cols, Tablet: 3 cols, Desktop: up to 6 cols.
 */
export function StatGrid({ children, className }: StatGridProps) {
  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4', className)}>
      {children}
    </div>
  );
}
