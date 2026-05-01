import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard,
  Building2,
  Users,
  Bot,
  Phone,
  Calendar,
  CalendarDays,
  BarChart3,
  Boxes,
  Settings,
  LogOut,
  BookOpen,
  Mail,
  GitBranch,
  Zap,
  MessageSquare,
  Code2,
  Wrench,
  UserPlus,
} from 'lucide-react';

interface SidebarProps {
  onNavigate?: () => void;
}

const adminNavItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/empresas', icon: Building2, label: 'Empresas' },
  { to: '/admin/utilizadores', icon: Users, label: 'Utilizadores' },
  { to: '/admin/agentes', icon: Bot, label: 'Agentes' },
  { to: '/admin/conhecimento', icon: BookOpen, label: 'Conhecimento' },
  { to: '/admin/widgets', icon: Code2, label: 'Widgets' },
  { to: '/admin/conversas', icon: MessageSquare, label: 'Conversas' },
  { to: '/admin/leads', icon: UserPlus, label: 'Leads' },
  { to: '/admin/chamadas', icon: Phone, label: 'Chamadas' },
  { to: '/admin/agendamentos', icon: Calendar, label: 'Agendamentos' },
  { to: '/admin/calendar', icon: CalendarDays, label: 'Calendário' },
  { to: '/admin/recursos', icon: Boxes, label: 'Recursos' },
  { to: '/admin/relatorios', icon: BarChart3, label: 'Relatórios Chamadas' },
  { to: '/admin/relatorios-conversas', icon: MessageSquare, label: 'Relatórios Conversas' },
  { to: '/admin/creditos', icon: Zap, label: 'Créditos & Utilização' },
];

const adminConfigItems = [
  { to: '/admin/configuracoes', icon: Settings, label: 'Configurações' },
  { to: '/admin/follow-up-rules', icon: GitBranch, label: 'Regras Follow-Up' },
  { to: '/admin/email-templates', icon: Mail, label: 'Templates de Email' },
  { to: '/admin/manutencao', icon: Wrench, label: 'Manutenção' },
];

const clienteNavItems = [
  { to: '/cliente', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/cliente/conversas', icon: MessageSquare, label: 'Conversas' },
  { to: '/cliente/chamadas', icon: Phone, label: 'Chamadas' },
  { to: '/cliente/agendamentos', icon: Calendar, label: 'Agendamentos' },
  { to: '/cliente/relatorios', icon: BarChart3, label: 'Relatórios Chamadas' },
  { to: '/cliente/relatorios-conversas', icon: MessageSquare, label: 'Relatórios Conversas' },
  { to: '/cliente/creditos', icon: Zap, label: 'Créditos & Utilização' },
];

export function Sidebar({ onNavigate }: SidebarProps) {
  const { profile, role, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const navItems = isAdmin ? adminNavItems : clienteNavItems;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    onNavigate?.();
  };

  const displayName = profile?.nome || 'Utilizador';
  const displayRole = role === 'admin' ? 'Admin' : 'Cliente';

  return (
    <div className="flex h-full flex-col bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Phone className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-sidebar-foreground">VoiceAI</h1>
            <p className="text-xs text-muted-foreground">Gestão de Agentes</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/admin' || item.to === '/cliente'}
              onClick={handleNavClick}
              className={({ isActive }) =>
                `sidebar-item ${isActive ? 'active' : ''}`
              }
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </div>
        
        {/* Config section - admin only */}
        {isAdmin && (
          <div className="mt-6 pt-4 border-t border-sidebar-border">
            <p className="px-3 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Configurações
            </p>
            <div className="space-y-1">
              {adminConfigItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={handleNavClick}
                  className={({ isActive }) =>
                    `sidebar-item ${isActive ? 'active' : ''}`
                  }
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-sidebar-border flex-shrink-0">
        <div className="flex items-center gap-3 mb-4 px-3">
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-medium text-primary">
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {displayName}
            </p>
            <p className="text-xs text-muted-foreground capitalize">
              {displayRole}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="sidebar-item w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          <span>Terminar Sessão</span>
        </button>
      </div>
    </div>
  );
}
