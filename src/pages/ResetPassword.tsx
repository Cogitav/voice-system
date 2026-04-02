import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Phone, Lock, CheckCircle, AlertCircle } from 'lucide-react';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const [sessionState, setSessionState] = useState<'loading' | 'valid' | 'invalid'>('loading');
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    
    // Handle URL hash tokens from email links
    const handleHashParams = async () => {
      const hash = window.location.hash;
      
      // If we have hash params, Supabase will handle the token exchange
      if (hash && hash.includes('access_token')) {
        // Let Supabase auth handle the token exchange via onAuthStateChange
        return;
      }
      
      // No hash - check existing session
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (isMounted) {
          setSessionState(session ? 'valid' : 'invalid');
        }
      } catch (err) {
        console.error('Session check error:', err);
        if (isMounted) {
          setSessionState('invalid');
        }
      }
    };

    // Listen for auth state changes (PASSWORD_RECOVERY event from email link)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      
      if (event === 'PASSWORD_RECOVERY') {
        setSessionState('valid');
        setError('');
        // Clear the hash from URL to prevent issues on refresh
        window.history.replaceState(null, '', window.location.pathname);
      } else if (event === 'SIGNED_IN' && session) {
        // Also valid for password reset
        setSessionState('valid');
        setError('');
      } else if (event === 'TOKEN_REFRESHED' && session) {
        setSessionState('valid');
      } else if (event === 'SIGNED_OUT') {
        // Don't immediately invalidate - user might be in the middle of reset
      }
    });

    handleHashParams();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('As passwords não coincidem');
      return;
    }

    if (password.length < 6) {
      setError('A password deve ter pelo menos 6 caracteres');
      return;
    }

    setIsLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        // Handle specific error types gracefully
        if (updateError.message.includes('session') || updateError.message.includes('token')) {
          setError('Sessão expirada. Por favor, solicite um novo link de recuperação.');
          setSessionState('invalid');
        } else {
          setError(updateError.message);
        }
        return;
      }

      setIsSuccess(true);
      
      // Sign out and redirect to login after success
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate('/login');
      }, 2500);
    } catch (err) {
      console.error('Password update error:', err);
      setError('Ocorreu um erro. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state while checking session
  if (sessionState === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Invalid or expired link
  if (sessionState === 'invalid') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-8">
        <div className="w-full max-w-md">
          <div className="glass-card rounded-2xl p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Link inválido ou expirado
            </h2>
            <p className="text-muted-foreground mb-6">
              Este link de recuperação já não é válido. Por favor, solicite um novo link.
            </p>
            <Button onClick={() => navigate('/login')} className="w-full">
              Voltar ao login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
            <Phone className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">VoiceAI</h1>
            <p className="text-sm text-muted-foreground">Gestão de Agentes</p>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-8">
          {isSuccess ? (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                Password alterada!
              </h2>
              <p className="text-muted-foreground mb-4">
                A sua password foi alterada com sucesso. Será redirecionado para o login.
              </p>
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <h2 className="text-2xl font-semibold text-foreground mb-2">
                  Definir nova password
                </h2>
                <p className="text-muted-foreground">
                  Introduza a sua nova password
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="password">Nova password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 h-12 bg-muted/50 border-border focus:border-primary"
                      required
                      minLength={6}
                      autoFocus
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirmar password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10 h-12 bg-muted/50 border-border focus:border-primary"
                      required
                      minLength={6}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12"
                  disabled={isLoading || !password || !confirmPassword}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      A guardar...
                    </span>
                  ) : (
                    'Guardar nova password'
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
