import { LucideIcon, Loader2 } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'primary' | 'success' | 'warning';
  isLoading?: boolean;
}

export function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend,
  variant = 'default',
  isLoading = false,
}: StatCardProps) {
  const variantStyles = {
    default: 'text-muted-foreground',
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
  };

  return (
    <div className="stat-card animate-fade-in min-w-0">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0 ${variantStyles[variant]}`}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        {trend && (
          <span className={`text-xs font-medium ${trend.isPositive ? 'text-success' : 'text-destructive'}`}>
            {trend.isPositive ? '+' : ''}{trend.value}%
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="flex items-center h-7 mb-1">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <h3 className="text-lg sm:text-2xl font-semibold text-foreground mb-1 truncate">{value}</h3>
      )}
      <p className="text-xs sm:text-sm text-muted-foreground truncate">{title}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{subtitle}</p>
      )}
    </div>
  );
}
