import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type WidgetThemeMode = 'light' | 'dark' | 'auto';
export type WidgetBorderRadius = 'normal' | 'rounded' | 'soft';
export type WidgetSize = 'small' | 'medium' | 'large';

export interface WidgetBranding {
  widget_primary_color: string | null;
  widget_secondary_color: string | null;
  widget_background_color: string | null;
  widget_user_message_color: string | null;
  widget_agent_message_color: string | null;
  widget_agent_text_color: string | null;
  widget_user_text_color: string | null;
  widget_input_background_color: string | null;
  widget_input_text_color: string | null;
  widget_theme_mode: WidgetThemeMode | null;
  widget_border_radius: WidgetBorderRadius | null;
  widget_size: WidgetSize | null;
  widget_button_color: string | null;
  widget_header_text: string | null;
  widget_avatar_url: string | null;
}

export interface Empresa extends WidgetBranding {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  fuso_horario: string | null;
  status: string;
  slug: string | null;
  subscription_plan_id: string | null;
  monthly_price: number | null;
  default_welcome_message: string | null;
  default_response_delay_ms: number | null;
  created_at: string;
  // Service access flags
  service_chat_enabled: boolean;
  service_voice_enabled: boolean;
  service_scheduling_enabled: boolean;
  service_email_enabled: boolean;
  // Chat AI configuration
  chat_ai_provider: string | null;
  chat_ai_model: string | null;
  chat_ai_real_enabled: boolean;
  // Joined plan info
  subscription_plan?: {
    id: string;
    name: string;
    monthly_credit_envelope: number;
    voice_quality_profile: string;
  } | null;
}

export interface EmpresaFormData {
  nome: string;
  email?: string;
  telefone?: string;
  fuso_horario?: string;
  status?: string;
  subscription_plan_id?: string;
  monthly_price?: number | null;
  default_welcome_message?: string;
  default_response_delay_ms?: number | null;
  // Service access flags
  service_chat_enabled?: boolean;
  service_voice_enabled?: boolean;
  service_scheduling_enabled?: boolean;
  service_email_enabled?: boolean;
  // Chat AI configuration
  chat_ai_provider?: string | null;
  chat_ai_model?: string | null;
  chat_ai_real_enabled?: boolean;
  // Widget branding
  widget_primary_color?: string | null;
  widget_secondary_color?: string | null;
  widget_background_color?: string | null;
  widget_user_message_color?: string | null;
  widget_agent_message_color?: string | null;
  widget_agent_text_color?: string | null;
  widget_user_text_color?: string | null;
  widget_input_background_color?: string | null;
  widget_input_text_color?: string | null;
  widget_theme_mode?: WidgetThemeMode | null;
  widget_border_radius?: WidgetBorderRadius | null;
  widget_size?: WidgetSize | null;
  widget_button_color?: string | null;
  widget_header_text?: string | null;
  widget_avatar_url?: string | null;
}

export function useEmpresas(includeArchived = false) {
  return useQuery({
    queryKey: ['empresas', includeArchived],
    queryFn: async () => {
      let query = supabase
        .from('empresas')
        .select(`
          id, nome, email, telefone, fuso_horario, status, slug,
          subscription_plan_id, monthly_price, default_welcome_message, default_response_delay_ms, created_at,
          service_chat_enabled, service_voice_enabled, service_scheduling_enabled, service_email_enabled,
          chat_ai_provider, chat_ai_model, chat_ai_real_enabled,
          widget_primary_color, widget_secondary_color, widget_background_color,
          widget_user_message_color, widget_agent_message_color, widget_agent_text_color, widget_user_text_color,
          widget_input_background_color, widget_input_text_color,
          widget_theme_mode, widget_border_radius, widget_size, widget_button_color,
          widget_header_text, widget_avatar_url, is_test_environment, deleted_at,
          subscription_plan:subscription_plans(id, name, monthly_credit_envelope, voice_quality_profile)
        `)
        .order('created_at', { ascending: false });

      // Filter out soft-deleted unless explicitly requested
      if (!includeArchived) {
        query = query.is('deleted_at', null);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(error.message);
      }

      return data as (Empresa & { is_test_environment?: boolean; deleted_at?: string | null })[];
    },
  });
}

// Generate a URL-safe slug from company name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, '') // Trim hyphens from start/end
    .substring(0, 50); // Limit length
}

// Get initial credits based on plan name
function getInitialCreditsForPlan(planName: string): number {
  switch (planName.toUpperCase()) {
    case 'BASE':
      return 4000;
    case 'PRO':
      return 9000;
    case 'ADVANCED':
      return 25000;
    default:
      return 4000; // Default to BASE if unknown
  }
}

export function useCreateEmpresa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: EmpresaFormData) => {
      // Auto-generate slug from company name
      const slug = generateSlug(data.nome);
      
      const { data: empresa, error } = await supabase
        .from('empresas')
        .insert({
          nome: data.nome,
          email: data.email || null,
          telefone: data.telefone || null,
          fuso_horario: data.fuso_horario || 'Europe/Lisbon',
          status: data.status || 'ativo',
          slug, // Auto-generated slug
          subscription_plan_id: data.subscription_plan_id || null,
          monthly_price: data.monthly_price ?? null,
          default_welcome_message: data.default_welcome_message || null,
          default_response_delay_ms: data.default_response_delay_ms ?? null,
          // Service flags (safe-by-default: false)
          service_chat_enabled: data.service_chat_enabled ?? false,
          service_voice_enabled: data.service_voice_enabled ?? false,
          service_scheduling_enabled: data.service_scheduling_enabled ?? false,
          service_email_enabled: data.service_email_enabled ?? false,
          // Chat AI configuration (safe-by-default: disabled)
          chat_ai_provider: data.chat_ai_provider || null,
          chat_ai_model: data.chat_ai_model || null,
          chat_ai_real_enabled: data.chat_ai_real_enabled ?? false,
          // Widget branding
          widget_primary_color: data.widget_primary_color || null,
          widget_secondary_color: data.widget_secondary_color || null,
          widget_background_color: data.widget_background_color || null,
          widget_user_message_color: data.widget_user_message_color || null,
          widget_agent_message_color: data.widget_agent_message_color || null,
          widget_agent_text_color: data.widget_agent_text_color || null,
          widget_user_text_color: data.widget_user_text_color || null,
          widget_input_background_color: data.widget_input_background_color || null,
          widget_input_text_color: data.widget_input_text_color || null,
          widget_theme_mode: data.widget_theme_mode || 'light',
          widget_border_radius: data.widget_border_radius || 'normal',
          widget_size: data.widget_size || 'medium',
          widget_button_color: data.widget_button_color || null,
          widget_header_text: data.widget_header_text || null,
          widget_avatar_url: data.widget_avatar_url || null,
        })
        .select(`
          *,
          subscription_plan:subscription_plans(id, name, monthly_credit_envelope)
        `)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      // Create initial credits_usage record based on plan
      if (empresa && empresa.subscription_plan_id) {
        const planName = empresa.subscription_plan?.name || 'BASE';
        const initialCredits = getInitialCreditsForPlan(planName);
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
        
        await supabase
          .from('credits_usage')
          .insert({
            empresa_id: empresa.id,
            month: currentMonth,
            credits_used: 0,
            credits_limit: initialCredits,
          });
      }

      return empresa;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      toast.success('Empresa criada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar empresa: ${error.message}`);
    },
  });
}

export function useUpdateEmpresa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<EmpresaFormData> }) => {
      const { data: empresa, error } = await supabase
        .from('empresas')
        .update({
          nome: data.nome,
          email: data.email || null,
          telefone: data.telefone || null,
          fuso_horario: data.fuso_horario,
          status: data.status,
          subscription_plan_id: data.subscription_plan_id,
          monthly_price: data.monthly_price ?? null,
          default_welcome_message: data.default_welcome_message || null,
          default_response_delay_ms: data.default_response_delay_ms ?? null,
          // Service flags
          service_chat_enabled: data.service_chat_enabled,
          service_voice_enabled: data.service_voice_enabled,
          service_scheduling_enabled: data.service_scheduling_enabled,
          service_email_enabled: data.service_email_enabled,
          // Chat AI configuration
          chat_ai_provider: data.chat_ai_provider,
          chat_ai_model: data.chat_ai_model,
          chat_ai_real_enabled: data.chat_ai_real_enabled,
          // Widget branding
          widget_primary_color: data.widget_primary_color,
          widget_secondary_color: data.widget_secondary_color,
          widget_background_color: data.widget_background_color,
          widget_user_message_color: data.widget_user_message_color,
          widget_agent_message_color: data.widget_agent_message_color,
          widget_agent_text_color: data.widget_agent_text_color,
          widget_user_text_color: data.widget_user_text_color,
          widget_input_background_color: data.widget_input_background_color,
          widget_input_text_color: data.widget_input_text_color,
          widget_theme_mode: data.widget_theme_mode,
          widget_border_radius: data.widget_border_radius,
          widget_size: data.widget_size,
          widget_button_color: data.widget_button_color,
          widget_header_text: data.widget_header_text,
          widget_avatar_url: data.widget_avatar_url,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return empresa;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      toast.success('Empresa atualizada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar empresa: ${error.message}`);
    },
  });
}
