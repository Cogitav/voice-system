import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export type AppRole = Database['public']['Enums']['app_role'];

interface UserProfile {
  id: string;
  user_id: string;
  empresa_id: string | null;
  nome: string;
  email: string;
  status: string;
}

interface AuthState {
  user: SupabaseUser | null;
  profile: UserProfile | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  isCoordinator: boolean;
  isReadOnly: boolean;
  role: AppRole | null;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    profile: null,
    session: null,
    isAuthenticated: false,
    isLoading: true,
    isAdmin: false,
    isCoordinator: false,
    isReadOnly: false,
    role: null,
  });

  // 🔥 GARANTE PROFILE (CORE FIX)
  const ensureProfile = async (user: SupabaseUser) => {
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!existingProfile) {
      console.log("CRIAR PROFILE AUTOMÁTICO");

      await supabase.from('profiles').insert({
        user_id: user.id,
        email: user.email,
        nome: user.user_metadata?.nome || '',
        status: 'ativo',
      });

      await supabase.from('user_roles').insert({
        user_id: user.id,
        role: 'cliente_normal',
      });
    }
  };

  const fetchUserRole = async (userId: string): Promise<AppRole | null> => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    return data?.role || null;
  };

  const fetchUserProfile = async (userId: string): Promise<UserProfile | null> => {
    const { data } = await supabase
      .from('profiles')
      .select('id, user_id, empresa_id, nome, email, status')
      .eq('user_id', userId)
      .maybeSingle();

    return data || null;
  };

  const fetchUserData = async (userId: string) => {
    const [profile, role] = await Promise.all([
      fetchUserProfile(userId),
      fetchUserRole(userId),
    ]);
    return { profile, role };
  };

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      if (event === 'PASSWORD_RECOVERY') return;

      if (session?.user) {
        setTimeout(async () => {
          if (!isMounted) return;

          const user = session.user;

          // 🔥 FIX PRINCIPAL
          await ensureProfile(user);

          const { profile, role } = await fetchUserData(user.id);

          if (!isMounted) return;

          supabase
            .from('profiles')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .then();

          setAuthState({
            user,
            profile,
            session,
            isAuthenticated: true,
            isLoading: false,
            isAdmin: role === 'admin',
            isCoordinator: role === 'cliente_coordenador',
            isReadOnly: false,
            role,
          });

        }, 0);

      } else {
        setAuthState({
          user: null,
          profile: null,
          session: null,
          isAuthenticated: false,
          isLoading: false,
          isAdmin: false,
          isCoordinator: false,
          isReadOnly: false,
          role: null,
        });
      }
    });

    // 🔥 FIX TAMBÉM AQUI
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted) return;

      if (session?.user) {
        await ensureProfile(session.user);

        const { profile, role } = await fetchUserData(session.user.id);

        if (!isMounted) return;

        setAuthState({
          user: session.user,
          profile,
          session,
          isAuthenticated: true,
          isLoading: false,
          isAdmin: role === 'admin',
          isCoordinator: role === 'cliente_coordenador',
          isReadOnly: false,
          role,
        });
      } else {
        setAuthState(prev => ({ ...prev, isLoading: false }));
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) return { success: false, error: error.message };

    return { success: true };
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ ...authState, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}