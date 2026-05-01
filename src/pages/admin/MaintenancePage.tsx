import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ConfirmationDialog } from '@/components/admin/ConfirmationDialog';
import { TestEnvironmentBadge } from '@/components/admin/TestEnvironmentBadge';
import { useEmpresas } from '@/hooks/useEmpresas';
import {
  useArchiveEmpresa,
  useRestoreEmpresa,
  useResetEmpresaDemoData,
  useResetCreditsUsage,
  useToggleTestEnvironment,
} from '@/hooks/useAdminMaintenance';
import {
  Wrench,
  Archive,
  RotateCcw,
  Trash2,
  FlaskConical,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';

type DialogType = 'archive' | 'restore' | 'reset-demo' | 'reset-credits' | null;

// ---------------------------------------------------------------------------
// System Health
// ---------------------------------------------------------------------------
// Shape returned by the `core-health-check` edge function (only what the
// function returns is rendered — never fabricate health data on the client).
//
// Success response (200):
//   { status: 'healthy' | 'issues_detected', total_issues: number,
//     checks: { [key: string]: number } }
//
// Error response (500):
//   { status: 'error', message: string }   ← surfaced via mutation.isError
// ---------------------------------------------------------------------------
interface HealthCheckResponse {
  status: 'healthy' | 'issues_detected';
  total_issues: number;
  checks: Record<string, number>;
}

// Friendly labels for the check keys currently emitted by core-health-check.
// Unknown keys fall back to the raw key so future checks render without
// requiring a frontend change.
const HEALTH_CHECK_LABELS: Record<string, string> = {
  closed_without_result: 'Conversas fechadas sem resultado',
  booking_active_without_appointment: 'Reservas activas sem agendamento associado',
  booking_active_without_snapshot: 'Reservas activas sem snapshot confirmado',
  idle_closed_mismatch: 'Conversas em estado idle mas com status closed',
  duplicate_appointments: 'Agendamentos duplicados',
  stuck_booking_processing: 'booking_processing parado há mais de 5 min',
  awaiting_slot_selection_without_suggestions: 'awaiting_slot_selection sem sugestões',
};

export default function MaintenancePage() {
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string>('');
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState<DialogType>(null);

  const { data: empresas = [], isLoading: loadingEmpresas } = useEmpresas(showArchived);
  const archiveMutation = useArchiveEmpresa();
  const restoreMutation = useRestoreEmpresa();
  const resetDemoMutation = useResetEmpresaDemoData();
  const resetCreditsMutation = useResetCreditsUsage();
  const toggleTestMutation = useToggleTestEnvironment();

  // Calls the core-health-check edge function. Returns whatever the function
  // returns — no client-side health is computed, no faked checks.
  const healthCheck = useMutation<HealthCheckResponse, Error, void>({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('core-health-check');
      if (error) throw error;
      return data as HealthCheckResponse;
    },
  });

  const selectedEmpresa = empresas.find(e => e.id === selectedEmpresaId);
  const isArchived = selectedEmpresa?.deleted_at != null;
  const isTestEnv = (selectedEmpresa as any)?.is_test_environment ?? false;

  const handleConfirmAction = () => {
    if (!selectedEmpresaId) return;

    switch (dialogOpen) {
      case 'archive':
        archiveMutation.mutate(selectedEmpresaId);
        break;
      case 'restore':
        restoreMutation.mutate(selectedEmpresaId);
        break;
      case 'reset-demo':
        resetDemoMutation.mutate(selectedEmpresaId);
        break;
      case 'reset-credits':
        resetCreditsMutation.mutate(selectedEmpresaId);
        break;
    }
    setDialogOpen(null);
  };

  const isLoading = archiveMutation.isPending || restoreMutation.isPending || 
                    resetDemoMutation.isPending || resetCreditsMutation.isPending ||
                    toggleTestMutation.isPending;

  return (
    <DashboardLayout>
      <PageContainer>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wrench className="w-6 h-6" />
            Ferramentas de Manutenção
          </h1>
          <p className="text-muted-foreground">
            Ferramentas administrativas para gestão e limpeza de dados
          </p>
        </div>

        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5" />
              System Health
            </CardTitle>
            <CardDescription>
              Diagnóstico de integridade dos dados de conversação e booking. Os
              valores apresentados são exactamente os retornados pelo edge
              function <code className="font-mono text-xs">core-health-check</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                onClick={() => healthCheck.mutate()}
                disabled={healthCheck.isPending}
                variant="outline"
              >
                {healthCheck.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    A verificar...
                  </>
                ) : (
                  <>
                    <Activity className="w-4 h-4 mr-2" />
                    Check system status
                  </>
                )}
              </Button>

              {healthCheck.data && (
                healthCheck.data.status === 'healthy' ? (
                  <Badge className="bg-green-600 hover:bg-green-700">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    OK
                  </Badge>
                ) : (
                  <Badge className="bg-amber-600 hover:bg-amber-700 text-white">
                    <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                    DEGRADED
                    <span className="ml-1.5 opacity-90">
                      ({healthCheck.data.total_issues} {healthCheck.data.total_issues === 1 ? 'problema' : 'problemas'})
                    </span>
                  </Badge>
                )
              )}

              {healthCheck.isError && !healthCheck.isPending && (
                <Badge variant="destructive">
                  <XCircle className="w-3.5 h-3.5 mr-1" />
                  ERROR
                </Badge>
              )}
            </div>

            {healthCheck.isError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Erro ao verificar status</AlertTitle>
                <AlertDescription>
                  {healthCheck.error?.message ?? 'Falha desconhecida ao chamar core-health-check.'}
                </AlertDescription>
              </Alert>
            )}

            {healthCheck.data && (
              <div className="space-y-2">
                {Object.entries(healthCheck.data.checks).map(([key, count]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 p-3 border rounded-lg"
                  >
                    <span className="text-sm">
                      {HEALTH_CHECK_LABELS[key] ?? key}
                    </span>
                    {count === 0 ? (
                      <Badge variant="outline" className="border-green-600/40 text-green-700 dark:text-green-400">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        OK
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-red-600/40 text-red-700 dark:text-red-400">
                        <XCircle className="w-3.5 h-3.5 mr-1" />
                        {count} {count === 1 ? 'ocorrência' : 'ocorrências'}
                      </Badge>
                    )}
                  </div>
                ))}

                {Object.keys(healthCheck.data.checks).length === 0 && (
                  <p className="text-sm text-muted-foreground italic py-2">
                    O edge function não retornou checks.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Empresa Selector */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Selecionar Empresa</CardTitle>
            <CardDescription>
              Escolha uma empresa para realizar operações de manutenção
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Select value={selectedEmpresaId} onValueChange={setSelectedEmpresaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma empresa..." />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map(empresa => (
                      <SelectItem key={empresa.id} value={empresa.id}>
                        <span className="flex items-center gap-2">
                          {empresa.nome}
                          {empresa.deleted_at && (
                            <Badge variant="secondary" className="text-xs">Arquivada</Badge>
                          )}
                          {(empresa as any).is_test_environment && (
                            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600">
                              Teste
                            </Badge>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="show-archived"
                  checked={showArchived}
                  onCheckedChange={setShowArchived}
                />
                <Label htmlFor="show-archived" className="flex items-center gap-1.5 cursor-pointer">
                  {showArchived ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  Ver Arquivadas
                </Label>
              </div>
            </div>

            {selectedEmpresa && (
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{selectedEmpresa.nome}</span>
                  {isArchived && <Badge variant="secondary">Arquivada</Badge>}
                  {isTestEnv && <TestEnvironmentBadge size="sm" />}
                </div>
                <p className="text-sm text-muted-foreground">
                  Email: {selectedEmpresa.email || 'Não definido'} • Status: {selectedEmpresa.status}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {selectedEmpresaId && (
          <>
            {/* Test Environment Toggle */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FlaskConical className="w-5 h-5" />
                  Modo de Teste
                </CardTitle>
                <CardDescription>
                  Empresas em modo de teste não enviam emails de sistema e não contam para relatórios de faturação
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">Ambiente de Teste</p>
                    <p className="text-sm text-muted-foreground">
                      {isTestEnv 
                        ? 'Esta empresa está em modo de teste. Emails de sistema serão bloqueados.'
                        : 'Esta empresa está em modo de produção. Emails de sistema serão enviados normalmente.'}
                    </p>
                  </div>
                  <Switch
                    checked={isTestEnv}
                    onCheckedChange={(checked) => toggleTestMutation.mutate({ 
                      empresaId: selectedEmpresaId, 
                      isTest: checked 
                    })}
                    disabled={isLoading || isArchived}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Maintenance Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Ações de Manutenção
                </CardTitle>
                <CardDescription>
                  Operações de limpeza e arquivamento. Estas ações afetam dados reais.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Archive / Restore */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <p className="font-medium flex items-center gap-2">
                      <Archive className="w-4 h-4" />
                      {isArchived ? 'Restaurar Empresa' : 'Arquivar Empresa'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {isArchived 
                        ? 'Restaurar empresa e todos os dados associados (agentes, conversas, chamadas, utilizadores)'
                        : 'Remove a empresa de todas as listagens. Dados não são apagados permanentemente.'}
                    </p>
                  </div>
                  <Button
                    variant={isArchived ? 'default' : 'outline'}
                    onClick={() => setDialogOpen(isArchived ? 'restore' : 'archive')}
                    disabled={isLoading}
                  >
                    {isArchived ? (
                      <>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Restaurar
                      </>
                    ) : (
                      <>
                        <Archive className="w-4 h-4 mr-2" />
                        Arquivar
                      </>
                    )}
                  </Button>
                </div>

                <Separator />

                {/* Reset Demo Data */}
                <div className="flex items-center justify-between p-4 border rounded-lg border-amber-500/30 bg-amber-500/5">
                  <div className="space-y-1">
                    <p className="font-medium flex items-center gap-2">
                      <Trash2 className="w-4 h-4" />
                      Limpar Dados de Demonstração
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Remove conversas, chamadas e reinicia créditos do mês atual. Ideal para preparar demos.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                    onClick={() => setDialogOpen('reset-demo')}
                    disabled={isLoading || isArchived}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Limpar Dados
                  </Button>
                </div>

                {/* Reset Credits Only */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <p className="font-medium flex items-center gap-2">
                      <RefreshCw className="w-4 h-4" />
                      Reiniciar Créditos do Mês
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Zera o contador de créditos usados no mês atual. Não afeta o histórico.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setDialogOpen('reset-credits')}
                    disabled={isLoading || isArchived}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reiniciar Créditos
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Confirmation Dialogs */}
        <ConfirmationDialog
          open={dialogOpen === 'archive'}
          onOpenChange={(open) => !open && setDialogOpen(null)}
          title="Arquivar Empresa"
          description={`Tem certeza que deseja arquivar "${selectedEmpresa?.nome}"? A empresa e todos os dados associados (agentes, conversas, chamadas, utilizadores) serão removidos das listagens.`}
          confirmLabel="Arquivar"
          onConfirm={handleConfirmAction}
          isDestructive
          isLoading={archiveMutation.isPending}
        />

        <ConfirmationDialog
          open={dialogOpen === 'restore'}
          onOpenChange={(open) => !open && setDialogOpen(null)}
          title="Restaurar Empresa"
          description={`Tem certeza que deseja restaurar "${selectedEmpresa?.nome}"? A empresa e todos os dados associados voltarão a aparecer nas listagens.`}
          confirmLabel="Restaurar"
          onConfirm={handleConfirmAction}
          isLoading={restoreMutation.isPending}
        />

        <ConfirmationDialog
          open={dialogOpen === 'reset-demo'}
          onOpenChange={(open) => !open && setDialogOpen(null)}
          title="Limpar Dados de Demonstração"
          description={`Tem certeza que deseja limpar os dados de demonstração de "${selectedEmpresa?.nome}"? Isto vai remover todas as conversas, chamadas e reiniciar os créditos do mês atual.`}
          confirmLabel="Limpar Dados"
          onConfirm={handleConfirmAction}
          isDestructive
          isLoading={resetDemoMutation.isPending}
        />

        <ConfirmationDialog
          open={dialogOpen === 'reset-credits'}
          onOpenChange={(open) => !open && setDialogOpen(null)}
          title="Reiniciar Créditos do Mês"
          description={`Tem certeza que deseja reiniciar os créditos de "${selectedEmpresa?.nome}" para o mês atual? O contador será zerado.`}
          confirmLabel="Reiniciar"
          onConfirm={handleConfirmAction}
          isLoading={resetCreditsMutation.isPending}
        />
      </div>
      </PageContainer>
    </DashboardLayout>
  );
}
