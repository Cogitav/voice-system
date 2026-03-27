import { Mail, AlertCircle, Info, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SETTING_KEYS, FOLLOWUP_BEHAVIORS, SettingKey } from '@/hooks/useSettings';
import { cn } from '@/lib/utils';

interface EmailFollowUpSettingsProps {
  settings: Record<string, any>;
  onSettingChange: (key: SettingKey, value: any) => void;
  isLoading?: boolean;
}

export function EmailFollowUpSettings({ 
  settings, 
  onSettingChange,
  isLoading 
}: EmailFollowUpSettingsProps) {
  const autoEmailEnabled = settings[SETTING_KEYS.AUTO_EMAIL_ENABLED] === true;
  const notifyCompanyEmail = settings[SETTING_KEYS.NOTIFY_COMPANY_EMAIL] === true;
  const defaultCompanyEmail = settings[SETTING_KEYS.DEFAULT_COMPANY_EMAIL] || '';
  const followupBehavior = settings[SETTING_KEYS.DEFAULT_FOLLOWUP_BEHAVIOR] || 'manual';

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">Emails de Seguimento</CardTitle>
            <CardDescription className="mt-1">
              Configure se e como o sistema envia emails após chamadas. 
              <span className="font-medium text-foreground"> Este sistema é totalmente opcional.</span>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* CRM Coexistence Notice */}
        <Alert className="bg-muted/50 border-muted-foreground/20">
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Compatível com CRMs externos:</strong> Pode manter estas opções desativadas e continuar a usar o seu CRM ou sistema de emails habitual. 
            Este módulo existe apenas como alternativa integrada para quem preferir.
          </AlertDescription>
        </Alert>

        {/* Main Toggle - Auto Email */}
        <div className="p-4 rounded-lg border-2 border-dashed transition-colors">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <Label htmlFor="auto-email" className="text-base font-medium cursor-pointer">
                Ativar envio de emails pelo sistema
              </Label>
              <p className="text-sm text-muted-foreground">
                Quando ativado, permite que o sistema envie emails de seguimento aos clientes ou notificações internas.
              </p>
              {/* Consequence Helper */}
              <div className={cn(
                "mt-3 p-3 rounded-md text-sm flex items-start gap-2",
                autoEmailEnabled 
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" 
                  : "bg-muted text-muted-foreground"
              )}>
                {autoEmailEnabled ? (
                  <>
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      <strong>Quando ativo:</strong> O sistema pode enviar emails conforme as regras de follow-up configuradas. 
                      Cada email requer ainda que exista um template e endereço de destino válidos.
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      <strong>Atualmente desativado:</strong> Nenhum email será enviado pelo sistema, independentemente das outras configurações.
                    </span>
                  </>
                )}
              </div>
            </div>
            <Switch
              id="auto-email"
              checked={autoEmailEnabled}
              onCheckedChange={(checked) => onSettingChange(SETTING_KEYS.AUTO_EMAIL_ENABLED, checked)}
              disabled={isLoading}
              className="mt-1"
            />
          </div>
        </div>

        {/* Dependent Settings Section */}
        <div className={cn(
          "space-y-4 transition-opacity",
          !autoEmailEnabled && "opacity-50 pointer-events-none"
        )}>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span>Opções de email (requerem ativação acima)</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Company Notification Toggle */}
          <div className="p-4 rounded-lg border bg-muted/30">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 flex-1">
                <Label htmlFor="notify-company" className="font-medium cursor-pointer">
                  Enviar notificação interna à empresa
                </Label>
                <p className="text-sm text-muted-foreground">
                  Após cada chamada relevante, envia um email resumo para a equipa da empresa.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  <strong>Exemplo:</strong> "Nova chamada recebida - Cliente interessado em agendar consulta"
                </p>
              </div>
              <Switch
                id="notify-company"
                checked={notifyCompanyEmail}
                onCheckedChange={(checked) => onSettingChange(SETTING_KEYS.NOTIFY_COMPANY_EMAIL, checked)}
                disabled={isLoading || !autoEmailEnabled}
                className="mt-1"
              />
            </div>
          </div>

          {/* Default Company Email - Only relevant when notify is enabled */}
          <div className={cn(
            "p-4 rounded-lg border transition-opacity",
            notifyCompanyEmail ? "bg-muted/30" : "opacity-50"
          )}>
            <Label htmlFor="company-email" className="font-medium">
              Email de notificação padrão
            </Label>
            <p className="text-sm text-muted-foreground mt-1 mb-3">
              Este email recebe as notificações internas quando a empresa não tem email próprio configurado.
            </p>
            <Input
              id="company-email"
              type="email"
              placeholder="equipa@suaempresa.com"
              value={defaultCompanyEmail}
              onChange={(e) => onSettingChange(SETTING_KEYS.DEFAULT_COMPANY_EMAIL, e.target.value || null)}
              disabled={isLoading || !autoEmailEnabled || !notifyCompanyEmail}
              className="max-w-md"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Cada empresa pode definir o seu próprio email nas definições da empresa.
            </p>
          </div>

          {/* Follow-up Behavior */}
          <div className="p-4 rounded-lg border bg-muted/30">
            <Label htmlFor="followup-behavior" className="font-medium">
              Modo de envio de emails ao cliente
            </Label>
            <p className="text-sm text-muted-foreground mt-1 mb-3">
              Define se os emails de follow-up são enviados automaticamente ou requerem aprovação manual.
            </p>
            <Select
              value={followupBehavior}
              onValueChange={(value) => onSettingChange(SETTING_KEYS.DEFAULT_FOLLOWUP_BEHAVIOR, value)}
              disabled={isLoading || !autoEmailEnabled}
            >
              <SelectTrigger className="max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FOLLOWUP_BEHAVIORS.map((behavior) => (
                  <SelectItem key={behavior.value} value={behavior.value}>
                    {behavior.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-3 p-3 rounded-md bg-background border text-sm">
              <p className="font-medium text-foreground mb-1">
                {FOLLOWUP_BEHAVIORS.find(b => b.value === followupBehavior)?.label}:
              </p>
              <p className="text-muted-foreground">
                {FOLLOWUP_BEHAVIORS.find(b => b.value === followupBehavior)?.description}
              </p>
              {followupBehavior === 'automatic' && (
                <p className="mt-2 text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Emails serão enviados sem confirmação prévia.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Email Sending Checklist */}
        <div className="p-4 rounded-lg border bg-muted/20">
          <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Quando é que um email é realmente enviado?
          </h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className={cn(
                "mt-0.5 h-4 w-4 rounded-full flex items-center justify-center text-xs shrink-0",
                autoEmailEnabled ? "bg-green-500/20 text-green-600" : "bg-muted text-muted-foreground"
              )}>
                {autoEmailEnabled ? "✓" : "1"}
              </span>
              O envio de emails está ativado (toggle acima)
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-4 w-4 rounded-full bg-muted flex items-center justify-center text-xs shrink-0">2</span>
              Existe uma regra de follow-up ativa para a intenção detetada
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-4 w-4 rounded-full bg-muted flex items-center justify-center text-xs shrink-0">3</span>
              Um template de email está selecionado na regra
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-4 w-4 rounded-full bg-muted flex items-center justify-center text-xs shrink-0">4</span>
              O destinatário tem um endereço de email válido
            </li>
          </ul>
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
            Se qualquer uma destas condições falhar, nenhum email é enviado.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}