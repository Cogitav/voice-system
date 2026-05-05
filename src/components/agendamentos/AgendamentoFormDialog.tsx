import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Calendar, Plus, Pencil } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEmpresas } from '@/hooks/useEmpresas';
import { useAgentes } from '@/hooks/useAgentes';
import { 
  Agendamento, 
  AgendamentoFormData, 
  useCreateAgendamento, 
  useUpdateAgendamento 
} from '@/hooks/useAgendamentos';
import { useState } from 'react';

const formSchema = z.object({
  empresa_id: z.string().min(1, 'Selecione uma empresa'),
  agente_id: z.string().optional(),
  data: z.string().min(1, 'Selecione uma data'),
  hora: z.string().min(1, 'Selecione uma hora'),
  estado: z.string().optional(),
  cliente_nome: z.string().optional(),
  cliente_telefone: z.string().optional(),
  notas: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface AgendamentoFormDialogProps {
  agendamento?: Agendamento | null;
  defaultValues?: Partial<AgendamentoFormData>;
  chamadaId?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AgendamentoFormDialog({ 
  agendamento, 
  defaultValues,
  chamadaId,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: AgendamentoFormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? controlledOnOpenChange! : setInternalOpen;

  const isEditing = !!agendamento;
  const { data: empresas = [] } = useEmpresas();
  const { data: agentes = [] } = useAgentes();
  const createAgendamento = useCreateAgendamento();
  const updateAgendamento = useUpdateAgendamento();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      empresa_id: defaultValues?.empresa_id || agendamento?.empresa_id || '',
      agente_id: defaultValues?.agente_id || agendamento?.agente_id || '',
      data: defaultValues?.data || agendamento?.data || '',
      hora: defaultValues?.hora || agendamento?.hora?.substring(0, 5) || '',
      estado: agendamento?.estado || 'pendente',
      cliente_nome: defaultValues?.cliente_nome || agendamento?.cliente_nome || '',
      cliente_telefone: defaultValues?.cliente_telefone || agendamento?.cliente_telefone || '',
      notas: agendamento?.notas || '',
    },
  });

  const selectedEmpresaId = form.watch('empresa_id');
  const filteredAgentes = agentes.filter(a => a.empresa_id === selectedEmpresaId);

  useEffect(() => {
    if (open) {
      form.reset({
        empresa_id: defaultValues?.empresa_id || agendamento?.empresa_id || '',
        agente_id: defaultValues?.agente_id || agendamento?.agente_id || '',
        data: defaultValues?.data || agendamento?.data || '',
        hora: defaultValues?.hora || agendamento?.hora?.substring(0, 5) || '',
        estado: agendamento?.estado || 'pendente',
        cliente_nome: defaultValues?.cliente_nome || agendamento?.cliente_nome || '',
        cliente_telefone: defaultValues?.cliente_telefone || agendamento?.cliente_telefone || '',
        notas: agendamento?.notas || '',
      });
    }
  }, [open, agendamento, defaultValues, form]);

  const onSubmit = async (values: FormValues) => {
    const formData: AgendamentoFormData = {
      empresa_id: values.empresa_id,
      agente_id: values.agente_id || null,
      chamada_id: chamadaId || agendamento?.chamada_id || null,
      data: values.data,
      hora: values.hora,
      estado: values.estado,
      cliente_nome: values.cliente_nome,
      cliente_telefone: values.cliente_telefone,
      notas: values.notas,
    };

    if (isEditing && agendamento) {
      updateAgendamento.mutate(
        { id: agendamento.id, data: formData },
        { onSuccess: () => setOpen(false) }
      );
    } else {
      createAgendamento.mutate(formData, {
        onSuccess: () => setOpen(false),
      });
    }
  };

  const isPending = createAgendamento.isPending || updateAgendamento.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button>
            {isEditing ? (
              <>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Novo Agendamento
              </>
            )}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {isEditing ? 'Editar Agendamento' : 'Novo Agendamento'}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Atualize os dados do agendamento.' 
              : 'Preencha os dados para criar um novo agendamento.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="empresa_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Empresa *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma empresa" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {empresas.map((empresa) => (
                        <SelectItem key={empresa.id} value={empresa.id}>
                          {empresa.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="agente_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agente</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um agente (opcional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {filteredAgentes.length === 0 ? (
                        <SelectItem value="none" disabled>
                          Nenhum agente disponível
                        </SelectItem>
                      ) : (
                        filteredAgentes.map((agente) => (
                          <SelectItem key={agente.id} value={agente.id}>
                            {agente.nome}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="data"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hora"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora *</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="cliente_nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Cliente</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cliente_telefone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input placeholder="+351 XXX XXX XXX" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {isEditing && (
              <FormField
                control={form.control}
                name="estado"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="confirmado">Confirmado</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                        <SelectItem value="concluido">Concluído</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="notas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Notas adicionais sobre o agendamento..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-end">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'A guardar...' : isEditing ? 'Guardar' : 'Criar'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
