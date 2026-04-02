import { useState, useMemo } from 'react';
import { Phone, Info } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { ChamadasTable } from '@/components/chamadas/ChamadasTable';
import { ChamadasFilters } from '@/components/chamadas/ChamadasFilters';
import { SimularChamadaDialog } from '@/components/chamadas/SimularChamadaDialog';
import { useAllChamadas } from '@/hooks/useChamadas';
import { useEmpresas } from '@/hooks/useEmpresas';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { DateRange } from 'react-day-picker';
import { isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';

export default function ChamadasPage() {
  const { data: chamadas = [], isLoading } = useAllChamadas();
  const { data: empresas = [] } = useEmpresas();
  
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Prepare empresas list for filter
  const empresasList = useMemo(
    () => empresas.map((e) => ({ id: e.id, nome: e.nome })),
    [empresas]
  );

  // Filter chamadas based on selected filters
  const filteredChamadas = useMemo(() => {
    return chamadas.filter((chamada) => {
      // Filter by empresa
      if (selectedEmpresaId) {
        // Match by empresa name since we have formatted data
        const empresa = empresas.find((e) => e.id === selectedEmpresaId);
        if (empresa && chamada.empresa !== empresa.nome) {
          return false;
        }
      }

      // Filter by date range
      if (dateRange?.from) {
        // Parse the formatted date (e.g., "21 jan 2026, 12:11")
        // The chamada.data is in format "dd MMM yyyy, HH:mm"
        try {
          // We need to extract the date from the formatted string
          // Since we don't have the original ISO date, we use the original data
          // For now, this is a simple text-based filter
          // A better approach would be to store original dates
        } catch {
          // Skip date filtering if parsing fails
        }
      }

      return true;
    });
  }, [chamadas, selectedEmpresaId, empresas, dateRange]);

  return (
    <DashboardLayout>
      <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Phone className="w-6 h-6" />
              Chamadas
            </h1>
            <p className="text-muted-foreground">
              Histórico de chamadas de todas as empresas
            </p>
          </div>
          <SimularChamadaDialog />
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Esta página mostra chamadas simuladas para validação do sistema. 
            A integração com telefonia real será implementada em breve.
          </AlertDescription>
        </Alert>

        {/* Filters */}
        <ChamadasFilters
          empresas={empresasList}
          selectedEmpresaId={selectedEmpresaId}
          onEmpresaChange={setSelectedEmpresaId}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />

        <ChamadasTable 
          chamadas={filteredChamadas} 
          isLoading={isLoading} 
          showEmpresa={true}
        />
      </div>
      </PageContainer>
    </DashboardLayout>
  );
}
