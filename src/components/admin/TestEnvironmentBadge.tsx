import { Badge } from '@/components/ui/badge';
import { FlaskConical } from 'lucide-react';

interface TestEnvironmentBadgeProps {
  className?: string;
  size?: 'sm' | 'default';
}

export function TestEnvironmentBadge({ className, size = 'default' }: TestEnvironmentBadgeProps) {
  return (
    <Badge 
      variant="outline" 
      className={`
        bg-amber-500/10 text-amber-600 border-amber-500/30 
        ${size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'px-2 py-1'}
        ${className}
      `}
    >
      <FlaskConical className={size === 'sm' ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-1.5'} />
      AMBIENTE DE TESTE
    </Badge>
  );
}
