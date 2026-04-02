import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import {
  useCreateSchedulingService,
  useUpdateSchedulingService,
  SchedulingService,
} from '@/hooks/useSchedulingServices';
import { useEffect } from 'react';

const schema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  description: z.string().optional(),
  duration_minutes: z.coerce.number().min(5, 'Mínimo 5 minutos').max(480, 'Máximo 8 horas'),
  buffer_before_minutes: z.coerce.number().min(0).max(120),
  buffer_after_minutes: z.coerce.number().min(0).max(120),
  status: z.enum(['active', 'inactive']),
  show_in_chat_menu: z.boolean(),
  bookable: z.boolean(),
  priority: z.coerce.number().min(0).max(100),
  price: z.coerce.number().min(0).optional().nullable(),
  currency: z.string().optional(),
  promo_price: z.coerce.number().min(0).optional().nullable(),
  promo_start: z.string().optional().nullable(),
  promo_end: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  empresaId: string;
  service?: SchedulingService | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SchedulingServiceFormDialog({ empresaId, service, open, onOpenChange }: Props) {
  const isEditing = !!service;
  const createMutation = useCreateSchedulingService(empresaId);
  const updateMutation = useUpdateSchedulingService(empresaId);
  const isPending = createMutation.isPending || updateMutation.isPending;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      duration_minutes: 30,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
      status: 'active',
      show_in_chat_menu: true,
      bookable: true,
      priority: 0,
      price: null,
      currency: 'EUR',
      promo_price: null,
      promo_start: null,
      promo_end: null,
    },
  });

  useEffect(() => {
    if (open && service) {
      form.reset({
        name: service.name,
        description: service.description || '',
        duration_minutes: service.duration_minutes,
        buffer_before_minutes: service.buffer_before_minutes,
        buffer_after_minutes: service.buffer_after_minutes,
        status: service.status,
        show_in_chat_menu: service.show_in_chat_menu ?? true,
        bookable: service.bookable ?? true,
        priority: service.priority,
        price: service.price,
        currency: service.currency || 'EUR',
        promo_price: service.promo_price,
        promo_start: service.promo_start ? service.promo_start.substring(0, 10) : null,
        promo_end: service.promo_end ? service.promo_end.substring(0, 10) : null,
      });
    } else if (open) {
      form.reset({
        name: '', description: '', duration_minutes: 30,
        buffer_before_minutes: 0, buffer_after_minutes: 0, status: 'active', show_in_chat_menu: true, bookable: true, priority: 0,
        price: null, currency: 'EUR', promo_price: null, promo_start: null, promo_end: null,
      });
    }
  }, [open, service, form]);

  const onSubmit = (values: FormValues) => {
    if (isEditing && service) {
      updateMutation.mutate({ id: service.id, data: values });
    } else {
      createMutation.mutate({
        name: values.name,
        description: values.description,
        duration_minutes: values.duration_minutes,
        buffer_before_minutes: values.buffer_before_minutes,
        buffer_after_minutes: values.buffer_after_minutes,
        status: values.status,
        show_in_chat_menu: values.show_in_chat_menu,
        bookable: values.bookable,
        priority: values.priority,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Serviço' : 'Novo Serviço'}</DialogTitle>
          <DialogDescription>
            Configure a duração e buffers do serviço de agendamento.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Nome *</FormLabel>
                <FormControl><Input placeholder="Ex: Consulta Inicial" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl><Textarea placeholder="Descrição opcional do serviço" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="duration_minutes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Duração (min) *</FormLabel>
                  <FormControl><Input type="number" min={5} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="buffer_before_minutes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Buffer antes (min)</FormLabel>
                  <FormControl><Input type="number" min={0} {...field} /></FormControl>
                  <FormDescription className="text-xs">Tempo livre antes</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="buffer_after_minutes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Buffer depois (min)</FormLabel>
                  <FormControl><Input type="number" min={0} {...field} /></FormControl>
                  <FormDescription className="text-xs">Tempo livre depois</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            {/* === Scheduling Configuration Section === */}
            <div className="border-t pt-4 mt-2">
              <h4 className="text-sm font-medium mb-3">Configuração de Agendamento</h4>
              <FormField control={form.control} name="bookable" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm">Agendável</FormLabel>
                    <FormDescription className="text-xs">
                      Define se este serviço pode ser agendado pelo assistente. Serviços não agendáveis são apenas informativos.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )} />
            </div>
            {/* === Conversation Menu Section === */}
            <div className="border-t pt-4 mt-2">
              <h4 className="text-sm font-medium mb-3">Configuração de Conversa</h4>
              <FormField control={form.control} name="show_in_chat_menu" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm">Mostrar no menu inicial</FormLabel>
                    <FormDescription className="text-xs">
                      Define se este serviço aparece no menu inicial apresentado ao utilizador no chat ou voz.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="priority" render={({ field }) => (
                <FormItem className="mt-3">
                  <FormLabel>Prioridade no menu</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      {...field}
                      disabled={!form.watch('show_in_chat_menu')}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Define a ordem de apresentação deste serviço no menu inicial. Menor = aparece primeiro.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* === Pricing Section === */}
            <div className="border-t pt-4 mt-2">
              <h4 className="text-sm font-medium mb-3">Preço (opcional)</h4>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="price" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preço</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={0.01} placeholder="Ex: 30.00" 
                        {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : Number(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="currency" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Moeda</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || 'EUR'}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="GBP">GBP (£)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-3 gap-4 mt-3">
                <FormField control={form.control} name="promo_price" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preço promo</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={0.01} placeholder="Ex: 20.00"
                        {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : Number(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="promo_start" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Início promo</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value || null)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="promo_end" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fim promo</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value || null)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {isEditing ? 'Guardar' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
