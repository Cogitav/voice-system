import { Layers, ShieldCheck, Building2, Phone, Globe } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function SystemBehaviorSettings() {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-muted">
            <Layers className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">Como funcionam as configurações</CardTitle>
            <CardDescription className="mt-1">
              Entenda como o sistema aplica as definições em diferentes níveis.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Hierarchy Explanation */}
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            As configurações são aplicadas em camadas. Uma definição mais específica substitui sempre uma mais geral:
          </p>
          
          <div className="grid gap-3">
            <div className="flex items-start gap-3 p-4 rounded-lg border-2 border-primary/50 bg-primary/5">
              <div className="p-1.5 rounded bg-primary/20">
                <Phone className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-sm">1. Por Chamada</h4>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">Prioridade máxima</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Definições escolhidas diretamente na página de detalhe de uma chamada específica.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  <strong>Exemplo:</strong> Decidir manualmente enviar um email de follow-up para uma chamada em particular.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/30">
              <div className="p-1.5 rounded bg-muted">
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-sm">2. Por Empresa</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Configurações específicas de cada empresa cliente. Substituem os valores globais.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  <strong>Exemplo:</strong> Uma empresa pode preferir tom formal, outra pode preferir amigável.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-lg border border-dashed bg-muted/10">
              <div className="p-1.5 rounded bg-muted/50">
                <Globe className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-sm">3. Global (esta página)</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Valores padrão da plataforma. Aplicados quando não há configurações mais específicas.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  <strong>Exemplo:</strong> Todas as novas empresas herdam automaticamente estas definições.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Safety Notice */}
        <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/50">
          <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            <strong>Seguro por defeito:</strong> Nenhuma ação automática é executada sem configuração explícita do administrador. 
            Todos os envios de emails requerem ativação manual.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}