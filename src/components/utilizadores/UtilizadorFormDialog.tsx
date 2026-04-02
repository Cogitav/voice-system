import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { CreateUtilizadorData } from '@/hooks/useUtilizadores';
import { Empresa } from '@/hooks/useEmpresas';
import { useAuth } from '@/contexts/AuthContext';

const utilizadorSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(100, 'Nome muito longo'),
  email: z.string().email('Email inválido'),
  empresa_id: z.string().min(1, 'Empresa é obrigatória'),
  role: z.enum(['cliente_coordenador', 'cliente_normal']),
  status: z.enum(['ativo', 'suspenso']).default('ativo'),
});

type UtilizadorFormValues = z.infer<typeof utilizadorSchema>;

interface UtilizadorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresas: Empresa[];
  onSubmit: (data: CreateUtilizadorData) => void;
  isLoading: boolean;
}

export function UtilizadorFormDialog({
  open,
  onOpenChange,
  empresas,
  onSubmit,
  isLoading,
}: UtilizadorFormDialogProps) {
  const { isAdmin, profile } = useAuth();

  const form = useForm<UtilizadorFormValues>({
    resolver: zodResolver(utilizadorSchema),
    defaultValues: {
      nome: '',
      email: '',
      empresa_id: '',
      role: 'cliente_normal',
      status: 'ativo',
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset({
        nome: '',
        email: '',
        empresa_id: isAdmin ? '' : (profile?.empresa_id || ''),
        role: 'cliente_normal',
        status: 'ativo',
      });
    } else if (!isAdmin && profile?.empresa_id) {
      // For coordinators, auto-set empresa_id
      form.setValue('empresa_id', profile.empresa_id);
    }
  }, [open, form, isAdmin, profile]);

  const handleSubmit = (values: UtilizadorFormValues) => {
    onSubmit({
      nome: values.nome,
      email: values.email,
      empresa_id: values.empresa_id,
      role: values.role,
      status: values.status,
    });
  };

  const activeEmpresas = empresas.filter((e) => e.status === 'ativo');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Novo Utilizador</DialogTitle>
          <DialogDescription>
            {isAdmin 
              ? 'Crie um novo utilizador e atribua-o a uma empresa.'
              : 'Crie um novo utilizador para a sua empresa.'}
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

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="email@exemplo.pt"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    O utilizador receberá um email para definir a sua password.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isAdmin ? (
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
                        {activeEmpresas.length === 0 ? (
                          <div className="py-2 px-2 text-sm text-muted-foreground">
                            Nenhuma empresa ativa disponível
                          </div>
                        ) : (
                          activeEmpresas.map((empresa) => (
                            <SelectItem key={empresa.id} value={empresa.id}>
                              {empresa.nome}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormField
                control={form.control}
                name="empresa_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Empresa</FormLabel>
                    <FormControl>
                      <Input 
                        value={empresas.find(e => e.id === field.value)?.nome || 'Sua empresa'} 
                        disabled 
                        className="bg-muted"
                      />
                    </FormControl>
                    <FormDescription>
                      Os utilizadores são criados automaticamente na sua empresa.
                    </FormDescription>
                  </FormItem>
                )}
              />
            )}

            {isAdmin && (
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
            )}

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
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
              <Button 
                type="submit" 
                disabled={isLoading || (isAdmin && activeEmpresas.length === 0)}
              >
                {isLoading ? 'A criar...' : 'Criar Utilizador'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
