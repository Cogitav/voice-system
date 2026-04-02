import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Save, Loader2, CalendarDays } from 'lucide-react';
import { useBusinessHours, useUpsertBusinessHours, DAY_LABELS, BusinessHourFormData } from '@/hooks/useBusinessHours';

interface Props {
  empresaId: string;
}

interface DayState {
  is_closed: boolean;
  start_time: string;
  end_time: string;
}

const DEFAULT_DAY: DayState = { is_closed: false, start_time: '09:00', end_time: '18:00' };
const CLOSED_DAY: DayState = { is_closed: true, start_time: '09:00', end_time: '18:00' };

function getInitialState(): Record<number, DayState> {
  return {
    0: { ...CLOSED_DAY }, // Sunday closed
    1: { ...DEFAULT_DAY },
    2: { ...DEFAULT_DAY },
    3: { ...DEFAULT_DAY },
    4: { ...DEFAULT_DAY },
    5: { ...DEFAULT_DAY },
    6: { ...CLOSED_DAY }, // Saturday closed
  };
}

export function BusinessHoursEditor({ empresaId }: Props) {
  const { data: hours, isLoading } = useBusinessHours(empresaId);
  const upsertMutation = useUpsertBusinessHours(empresaId);
  const [days, setDays] = useState<Record<number, DayState>>(getInitialState());
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (hours && hours.length > 0) {
      const state = getInitialState();
      hours.forEach(h => {
        state[h.day_of_week] = {
          is_closed: h.is_closed,
          start_time: h.start_time.substring(0, 5),
          end_time: h.end_time.substring(0, 5),
        };
      });
      setDays(state);
      setHasChanges(false);
    }
  }, [hours]);

  const updateDay = (day: number, update: Partial<DayState>) => {
    setDays(prev => ({ ...prev, [day]: { ...prev[day], ...update } }));
    setHasChanges(true);
  };

  const handleSave = () => {
    const formData: BusinessHourFormData[] = Object.entries(days).map(([day, state]) => ({
      day_of_week: parseInt(day),
      start_time: state.start_time + ':00',
      end_time: state.end_time + ':00',
      is_closed: state.is_closed,
    }));
    upsertMutation.mutate(formData, {
      onSuccess: () => setHasChanges(false),
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Horário de Funcionamento
            </CardTitle>
            <CardDescription>
              Define os horários de disponibilidade para agendamentos.
            </CardDescription>
          </div>
          {hasChanges && (
            <Button type="button" size="sm" onClick={handleSave} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Guardar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6, 0].map(day => {
            const state = days[day];
            return (
              <div key={day} className="flex flex-col md:flex-row md:items-center gap-3 p-2 rounded-lg border min-w-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-28 flex-shrink-0">
                    <Label className="text-sm font-medium">{DAY_LABELS[day]}</Label>
                  </div>
                  <Switch
                    checked={!state.is_closed}
                    onCheckedChange={(checked) => updateDay(day, { is_closed: !checked })}
                  />
                  {state.is_closed && (
                    <span className="text-sm text-muted-foreground">Fechado</span>
                  )}
                </div>
                {!state.is_closed && (
                  <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                    <Input
                      type="time"
                      value={state.start_time}
                      onChange={(e) => updateDay(day, { start_time: e.target.value })}
                      className="w-full sm:w-28 h-8 text-sm"
                    />
                    <span className="text-muted-foreground text-sm hidden sm:inline self-center">–</span>
                    <Input
                      type="time"
                      value={state.end_time}
                      onChange={(e) => updateDay(day, { end_time: e.target.value })}
                      className="w-full sm:w-28 h-8 text-sm"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
