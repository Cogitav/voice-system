import { useState, useEffect, useMemo } from 'react';
import { Mail, Send, AlertCircle, Eye, Building2, User, Settings } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useEmailTemplatesByEmpresa, EmailTemplate } from '@/hooks/useEmailTemplates';
import { useSendFollowUpEmail } from '@/hooks/useSendFollowUpEmail';
import { useGlobalSettings, SETTING_KEYS } from '@/hooks/useSettings';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

interface EmailFollowUpSectionProps {
  chamadaId: string;
  empresaId: string;
  intent: string | null;
  status: string;
  clienteTelefone: string;
  clienteNome?: string;
  empresaNome: string;
  resumo: string;
}

// Intent-based defaults
const getIntentDefaults = (intent: string | null) => {
  switch (intent?.toLowerCase()) {
    case 'agendamento':
      return { sendToClient: true, sendToCompany: false };
    case 'reclamação':
    case 'reclamacao':
      return { sendToClient: false, sendToCompany: true };
    default:
      return { sendToClient: false, sendToCompany: false };
  }
};

export function EmailFollowUpSection({
  chamadaId,
  empresaId,
  intent,
  status,
  clienteTelefone,
  clienteNome,
  empresaNome,
  resumo,
}: EmailFollowUpSectionProps) {
  const { data: templates = [], isLoading: templatesLoading } = useEmailTemplatesByEmpresa(empresaId);
  const { data: globalSettings } = useGlobalSettings();
  const sendEmail = useSendFollowUpEmail();

  // Get settings values
  const autoEmailEnabled = globalSettings?.settings?.[SETTING_KEYS.AUTO_EMAIL_ENABLED] === true;
  const notifyCompanyEnabled = globalSettings?.settings?.[SETTING_KEYS.NOTIFY_COMPANY_EMAIL] === true;
  const defaultCompanyEmail = globalSettings?.settings?.[SETTING_KEYS.DEFAULT_COMPANY_EMAIL] || '';
  const followupBehavior = globalSettings?.settings?.[SETTING_KEYS.DEFAULT_FOLLOWUP_BEHAVIOR] || 'manual';

  const defaults = getIntentDefaults(intent);
  
  // Apply settings to defaults - if auto email is disabled globally, override to false
  const initialSendToClient = autoEmailEnabled ? defaults.sendToClient : false;
  const initialSendToCompany = notifyCompanyEnabled ? defaults.sendToCompany : false;
  
  const [sendToClient, setSendToClient] = useState(initialSendToClient);
  const [sendToCompany, setSendToCompany] = useState(initialSendToCompany);
  const [clientTemplateId, setClientTemplateId] = useState<string>('');
  const [companyTemplateId, setCompanyTemplateId] = useState<string>('');
  const [clientEmail, setClientEmail] = useState('');
  const [companyEmail, setCompanyEmail] = useState(defaultCompanyEmail);
  const [emailsSent, setEmailsSent] = useState(false);

  // Update company email when settings load
  useEffect(() => {
    if (defaultCompanyEmail && !companyEmail) {
      setCompanyEmail(defaultCompanyEmail);
    }
  }, [defaultCompanyEmail]);

  // Filter templates by recipient type and intent
  const clientTemplates = useMemo(() => 
    templates.filter(t => t.recipient_type === 'client' && t.is_active),
    [templates]
  );
  
  const companyTemplates = useMemo(() => 
    templates.filter(t => t.recipient_type === 'company' && t.is_active),
    [templates]
  );

  // Auto-select template matching intent
  useEffect(() => {
    if (intent && clientTemplates.length > 0 && !clientTemplateId) {
      const match = clientTemplates.find(t => 
        t.intent.toLowerCase() === intent.toLowerCase()
      );
      if (match) setClientTemplateId(match.id);
    }
  }, [intent, clientTemplates, clientTemplateId]);

  useEffect(() => {
    if (intent && companyTemplates.length > 0 && !companyTemplateId) {
      const match = companyTemplates.find(t => 
        t.intent.toLowerCase() === intent.toLowerCase()
      );
      if (match) setCompanyTemplateId(match.id);
    }
  }, [intent, companyTemplates, companyTemplateId]);

  const selectedClientTemplate = clientTemplates.find(t => t.id === clientTemplateId);
  const selectedCompanyTemplate = companyTemplates.find(t => t.id === companyTemplateId);

  const canSendClientEmail = sendToClient && clientTemplateId && clientEmail;
  const canSendCompanyEmail = sendToCompany && companyTemplateId && companyEmail;
  const canSendAny = canSendClientEmail || canSendCompanyEmail;
  const isCallCompleted = status === 'concluida';

  const replaceVariables = (text: string) => {
    return text
      .replace(/\{\{cliente_nome\}\}/g, clienteNome || 'Cliente')
      .replace(/\{\{empresa_nome\}\}/g, empresaNome)
      .replace(/\{\{resumo_chamada\}\}/g, resumo)
      .replace(/\{\{data_agendamento\}\}/g, '-')
      .replace(/\{\{hora_agendamento\}\}/g, '-');
  };

  const handleSendEmails = async () => {
    if (!canSendAny) return;

    try {
      const promises: Promise<any>[] = [];

      if (canSendClientEmail) {
        promises.push(
          sendEmail.mutateAsync({
            chamadaId,
            recipientEmail: clientEmail,
            clienteNome: clienteNome,
          })
        );
      }

      if (canSendCompanyEmail) {
        promises.push(
          sendEmail.mutateAsync({
            chamadaId,
            recipientEmail: companyEmail,
            clienteNome: clienteNome,
          })
        );
      }

      await Promise.all(promises);
      setEmailsSent(true);
      toast.success('Email(s) enviado(s) com sucesso!');
    } catch (error) {
      toast.error('Erro ao enviar email(s). Verifique os logs.');
    }
  };

  const EmailPreviewDialog = ({ template, title }: { template: EmailTemplate | undefined; title: string }) => {
    if (!template) return null;
    
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1">
            <Eye className="h-3 w-3" />
            Pré-visualizar
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Pré-visualização do email com variáveis substituídas</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Assunto</Label>
              <p className="font-medium">{replaceVariables(template.subject)}</p>
            </div>
            <Separator />
            <div>
              <Label className="text-xs text-muted-foreground">Corpo</Label>
              <ScrollArea className="h-[200px] mt-2 rounded border p-3 bg-muted/50">
                <p className="whitespace-pre-wrap text-sm">{replaceVariables(template.body)}</p>
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Follow-up
        </CardTitle>
        <CardDescription>
          Configure e envie emails de seguimento. Esta funcionalidade é opcional e pode coexistir com sistemas externos (CRM, etc.).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Settings Info Alert */}
        {!autoEmailEnabled && followupBehavior === 'manual' && (
          <Alert className="border-blue-200 bg-blue-50">
            <Settings className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              Emails automáticos estão <strong>desativados</strong> nas{' '}
              <Link to="/admin/configuracoes" className="underline font-medium">
                configurações globais
              </Link>
              . Pode ainda enviar emails manualmente abaixo.
            </AlertDescription>
          </Alert>
        )}

        {!isCallCompleted && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Os emails só podem ser enviados quando a chamada estiver concluída.
            </AlertDescription>
          </Alert>
        )}

        {emailsSent && (
          <Alert className="border-green-200 bg-green-50 text-green-800">
            <Mail className="h-4 w-4" />
            <AlertDescription>
              Email(s) já enviado(s) para esta chamada.
            </AlertDescription>
          </Alert>
        )}

        {/* Client Email Section */}
        <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="send-client" className="font-medium">Enviar email ao cliente</Label>
            </div>
            <Switch
              id="send-client"
              checked={sendToClient}
              onCheckedChange={setSendToClient}
              disabled={emailsSent}
            />
          </div>

          {sendToClient && (
            <div className="space-y-3 pl-6">
              <div className="space-y-1.5">
                <Label className="text-sm">Email do cliente</Label>
                <Input
                  type="email"
                  placeholder="cliente@email.com"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  disabled={emailsSent}
                />
              </div>
              
              <div className="space-y-1.5">
                <Label className="text-sm">Template</Label>
                <div className="flex gap-2">
                  <Select
                    value={clientTemplateId}
                    onValueChange={setClientTemplateId}
                    disabled={emailsSent || templatesLoading}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecionar template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {clientTemplates.length === 0 ? (
                        <SelectItem value="none" disabled>Nenhum template disponível</SelectItem>
                      ) : (
                        clientTemplates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.subject} ({t.intent})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <EmailPreviewDialog template={selectedClientTemplate} title="Email para Cliente" />
                </div>
              </div>

              {sendToClient && !clientTemplateId && (
                <p className="text-xs text-amber-600">⚠️ Selecione um template para enviar o email.</p>
              )}
              {sendToClient && clientTemplateId && !clientEmail && (
                <p className="text-xs text-amber-600">⚠️ Introduza o email do cliente.</p>
              )}
            </div>
          )}
        </div>

        {/* Company Email Section */}
        <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="send-company" className="font-medium">Notificar empresa</Label>
            </div>
            <Switch
              id="send-company"
              checked={sendToCompany}
              onCheckedChange={setSendToCompany}
              disabled={emailsSent}
            />
          </div>

          {sendToCompany && (
            <div className="space-y-3 pl-6">
              <div className="space-y-1.5">
                <Label className="text-sm">Email interno</Label>
                <Input
                  type="email"
                  placeholder="equipa@empresa.com"
                  value={companyEmail}
                  onChange={(e) => setCompanyEmail(e.target.value)}
                  disabled={emailsSent}
                />
              </div>
              
              <div className="space-y-1.5">
                <Label className="text-sm">Template</Label>
                <div className="flex gap-2">
                  <Select
                    value={companyTemplateId}
                    onValueChange={setCompanyTemplateId}
                    disabled={emailsSent || templatesLoading}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecionar template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {companyTemplates.length === 0 ? (
                        <SelectItem value="none" disabled>Nenhum template disponível</SelectItem>
                      ) : (
                        companyTemplates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.subject} ({t.intent})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <EmailPreviewDialog template={selectedCompanyTemplate} title="Email para Empresa" />
                </div>
              </div>

              {sendToCompany && !companyTemplateId && (
                <p className="text-xs text-amber-600">⚠️ Selecione um template para enviar o email.</p>
              )}
              {sendToCompany && companyTemplateId && !companyEmail && (
                <p className="text-xs text-amber-600">⚠️ Introduza o email da empresa.</p>
              )}
            </div>
          )}
        </div>

        {/* Send Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSendEmails}
            disabled={!canSendAny || !isCallCompleted || emailsSent || sendEmail.isPending}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {sendEmail.isPending ? 'A enviar...' : 'Enviar Email(s)'}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Os emails enviados são registados em log para auditoria.
        </p>
      </CardContent>
    </Card>
  );
}
