import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Utilizador, UpdateUtilizadorData } from '@/hooks/useUtilizadores';

const editUtilizadorSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(100, 'Nome muito longo'),
  role: z.enum(['cliente_coordenador', 'cliente_normal']),
  status: z.enum(['ativo', 'suspenso']),
});

type EditUtilizadorFormValues = z.infer<typeof editUtilizadorSchema>;

interface UtilizadorEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  utilizador: Utilizador | null;
  onSubmit: (data: UpdateUtilizadorData) => void;
  isLoading: boolean;
}

export function UtilizadorEditDialog({
  open,
  onOpenChange,
  utilizador,
  onSubmit,
  isLoading,
}: UtilizadorEditDialogProps) {
  const form = useForm<EditUtilizadorFormValues>({
    resolver: zodResolver(editUtilizadorSchema),
    defaultValues: {
      nome: '',
      role: 'cliente_normal',
      status: 'ativo',
    },
  });

  useEffect(() => {
    if (utilizador && open) {
      form.reset({
        nome: utilizador.nome,
        role: utilizador.role === 'admin' ? 'cliente_normal' : utilizador.role as 'cliente_coordenador' | 'cliente_normal',
        status: utilizador.status === 'inativo' ? 'suspenso' : utilizador.status as 'ativo' | 'suspenso',
      });
    }
  }, [utilizador, open, form]);

  const handleSubmit = (values: EditUtilizadorFormValues) => {
    if (!utilizador) return;

    const updates: UpdateUtilizadorData = {
      profileId: utilizador.id,
    };

    if (values.nome !== utilizador.nome) {
      updates.nome = values.nome;
    }
    if (values.role !== utilizador.role) {
      updates.role = values.role;
    }
    if (values.status !== utilizador.status) {
      updates.status = values.status;
    }

    onSubmit(updates);
  };

  if (!utilizador) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Utilizador</DialogTitle>
          <DialogDescription>
            Atualize as informações do utilizador. O email e a empresa não podem ser alterados.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome completo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input value={utilizador.email} disabled className="bg-muted" />
              </FormControl>
              <FormDescription>
                O email não pode ser alterado. Use o reset de password para alterações de acesso.
              </FormDescription>
            </FormItem>

            <FormItem>
              <div className="flex items-center gap-2">
                <FormLabel>Empresa</FormLabel>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>
                        A empresa não pode ser alterada após a criação do utilizador. 
                        Para mover um utilizador para outra empresa, crie um novo utilizador.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <FormControl>
                <Input value={utilizador.empresa_nome || '—'} disabled className="bg-muted" />
              </FormControl>
            </FormItem>

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Função *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a função" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cliente_coordenador">
                        Coordenador
                      </SelectItem>
                      <SelectItem value="cliente_normal">
                        Utilizador
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Coordenadores podem criar utilizadores na sua empresa.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o estado" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="suspenso">Suspenso</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Utilizadores suspensos não podem aceder ao sistema.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'A guardar...' : 'Guardar Alterações'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
