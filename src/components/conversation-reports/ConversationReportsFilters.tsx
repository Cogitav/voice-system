import { useState, useEffect } from 'react';
import { Building2, Calendar, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { pt } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useEmpresas } from '@/hooks/useEmpresas';

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

interface ConversationReportsFiltersProps {
  onFiltersChange: (filters: {
    empresaId: string | null;
    dateRange: DateRange;
  }) => void;
}

export function ConversationReportsFilters({ onFiltersChange }: ConversationReportsFiltersProps) {
  const { data: empresas = [] } = useEmpresas();
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>('all');
  const [datePreset, setDatePreset] = useState<'7d' | '30d' | 'custom' | null>('7d');
  const [dateRange, setDateRange] = useState<DateRange>({ 
    from: subDays(new Date(), 6), 
    to: new Date() 
  });

  useEffect(() => {
    onFiltersChange({
      empresaId: selectedEmpresa === 'all' ? null : selectedEmpresa,
      dateRange,
    });
  }, [selectedEmpresa, dateRange, onFiltersChange]);

  const handlePreset = (preset: '7d' | '30d') => {
    const today = new Date();
    const from = subDays(today, preset === '7d' ? 6 : 29);
    setDatePreset(preset);
    setDateRange({ from, to: today });
  };

  const clearFilters = () => {
    setSelectedEmpresa('all');
    setDateRange({ from: undefined, to: undefined });
    setDatePreset(null);
  };

  const hasFilters = selectedEmpresa !== 'all' || dateRange.from;

  const formatDateRange = () => {
    if (!dateRange?.from) return 'Selecionar período';
    if (!dateRange.to) return format(dateRange.from, 'dd MMM yyyy', { locale: pt });
    return `${format(dateRange.from, 'dd MMM', { locale: pt })} - ${format(dateRange.to, 'dd MMM yyyy', { locale: pt })}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Company Filter */}
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground flex items-center gap-1">
          <Building2 className="h-4 w-4" />
          Empresa:
        </Label>
        <Select
          value={selectedEmpresa}
          onValueChange={setSelectedEmpresa}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
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

      {/* Date Range Filter */}
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground flex items-center gap-1">
          <Calendar className="h-4 w-4" />
          Período:
        </Label>
        <div className="flex flex-wrap gap-1">
          <Button
            variant={datePreset === '7d' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePreset('7d')}
          >
            Últimos 7 dias
          </Button>
          <Button
            variant={datePreset === '30d' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePreset('30d')}
          >
            Últimos 30 dias
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={datePreset === 'custom' ? 'default' : 'outline'}
                size="sm"
                className={cn(datePreset === 'custom' && 'bg-primary text-primary-foreground')}
              >
                {datePreset === 'custom' ? formatDateRange() : 'Personalizado'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={(range) => {
                  setDatePreset('custom');
                  if (range) {
                    setDateRange(range as DateRange);
                  }
                }}
                numberOfMonths={2}
                locale={pt}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Clear Filters */}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="h-4 w-4 mr-1" />
          Limpar filtros
        </Button>
      )}

      {/* Active filters badges */}
      {selectedEmpresa !== 'all' && (
        <Badge variant="secondary" className="gap-1">
          {empresas.find((e) => e.id === selectedEmpresa)?.nome}
          <X
            className="h-3 w-3 cursor-pointer"
            onClick={() => setSelectedEmpresa('all')}
          />
        </Badge>
      )}
    </div>
  );
}
