export function useCreateUtilizador() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateUtilizadorData) => {

      // 🔥 VALIDAÇÃO CRÍTICA
      if (!data.empresa_id) {
        throw new Error('empresa_id em falta');
      }

      const { data: sessionData, error } = await supabase.auth.getSession();

      if (error || !sessionData.session) {
        throw new Error('Sessão inválida');
      }

      const token = sessionData.session.access_token;

      if (!token) {
        throw new Error('Token não encontrado');
      }

      console.log("PAYLOAD ENVIADO:", data);

      const response = await fetch(
        'https://szlwbqvqdvgjmnczfoaq.supabase.co/functions/v1/create-user',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            nome: data.nome,
            email: data.email,
            empresa_id: data.empresa_id, // 🔥 GARANTIDO
            role: data.role,
            status: data.status,
          }),
        }
      );

      const result = await response.json();

      console.log("RESULT:", result);

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao criar utilizador');
      }

      return result;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['utilizadores'] });

      toast.success('Convite enviado com sucesso!', {
        description: 'O utilizador receberá um email para definir a sua password.',
        duration: 6000,
      });
    },

    onError: (error: Error) => {
      toast.error(`Erro ao criar utilizador: ${error.message}`);
    },
  });
}