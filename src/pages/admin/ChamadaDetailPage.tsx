import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Phone, 
  Building2, 
  Bot, 
  Clock, 
  Calendar, 
  MessageSquare, 
  Target, 
  FileText, 
  Zap, 
  ChevronRight,
  AlertTriangle,
  CalendarPlus,
  HelpCircle,
  Info,
  CheckCircle2,
  Mail,
  ListTodo
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useChamadaDetail, useUpdateProximaAcao } from '@/hooks/useChamadaDetail';
import { useAuth } from '@/contexts/AuthContext';
import { AgendamentoFormDialog } from '@/components/agendamentos/AgendamentoFormDialog';
import { EmailFollowUpSection } from '@/components/chamadas/EmailFollowUpSection';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { toast } from 'sonner';

export default function ChamadaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const basePath = isAdmin ? '/admin' : '/cliente';
  const [showAgendamentoDialog, setShowAgendamentoDialog] = useState(false);

  const { data: chamada, isLoading, error } = useChamadaDetail(id);
  const updateProximaAcao = useUpdateProximaAcao();

  const handleProximaAcaoChange = (value: string) => {
    if (!chamada) return;
    const newValue = value === 'none' ? null : value;
    updateProximaAcao.mutate(
      { id: chamada.id, proxima_acao: newValue },
      {
        onSuccess: () => {
          toast.success('Próxima ação atualizada com sucesso');
        },
        onError: () => {
          toast.error('Erro ao atualizar próxima ação');
        },
      }
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'concluida':
        return <Badge className="bg-green-600 hover:bg-green-700">Concluída</Badge>;
      case 'em_andamento':
        return <Badge className="bg-yellow-600 hover:bg-yellow-700 text-white">Em Andamento</Badge>;
      case 'falha':
        return <Badge variant="destructive">Falha</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const hasNoIntent = !chamada?.intencao_detetada || chamada.intencao_detetada === 'Não identificada';
  const hasNoNextAction = !chamada?.proxima_acao;
  const isCallCompleted = chamada?.status === 'concluida';

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageContainer>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
          <Skeleton className="h-64" />
        </div>
        </PageContainer>
      </DashboardLayout>
    );
  }

  if (error || !chamada) {
    return (
      <DashboardLayout>
        <PageContainer>
        <div className="flex flex-col items-center justify-center py-12">
          <Phone className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Chamada não encontrada</h2>
          <p className="text-muted-foreground mb-4">
            A chamada que procura não existe ou foi removida.
          </p>
          <Button onClick={() => navigate(`${basePath}/chamadas`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar à lista
          </Button>
        </div>
        </PageContainer>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`${basePath}/chamadas`)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight font-mono">
                  {chamada.telefone_cliente}
                </h1>
                {getStatusBadge(chamada.status)}
              </div>
              <p className="text-muted-foreground">
                {format(new Date(chamada.data_hora_inicio), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: pt })}
              </p>
            </div>
          </div>
        </div>

        {/* Simulation Notice */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Esta chamada é uma <strong>simulação</strong> para validação do sistema. 
            A transcrição e resumo são gerados automaticamente.
          </AlertDescription>
        </Alert>

        {/* Call Info Cards - Compact Row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Empresa</p>
                  <p className="font-medium truncate">{chamada.empresa_nome}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Bot className="h-5 w-5 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Agente</p>
                  <p className="font-medium truncate">
                    {chamada.agente_nome || <span className="text-muted-foreground italic">Não atribuído</span>}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Duração</p>
                  <p className="font-medium">{formatDuration(chamada.duracao)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Target className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Intenção</p>
                  {hasNoIntent ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="text-xs border-dashed text-muted-foreground">
                            <HelpCircle className="h-3 w-3 mr-1" />
                            Não identificada
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[200px]">
                          <p className="text-xs">
                            A IA não conseguiu classificar automaticamente.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      {chamada.intencao_detetada}
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content - Tabbed Layout */}
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="summary" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Resumo
            </TabsTrigger>
            <TabsTrigger value="transcript" className="gap-2">
              <FileText className="h-4 w-4" />
              Transcrição
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="followup" className="gap-2">
                <ListTodo className="h-4 w-4" />
                Follow-Up
              </TabsTrigger>
            )}
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="mt-6 space-y-6">
            {/* AI Summary Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Resumo da IA
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chamada.resumo ? (
                  <p className="text-sm leading-relaxed text-muted-foreground">{chamada.resumo}</p>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground py-2">
                    <HelpCircle className="h-4 w-4" />
                    <p className="text-sm italic">Resumo não disponível.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Agent Actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Ações do Agente
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chamada.acoes_agente && chamada.acoes_agente.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {chamada.acoes_agente.map((acao, index) => (
                      <div 
                        key={index} 
                        className="flex items-center gap-1 bg-muted rounded-lg px-3 py-1.5 text-sm"
                      >
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        {acao}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground py-2">
                    <Info className="h-4 w-4" />
                    <p className="text-sm italic">Nenhuma ação executada.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transcript Tab */}
          <TabsContent value="transcript" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Transcrição da Chamada
                </CardTitle>
                <CardDescription>
                  Transcrição completa da conversa (simulada)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {chamada.transcricao ? (
                  <ScrollArea className="h-[400px] rounded-lg border bg-muted/50 p-4">
                    <pre className="text-sm whitespace-pre-wrap font-mono leading-relaxed">
                      {chamada.transcricao}
                    </pre>
                  </ScrollArea>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-muted-foreground py-12 border rounded-lg border-dashed bg-muted/20">
                    <FileText className="h-5 w-5" />
                    <p className="text-sm">Transcrição não disponível.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Follow-Up Tab (Admin Only) */}
          {isAdmin && (
            <TabsContent value="followup" className="mt-6 space-y-6">
              {/* Status Summary */}
              {isCallCompleted && (hasNoIntent || hasNoNextAction) && (
                <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50">
                  <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertTitle className="text-amber-800 dark:text-amber-200">Ações sugeridas</AlertTitle>
                  <AlertDescription className="text-amber-700 dark:text-amber-300">
                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                      {hasNoIntent && (
                        <li>Intenção não detetada — pode ser classificada manualmente</li>
                      )}
                      {hasNoNextAction && (
                        <li>Defina a próxima ação abaixo se necessário</li>
                      )}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Next Action Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Próxima Ação
                  </CardTitle>
                  <CardDescription>
                    Defina a ação de seguimento para esta chamada. Esta configuração é opcional.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Select
                      value={chamada.proxima_acao || 'none'}
                      onValueChange={handleProximaAcaoChange}
                      disabled={updateProximaAcao.isPending}
                    >
                      <SelectTrigger className="w-[280px]">
                        <SelectValue placeholder="Selecionar ação..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma ação necessária</SelectItem>
                        <SelectItem value="criar_agendamento">Criar agendamento</SelectItem>
                        <SelectItem value="follow_up">Follow-up manual</SelectItem>
                        <SelectItem value="escalar_humano">Escalar para humano</SelectItem>
                      </SelectContent>
                    </Select>
                    {updateProximaAcao.isPending && (
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>

                  {chamada.proxima_acao && chamada.proxima_acao !== 'none' && (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Ação de seguimento definida</span>
                    </div>
                  )}

                  {chamada.proxima_acao === 'criar_agendamento' && (
                    <div className="pt-2">
                      <Button 
                        onClick={() => setShowAgendamentoDialog(true)}
                        className="gap-2"
                      >
                        <CalendarPlus className="h-4 w-4" />
                        Criar Agendamento
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Separator />

              {/* Email Follow-up */}
              <EmailFollowUpSection
                chamadaId={chamada.id}
                empresaId={chamada.empresa_id}
                intent={chamada.intencao_detetada}
                status={chamada.status}
                clienteTelefone={chamada.telefone_cliente}
                clienteNome={undefined}
                empresaNome={chamada.empresa_nome}
                resumo={chamada.resumo}
              />
            </TabsContent>
          )}
        </Tabs>

        {/* Agendamento Dialog */}
        {chamada && (
          <AgendamentoFormDialog
            chamadaId={chamada.id}
            defaultValues={{
              empresa_id: chamada.empresa_id,
              agente_id: chamada.agente_id || undefined,
              cliente_telefone: chamada.telefone_cliente,
            }}
            open={showAgendamentoDialog}
            onOpenChange={setShowAgendamentoDialog}
            trigger={<span />}
          />
        )}
      </div>
      </PageContainer>
    </DashboardLayout>
  );
}
