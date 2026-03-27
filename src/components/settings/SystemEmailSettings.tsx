import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, AlertCircle, Info } from 'lucide-react';
import { SettingKey, SETTING_KEYS } from '@/hooks/useSettings';

interface SystemEmailSettingsProps {
  settings: Record<string, any>;
  onSettingChange: (key: SettingKey, value: any) => void;
  isLoading?: boolean;
}

export function SystemEmailSettings({ settings, onSettingChange, isLoading }: SystemEmailSettingsProps) {
  return (
    <div className="space-y-6">
      {/* Sender Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Configuração do Remetente
          </CardTitle>
          <CardDescription>
            Defina o remetente dos emails de sistema enviados pela plataforma
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sender-name">Nome do Remetente</Label>
              <Input
                id="sender-name"
                placeholder="AI Call Platform"
                value={settings[SETTING_KEYS.EMAIL_SENDER_NAME] || ''}
                onChange={(e) => onSettingChange(SETTING_KEYS.EMAIL_SENDER_NAME, e.target.value || null)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sender-email">Email do Remetente</Label>
              <Input
                id="sender-email"
                type="email"
                placeholder="no-reply@platform.com"
                value={settings[SETTING_KEYS.EMAIL_SENDER_ADDRESS] || ''}
                onChange={(e) => onSettingChange(SETTING_KEYS.EMAIL_SENDER_ADDRESS, e.target.value || null)}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Utilize um domínio verificado no Resend
              </p>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="admin-email">Email do Administrador (Alertas)</Label>
            <Input
              id="admin-email"
              type="email"
              placeholder="admin@empresa.com"
              value={settings[SETTING_KEYS.ADMIN_NOTIFICATION_EMAIL] || ''}
              onChange={(e) => onSettingChange(SETTING_KEYS.ADMIN_NOTIFICATION_EMAIL, e.target.value || null)}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Este email recebe todos os alertas de créditos (70%, 85%, 100%)
            </p>
          </div>

          {!settings[SETTING_KEYS.ADMIN_NOTIFICATION_EMAIL] && (
            <Alert variant="default" className="bg-yellow-500/10 border-yellow-500/30">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-700 dark:text-yellow-200">
                Configure um email de administrador para receber alertas de utilização de créditos.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Branding Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Branding dos Emails</CardTitle>
          <CardDescription>
            Personalize a aparência dos emails enviados pelo sistema
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="logo-url">URL do Logo</Label>
            <Input
              id="logo-url"
              type="url"
              placeholder="https://exemplo.com/logo.png"
              value={settings[SETTING_KEYS.PLATFORM_LOGO_URL] || ''}
              onChange={(e) => onSettingChange(SETTING_KEYS.PLATFORM_LOGO_URL, e.target.value || null)}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Imagem PNG ou JPG com altura máxima de 60px. Deixe vazio para não incluir logo.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="signature">Assinatura</Label>
            <Input
              id="signature"
              placeholder="— Equipa AI Call Platform"
              value={settings[SETTING_KEYS.PLATFORM_SIGNATURE] || ''}
              onChange={(e) => onSettingChange(SETTING_KEYS.PLATFORM_SIGNATURE, e.target.value || null)}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="footer-text">Texto do Rodapé</Label>
            <Textarea
              id="footer-text"
              placeholder="Este é um email automático. Por favor não responda."
              value={settings[SETTING_KEYS.PLATFORM_FOOTER_TEXT] || ''}
              onChange={(e) => onSettingChange(SETTING_KEYS.PLATFORM_FOOTER_TEXT, e.target.value || null)}
              disabled={isLoading}
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              Texto legal ou informativo que aparece no rodapé de todos os emails
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Info Box */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Estas mensagens são enviadas automaticamente pelo sistema.
          Alterações aplicam-se apenas a envios futuros.
        </AlertDescription>
      </Alert>
    </div>
  );
}
