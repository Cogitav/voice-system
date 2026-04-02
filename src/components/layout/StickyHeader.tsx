import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StickyHeaderProps {
  children: ReactNode;
  className?: string;
}

/**
 * StickyHeader — sticks to top within the scroll container.
 * Solid background, safe z-index.
 */
export function StickyHeader({ children, className }: StickyHeaderProps) {
  return (
    <div
      className={cn(
        'sticky top-0 z-20 bg-background border-b flex-shrink-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
