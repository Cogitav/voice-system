import { ChevronLeft, ChevronRight, CalendarDays, LayoutList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, addDays } from 'date-fns';
import { pt } from 'date-fns/locale';

interface CalendarHeaderProps {
  currentDate: Date;
  viewMode: 'week' | 'day';
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewModeChange: (mode: 'week' | 'day') => void;
}

export function CalendarHeader({
  currentDate,
  viewMode,
  onPrev,
  onNext,
  onToday,
  onViewModeChange,
}: CalendarHeaderProps) {
  const getTitle = () => {
    if (viewMode === 'day') {
      return format(currentDate, "EEEE, d 'de' MMMM yyyy", { locale: pt });
    }
    const weekStart = currentDate;
    const weekEnd = addDays(currentDate, 6);
    if (weekStart.getMonth() === weekEnd.getMonth()) {
      return `${format(weekStart, 'd', { locale: pt })} – ${format(weekEnd, "d 'de' MMMM yyyy", { locale: pt })}`;
    }
    return `${format(weekStart, "d MMM", { locale: pt })} – ${format(weekEnd, "d MMM yyyy", { locale: pt })}`;
  };

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onToday}>
          Hoje
        </Button>
        <Button variant="ghost" size="icon" onClick={onPrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold capitalize ml-2">{getTitle()}</h2>
      </div>
      <div className="flex items-center gap-1 border rounded-md p-0.5">
        <Button
          variant={viewMode === 'day' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('day')}
          className="gap-1.5"
        >
          <LayoutList className="h-3.5 w-3.5" />
          Dia
        </Button>
        <Button
          variant={viewMode === 'week' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('week')}
          className="gap-1.5"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Semana
        </Button>
      </div>
    </div>
  );
}
