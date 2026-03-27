import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SplitViewProps {
  children: ReactNode;
  /** Number of columns on desktop (default 2) */
  columns?: 2 | 3;
  className?: string;
}

/**
 * SplitView — horizontal split on desktop, stacked on mobile.
 * Each child should manage its own internal scroll if needed.
 * Uses CSS Grid for equal-height columns.
 */
export function SplitView({ children, columns = 2, className }: SplitViewProps) {
  const colsClass = columns === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2';

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4',
        colsClass,
        'h-[calc(100dvh-14rem)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
