import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { BookOpen, Info } from 'lucide-react';
import { KnowledgeTable } from '@/components/knowledge/KnowledgeTable';
import { useKnowledgeBase } from '@/hooks/useKnowledgeBase';
import { useAuth } from '@/contexts/AuthContext';

export default function ClienteKnowledgeBasePage() {
  const { profile } = useAuth();
  const { data: knowledge = [], isLoading } = useKnowledgeBase(profile?.empresa_id);

  return (
    <DashboardLayout>
      <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Base de Conhecimento</h1>
            <p className="text-sm text-muted-foreground">
              Visualizar informação disponível para os agentes
            </p>
          </div>
        </div>

        {/* Info Banner */}
        <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg border">
          <Info className="w-5 h-5 text-primary mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium">
              Sobre a Base de Conhecimento
            </p>
            <p className="text-sm text-muted-foreground">
              Esta informação é utilizada pelos agentes para responder com maior precisão às questões dos clientes.
              Apenas administradores podem adicionar ou modificar este conteúdo.
            </p>
          </div>
        </div>

        {/* Table (Read-only) */}
        <KnowledgeTable
          knowledge={knowledge}
          isLoading={isLoading}
          readOnly={true}
        />
      </div>
      </PageContainer>
    </DashboardLayout>
  );
}
