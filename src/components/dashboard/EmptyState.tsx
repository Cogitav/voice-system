import { LucideIcon, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  className?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  variant?: 'default' | 'compact' | 'inline';
}

export function EmptyState({ 
  icon: Icon = Database, 
  title, 
  description = 'Sem dados disponíveis',
  className = '',
  action,
  variant = 'default',
}: EmptyStateProps) {
  if (variant === 'inline') {
    return (
      <div className={cn('flex items-center gap-3 py-4 px-3 rounded-lg bg-muted/30 border border-dashed', className)}>
        <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        </div>
        {action && (
          <Button variant="outline" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={cn('flex flex-col items-center justify-center py-8 text-center', className)}>
        <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
          <Icon className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground mb-0.5">{title}</p>
        <p className="text-xs text-muted-foreground max-w-xs">{description}</p>
        {action && (
          <Button variant="outline" size="sm" onClick={action.onClick} className="mt-3">
            {action.label}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
      {action && (
        <Button variant="default" onClick={action.onClick} className="mt-4">
          {action.label}
        </Button>
      )}
    </div>
  );
}
