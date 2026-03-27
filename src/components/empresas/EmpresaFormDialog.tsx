import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
// ScrollArea removed - using native overflow-y-auto
import { Check, ChevronLeft, ChevronRight, Building2, Settings2, CreditCard, BarChart3, Palette, CheckCircle2, AlertCircle, X, Cog, Bot } from 'lucide-react';
import { Empresa, EmpresaFormData, WidgetThemeMode, WidgetBorderRadius, WidgetSize } from '@/hooks/useEmpresas';
import { useSubscriptionPlans, PLAN_PRICE_HINTS } from '@/hooks/useSubscriptionPlans';
import { cn } from '@/lib/utils';
import { WidgetBrandingSettings } from './WidgetBrandingSettings';
import { EmpresaServicesSettings } from './EmpresaServicesSettings';
import { ChatAISettings } from './ChatAISettings';
import { SchedulingStatusCard } from '@/components/admin/SchedulingStatusBadge';
import { SchedulingCapabilitiesCard } from '@/components/empresas/SchedulingCapabilitiesCard';
import { BookingConfigurationCard } from '@/components/scheduling/BookingConfigurationCard';
import { SchedulingServicesTable } from '@/components/scheduling/SchedulingServicesTable';
import { BusinessHoursEditor } from '@/components/scheduling/BusinessHoursEditor';
import { SlotIncrementSetting } from '@/components/scheduling/SlotIncrementSetting';

const empresaSchema = z.object({
  nome: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  status: z.enum(['ativo', 'pausado', 'teste']),
  subscription_plan_id: z.string().min(1, 'Selecione um plano'),
  monthly_price: z.coerce.number().min(0, 'Valor deve ser positivo').optional(),
  // Service access flags
  service_chat_enabled: z.boolean().default(false),
  service_voice_enabled: z.boolean().default(false),
  service_scheduling_enabled: z.boolean().default(false),
  service_email_enabled: z.boolean().default(false),
  // Chat AI configuration
  chat_ai_provider: z.string().optional().nullable(),
  chat_ai_model: z.string().optional().nullable(),
  chat_ai_real_enabled: z.boolean().default(false),
  // Widget branding
  widget_primary_color: z.string().optional().nullable(),
  widget_secondary_color: z.string().optional().nullable(),
  widget_background_color: z.string().optional().nullable(),
  widget_user_message_color: z.string().optional().nullable(),
  widget_agent_message_color: z.string().optional().nullable(),
  widget_agent_text_color: z.string().optional().nullable(),
  widget_user_text_color: z.string().optional().nullable(),
  widget_input_background_color: z.string().optional().nullable(),
  widget_input_text_color: z.string().optional().nullable(),
  widget_theme_mode: z.enum(['light', 'dark', 'auto']).optional().nullable(),
  widget_border_radius: z.enum(['normal', 'rounded', 'soft']).optional().nullable(),
  widget_size: z.enum(['small', 'medium', 'large']).optional().nullable(),
  widget_button_color: z.string().optional().nullable(),
  widget_header_text: z.string().optional().nullable(),
  widget_avatar_url: z.string().url().optional().or(z.literal('')).nullable(),
});

type FormValues = z.infer<typeof empresaSchema>;

type SaveState = 'idle' | 'saving' | 'success' | 'error';

interface EmpresaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresa?: Empresa | null;
  onSubmit: (data: EmpresaFormData) => void;
  isLoading: boolean;
}

const STEPS = [
  { id: 1, title: 'Dados Básicos', icon: Building2 },
  { id: 2, title: 'Plano', icon: Settings2 },
  { id: 3, title: 'Preço', icon: CreditCard },
  { id: 4, title: 'Branding', icon: Palette },
  { id: 5, title: 'Serviços', icon: Cog },
  { id: 6, title: 'IA Chat', icon: Bot },
  { id: 7, title: 'Resumo', icon: BarChart3 },
];

export function EmpresaFormDialog({
  open,
  onOpenChange,
  empresa,
  onSubmit,
  isLoading,
}: EmpresaFormDialogProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { data: plans = [], isLoading: plansLoading } = useSubscriptionPlans();
  const isEditing = !!empresa;

  const form = useForm<FormValues>({
    resolver: zodResolver(empresaSchema),
    defaultValues: {
      nome: '',
      email: '',
      status: 'ativo',
      subscription_plan_id: '',
      monthly_price: undefined,
      service_chat_enabled: false,
      service_voice_enabled: false,
      service_scheduling_enabled: false,
      service_email_enabled: false,
      chat_ai_provider: null,
      chat_ai_model: null,
      chat_ai_real_enabled: false,
      widget_primary_color: null,
      widget_secondary_color: null,
      widget_background_color: null,
      widget_user_message_color: null,
      widget_agent_message_color: null,
      widget_agent_text_color: null,
      widget_user_text_color: null,
      widget_input_background_color: null,
      widget_input_text_color: null,
      widget_theme_mode: 'light',
      widget_border_radius: 'normal',
      widget_size: 'medium',
      widget_button_color: null,
      widget_header_text: null,
      widget_avatar_url: null,
    },
  });

  // Reset form and state when dialog opens/closes or empresa changes
  useEffect(() => {
    if (open) {
      setSaveState('idle');
      setErrorMessage(null);
      if (empresa) {
        form.reset({
          nome: empresa.nome,
          email: empresa.email || '',
          status: (empresa.status as 'ativo' | 'pausado' | 'teste') || 'ativo',
          subscription_plan_id: empresa.subscription_plan_id || '',
          monthly_price: empresa.monthly_price ?? undefined,
          service_chat_enabled: empresa.service_chat_enabled ?? false,
          service_voice_enabled: empresa.service_voice_enabled ?? false,
          service_scheduling_enabled: empresa.service_scheduling_enabled ?? false,
          service_email_enabled: empresa.service_email_enabled ?? false,
          chat_ai_provider: empresa.chat_ai_provider,
          chat_ai_model: empresa.chat_ai_model,
          chat_ai_real_enabled: empresa.chat_ai_real_enabled ?? false,
          widget_primary_color: empresa.widget_primary_color,
          widget_secondary_color: empresa.widget_secondary_color,
          widget_background_color: empresa.widget_background_color,
          widget_user_message_color: empresa.widget_user_message_color,
          widget_agent_message_color: empresa.widget_agent_message_color,
          widget_agent_text_color: empresa.widget_agent_text_color,
          widget_user_text_color: empresa.widget_user_text_color,
          widget_input_background_color: empresa.widget_input_background_color,
          widget_input_text_color: empresa.widget_input_text_color,
          widget_theme_mode: empresa.widget_theme_mode as WidgetThemeMode,
          widget_border_radius: empresa.widget_border_radius as WidgetBorderRadius,
          widget_size: empresa.widget_size as WidgetSize,
          widget_button_color: empresa.widget_button_color,
          widget_header_text: empresa.widget_header_text,
          widget_avatar_url: empresa.widget_avatar_url,
        });
      } else {
        form.reset({
          nome: '',
          email: '',
          status: 'ativo',
          subscription_plan_id: '',
          monthly_price: undefined,
          service_chat_enabled: false,
          service_voice_enabled: false,
          service_scheduling_enabled: false,
          service_email_enabled: false,
          chat_ai_provider: null,
          chat_ai_model: null,
          chat_ai_real_enabled: false,
          widget_primary_color: null,
          widget_secondary_color: null,
          widget_background_color: null,
          widget_user_message_color: null,
          widget_agent_message_color: null,
          widget_agent_text_color: null,
          widget_user_text_color: null,
          widget_input_background_color: null,
          widget_input_text_color: null,
          widget_theme_mode: 'light',
          widget_border_radius: 'normal',
          widget_size: 'medium',
          widget_button_color: null,
          widget_header_text: null,
          widget_avatar_url: null,
        });
      }
      setCurrentStep(1);
    }
  }, [empresa, form, open]);

  // Track loading state changes to detect success/error
  useEffect(() => {
    if (saveState === 'saving' && !isLoading) {
      // Save completed - assume success (parent would show toast on error)
      setSaveState('success');
    }
  }, [isLoading, saveState]);

  const handleSubmit = (values: FormValues) => {
    setSaveState('saving');
    setErrorMessage(null);
    try {
      onSubmit({
        nome: values.nome,
        email: values.email || undefined,
        status: values.status,
        subscription_plan_id: values.subscription_plan_id,
        monthly_price: values.monthly_price ?? null,
        service_chat_enabled: values.service_chat_enabled,
        service_voice_enabled: values.service_voice_enabled,
        service_scheduling_enabled: values.service_scheduling_enabled,
        service_email_enabled: values.service_email_enabled,
        chat_ai_provider: values.chat_ai_provider || null,
        chat_ai_model: values.chat_ai_model || null,
        chat_ai_real_enabled: values.chat_ai_real_enabled,
        widget_primary_color: values.widget_primary_color || null,
        widget_secondary_color: values.widget_secondary_color || null,
        widget_background_color: values.widget_background_color || null,
        widget_user_message_color: values.widget_user_message_color || null,
        widget_agent_message_color: values.widget_agent_message_color || null,
        widget_agent_text_color: values.widget_agent_text_color || null,
        widget_user_text_color: values.widget_user_text_color || null,
        widget_input_background_color: values.widget_input_background_color || null,
        widget_input_text_color: values.widget_input_text_color || null,
        widget_theme_mode: values.widget_theme_mode || null,
        widget_border_radius: values.widget_border_radius || null,
        widget_size: values.widget_size || null,
        widget_button_color: values.widget_button_color || null,
        widget_header_text: values.widget_header_text || null,
        widget_avatar_url: values.widget_avatar_url || null,
      });
    } catch (error) {
      setSaveState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Ocorreu um erro ao guardar.');
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const selectedPlan = plans.find(p => p.id === form.watch('subscription_plan_id'));
  const priceHint = selectedPlan ? PLAN_PRICE_HINTS[selectedPlan.name] : null;

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return form.watch('nome')?.length >= 2;
      case 2:
        return !!form.watch('subscription_plan_id');
      case 3:
        return true; // Price is optional
      case 4:
        return true; // Branding is optional
      case 5:
        return true; // Services is optional
      case 6:
        return true; // AI config is optional
      case 7:
        return true; // Summary
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < 7) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center">
      <div className="flex items-center gap-1 overflow-x-auto py-2">
        {STEPS.map((step, index) => {
          const StepIcon = step.icon;
          const isActive = step.id === currentStep;
          const isCompleted = step.id < currentStep;
          
          return (
            <div key={step.id} className="flex items-center flex-shrink-0">
              <button
                type="button"
                onClick={() => step.id < currentStep && setCurrentStep(step.id)}
                disabled={step.id > currentStep}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-medium',
                  isActive && 'bg-primary text-primary-foreground',
                  isCompleted && 'bg-primary/10 text-primary cursor-pointer hover:bg-primary/20',
                  !isActive && !isCompleted && 'bg-muted/50 text-muted-foreground'
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <StepIcon className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">{step.title}</span>
              </button>
              {index < STEPS.length - 1 && (
                <div className={cn(
                  'w-4 h-0.5 mx-1',
                  step.id < currentStep ? 'bg-primary' : 'bg-muted'
                )} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold">Dados Básicos</h3>
        <p className="text-sm text-muted-foreground">Informações principais da empresa</p>
      </div>
      
      <FormField
        control={form.control}
        name="nome"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nome da Empresa *</FormLabel>
            <FormControl>
              <Input placeholder="Nome da empresa" {...field} />
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
            <FormLabel>Email de Contacto</FormLabel>
            <FormControl>
              <Input type="email" placeholder="email@empresa.com" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="status"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Status</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="pausado">Pausado</SelectItem>
                <SelectItem value="teste">Teste</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold">Selecionar Plano</h3>
        <p className="text-sm text-muted-foreground">
          O plano define a capacidade técnica e limites do sistema.
        </p>
      </div>

      {plansLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          Carregando planos...
        </div>
      ) : (
        <FormField
          control={form.control}
          name="subscription_plan_id"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className="grid gap-3">
                  {plans.map((plan) => {
                    const isSelected = field.value === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => field.onChange(plan.id)}
                        className={cn(
                          'flex items-center justify-between p-4 rounded-lg border-2 transition-all text-left',
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        )}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{plan.name}</span>
                            {plan.name === 'PRO' && (
                              <Badge variant="secondary" className="text-xs">Popular</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {plan.description}
                          </p>
                          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                            <span>Envelope: {plan.monthly_credit_envelope.toLocaleString()} créditos</span>
                            <span>Qualidade: {plan.voice_quality_profile}</span>
                          </div>
                        </div>
                        <div className={cn(
                          'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                          isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'
                        )}>
                          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold">Preço Mensal</h3>
        <p className="text-sm text-muted-foreground">
          Este é um valor comercial acordado com o cliente.
        </p>
      </div>

      <FormField
        control={form.control}
        name="monthly_price"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Preço Mensal (€)</FormLabel>
            <FormControl>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                {...field}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
              />
            </FormControl>
            {priceHint && (
              <FormDescription>
                Sugestão para plano {selectedPlan?.name}: €{priceHint.min} - €{priceHint.max}
              </FormDescription>
            )}
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="bg-muted/50 rounded-lg p-4 mt-4">
        <p className="text-sm text-muted-foreground">
          <strong>Nota:</strong> Este valor não afeta os limites do sistema ou o consumo de créditos.
          É apenas para registo e acompanhamento comercial.
        </p>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold">Branding do Widget</h3>
        <p className="text-sm text-muted-foreground">
          Personalize a aparência do chat widget (opcional)
        </p>
      </div>
      <WidgetBrandingSettings form={form} empresaNome={form.watch('nome')} />
    </div>
  );

  const renderStep5 = () => (
    <EmpresaServicesSettings form={form} empresaId={empresa?.id} />
  );

  const renderStep6 = () => (
    <ChatAISettings form={form} />
  );

  const renderStep7 = () => {
    const activeServices = [];
    if (form.watch('service_chat_enabled')) activeServices.push('Chat');
    if (form.watch('service_voice_enabled')) activeServices.push('Voz');
    if (form.watch('service_scheduling_enabled')) activeServices.push('Agendamentos');
    if (form.watch('service_email_enabled')) activeServices.push('Email');

    const aiEnabled = form.watch('chat_ai_real_enabled');
    const aiModel = form.watch('chat_ai_model');

    return (
      <div className="space-y-4">
        <div className="text-center mb-4">
          <h3 className="text-lg font-semibold">Resumo & Alertas</h3>
          <p className="text-sm text-muted-foreground">
            Reveja os dados antes de guardar
          </p>
        </div>

        <div className="bg-muted/30 rounded-lg p-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Nome:</span>
            <span className="font-medium">{form.watch('nome')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email:</span>
            <span>{form.watch('email') || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status:</span>
            <Badge variant={form.watch('status') === 'ativo' ? 'default' : 'secondary'}>
              {form.watch('status') === 'ativo' ? 'Ativo' : form.watch('status') === 'pausado' ? 'Pausado' : 'Teste'}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Plano:</span>
            <span className="font-medium">{selectedPlan?.name || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Preço Mensal:</span>
            <span>
              {form.watch('monthly_price') 
                ? `€${form.watch('monthly_price')?.toFixed(2)}`
                : '—'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Serviços Ativos:</span>
            <div className="flex gap-1 flex-wrap justify-end">
              {activeServices.length > 0 ? (
                activeServices.map((service) => (
                  <Badge key={service} variant="outline" className="text-xs">
                    {service}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">Nenhum</span>
              )}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">IA Chat:</span>
            <div className="flex items-center gap-2">
              {aiEnabled ? (
                <>
                  <Badge variant="default" className="text-xs">Ativo</Badge>
                  <span className="text-xs text-muted-foreground">
                    {aiModel?.split('/').pop() || 'Gemini 3 Flash'}
                  </span>
                </>
              ) : (
                <Badge variant="secondary" className="text-xs">Mock AI</Badge>
              )}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Widget Branding:</span>
            <div className="flex gap-1">
              {form.watch('widget_primary_color') && (
                <div 
                  className="w-5 h-5 rounded-full border"
                  style={{ backgroundColor: form.watch('widget_primary_color') || undefined }}
                  title="Cor primária"
                />
              )}
              {form.watch('widget_user_message_color') && (
                <div 
                  className="w-5 h-5 rounded-full border"
                  style={{ backgroundColor: form.watch('widget_user_message_color') || undefined }}
                  title="Mensagens do visitante"
                />
              )}
              {!form.watch('widget_primary_color') && !form.watch('widget_user_message_color') && (
                <span className="text-sm">Padrão</span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 mt-4">
          <h4 className="font-medium text-sm mb-2">Alertas de Utilização</h4>
          <p className="text-sm text-muted-foreground mb-2">
            O consumo mensal é monitorizado como percentagem do envelope do plano.
          </p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-green-100 dark:bg-green-900/30 rounded p-2 text-center">
              <span className="font-medium">70%</span>
              <p className="text-muted-foreground">Aviso suave</p>
            </div>
            <div className="bg-yellow-100 dark:bg-yellow-900/30 rounded p-2 text-center">
              <span className="font-medium">85%</span>
              <p className="text-muted-foreground">Alerta</p>
            </div>
            <div className="bg-red-100 dark:bg-red-900/30 rounded p-2 text-center">
              <span className="font-medium">95%</span>
              <p className="text-muted-foreground">Ação recomendada</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render success state
  const renderSuccessState = () => (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
        <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold">
          {isEditing ? 'Empresa atualizada com sucesso!' : 'Empresa criada com sucesso!'}
        </h3>
        <p className="text-sm text-muted-foreground">
          As alterações foram guardadas.
        </p>
      </div>
    </div>
  );

  // Render error state
  const renderErrorState = () => (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        {errorMessage || 'Ocorreu um erro ao guardar. Por favor, tente novamente.'}
      </AlertDescription>
    </Alert>
  );

  return (
    <Dialog open={open} onOpenChange={saveState === 'saving' ? undefined : onOpenChange}>
      <DialogContent className="p-0 w-full max-w-5xl h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col gap-0">
        {/* Fixed Header */}
        <div className="flex-shrink-0 border-b px-6 py-4">
          <div className="flex items-start justify-between">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-xl">
                {isEditing ? 'Editar Empresa' : 'Nova Empresa'}
              </DialogTitle>
              <DialogDescription>
                {saveState === 'success' 
                  ? 'Operação concluída com sucesso.'
                  : isEditing
                    ? 'Atualize os dados da empresa.'
                    : 'Configure uma nova empresa no sistema.'}
              </DialogDescription>
            </DialogHeader>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-8 w-8 -mr-2 -mt-2"
              disabled={saveState === 'saving'}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Fechar</span>
            </Button>
          </div>
          
          {/* Step indicator - only show when not in success state */}
          {saveState !== 'success' && (
            <div className="mt-4">
              {renderStepIndicator()}
            </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
          <Form {...form}>
            <form id="empresa-main-form" onSubmit={form.handleSubmit(handleSubmit)}>
              {saveState === 'error' && renderErrorState()}
                
              {saveState === 'success' ? (
                renderSuccessState()
              ) : (
                <>
                  {currentStep === 1 && renderStep1()}
                  {currentStep === 2 && renderStep2()}
                  {currentStep === 3 && renderStep3()}
                  {currentStep === 4 && renderStep4()}
                  {currentStep === 5 && renderStep5()}
                  {currentStep === 6 && renderStep6()}
                  {currentStep === 7 && renderStep7()}
                </>
              )}
            </form>
          </Form>

          {/* Scheduling components rendered OUTSIDE the form to prevent accidental submit */}
          {saveState !== 'success' && currentStep === 5 && empresa?.id && (form.watch('service_scheduling_enabled') ?? false) && (
            <div className="border-t pt-4 mt-4 space-y-4">
              <SchedulingStatusCard empresaId={empresa.id} />
              <SchedulingCapabilitiesCard empresaId={empresa.id} schedulingEnabled={true} />
              <BookingConfigurationCard empresaId={empresa.id} />
              <SchedulingServicesTable empresaId={empresa.id} />
              <BusinessHoursEditor empresaId={empresa.id} />
              <SlotIncrementSetting empresaId={empresa.id} />
            </div>
          )}
        </div>

        {/* Fixed Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t bg-background">
          <div className="flex items-center justify-between gap-2">
            {saveState === 'success' ? (
              <>
                <div />
                <Button type="button" onClick={handleClose}>
                  Fechar
                </Button>
              </>
            ) : (
              <>
                {currentStep > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePrev}
                    disabled={saveState === 'saving'}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Anterior
                  </Button>
                ) : (
                  <div />
                )}
                
                {currentStep < 7 ? (
                  <Button
                    type="button"
                    onClick={handleNext}
                    disabled={!canProceed()}
                  >
                    Próximo
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button 
                    type="submit"
                    form="empresa-main-form"
                    disabled={saveState === 'saving'}
                    className="min-w-[180px]"
                  >
                    {saveState === 'saving' ? (
                      'Guardando...'
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Confirmar & Guardar
                      </>
                    )}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
