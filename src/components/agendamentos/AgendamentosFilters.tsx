import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useEmpresas } from '@/hooks/useEmpresas';
import { useAgentes } from '@/hooks/useAgentes';
import { AgendamentoFilters } from '@/hooks/useAgendamentos';

interface AgendamentosFiltersProps {
  filters: AgendamentoFilters;
  onFiltersChange: (filters: AgendamentoFilters) => void;
}

export function AgendamentosFilters({ filters, onFiltersChange }: AgendamentosFiltersProps) {
  const { data: empresas = [] } = useEmpresas();
  const { data: agentes = [] } = useAgentes();

  const activeFiltersCount = Object.values(filters).filter(Boolean).length;

  const handleClearFilters = () => {
    onFiltersChange({});
  };

  const handleFilterChange = (key: keyof AgendamentoFilters, value: string | undefined) => {
    onFiltersChange({
      ...filters,
      [key]: value === 'all' ? undefined : value,
    });
  };

  const filteredAgentes = filters.empresa_id 
    ? agentes.filter(a => a.empresa_id === filters.empresa_id)
    : agentes;

  return (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Filter className="h-4 w-4" />
            Filtros
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5">
                {activeFiltersCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Filtros</h4>
              {activeFiltersCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="h-auto p-1 text-muted-foreground"
                >
                  <X className="h-4 w-4 mr-1" />
                  Limpar
                </Button>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Select
                  value={filters.empresa_id || 'all'}
                  onValueChange={(value) => handleFilterChange('empresa_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as empresas" />
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
              </div>

              <div className="space-y-2">
                <Label>Agente</Label>
                <Select
                  value={filters.agente_id || 'all'}
                  onValueChange={(value) => handleFilterChange('agente_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os agentes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os agentes</SelectItem>
                    {filteredAgentes.map((agente) => (
                      <SelectItem key={agente.id} value={agente.id}>
                        {agente.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={filters.estado || 'all'}
                  onValueChange={(value) => handleFilterChange('estado', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os estados" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os estados</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="confirmado">Confirmado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Data início</Label>
                  <Input
                    type="date"
                    value={filters.data_inicio || ''}
                    onChange={(e) => handleFilterChange('data_inicio', e.target.value || undefined)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data fim</Label>
                  <Input
                    type="date"
                    value={filters.data_fim || ''}
                    onChange={(e) => handleFilterChange('data_fim', e.target.value || undefined)}
                  />
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {activeFiltersCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearFilters}
          className="text-muted-foreground"
        >
          <X className="h-4 w-4 mr-1" />
          Limpar filtros
        </Button>
      )}
    </div>
  );
}
