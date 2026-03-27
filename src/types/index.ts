export type UserRole = 'admin' | 'cliente';

export interface User {
  id: string;
  empresa_id: string | null;
  nome: string;
  email: string;
  role: UserRole;
  status: 'ativo' | 'inativo';
  created_at: string;
}

export interface Empresa {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  fuso_horario: string;
  horario_funcionamento: string;
  status: 'ativo' | 'inativo';
  created_at: string;
}

export interface Agente {
  id: string;
  empresa_id: string;
  nome: string;
  idioma: string;
  personalidade: string;
  prompt_base: string;
  regras: string;
  status: 'ativo' | 'inativo';
  created_at: string;
}

export interface Intencao {
  id: string;
  agente_id: string;
  nome: string;
  descricao: string;
  tipo_acao: 'informar' | 'agendar' | 'encaminhar';
  prioridade: number;
}

export interface Chamada {
  id: string;
  empresa_id: string;
  agente_id: string;
  telefone_cliente: string;
  data_hora_inicio: string;
  duracao: number;
  intencao_detetada: string;
  resultado: string;
  status: 'concluida' | 'em_andamento' | 'falha';
  created_at: string;
}

export interface Agendamento {
  id: string;
  empresa_id: string;
  chamada_id: string;
  data: string;
  hora: string;
  estado: 'pendente' | 'confirmado' | 'cancelado' | 'concluido';
  created_at: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
