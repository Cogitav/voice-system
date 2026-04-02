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

  // Fetch user role from user_roles table
  const fetchUserRole = async (userId: string): Promise<AppRole | null> => {
    try {
      const { data: roleData, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user role:', error);
        return null;
      }

      return roleData?.role || null;
    } catch (error) {
      console.error('Error fetching user role:', error);
      return null;
    }
  };

  // Fetch user profile (without role - role comes from user_roles)
  const fetchUserProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, user_id, empresa_id, nome, email, status')
        .eq('user_id', userId)
        .maybeSingle();

      return profile || null;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  };

  // Combined fetch that gets both profile and role
  const fetchUserData = async (userId: string) => {
    const [profile, role] = await Promise.all([
      fetchUserProfile(userId),
      fetchUserRole(userId),
    ]);
    return { profile, role };
  };

  useEffect(() => {
    let isMounted = true;
    
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      
      // Skip PASSWORD_RECOVERY events - handled by ResetPassword page
      if (event === 'PASSWORD_RECOVERY') {
        return;
      }
      
      if (session?.user) {
        // Defer data fetch to avoid Supabase client deadlock
        setTimeout(async () => {
          if (!isMounted) return;
          const { profile, role } = await fetchUserData(session.user.id);
          if (!isMounted) return;
          // Update last_seen_at for operator availability tracking
          supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('user_id', session.user.id).then();
          setAuthState({
            user: session.user,
            profile,
            session,
            isAuthenticated: true,
            isLoading: false,
            isAdmin: role === 'admin',
            isCoordinator: role === 'cliente_coordenador',
            isReadOnly: false, // UI-level permission, not database role
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

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted) return;
      if (session?.user) {
        const { profile, role } = await fetchUserData(session.user.id);
        if (!isMounted) return;
        // Update last_seen_at on initial load
        supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('user_id', session.user.id).then();
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

    // Heartbeat: update last_seen_at every 2 minutes while authenticated
    const heartbeatInterval = setInterval(async () => {
      if (!isMounted) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('user_id', session.user.id).then();
      }
    }, 2 * 60 * 1000);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      clearInterval(heartbeatInterval);
    };
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.user) {
        const { profile, role } = await fetchUserData(data.user.id);
        setAuthState({
          user: data.user,
          profile,
          session: data.session,
          isAuthenticated: true,
          isLoading: false,
          isAdmin: role === 'admin',
          isCoordinator: role === 'cliente_coordenador',
          isReadOnly: false, // UI-level permission, not database role
          role,
        });
        return { success: true };
      }

      return { success: false, error: 'Erro ao fazer login' };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Erro ao fazer login' };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
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
  };

  return (
    <AuthContext.Provider value={{ ...authState, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
