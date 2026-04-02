import { useState } from 'react';
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
import type { DateRange } from 'react-day-picker';

interface ChamadasFiltersProps {
  empresas: { id: string; nome: string }[];
  selectedEmpresaId: string | null;
  onEmpresaChange: (empresaId: string | null) => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
}

type DatePreset = '7d' | '30d' | 'this_month' | 'last_month' | 'custom';

export function ChamadasFilters({
  empresas,
  selectedEmpresaId,
  onEmpresaChange,
  dateRange,
  onDateRangeChange,
}: ChamadasFiltersProps) {
  const [datePreset, setDatePreset] = useState<DatePreset | null>(null);

  const handlePreset = (preset: DatePreset) => {
    const today = new Date();
    let from: Date;
    let to: Date = today;

    switch (preset) {
      case '7d':
        from = subDays(today, 6);
        break;
      case '30d':
        from = subDays(today, 29);
        break;
      case 'this_month':
        from = startOfMonth(today);
        to = endOfMonth(today);
        break;
      case 'last_month':
        const lastMonth = subMonths(today, 1);
        from = startOfMonth(lastMonth);
        to = endOfMonth(lastMonth);
        break;
      default:
        return;
    }

    setDatePreset(preset);
    onDateRangeChange({ from, to });
  };

  const clearFilters = () => {
    onEmpresaChange(null);
    onDateRangeChange(undefined);
    setDatePreset(null);
  };

  const hasFilters = selectedEmpresaId || dateRange;

  const formatDateRange = () => {
    if (!dateRange?.from) return 'Selecionar período';
    if (!dateRange.to) return format(dateRange.from, 'dd MMM yyyy', { locale: pt });
    return `${format(dateRange.from, 'dd MMM', { locale: pt })} - ${format(dateRange.to, 'dd MMM yyyy', { locale: pt })}`;
  };

  return (
    <div className="flex flex-wrap items-start gap-3">
      {/* Company Filter */}
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground flex items-center gap-1">
          <Building2 className="h-4 w-4" />
          Empresa:
        </Label>
        <Select
          value={selectedEmpresaId || 'all'}
          onValueChange={(value) => onEmpresaChange(value === 'all' ? null : value)}
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
            7 dias
          </Button>
          <Button
            variant={datePreset === '30d' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePreset('30d')}
          >
            30 dias
          </Button>
          <Button
            variant={datePreset === 'this_month' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePreset('this_month')}
          >
            Este mês
          </Button>
          <Button
            variant={datePreset === 'last_month' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePreset('last_month')}
          >
            Mês anterior
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={datePreset === 'custom' ? 'default' : 'outline'}
                size="sm"
                className={cn(!datePreset && dateRange && 'bg-primary text-primary-foreground')}
              >
                {datePreset === 'custom' || (!datePreset && dateRange) 
                  ? formatDateRange() 
                  : 'Personalizado'}
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
                  onDateRangeChange(range);
                }}
                numberOfMonths={2}
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
      {hasFilters && (
        <div className="flex gap-2 ml-2">
          {selectedEmpresaId && (
            <Badge variant="secondary" className="gap-1">
              {empresas.find((e) => e.id === selectedEmpresaId)?.nome}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onEmpresaChange(null)}
              />
            </Badge>
          )}
          {dateRange && (
            <Badge variant="secondary" className="gap-1">
              {formatDateRange()}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => {
                  onDateRangeChange(undefined);
                  setDatePreset(null);
                }}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
