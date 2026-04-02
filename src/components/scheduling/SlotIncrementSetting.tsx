import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Save, Loader2, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Props {
  empresaId: string;
}

const INCREMENTS = [
  { value: '5', label: '5 minutos' },
  { value: '10', label: '10 minutos' },
  { value: '15', label: '15 minutos' },
  { value: '20', label: '20 minutos' },
  { value: '30', label: '30 minutos' },
  { value: '60', label: '60 minutos' },
];

export function SlotIncrementSetting({ empresaId }: Props) {
  const queryClient = useQueryClient();

  const { data: empresa } = useQuery({
    queryKey: ['empresa-slot-increment', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresas')
        .select('slot_increment_minutes')
        .eq('id', empresaId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [value, setValue] = useState('15');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (empresa) {
      setValue(String(empresa.slot_increment_minutes ?? 15));
      setHasChanges(false);
    }
  }, [empresa]);

  const mutation = useMutation({
    mutationFn: async (increment: number) => {
      const { error } = await supabase
        .from('empresas')
        .update({ slot_increment_minutes: increment })
        .eq('id', empresaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa-slot-increment', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      toast.success('Incremento de slots guardado');
      setHasChanges(false);
    },
    onError: (error: Error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Incremento de Slots
            </CardTitle>
            <CardDescription>
              Intervalo entre slots disponíveis na consulta de disponibilidade.
            </CardDescription>
          </div>
          {hasChanges && (
            <Button type="button" size="sm" onClick={() => mutation.mutate(parseInt(value))} disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Guardar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Label className="text-sm">Intervalo:</Label>
          <Select value={value} onValueChange={(v) => { setValue(v); setHasChanges(true); }}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INCREMENTS.map(i => (
                <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
