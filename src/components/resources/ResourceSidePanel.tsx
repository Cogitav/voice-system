import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  useCreateSchedulingResource,
  useUpdateSchedulingResource,
  SchedulingResource,
  SchedulingResourceFormData,
} from '@/hooks/useSchedulingResources';

interface ResourceSidePanelProps {
  resource: SchedulingResource | null;
  empresaId: string;
  onClose: () => void;
}

const PRESET_COLORS = [
  '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
];

export function ResourceSidePanel({ resource, empresaId, onClose }: ResourceSidePanelProps) {
  const createMutation = useCreateSchedulingResource(empresaId);
  const updateMutation = useUpdateSchedulingResource(empresaId);
  const isEdit = !!resource;

  const [name, setName] = useState('');
  const [type, setType] = useState<'person' | 'room' | 'equipment'>('person');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [duration, setDuration] = useState(30);
  const [priority, setPriority] = useState(0);
  const [capacity, setCapacity] = useState(1);
  const [color, setColor] = useState('#3b82f6');
  const [calendarType, setCalendarType] = useState('internal');

  useEffect(() => {
    if (resource) {
      setName(resource.name);
      setType(resource.type);
      setStatus(resource.status);
      setDuration(resource.default_appointment_duration_minutes);
      setPriority(resource.priority);
      setCapacity(resource.capacity ?? 1);
      setColor(resource.color || '#3b82f6');
      setCalendarType(resource.calendar_type || 'internal');
    } else {
      setName('');
      setType('person');
      setStatus('active');
      setDuration(30);
      setPriority(0);
      setCapacity(1);
      setColor('#3b82f6');
      setCalendarType('internal');
    }
  }, [resource]);

  const handleSave = () => {
    if (!name.trim()) return;
    if (!empresaId) {
      console.error('[Resources] Missing empresa_id in profile. Cannot save resource.');
      return;
    }

    const data: SchedulingResourceFormData = {
      name: name.trim(),
      type,
      status,
      default_appointment_duration_minutes: duration,
      priority,
      calendar_type: calendarType,
    };

    if (isEdit) {
      updateMutation.mutate(
        { id: resource.id, data: { ...data, color, capacity } as any },
        { onSuccess: onClose }
      );
    } else {
      createMutation.mutate(
        { ...data, color, capacity } as any,
        { onSuccess: onClose }
      );
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[380px] sm:w-[420px]">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar Recurso' : 'Novo Recurso'}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Dr. Silva / Sala 1" />
          </div>

          <div>
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="person">Pessoa</SelectItem>
                <SelectItem value="room">Sala</SelectItem>
                <SelectItem value="equipment">Equipamento</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Estado</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Duração Padrão (min)</Label>
              <Input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} min={5} step={5} />
            </div>
            <div>
              <Label>Prioridade</Label>
              <Input type="number" value={priority} onChange={e => setPriority(Number(e.target.value))} min={0} />
            </div>
          </div>

          <div>
            <Label>Capacidade</Label>
            <Input type="number" value={capacity} onChange={e => setCapacity(Number(e.target.value))} min={1} />
            <p className="text-xs text-muted-foreground mt-1">Nº de agendamentos simultâneos permitidos.</p>
          </div>

          <div>
            <Label>Cor</Label>
            <div className="flex items-center gap-2 mt-1.5">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: c === color ? 'hsl(var(--foreground))' : 'transparent',
                  }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="w-10 h-8 p-0 border-0 cursor-pointer"
              />
              <Input
                value={color}
                onChange={e => setColor(e.target.value)}
                className="flex-1 h-8 text-sm font-mono"
                placeholder="#hex"
              />
            </div>
          </div>
        </div>

        <div className="mt-6">
          <Button className="w-full gap-2" onClick={handleSave} disabled={saving || !name.trim() || !empresaId}>
            <Save className="h-4 w-4" />
            {saving ? 'A guardar...' : 'Guardar'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
