import { 
  Zap, 
  Phone, 
  MessageSquare, 
  Calendar, 
  BookOpen, 
  Eye, 
  BarChart3, 
  Settings, 
  Clock,
  Package,
  AlertCircle,
  CheckCircle,
  Info
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { useAuth } from '@/contexts/AuthContext';
import { ClientCreditsWidget } from '@/components/credits/ClientCreditsWidget';
import { CreditEventsSummary } from '@/components/credits/CreditEventsSummary';

export default function CreditsUsagePage() {
  const { profile, isAdmin } = useAuth();
  
  return (
    <DashboardLayout>
      <PageContainer>
      <div className="space-y-8 max-w-4xl">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <Zap className="w-8 h-8 text-primary" />
          Créditos & Utilização
        </h1>
        <p className="text-muted-foreground mt-2">
          Compreenda como os créditos funcionam e como a utilização é medida
        </p>
      </div>

      {/* Current Usage Widget for Clients */}
      {!isAdmin && profile?.empresa_id && (
        <div className="grid gap-6 md:grid-cols-2">
          <ClientCreditsWidget />
          <CreditEventsSummary empresaId={profile.empresa_id} />
        </div>
      )}

      {/* Introduction */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5 text-primary" />
            O que são créditos?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            Os créditos são uma forma simples de medir como os serviços de IA da plataforma são utilizados. 
            Cada ação consome uma pequena quantidade de créditos, ajudando-o a compreender e controlar a utilização.
          </p>
          <div className="flex items-start gap-3 p-4 bg-primary/5 rounded-lg border border-primary/10">
            <Zap className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground">Transparência e previsibilidade</p>
              <p className="text-sm text-muted-foreground">
                O sistema de créditos foi desenhado para ser claro e previsível. 
                Pode sempre ver a utilização no seu painel e ajustar conforme necessário.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5 text-primary" />
            O que são créditos?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            Os créditos são uma forma simples de medir como os serviços de IA da plataforma são utilizados. 
            Cada ação consome uma pequena quantidade de créditos, ajudando-o a compreender e controlar a utilização.
          </p>
          <div className="flex items-start gap-3 p-4 bg-primary/5 rounded-lg border border-primary/10">
            <Zap className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground">Transparência e previsibilidade</p>
              <p className="text-sm text-muted-foreground">
                O sistema de créditos foi desenhado para ser claro e previsível. 
                Pode sempre ver a utilização no seu painel e ajustar conforme necessário.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* What uses credits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            O que consome créditos
          </CardTitle>
          <CardDescription>
            Ações que utilizam serviços de IA consomem créditos automaticamente
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <CreditUsageItem 
              icon={Phone}
              title="Chamadas telefónicas automatizadas"
              description="O agente de IA realiza chamadas em nome da sua empresa"
              example="Uma chamada típica de 5 minutos consome uma pequena quantidade de créditos"
            />
            <CreditUsageItem 
              icon={MessageSquare}
              title="Mensagens e conversas com IA"
              description="Interações através de chat ou outros canais com suporte de IA"
              example="Cada resposta gerada pelo assistente consome créditos"
            />
            <CreditUsageItem 
              icon={Calendar}
              title="Agendamentos automáticos"
              description="Quando o agente cria marcações automaticamente durante uma chamada"
              example="A criação automática de um agendamento consome créditos adicionais"
            />
            <CreditUsageItem 
              icon={BookOpen}
              title="Processamento de conhecimento"
              description="Análise de FAQs, documentos ou websites para treinar o agente"
              example="Adicionar um documento à base de conhecimento consome créditos"
            />
          </div>
        </CardContent>
      </Card>

      {/* What does NOT use credits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-500" />
            O que NÃO consome créditos
          </CardTitle>
          <CardDescription>
            Estas ações são gratuitas e ilimitadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            <FreeActionItem icon={Eye} label="Aceder à plataforma" />
            <FreeActionItem icon={BarChart3} label="Ver dashboards e relatórios" />
            <FreeActionItem icon={Settings} label="Configurações de administração" />
            <FreeActionItem icon={Clock} label="Acesso a dados históricos" />
          </div>
        </CardContent>
      </Card>

      {/* Monthly credits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-500" />
            Créditos mensais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Cada plano inclui uma quantidade mensal de créditos que é renovada automaticamente 
            no início de cada ciclo de faturação.
          </p>
          
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
              <div>
                <p className="font-medium text-foreground">Renovação automática</p>
                <p className="text-sm text-muted-foreground">
                  Os créditos são renovados mensalmente com base no plano selecionado
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
              <div>
                <p className="font-medium text-foreground">Créditos não acumulam</p>
                <p className="text-sm text-muted-foreground">
                  Créditos não utilizados no mês não transitam para o mês seguinte
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-emerald-500 mt-2 flex-shrink-0" />
              <div>
                <p className="font-medium text-foreground">Acompanhamento contínuo</p>
                <p className="text-sm text-muted-foreground">
                  A utilização é registada continuamente e pode ser consultada a qualquer momento
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* What happens when credits run out */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            Quando os créditos terminam
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/50">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-blue-800 dark:text-blue-200">
              O serviço continua a funcionar normalmente. Não há interrupções abruptas.
            </AlertDescription>
          </Alert>
          
          <p className="text-muted-foreground">
            Mesmo quando os créditos do mês terminam, a plataforma continua operacional 
            e a utilização é registada normalmente. O administrador pode então:
          </p>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-foreground">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span>Ajustar o plano para incluir mais créditos mensais</span>
            </div>
            <div className="flex items-center gap-2 text-foreground">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span>Adicionar packs de créditos extra</span>
            </div>
            <div className="flex items-center gap-2 text-foreground">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span>Rever a utilização no próximo ciclo de faturação</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credit Packs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-500" />
            Packs de créditos
          </CardTitle>
          <CardDescription>
            Créditos adicionais para períodos de maior utilização
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Os packs de créditos permitem adicionar créditos extra ao seu plano, 
            ideais para picos de utilização ou campanhas específicas.
          </p>
          
          <div className="grid sm:grid-cols-3 gap-4">
            <CreditPackCard 
              name="EXTRA S"
              credits="1.000"
              description="Ideal para ajustes pontuais"
            />
            <CreditPackCard 
              name="EXTRA M"
              credits="3.000"
              description="Para campanhas ou picos de atividade"
              featured
            />
            <CreditPackCard 
              name="EXTRA L"
              credits="5.000"
              description="Máxima flexibilidade operacional"
            />
          </div>
          
          <div className="space-y-3 pt-2">
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-purple-500 mt-2 flex-shrink-0" />
              <p className="text-sm text-muted-foreground">
                Os packs são adicionados ao plano mensal e não expiram imediatamente
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-purple-500 mt-2 flex-shrink-0" />
              <p className="text-sm text-muted-foreground">
                Os packs são geridos exclusivamente pelo administrador
              </p>
            </div>
          </div>
          
          <Alert className="mt-4">
            <Info className="h-4 w-4" />
            <AlertDescription>
              Para adicionar créditos extra, contacte o administrador da plataforma.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Footer note */}
      <div className="text-center text-sm text-muted-foreground pb-8">
        <p>
          Esta página é apenas informativa. Para questões sobre créditos ou faturação, 
          contacte o administrador.
        </p>
      </div>
    </div>
      </PageContainer>
    </DashboardLayout>
  );
}

// Helper Components

function CreditUsageItem({ 
  icon: Icon, 
  title, 
  description, 
  example 
}: { 
  icon: React.ElementType;
  title: string;
  description: string;
  example: string;
}) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
      </div>
      <div className="space-y-1">
        <h4 className="font-medium text-foreground">{title}</h4>
        <p className="text-sm text-muted-foreground">{description}</p>
        <p className="text-xs text-muted-foreground/80 italic">Exemplo: {example}</p>
      </div>
    </div>
  );
}

function FreeActionItem({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
      <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
      <span className="text-sm text-emerald-800 dark:text-emerald-200">{label}</span>
    </div>
  );
}

function CreditPackCard({ 
  name, 
  credits, 
  description, 
  featured = false 
}: { 
  name: string;
  credits: string;
  description: string;
  featured?: boolean;
}) {
  return (
    <div className={`relative p-4 rounded-lg border text-center ${
      featured 
        ? 'border-primary bg-primary/5 ring-1 ring-primary/20' 
        : 'bg-card'
    }`}>
      {featured && (
        <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 text-xs">
          Popular
        </Badge>
      )}
      <h4 className="font-medium text-foreground mt-1">{name}</h4>
      <p className="text-2xl font-bold text-primary mt-2">+{credits}</p>
      <p className="text-xs text-muted-foreground">créditos</p>
      <p className="text-xs text-muted-foreground mt-2">{description}</p>
    </div>
  );
}
