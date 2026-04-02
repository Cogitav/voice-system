import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useAdminResetPassword() {
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null);
  const { toast } = useToast();

  const sendResetPassword = async (email: string) => {
    setLoadingEmail(email);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        toast({
          title: 'Sessão expirada',
          description: 'Por favor, faça login novamente.',
          variant: 'destructive',
        });
        return false;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-reset-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ email }),
        }
      );

      const result = await response.json();

      if (response.ok) {
        toast({
          title: 'Email enviado',
          description: result.message || 'Se existir uma conta com este email, foi enviado um link de recuperação.',
        });
        return true;
      } else {
        // For security, we show a generic message even on errors
        if (response.status === 403) {
          toast({
            title: 'Acesso negado',
            description: 'Não tem permissões para executar esta ação.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Email enviado',
            description: 'Se existir uma conta com este email, foi enviado um link de recuperação.',
          });
        }
        return response.status !== 403;
      }
    } catch (error) {
      console.error('Error sending reset password:', error);
      // Generic message for security
      toast({
        title: 'Email enviado',
        description: 'Se existir uma conta com este email, foi enviado um link de recuperação.',
      });
      return true;
    } finally {
      setLoadingEmail(null);
    }
  };

  return {
    sendResetPassword,
    loadingEmail,
    isLoading: loadingEmail !== null,
  };
}
