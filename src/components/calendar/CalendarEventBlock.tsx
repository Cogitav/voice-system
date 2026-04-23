import { cn } from '@/lib/utils';
import { CalendarEvent } from '@/hooks/useCalendarData';

interface CalendarEventBlockProps {
  event: CalendarEvent;
  top: number;
  height: number;
  resourceColor?: string | null;
  onClick: () => void;
}

function getStatusClasses(estado: string) {
  switch (estado) {
    case 'confirmado':
      return 'border-emerald-500/50';
    case 'pendente':
    case 'requested':
      return 'border-amber-500/50';
    case 'cancelado':
      return 'border-muted-foreground/30';
    case 'concluido':
      return 'border-destructive/50';
    default:
      return 'border-primary/50';
  }
}

function getStatusBgFallback(estado: string) {
  switch (estado) {
    case 'confirmado':
      return 'bg-emerald-500/20 text-emerald-200';
    case 'pendente':
    case 'requested':
      return 'bg-amber-500/20 text-amber-200';
    case 'cancelado':
      return 'bg-muted/50 text-muted-foreground';
    case 'concluido':
      return 'bg-destructive/20 text-destructive';
    default:
      return 'bg-primary/20 text-primary';
  }
}

export function CalendarEventBlock({ event, top, height, resourceColor, onClick }: CalendarEventBlockProps) {
  const horaEnd = (() => {
    if (event.duration_minutes) {
      const [h, m] = event.hora.split(':').map(Number);
      const totalMin = h * 60 + m + event.duration_minutes;
      return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
    }
    if (event.end_datetime) {
      const d = new Date(event.end_datetime);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return null;
  })();

  const useResourceColor = !!resourceColor;
  const bgStyle = useResourceColor
    ? { backgroundColor: `${resourceColor}30`, top, height: Math.max(height - 2, 20) }
    : { top, height: Math.max(height - 2, 20) };

  return (
    <div
      className={cn(
        'absolute left-0.5 right-0.5 rounded-md border px-1.5 py-0.5 cursor-pointer overflow-hidden transition-shadow hover:shadow-md z-10',
        getStatusClasses(event.estado),
        !useResourceColor && getStatusBgFallback(event.estado),
      )}
      style={bgStyle}
      onClick={onClick}
    >
      <p className="text-xs font-medium truncate" style={useResourceColor ? { color: resourceColor } : undefined}>
        {event.cliente_nome || 'Sem nome'}
      </p>
      <p className="text-[10px] opacity-80 truncate">
        {event.hora.substring(0, 5)}
        {horaEnd && ` – ${horaEnd}`}
      </p>
      {event.service_name && height > 40 && (
        <p className="text-[10px] opacity-70 truncate">{event.service_name}</p>
      )}
    </div>
  );
}
