import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionProps {
  children: ReactNode;
  /** Spacing between child elements. Defaults to 'md' (space-y-6) */
  spacing?: 'sm' | 'md' | 'lg';
  className?: string;
}

const spacingMap = {
  sm: 'space-y-4',
  md: 'space-y-6',
  lg: 'space-y-8',
};

/**
 * Section — consistent vertical spacing between blocks of content.
 * No internal scroll.
 */
export function Section({ children, spacing = 'md', className }: SectionProps) {
  return (
    <div className={cn(spacingMap[spacing], className)}>
      {children}
    </div>
  );
}
