import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useEmpresas, Empresa } from '@/hooks/useEmpresas';

// Service types supported by the platform
export type ServiceType = 'chat' | 'voice' | 'scheduling' | 'email';

// Service metadata for UI display
export interface ServiceInfo {
  id: ServiceType;
  label: string;
  description: string;
  warning?: string;
}

// Complete list of platform services
export const PLATFORM_SERVICES: ServiceInfo[] = [
  {
    id: 'chat',
    label: 'Chat',
    description: 'Widget de chat no website, inbox de mensagens, handoff humano e assistente IA interno.',
  },
  {
    id: 'voice',
    label: 'Voz',
    description: 'Chamadas telefónicas, agentes de voz IA, transcrição e resumos de chamadas.',
    warning: 'Este serviço consome mais recursos e tem custos operacionais mais elevados.',
  },
  {
    id: 'scheduling',
    label: 'Agendamentos',
    description: 'Criação de compromissos, sincronização com calendários externos e gestão de horários.',
  },
  {
    id: 'email',
    label: 'Email',
    description: 'Emails de follow-up, notificações automáticas e alertas do sistema.',
  },
];

// Map service type to database column
export function getServiceColumn(service: ServiceType): keyof Empresa {
  switch (service) {
    case 'chat':
      return 'service_chat_enabled' as keyof Empresa;
    case 'voice':
      return 'service_voice_enabled' as keyof Empresa;
    case 'scheduling':
      return 'service_scheduling_enabled' as keyof Empresa;
    case 'email':
      return 'service_email_enabled' as keyof Empresa;
  }
}

// Extract service flags from empresa
export interface ServiceAccessFlags {
  chat: boolean;
  voice: boolean;
  scheduling: boolean;
  email: boolean;
}

interface EmpresaWithServices {
  service_chat_enabled?: boolean;
  service_voice_enabled?: boolean;
  service_scheduling_enabled?: boolean;
  service_email_enabled?: boolean;
}

export function getServiceFlags(empresa: EmpresaWithServices | null | undefined): ServiceAccessFlags {
  if (!empresa) {
    return { chat: false, voice: false, scheduling: false, email: false };
  }
  
  return {
    chat: empresa.service_chat_enabled ?? false,
    voice: empresa.service_voice_enabled ?? false,
    scheduling: empresa.service_scheduling_enabled ?? false,
    email: empresa.service_email_enabled ?? false,
  };
}

/**
 * Hook to check service access for the current user's empresa.
 * Used by clients to know which features are available.
 */
export function useServiceAccess() {
  const { profile, role } = useAuth();
  const empresaId = profile?.empresa_id;
  const { data: empresas } = useEmpresas();
  
  const empresa = useMemo(() => {
    if (role === 'admin') return null; // Admins see all, handle separately
    return empresas?.find(e => e.id === empresaId) || null;
  }, [empresas, empresaId, role]);
  
  const services = useMemo(() => getServiceFlags(empresa), [empresa]);
  
  const isServiceEnabled = (service: ServiceType): boolean => {
    if (role === 'admin') return true; // Admins always have access
    return services[service];
  };
  
  const getDisabledMessage = (service: ServiceType): string => {
    const info = PLATFORM_SERVICES.find(s => s.id === service);
    return `O serviço "${info?.label || service}" não está ativo para a sua empresa. Contacte o administrador para mais informações.`;
  };
  
  return {
    services,
    isServiceEnabled,
    getDisabledMessage,
    isAdmin: role === 'admin',
  };
}

/**
 * Hook to check service access for a specific empresa.
 * Used by admins when viewing/editing empresa details.
 */
export function useEmpresaServiceAccess(empresaId: string | null) {
  const { data: empresas } = useEmpresas();
  
  const empresa = useMemo(() => {
    if (!empresaId) return null;
    return empresas?.find(e => e.id === empresaId) || null;
  }, [empresas, empresaId]);
  
  const services = useMemo(() => getServiceFlags(empresa), [empresa]);
  
  const isServiceEnabled = (service: ServiceType): boolean => {
    return services[service];
  };
  
  return {
    empresa,
    services,
    isServiceEnabled,
  };
}
