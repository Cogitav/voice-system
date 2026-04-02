import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

interface SidePanelProps {
  children: ReactNode;
  /** Desktop width class (default w-80) */
  widthClass?: string;
  /** Whether the panel is open (desktop) */
  isOpen: boolean;
  /** Mobile-specific: collapsible label */
  mobileLabel?: string;
  /** Mobile collapsible state */
  mobileOpen?: boolean;
  onMobileToggle?: (open: boolean) => void;
  className?: string;
}

/**
 * SidePanel — fixed-width side panel on desktop, collapsible on mobile.
 * Desktop: rendered as a flex-shrink-0 column with internal scroll.
 * Mobile: rendered as a collapsible section.
 */
export function SidePanel({
  children,
  widthClass = 'w-72 xl:w-80',
  isOpen,
  mobileLabel = 'Painel',
  mobileOpen = false,
  onMobileToggle,
  className,
}: SidePanelProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Collapsible open={mobileOpen} onOpenChange={onMobileToggle}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-3 border-t bg-muted/30 text-sm font-medium">
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              {mobileLabel}
            </span>
            {mobileOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="max-h-[40vh] overflow-y-auto">
            {children}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'border-l bg-muted/20 flex flex-col h-full flex-shrink-0 min-h-0',
        widthClass,
        className,
      )}
    >
      {children}
    </div>
  );
}
