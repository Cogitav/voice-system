import { useAuth } from '@/contexts/AuthContext';

export interface Permissions {
  // Role checks
  isAdmin: boolean;
  isCoordinator: boolean;
  isReadOnly: boolean;
  isOperator: boolean;
  
  // Conversation permissions
  canViewConversations: boolean;
  canReplyToConversations: boolean;
  canAssumeConversations: boolean;
  canCloseConversations: boolean;
  
  // User management
  canManageUsers: boolean;
  canManageCompanyUsers: boolean;
  
  // Configuration
  canManageAgents: boolean;
  canManageKnowledge: boolean;
  canManageSettings: boolean;
  canManageCredits: boolean;
  canManageTemplates: boolean;
  
  // Reports
  canViewReports: boolean;
  canViewAllCompanies: boolean;
}

export function usePermissions(): Permissions {
  const { isAdmin, isCoordinator, isReadOnly, role } = useAuth();
  
  const isOperator = role === 'cliente_normal';
  
  // Admins have full access
  if (isAdmin) {
    return {
      isAdmin: true,
      isCoordinator: false,
      isReadOnly: false,
      isOperator: false,
      
      canViewConversations: true,
      canReplyToConversations: true,
      canAssumeConversations: true,
      canCloseConversations: true,
      
      canManageUsers: true,
      canManageCompanyUsers: true,
      
      canManageAgents: true,
      canManageKnowledge: true,
      canManageSettings: true,
      canManageCredits: true,
      canManageTemplates: true,
      
      canViewReports: true,
      canViewAllCompanies: true,
    };
  }
  
  // Coordinators can manage their company
  if (isCoordinator) {
    return {
      isAdmin: false,
      isCoordinator: true,
      isReadOnly: false,
      isOperator: false,
      
      canViewConversations: true,
      canReplyToConversations: true,
      canAssumeConversations: true,
      canCloseConversations: true,
      
      canManageUsers: false,
      canManageCompanyUsers: true,
      
      canManageAgents: true,
      canManageKnowledge: true,
      canManageSettings: false,
      canManageCredits: false,
      canManageTemplates: false,
      
      canViewReports: true,
      canViewAllCompanies: false,
    };
  }
  
  // Note: Read-only mode is reserved for future UI-level implementation
  // For v1, all non-admin/non-coordinator users are treated as operators
  
  // Normal operators (cliente_normal)
  return {
    isAdmin: false,
    isCoordinator: false,
    isReadOnly: false,
    isOperator: true,
    
    canViewConversations: true,
    canReplyToConversations: true,
    canAssumeConversations: true,
    canCloseConversations: true,
    
    canManageUsers: false,
    canManageCompanyUsers: false,
    
    canManageAgents: false,
    canManageKnowledge: false,
    canManageSettings: false,
    canManageCredits: false,
    canManageTemplates: false,
    
    canViewReports: true,
    canViewAllCompanies: false,
  };
}
