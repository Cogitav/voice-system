import { Phone, Info } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { ChamadasTable } from '@/components/chamadas/ChamadasTable';
import { useChamadasByEmpresa } from '@/hooks/useChamadas';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function ChamadasPage() {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id || null;
  const { data: chamadas = [], isLoading } = useChamadasByEmpresa(empresaId);

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
              Histórico de chamadas da sua empresa
            </p>
          </div>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Esta página mostra o histórico de chamadas dos seus agentes. Consulte aqui o registo 
            de todas as interações telefónicas.
          </AlertDescription>
        </Alert>

        <ChamadasTable 
          chamadas={chamadas} 
          isLoading={isLoading} 
          showEmpresa={false}
        />
      </div>
      </PageContainer>
    </DashboardLayout>
  );
}
