import { useMemo } from 'react';
import { format, addDays, isSameDay, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { CalendarResource, CalendarEvent } from '@/hooks/useCalendarData';
import { CalendarEventBlock } from './CalendarEventBlock';

const START_HOUR = 7;
const END_HOUR = 20;
const SLOT_HEIGHT = 48; // px per 30min slot

interface CalendarTimeGridProps {
  currentDate: Date;
  viewMode: 'week' | 'day';
  resources: CalendarResource[];
  events: CalendarEvent[];
  onSlotClick: (date: string, time: string, resourceId: string) => void;
  onEventClick: (event: CalendarEvent) => void;
}

function getTimeSlots() {
  const slots: string[] = [];
  for (let h = START_HOUR; h < END_HOUR; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
}

function getEventPosition(event: CalendarEvent) {
  // CRITICAL: Always use event.hora (stored in Europe/Lisbon local time)
  // NEVER derive time from start_datetime to avoid UTC conversion offset
  const [hStr, mStr] = event.hora.split(':');
  const h = parseInt(hStr);
  const m = parseInt(mStr);
  const topMinutes = (h - START_HOUR) * 60 + m;
  const top = (topMinutes / 30) * SLOT_HEIGHT;
  const duration = event.duration_minutes || 30;
  const height = (duration / 30) * SLOT_HEIGHT;
  return { top, height: Math.max(height, SLOT_HEIGHT / 2) };
}

export function CalendarTimeGrid({
  currentDate,
  viewMode,
  resources,
  events,
  onSlotClick,
  onEventClick,
}: CalendarTimeGridProps) {
  const timeSlots = useMemo(() => getTimeSlots(), []);

  const days = useMemo(() => {
    if (viewMode === 'day') return [currentDate];
    return Array.from({ length: 7 }, (_, i) => addDays(currentDate, i));
  }, [currentDate, viewMode]);

  const columns = useMemo(() => {
    if (resources.length === 0) {
      // If no resources, show one column per day
      return days.map(day => ({
        key: format(day, 'yyyy-MM-dd'),
        label: format(day, 'EEE d', { locale: pt }),
        date: day,
        resourceId: '__none__',
        resourceName: null,
      }));
    }

    // In weekly view with resources, show resource columns per day
    const cols: { key: string; label: string; date: Date; resourceId: string; resourceName: string | null; dayLabel?: string }[] = [];
    for (const day of days) {
      for (const r of resources) {
        cols.push({
          key: `${format(day, 'yyyy-MM-dd')}_${r.id}`,
          label: r.name,
          date: day,
          resourceId: r.id,
          resourceName: r.name,
          dayLabel: format(day, 'EEE d', { locale: pt }),
        });
      }
    }
    return cols;
  }, [days, resources]);

  // Group columns by day for header rendering
  const dayGroups = useMemo(() => {
    const groups: { date: Date; label: string; colSpan: number }[] = [];
    let lastDay = '';
    for (const col of columns) {
      const dayStr = format(col.date, 'yyyy-MM-dd');
      if (dayStr !== lastDay) {
        groups.push({
          date: col.date,
          label: format(col.date, 'EEE d', { locale: pt }),
          colSpan: resources.length > 0 ? resources.length : 1,
        });
        lastDay = dayStr;
      }
    }
    return groups;
  }, [columns, resources]);

  const getEventsForColumn = (date: Date, resourceId: string) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return events.filter(e => {
      if (e.data !== dateStr) return false;
      if (resourceId === '__none__') return true;
      return e.resource_ids.includes(resourceId) || e.resource_id === resourceId;
    });
  };

  const isToday = (date: Date) => isSameDay(date, new Date());

  return (
    <div className="flex-1 overflow-auto border rounded-lg bg-card">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-card border-b">
        {/* Day headers */}
        <div className="flex">
          <div className="w-16 flex-shrink-0 border-r" />
          {dayGroups.map(group => (
            <div
              key={format(group.date, 'yyyy-MM-dd')}
              className={cn(
                'flex-1 text-center py-2 text-sm font-medium border-r last:border-r-0 capitalize',
                isToday(group.date) && 'text-primary bg-primary/5'
              )}
              style={{ minWidth: resources.length > 0 ? resources.length * 140 : 140 }}
            >
              {group.label}
            </div>
          ))}
        </div>
        {/* Resource sub-headers */}
        {resources.length > 0 && (
          <div className="flex border-t">
            <div className="w-16 flex-shrink-0 border-r" />
            {columns.map(col => (
              <div
                key={col.key}
                className="flex-1 text-center py-1.5 text-xs text-muted-foreground border-r last:border-r-0 truncate px-1"
                style={{ minWidth: 140 }}
              >
                {col.resourceName}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Time grid body */}
      <div className="flex">
        {/* Time labels */}
        <div className="w-16 flex-shrink-0 border-r">
          {timeSlots.map((slot, i) => (
            <div
              key={slot}
              className="border-b text-right pr-2 text-xs text-muted-foreground"
              style={{ height: SLOT_HEIGHT }}
            >
              {i % 2 === 0 && <span className="relative -top-2">{slot}</span>}
            </div>
          ))}
        </div>

        {/* Columns */}
        {columns.map(col => (
          <div
            key={col.key}
            className="flex-1 relative border-r last:border-r-0"
            style={{ minWidth: 140 }}
          >
            {/* Slot backgrounds */}
            {timeSlots.map((slot, i) => (
              <div
                key={slot}
                className={cn(
                  'border-b cursor-pointer hover:bg-accent/30 transition-colors',
                  i % 2 === 0 && 'border-b-border',
                  i % 2 !== 0 && 'border-b-border/30'
                )}
                style={{ height: SLOT_HEIGHT }}
                onClick={() => onSlotClick(format(col.date, 'yyyy-MM-dd'), slot, col.resourceId)}
              />
            ))}

            {/* Event blocks */}
            {getEventsForColumn(col.date, col.resourceId).map(event => {
              const pos = getEventPosition(event);
              const res = resources.find(r => r.id === col.resourceId);
              return (
                <CalendarEventBlock
                  key={event.id}
                  event={event}
                  top={pos.top}
                  height={pos.height}
                  resourceColor={res?.color}
                  onClick={() => onEventClick(event)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
