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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Agente, AgenteFormData } from '@/hooks/useAgentes';
import { useEmpresas } from '@/hooks/useEmpresas';
import { useAuth } from '@/contexts/AuthContext';

const agenteSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(100, 'Nome muito longo'),
  empresa_id: z.string().min(1, 'Empresa é obrigatória'),
  idioma: z.string().default('pt-PT'),
  descricao_funcao: z.string().min(1, 'Descrição da função é obrigatória').max(500, 'Descrição muito longa'),
  contexto_negocio: z.string().max(5000, 'Contexto muito longo').optional().or(z.literal('')),
  prompt_base: z.string().min(1, 'Instruções de comportamento são obrigatórias').max(5000, 'Prompt muito longo'),
  regras: z.string().max(2000, 'Regras muito longas').optional().or(z.literal('')),
  status: z.enum(['ativo', 'inativo']).default('ativo'),
  is_default_chat_agent: z.boolean().default(false),
  welcome_message: z.string().max(500, 'Mensagem muito longa').optional().or(z.literal('')),
  response_delay_ms: z.number().int().min(0).max(10000).optional(),
  initial_greeting: z.string().max(1000, 'Mensagem muito longa').optional().or(z.literal('')),
  response_style: z.enum(['formal', 'neutral', 'friendly', 'energetic']).default('neutral'),
});

type AgenteFormValues = z.infer<typeof agenteSchema>;

interface AgenteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agente?: Agente | null;
  onSubmit: (data: AgenteFormData) => void;
  isLoading: boolean;
}

const LANGUAGES = [
  { value: 'pt-PT', label: 'Português (Portugal)' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es-ES', label: 'Español' },
  { value: 'fr-FR', label: 'Français' },
];

interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

export function AgenteFormDialog({
  open,
  onOpenChange,
  agente,
  onSubmit,
  isLoading,
}: AgenteFormDialogProps) {
  const isEditing = !!agente;
  const { isAdmin, profile } = useAuth();
  const { data: empresas = [] } = useEmpresas();

  const clientEmpresaId = profile?.empresa_id || '';

  const form = useForm<AgenteFormValues>({
    resolver: zodResolver(agenteSchema),
    defaultValues: {
      nome: '',
      empresa_id: clientEmpresaId,
      idioma: 'pt-PT',
      descricao_funcao: '',
      contexto_negocio: '',
      prompt_base: '',
      regras: '',
      status: 'ativo',
      is_default_chat_agent: false,
      welcome_message: '',
      response_delay_ms: undefined,
      initial_greeting: '',
      response_style: 'neutral',
    },
  });

  useEffect(() => {
    if (agente) {
      form.reset({
        nome: agente.nome,
        empresa_id: agente.empresa_id,
        idioma: agente.idioma || 'pt-PT',
        descricao_funcao: agente.descricao_funcao || '',
        contexto_negocio: agente.contexto_negocio || '',
        prompt_base: agente.prompt_base || '',
        regras: agente.regras || '',
        status: agente.status as 'ativo' | 'inativo',
        is_default_chat_agent: agente.is_default_chat_agent ?? false,
        welcome_message: agente.welcome_message || '',
        response_delay_ms: agente.response_delay_ms ?? undefined,
        initial_greeting: agente.initial_greeting || '',
        response_style: (agente.response_style as 'formal' | 'neutral' | 'friendly' | 'energetic') || 'neutral',
      });
    } else {
      form.reset({
        nome: '',
        empresa_id: isAdmin ? '' : clientEmpresaId,
        idioma: 'pt-PT',
        descricao_funcao: '',
        contexto_negocio: '',
        prompt_base: '',
        regras: '',
        status: 'ativo',
        is_default_chat_agent: false,
        welcome_message: '',
        response_delay_ms: undefined,
        initial_greeting: '',
        response_style: 'neutral',
      });
    }
  }, [agente, form, isAdmin, clientEmpresaId]);

  const handleSubmit = (values: AgenteFormValues) => {
    onSubmit({
      nome: values.nome,
      empresa_id: isAdmin ? values.empresa_id : clientEmpresaId,
      idioma: values.idioma,
      descricao_funcao: values.descricao_funcao,
      contexto_negocio: values.contexto_negocio || undefined,
      prompt_base: values.prompt_base,
      regras: values.regras || undefined,
      status: values.status,
      is_default_chat_agent: values.is_default_chat_agent,
      welcome_message: values.welcome_message || undefined,
      response_delay_ms: values.response_delay_ms ?? undefined,
      initial_greeting: values.initial_greeting || undefined,
      response_style: values.response_style,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Agente' : 'Novo Agente'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Altere a configuração do agente abaixo.'
              : 'Configure um novo agente de voz. Campos marcados com * são obrigatórios.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* SECTION 1 — Agent Identity */}
            <FormSection 
              title="1. Identidade do Agente"
              description="Informações básicas que identificam o agente."
            >
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Agente *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Assistente de Vendas" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isAdmin && (
                <FormField
                  control={form.control}
                  name="empresa_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Empresa *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a empresa" />
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
              )}

              <FormField
                control={form.control}
                name="idioma"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Idioma</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o idioma" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LANGUAGES.map((lang) => (
                          <SelectItem key={lang.value} value={lang.value}>
                            {lang.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Idioma principal em que o agente irá comunicar.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="descricao_funcao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição da Função *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Ex: Este agente é o assistente de vendas principal, responsável por atender chamadas de clientes interessados em produtos..."
                        className="min-h-[80px]"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Quem é este agente e qual é a sua principal responsabilidade?
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>

            <Separator />

            {/* SECTION 2 — Business Context */}
            <FormSection 
              title="2. Contexto de Negócio"
              description="Conhecimento sobre a empresa e domínio de atuação."
            >
              <FormField
                control={form.control}
                name="contexto_negocio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contexto de Negócio / Conhecimento do Domínio</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Ex: A empresa XYZ é uma loja de eletrodomésticos com 20 anos de mercado. Os principais produtos são... Os clientes típicos são... As políticas de devolução são..."
                        className="min-h-[120px]"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Descreva a empresa, serviços, clientes típicos e regras de negócio que o agente deve conhecer.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>

            <Separator />

            {/* SECTION 3 — Core Behavior */}
            <FormSection 
              title="3. Comportamento Central (System Prompt)"
              description="Define como o agente se comporta em todas as situações."
            >
              <FormField
                control={form.control}
                name="prompt_base"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instruções de Comportamento *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Ex: Seja sempre cordial e profissional. Responda de forma clara e concisa. Quando não souber uma resposta, admita e ofereça transferir para um humano. Priorize resolver o problema do cliente na primeira interação..."
                        className="min-h-[140px] font-mono text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Defina como o agente deve comportar-se: tom, estilo, prioridades e forma de tomar decisões. Isto funciona como o system prompt.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>

            <Separator />

            {/* SECTION 4 — Rules & Restrictions */}
            <FormSection 
              title="4. Regras e Restrições"
              description="Limites e proibições para o comportamento do agente."
            >
              <FormField
                control={form.control}
                name="regras"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Regras e Restrições</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Ex: Nunca divulgar informações de preços sem confirmação. Nunca falar sobre concorrentes. Não fazer promessas de prazos de entrega. Encaminhar sempre reclamações para o supervisor..."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      O que o agente nunca deve fazer, tópicos sensíveis a evitar e regras de negócio rígidas.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>

            <Separator />

            {/* SECTION 5 — Chat Configuration */}
            <FormSection 
              title="5. Configuração de Chat"
              description="Configurações para o chat do website."
            >
              <FormField
                control={form.control}
                name="is_default_chat_agent"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <FormLabel className="text-base">
                          Agente Padrão para Chat
                        </FormLabel>
                        {field.value && (
                          <Badge variant="secondary" className="text-xs">
                            Ativo
                          </Badge>
                        )}
                      </div>
                      <FormDescription>
                        Este agente será usado automaticamente para conversas de chat do website.
                        Apenas um agente pode ser o padrão por empresa.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="welcome_message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mensagem de Boas-Vindas</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Ex: Olá! 👋 Sou o assistente virtual. Como posso ajudá-lo hoje?"
                        className="min-h-[80px]"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Mensagem exibida automaticamente quando uma nova conversa começa. 
                      Se vazio, será usada a mensagem padrão da empresa ou da plataforma.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="response_delay_ms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tempo de Resposta (ms)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="2000"
                        min={0}
                        max={10000}
                        step={100}
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          field.onChange(val === '' ? undefined : parseInt(val, 10));
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Tempo de espera antes de mostrar a resposta (simula digitação humana).
                      Valor em milissegundos. Padrão: 2000ms (2 segundos).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>

            <Separator />

            {/* SECTION 6 — Initial Greeting */}
            <FormSection 
              title="6. Mensagem Inicial"
              description="Mensagem enviada automaticamente quando uma nova conversa começa."
            >
              <FormField
                control={form.control}
                name="initial_greeting"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mensagem inicial do assistente</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={"Olá! 👋\nSou o assistente virtual da {empresa}.\nComo posso ajudar hoje?"}
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Esta mensagem é enviada automaticamente quando uma nova conversa começa. 
                      O menu de serviços será adicionado automaticamente abaixo.
                      <br />
                      <span className="font-medium">Variáveis disponíveis:</span> {'{empresa}'} — nome da empresa, {'{agente}'} — nome do agente.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>

            <Separator />

            {/* SECTION 7 — Response Style */}
            <FormSection 
              title="7. Estilo de Resposta"
              description="Define o tom e estilo das mensagens do assistente."
            >
              <FormField
                control={form.control}
                name="response_style"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estilo de resposta</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o estilo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="formal">Formal — Sem emojis, tom profissional</SelectItem>
                        <SelectItem value="neutral">Neutro — Tom equilibrado, emojis mínimos</SelectItem>
                        <SelectItem value="friendly">Amigável — Tom caloroso, emojis para estrutura</SelectItem>
                        <SelectItem value="energetic">Energético — Tom entusiasta, expressivo</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      O estilo é aplicado automaticamente às respostas do assistente sem alterar a lógica de IA.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>

            <Separator />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Agentes inativos não recebem chamadas.
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
                {isLoading
                  ? 'A guardar...'
                  : isEditing
                  ? 'Guardar Alterações'
                  : 'Criar Agente'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
