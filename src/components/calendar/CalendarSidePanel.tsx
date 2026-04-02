import { useEffect, useState } from 'react';
import { X, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarEvent, CalendarResource } from '@/hooks/useCalendarData';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  empresa_id: string;
}

interface CalendarSidePanelProps {
  mode: 'create' | 'edit';
  event?: CalendarEvent | null;
  defaultDate?: string;
  defaultTime?: string;
  defaultResourceId?: string;
  resources: CalendarResource[];
  services: Service[];
  onClose: () => void;
}

export function CalendarSidePanel({
  mode,
  event,
  defaultDate,
  defaultTime,
  defaultResourceId,
  resources,
  services,
  onClose,
}: CalendarSidePanelProps) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [clienteNome, setClienteNome] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [serviceId, setServiceId] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [estado, setEstado] = useState('pendente');
  const [notas, setNotas] = useState('');

  useEffect(() => {
    if (mode === 'edit' && event) {
      setClienteNome(event.cliente_nome || '');
      setClienteTelefone(event.cliente_telefone || '');
      setData(event.data);
      setHora(event.hora.substring(0, 5));
      setDurationMinutes(event.duration_minutes || 30);
      setServiceId(event.service_id || '');
      setResourceId(event.resource_id || event.resource_ids[0] || '');
      setEstado(event.estado);
      setNotas(event.notas || '');
    } else {
      setClienteNome('');
      setClienteTelefone('');
      setData(defaultDate || '');
      setHora(defaultTime?.substring(0, 5) || '');
      setDurationMinutes(30);
      setServiceId('');
      setResourceId(defaultResourceId || '');
      setEstado('pendente');
      setNotas('');
    }
  }, [mode, event, defaultDate, defaultTime, defaultResourceId]);

  // When service changes, update duration
  useEffect(() => {
    if (serviceId) {
      const s = services.find(s => s.id === serviceId);
      if (s) setDurationMinutes(s.duration_minutes);
    }
  }, [serviceId, services]);

  const checkConflict = async (): Promise<boolean> => {
    if (!resourceId || resourceId === '__none__') return false;

    const [h, m] = hora.split(':').map(Number);
    const startMin = h * 60 + m;
    const endMin = startMin + durationMinutes;

    // Fetch existing appointments for this resource on this day
    const { data: existing } = await supabase
      .from('agendamentos')
      .select('id, hora, duration_minutes')
      .eq('data', data)
      .eq('resource_id', resourceId)
      .in('scheduling_state', ['requested', 'confirmed'])
      .neq('id', event?.id || '00000000-0000-0000-0000-000000000000');

    if (!existing) return false;

    for (const ex of existing) {
      const [eh, em] = ex.hora.split(':').map(Number);
      const exStart = eh * 60 + em;
      const exEnd = exStart + (ex.duration_minutes || 30);
      if (startMin < exEnd && endMin > exStart) return true;
    }

    // Also check appointment_resources
    const { data: arExisting } = await supabase
      .from('appointment_resources')
      .select('appointment_id')
      .eq('resource_id', resourceId);

    if (arExisting && arExisting.length > 0) {
      const appointmentIds = arExisting.map(a => a.appointment_id).filter(id => id !== event?.id);
      if (appointmentIds.length > 0) {
        const { data: arAppointments } = await supabase
          .from('agendamentos')
          .select('id, hora, duration_minutes')
          .eq('data', data)
          .in('id', appointmentIds)
          .in('scheduling_state', ['requested', 'confirmed']);

        if (arAppointments) {
          for (const ex of arAppointments) {
            const [eh, em] = ex.hora.split(':').map(Number);
            const exStart = eh * 60 + em;
            const exEnd = exStart + (ex.duration_minutes || 30);
            if (startMin < exEnd && endMin > exStart) return true;
          }
        }
      }
    }

    return false;
  };

  const handleSave = async () => {
    if (!data || !hora) {
      toast.error('Data e hora são obrigatórios.');
      return;
    }

    // Need at least one resource to know empresa_id
    const resource = resources.find(r => r.id === resourceId);
    if (!resource && resources.length > 0) {
      toast.error('Selecione um recurso.');
      return;
    }

    setSaving(true);

    try {
      const hasConflict = await checkConflict();
      if (hasConflict) {
        toast.error('Este recurso já está ocupado neste horário.');
        setSaving(false);
        return;
      }

      const empresaId = resource?.empresa_id || event?.empresa_id;
      if (!empresaId) {
        toast.error('Não foi possível determinar a empresa.');
        setSaving(false);
        return;
      }

      const [h, m] = hora.split(':').map(Number);
      const startDt = new Date(`${data}T${hora}:00`);
      const endDt = new Date(startDt.getTime() + durationMinutes * 60000);

      const payload = {
        empresa_id: empresaId,
        data,
        hora: `${hora}:00`,
        duration_minutes: durationMinutes,
        start_datetime: startDt.toISOString(),
        end_datetime: endDt.toISOString(),
        cliente_nome: clienteNome || null,
        cliente_telefone: clienteTelefone || null,
        service_id: serviceId || null,
        resource_id: resourceId && resourceId !== '__none__' ? resourceId : null,
        estado,
        scheduling_state: estado === 'confirmado' ? 'confirmed' : 'requested',
        notas: notas || null,
      };

      if (mode === 'edit' && event) {
        const { error } = await supabase
          .from('agendamentos')
          .update(payload)
          .eq('id', event.id);
        if (error) throw error;
        toast.success('Agendamento atualizado.');
      } else {
        const { data: newRow, error } = await supabase
          .from('agendamentos')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;

        // Insert appointment_resources if resource selected
        if (resourceId && resourceId !== '__none__' && newRow) {
          await supabase.from('appointment_resources').insert({
            appointment_id: newRow.id,
            resource_id: resourceId,
          });
        }

        toast.success('Agendamento criado.');
      }

      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!event) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('agendamentos')
        .delete()
        .eq('id', event.id);
      if (error) throw error;

      toast.success('Agendamento eliminado.');
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao eliminar.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="w-80 border-l bg-card flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">
          {mode === 'edit' ? 'Editar Agendamento' : 'Novo Agendamento'}
        </h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 p-4 space-y-4">
        <div>
          <Label>Nome do Cliente</Label>
          <Input value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Nome" />
        </div>

        <div>
          <Label>Telefone</Label>
          <Input value={clienteTelefone} onChange={e => setClienteTelefone(e.target.value)} placeholder="+351..." />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Data</Label>
            <Input type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>
          <div>
            <Label>Hora</Label>
            <Input type="time" value={hora} onChange={e => setHora(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Duração (min)</Label>
          <Input type="number" value={durationMinutes} onChange={e => setDurationMinutes(Number(e.target.value))} min={15} step={15} />
        </div>

        {services.length > 0 && (
          <div>
            <Label>Serviço</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger>
                <SelectValue placeholder="Opcional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {services.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.duration_minutes}min)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {resources.length > 0 && (
          <div>
            <Label>Recurso</Label>
            <Select value={resourceId} onValueChange={setResourceId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {resources.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label>Estado</Label>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="confirmado">Confirmado</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
              <SelectItem value="concluido">Concluído</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Notas</Label>
          <Textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3} placeholder="Notas..." />
        </div>
      </div>

      <div className="p-4 border-t space-y-2">
        <Button className="w-full gap-2" onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? 'A guardar...' : 'Guardar'}
        </Button>
        {mode === 'edit' && (
          <Button variant="destructive" className="w-full gap-2" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="h-4 w-4" />
            {deleting ? 'A eliminar...' : 'Eliminar'}
          </Button>
        )}
      </div>
    </div>
  );
}
