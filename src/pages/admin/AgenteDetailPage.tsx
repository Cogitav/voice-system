import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Power, Bot, Building2, Globe, FileText, ShieldAlert, Briefcase, MessageSquare, FlaskConical, BookOpen, AlertTriangle, Info, CheckCircle2, MessageCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AgenteFormDialog } from '@/components/agentes/AgenteFormDialog';
import { AgentTestChat } from '@/components/agentes/AgentTestChat';
import { useAgente, useUpdateAgente, AgenteFormData } from '@/hooks/useAgentes';
import { useKnowledgeBase } from '@/hooks/useKnowledgeBase';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

export default function AgenteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const basePath = isAdmin ? '/admin' : '/cliente';
  
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const { data: agente, isLoading, error } = useAgente(id);
  const updateMutation = useUpdateAgente();
  
  // Fetch knowledge base for this agent
  const { data: knowledgeItems } = useKnowledgeBase(agente?.empresa_id, id);
  const hasKnowledge = (knowledgeItems?.length ?? 0) > 0;

  // Check for missing configurations
  const hasPrompt = !!agente?.prompt_base?.trim();
  const hasBusinessContext = !!agente?.contexto_negocio?.trim();
  const hasRules = !!agente?.regras?.trim();
  const configurationIssues: string[] = [];
  
  if (!hasPrompt) configurationIssues.push('System prompt não definido');
  if (!hasBusinessContext) configurationIssues.push('Contexto de negócio não definido');
  
  const handleToggleStatus = () => {
    if (!agente) return;
    const newStatus = agente.status === 'ativo' ? 'inativo' : 'ativo';
    updateMutation.mutate({
      id: agente.id,
      data: { ...agente, status: newStatus },
    });
  };

  const handleSubmit = (data: AgenteFormData) => {
    if (!agente) return;
    updateMutation.mutate(
      { id: agente.id, data },
      {
        onSuccess: () => {
          setDialogOpen(false);
        },
      }
    );
  };

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
        </div>
        </PageContainer>
      </DashboardLayout>
    );
  }

  if (error || !agente) {
    return (
      <DashboardLayout>
        <PageContainer>
        <div className="flex flex-col items-center justify-center py-12">
          <Bot className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Agente não encontrado</h2>
          <p className="text-muted-foreground mb-4">
            O agente que procura não existe ou foi removido.
          </p>
          <Button onClick={() => navigate(`${basePath}/agentes`)}>
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
              onClick={() => navigate(`${basePath}/agentes`)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">{agente.nome}</h1>
                <Badge variant={agente.status === 'ativo' ? 'default' : 'secondary'}>
                  {agente.status === 'ativo' ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              <p className="text-muted-foreground">
                Criado em {format(new Date(agente.created_at), "dd 'de' MMMM 'de' yyyy", { locale: pt })}
              </p>
            </div>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleToggleStatus}
                disabled={updateMutation.isPending}
              >
                <Power className={`mr-2 h-4 w-4 ${agente.status === 'ativo' ? 'text-destructive' : 'text-green-500'}`} />
                {agente.status === 'ativo' ? 'Desativar' : 'Ativar'}
              </Button>
              <Button onClick={() => setDialogOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </Button>
            </div>
          )}
        </div>

        {/* Configuration Warnings */}
        {isAdmin && configurationIssues.length > 0 && (
          <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-amber-800 dark:text-amber-200">Configuração incompleta</AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              <p className="mb-1">O agente pode funcionar, mas recomendamos completar a configuração:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {configurationIssues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Knowledge Status */}
        {!hasKnowledge && (
          <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/50">
            <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertTitle className="text-blue-800 dark:text-blue-200">Sem base de conhecimento</AlertTitle>
            <AlertDescription className="text-blue-700 dark:text-blue-300">
              Este agente não tem conhecimento adicional configurado. O agente funcionará usando apenas o prompt e contexto definidos.{' '}
              {isAdmin && (
                <Link to={`${basePath}/knowledge`} className="underline font-medium">
                  Adicionar conhecimento
                </Link>
              )}
            </AlertDescription>
          </Alert>
        )}

        {hasKnowledge && (
          <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/50">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-green-800 dark:text-green-200">
              <strong>Base de conhecimento ativa:</strong> {knowledgeItems?.length} item(ns) disponível(is) para enriquecer as respostas deste agente.
            </AlertDescription>
          </Alert>
        )}

        {/* Section 1: Agent Identity */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                1. Identidade do Agente
              </CardTitle>
              <CardDescription>
                Informações básicas que identificam o agente
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Empresa</p>
                  <p className="font-medium">{agente.empresa_nome}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Idioma</p>
                  <p className="font-medium">{agente.idioma || 'pt-PT'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Descrição da Função
              </CardTitle>
              <CardDescription>
                Quem é este agente e qual é a sua principal responsabilidade
              </CardDescription>
            </CardHeader>
            <CardContent>
              {agente.descricao_funcao ? (
                <p className="text-sm whitespace-pre-wrap">
                  {agente.descricao_funcao}
                </p>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground py-2">
                  <Info className="h-4 w-4" />
                  <p className="text-sm italic">Nenhuma descrição definida. Opcional, mas recomendado.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Section 2: Business Context */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              2. Contexto de Negócio
            </CardTitle>
            <CardDescription>
              Conhecimento sobre a empresa e domínio de atuação do agente
            </CardDescription>
          </CardHeader>
          <CardContent>
            {agente.contexto_negocio ? (
              <div className="bg-muted rounded-lg p-4 max-h-[300px] overflow-y-auto">
                <p className="text-sm whitespace-pre-wrap">
                  {agente.contexto_negocio}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 border rounded-lg border-dashed bg-muted/20">
                <Briefcase className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  Contexto de negócio não definido. Adicione informações sobre a empresa, produtos, serviços ou políticas para que o agente possa responder com mais precisão.
                </p>
                {isAdmin && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setDialogOpen(true)}>
                    Adicionar contexto
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

      {/* Tabs for Details and Test */}
        <Tabs defaultValue="details" className="w-full">
          <TabsList>
            <TabsTrigger value="details">
              <FileText className="h-4 w-4 mr-2" />
              Detalhes
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="test">
                <FlaskConical className="h-4 w-4 mr-2" />
                Testar Agente
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="details" className="mt-6 space-y-6">
            {/* Section 3 & 4: Core Behavior and Rules */}
            <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    3. Comportamento Central (System Prompt)
                  </CardTitle>
                  <CardDescription>
                    Define como o agente se comporta em todas as situações
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {agente.prompt_base ? (
                    <div className="bg-muted rounded-lg p-4 max-h-[300px] overflow-y-auto">
                      <pre className="text-sm whitespace-pre-wrap font-mono">
                        {agente.prompt_base}
                      </pre>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 border rounded-lg border-dashed bg-muted/20">
                      <MessageSquare className="h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground text-center max-w-md">
                        System prompt não definido. Este é o elemento mais importante para definir a personalidade e comportamento do agente.
                      </p>
                      {isAdmin && (
                        <Button variant="outline" size="sm" className="mt-3" onClick={() => setDialogOpen(true)}>
                          Definir prompt
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5" />
                    4. Regras e Restrições
                  </CardTitle>
                  <CardDescription>
                    O que o agente nunca deve fazer e limites rígidos
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {agente.regras ? (
                    <div className="bg-muted rounded-lg p-4 max-h-[300px] overflow-y-auto">
                      <pre className="text-sm whitespace-pre-wrap">
                        {agente.regras}
                      </pre>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 border rounded-lg border-dashed bg-muted/20">
                      <ShieldAlert className="h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground text-center max-w-md">
                        Nenhuma regra ou restrição definida. Opcional, mas útil para evitar comportamentos indesejados.
                      </p>
                      {isAdmin && (
                        <Button variant="outline" size="sm" className="mt-3" onClick={() => setDialogOpen(true)}>
                          Adicionar regras
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Initial Greeting */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Mensagem Inicial
                </CardTitle>
                <CardDescription>
                  Mensagem enviada automaticamente quando uma nova conversa começa
                </CardDescription>
              </CardHeader>
              <CardContent>
                {agente.initial_greeting ? (
                  <div className="bg-muted rounded-lg p-4 max-h-[200px] overflow-y-auto">
                    <p className="text-sm whitespace-pre-wrap">
                      {agente.initial_greeting}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground py-2">
                    <Info className="h-4 w-4" />
                    <p className="text-sm italic">A utilizar mensagem padrão da plataforma.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="test" className="mt-6">
              <AgentTestChat 
                agentId={agente.id} 
                agentName={agente.nome}
                hasKnowledge={hasKnowledge}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {isAdmin && (
        <AgenteFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          agente={agente}
          onSubmit={handleSubmit}
          isLoading={updateMutation.isPending}
        />
      )}
      </PageContainer>
    </DashboardLayout>
  );
}
