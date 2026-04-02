import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { DateRange } from '@/hooks/useRelatorios';

interface DateRangeSelectorProps {
  value: DateRange;
  onChange: (value: DateRange) => void;
}

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-sm text-muted-foreground flex items-center gap-1">
        <Calendar className="h-4 w-4" />
        Período:
      </Label>
      <div className="flex gap-1">
        <Button
          variant={value === '7d' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange('7d')}
        >
          Últimos 7 dias
        </Button>
        <Button
          variant={value === '30d' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange('30d')}
        >
          Últimos 30 dias
        </Button>
      </div>
    </div>
  );
}
