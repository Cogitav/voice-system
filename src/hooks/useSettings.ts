import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type SettingsScope = 'global' | 'empresa';

export interface Setting {
  id: string;
  scope: SettingsScope;
  empresa_id: string | null;
  key: string;
  value: any;
  created_at: string;
  updated_at: string;
}

// Available setting keys
export const SETTING_KEYS = {
  // Email & Communication
  AUTO_EMAIL_ENABLED: 'auto_email_enabled',
  NOTIFY_COMPANY_EMAIL: 'notify_company_email',
  DEFAULT_COMPANY_EMAIL: 'default_company_email',
  DEFAULT_FOLLOWUP_BEHAVIOR: 'default_followup_behavior',
  // Admin notification email (for credit alerts, etc.)
  ADMIN_NOTIFICATION_EMAIL: 'admin_notification_email',
  // Email sender configuration
  EMAIL_SENDER_ADDRESS: 'email_sender_address',
  EMAIL_SENDER_NAME: 'email_sender_name',
  // Platform branding for emails
  PLATFORM_LOGO_URL: 'platform_logo_url',
  PLATFORM_FOOTER_TEXT: 'platform_footer_text',
  PLATFORM_SIGNATURE: 'platform_signature',
  // Agent defaults
  AGENT_DEFAULT_TONE: 'agent_default_tone',
  // Integration toggles (admin only)
  INTEGRATION_EMAIL_ENABLED: 'integration_email_enabled',
  INTEGRATION_PHONE_ENABLED: 'integration_phone_enabled',
  INTEGRATION_WHATSAPP_ENABLED: 'integration_whatsapp_enabled',
  INTEGRATION_WEBCHAT_ENABLED: 'integration_webchat_enabled',
  INTEGRATION_CALENDAR_ENABLED: 'integration_calendar_enabled',
  INTEGRATION_CRM_ENABLED: 'integration_crm_enabled',
} as const;

export type SettingKey = typeof SETTING_KEYS[keyof typeof SETTING_KEYS];

// Setting options
export const FOLLOWUP_BEHAVIORS = [
  { value: 'manual', label: 'Manual', description: 'O administrador decide caso a caso se envia emails.' },
  { value: 'suggested', label: 'Sugerido', description: 'O sistema sugere enviar email com base na intenção, mas requer confirmação.' },
  { value: 'automatic', label: 'Automático', description: 'Emails são enviados automaticamente com base nas regras configuradas.' },
] as const;

export const AGENT_TONES = [
  { value: 'formal', label: 'Formal', description: 'Tom profissional e distante.' },
  { value: 'balanced', label: 'Equilibrado', description: 'Tom profissional mas acessível.' },
  { value: 'friendly', label: 'Amigável', description: 'Tom caloroso e próximo.' },
] as const;

// Default values for settings
export const DEFAULT_SETTINGS: Record<SettingKey, any> = {
  // Email & Communication defaults
  [SETTING_KEYS.AUTO_EMAIL_ENABLED]: false,
  [SETTING_KEYS.NOTIFY_COMPANY_EMAIL]: false,
  [SETTING_KEYS.DEFAULT_COMPANY_EMAIL]: null,
  [SETTING_KEYS.DEFAULT_FOLLOWUP_BEHAVIOR]: 'manual',
  // Admin notification email
  [SETTING_KEYS.ADMIN_NOTIFICATION_EMAIL]: null,
  // Email sender configuration
  [SETTING_KEYS.EMAIL_SENDER_ADDRESS]: 'no-reply@platform.com',
  [SETTING_KEYS.EMAIL_SENDER_NAME]: 'AI Call Platform',
  // Platform branding for emails
  [SETTING_KEYS.PLATFORM_LOGO_URL]: null,
  [SETTING_KEYS.PLATFORM_FOOTER_TEXT]: 'Este é um email automático. Por favor não responda.',
  [SETTING_KEYS.PLATFORM_SIGNATURE]: '— Equipa AI Call Platform',
  // Agent defaults
  [SETTING_KEYS.AGENT_DEFAULT_TONE]: 'balanced',
  // Integration defaults (Email active by default, others off)
  [SETTING_KEYS.INTEGRATION_EMAIL_ENABLED]: true,
  [SETTING_KEYS.INTEGRATION_PHONE_ENABLED]: false,
  [SETTING_KEYS.INTEGRATION_WHATSAPP_ENABLED]: false,
  [SETTING_KEYS.INTEGRATION_WEBCHAT_ENABLED]: false,
  [SETTING_KEYS.INTEGRATION_CALENDAR_ENABLED]: false,
  [SETTING_KEYS.INTEGRATION_CRM_ENABLED]: false,
};

// Fetch all global settings
export function useGlobalSettings() {
  return useQuery({
    queryKey: ['settings', 'global'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('scope', 'global')
        .is('empresa_id', null);

      if (error) throw error;
      
      // Convert array to key-value object with defaults
      const settingsMap: Record<string, any> = { ...DEFAULT_SETTINGS };
      data?.forEach((setting: Setting) => {
        settingsMap[setting.key] = setting.value;
      });
      
      return { settings: settingsMap, raw: data as Setting[] };
    },
  });
}

// Fetch empresa-specific settings with fallback to global
export function useEmpresaSettings(empresaId: string | null) {
  const { data: globalData } = useGlobalSettings();
  
  return useQuery({
    queryKey: ['settings', 'empresa', empresaId],
    queryFn: async () => {
      if (!empresaId) return null;
      
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('scope', 'empresa')
        .eq('empresa_id', empresaId);

      if (error) throw error;
      return data as Setting[];
    },
    enabled: !!empresaId,
    select: (empresaSettings) => {
      // Merge: empresa settings override global settings
      const settingsMap: Record<string, any> = { 
        ...(globalData?.settings || DEFAULT_SETTINGS)
      };
      
      empresaSettings?.forEach((setting: Setting) => {
        settingsMap[setting.key] = setting.value;
      });
      
      return settingsMap;
    },
  });
}

// Get effective setting value with hierarchy: call > empresa > global
export function useEffectiveSetting(
  key: SettingKey,
  empresaId: string | null,
  callOverride?: any
) {
  const { data: globalSettings } = useGlobalSettings();
  const { data: empresaSettings } = useEmpresaSettings(empresaId);
  
  // Priority: call override > empresa > global > default
  if (callOverride !== undefined) return callOverride;
  if (empresaSettings?.[key] !== undefined) return empresaSettings[key];
  if (globalSettings?.settings?.[key] !== undefined) return globalSettings.settings[key];
  return DEFAULT_SETTINGS[key];
}

// Ensure value is never null - use empty string or default as fallback
function ensureValidValue(value: any): any {
  if (value === null || value === undefined) {
    return '';
  }
  return value;
}

// Update a global setting
export function useUpdateGlobalSetting() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ key, value }: { key: SettingKey; value: any }) => {
      // Ensure value is never null to avoid DB constraint violation
      const safeValue = ensureValidValue(value);
      
      // Try to update existing, if not found, insert
      const { data: existing } = await supabase
        .from('settings')
        .select('id')
        .eq('scope', 'global')
        .eq('key', key)
        .is('empresa_id', null)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('settings')
          .update({ value: safeValue })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('settings')
          .insert({ scope: 'global', key, value: safeValue });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Definição guardada com sucesso');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao guardar definição: ${error.message}`);
    },
  });
}

// Update multiple global settings at once
export function useUpdateGlobalSettings() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (updates: Array<{ key: SettingKey; value: any }>) => {
      for (const { key, value } of updates) {
        // Ensure value is never null to avoid DB constraint violation
        const safeValue = ensureValidValue(value);
        
        const { data: existing } = await supabase
          .from('settings')
          .select('id')
          .eq('scope', 'global')
          .eq('key', key)
          .is('empresa_id', null)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from('settings')
            .update({ value: safeValue })
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('settings')
            .insert({ scope: 'global', key, value: safeValue });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Definições guardadas com sucesso');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao guardar definições: ${error.message}`);
    },
  });
}

// Update empresa-specific setting
export function useUpdateEmpresaSetting() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ empresaId, key, value }: { empresaId: string; key: SettingKey; value: any }) => {
      const { data: existing } = await supabase
        .from('settings')
        .select('id')
        .eq('scope', 'empresa')
        .eq('key', key)
        .eq('empresa_id', empresaId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('settings')
          .update({ value })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('settings')
          .insert({ scope: 'empresa', empresa_id: empresaId, key, value });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Definição da empresa guardada com sucesso');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao guardar definição: ${error.message}`);
    },
  });
}
