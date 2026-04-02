import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ConversationFilters as Filters, ConversationStatus, ConversationChannel, ConversationOwner } from '@/types/conversations';
import { useEmpresas } from '@/hooks/useEmpresas';
import { useAuth } from '@/contexts/AuthContext';

interface ConversationFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export function ConversationFilters({ filters, onChange }: ConversationFiltersProps) {
  const { isAdmin } = useAuth();
  const { data: empresas } = useEmpresas();

  return (
    <div className="space-y-3 p-4 border-b">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar conversas..."
          className="pl-9"
          value={filters.search || ''}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </div>
      
      <div className="flex gap-2 flex-wrap">
        <Select
          value={filters.status || 'all'}
          onValueChange={(value) => onChange({ ...filters, status: value as ConversationStatus | 'all' })}
        >
          <SelectTrigger className="flex-1 min-w-[140px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            <SelectItem value="ai_active">IA Ativa</SelectItem>
            <SelectItem value="waiting_human">Aguardando Humano</SelectItem>
            <SelectItem value="human_active">Humano Ativo</SelectItem>
            <SelectItem value="completed">Concluída</SelectItem>
            <SelectItem value="closed">Encerrada</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.channel || 'all'}
          onValueChange={(value) => onChange({ ...filters, channel: value as ConversationChannel | 'all' })}
        >
          <SelectTrigger className="flex-1 min-w-[120px]">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os canais</SelectItem>
            <SelectItem value="chat">Chat</SelectItem>
            <SelectItem value="voice">Voz</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.owner || 'all'}
          onValueChange={(value) => onChange({ ...filters, owner: value as ConversationOwner | 'all' })}
        >
          <SelectTrigger className="flex-1 min-w-[100px]">
            <SelectValue placeholder="Dono" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ai">IA</SelectItem>
            <SelectItem value="human">Humano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isAdmin && empresas && empresas.length > 0 && (
        <Select
          value={filters.empresaId || 'all'}
          onValueChange={(value) => onChange({ ...filters, empresaId: value === 'all' ? undefined : value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            {empresas.map((empresa) => (
              <SelectItem key={empresa.id} value={empresa.id}>
                {empresa.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
