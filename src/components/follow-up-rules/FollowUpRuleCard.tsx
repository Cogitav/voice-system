import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, Mail, Calendar, FileText, UserCheck, Info } from 'lucide-react';
import { FollowUpRule, useUpdateFollowUpRule, useDeleteFollowUpRule, FOLLOW_UP_INTENT_OPTIONS } from '@/hooks/useFollowUpRules';
import { EmailTemplate } from '@/hooks/useEmailTemplates';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface FollowUpRuleCardProps {
  rule: FollowUpRule;
  clientTemplates: EmailTemplate[];
  companyTemplates: EmailTemplate[];
}

export function FollowUpRuleCard({ rule, clientTemplates, companyTemplates }: FollowUpRuleCardProps) {
  const updateRule = useUpdateFollowUpRule();
  const deleteRule = useDeleteFollowUpRule();
  
  const [localRule, setLocalRule] = useState(rule);
  
  const intentLabel = FOLLOW_UP_INTENT_OPTIONS.find(o => o.value === rule.intent)?.label || rule.intent;

  const handleToggle = (field: keyof FollowUpRule, value: boolean) => {
    setLocalRule(prev => ({ ...prev, [field]: value }));
    updateRule.mutate({ id: rule.id, data: { [field]: value } });
  };

  const handleSelectChange = (field: 'client_template_id' | 'company_template_id', value: string) => {
    const newValue = value === 'none' ? null : value;
    setLocalRule(prev => ({ ...prev, [field]: newValue }));
    updateRule.mutate({ id: rule.id, data: { [field]: newValue } });
  };

  const handleEmailChange = (value: string) => {
    setLocalRule(prev => ({ ...prev, company_notification_email: value }));
  };

  const handleEmailBlur = () => {
    if (localRule.company_notification_email !== rule.company_notification_email) {
      updateRule.mutate({ 
        id: rule.id, 
        data: { company_notification_email: localRule.company_notification_email } 
      });
    }
  };

  const handleDelete = () => {
    deleteRule.mutate(rule.id);
  };

  const canSendClientEmail = localRule.send_email_client && localRule.client_template_id;
  const canSendCompanyEmail = localRule.send_email_company && localRule.company_template_id && localRule.company_notification_email;

  return (
    <Card className="relative">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{intentLabel}</CardTitle>
            <Badge variant={localRule.is_active ? 'default' : 'secondary'}>
              {localRule.is_active ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor={`active-${rule.id}`} className="text-sm text-muted-foreground">
                Ativo
              </Label>
              <Switch
                id={`active-${rule.id}`}
                checked={localRule.is_active}
                onCheckedChange={(checked) => handleToggle('is_active', checked)}
              />
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminar Regra</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja eliminar esta regra de follow-up para "{intentLabel}"?
                    Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        <CardDescription className="text-xs">
          Empresa: {rule.empresa_nome}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Actions Section */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Info className="h-4 w-4" />
            Ações (todas opcionais)
          </h4>
          
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Register Only */}
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor={`register-${rule.id}`} className="text-sm cursor-pointer">
                  Apenas registar chamada
                </Label>
              </div>
              <Switch
                id={`register-${rule.id}`}
                checked={localRule.register_only}
                onCheckedChange={(checked) => handleToggle('register_only', checked)}
              />
            </div>

            {/* Mark for Manual Follow-up */}
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor={`manual-${rule.id}`} className="text-sm cursor-pointer">
                  Marcar para follow-up manual
                </Label>
              </div>
              <Switch
                id={`manual-${rule.id}`}
                checked={localRule.mark_manual_followup}
                onCheckedChange={(checked) => handleToggle('mark_manual_followup', checked)}
              />
            </div>

            {/* Create Appointment */}
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor={`appointment-${rule.id}`} className="text-sm cursor-pointer">
                  Criar agendamento
                </Label>
              </div>
              <Switch
                id={`appointment-${rule.id}`}
                checked={localRule.create_appointment}
                onCheckedChange={(checked) => handleToggle('create_appointment', checked)}
              />
            </div>
          </div>
        </div>

        {/* Client Email Section */}
        <div className="space-y-3 p-4 rounded-lg border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor={`email-client-${rule.id}`} className="text-sm font-medium cursor-pointer">
                Enviar email ao cliente
              </Label>
            </div>
            <Switch
              id={`email-client-${rule.id}`}
              checked={localRule.send_email_client}
              onCheckedChange={(checked) => handleToggle('send_email_client', checked)}
            />
          </div>
          
          {localRule.send_email_client && (
            <div className="space-y-2 pt-2">
              <Label className="text-xs text-muted-foreground">Template para cliente</Label>
              <Select
                value={localRule.client_template_id || 'none'}
                onValueChange={(value) => handleSelectChange('client_template_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar template..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum (email não será enviado)</SelectItem>
                  {clientTemplates.filter(t => t.is_active).map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.subject} ({template.intent})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!canSendClientEmail && localRule.send_email_client && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ Email não será enviado sem template selecionado
                </p>
              )}
            </div>
          )}
        </div>

        {/* Company Email Section */}
        <div className="space-y-3 p-4 rounded-lg border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor={`email-company-${rule.id}`} className="text-sm font-medium cursor-pointer">
                Enviar email à empresa
              </Label>
            </div>
            <Switch
              id={`email-company-${rule.id}`}
              checked={localRule.send_email_company}
              onCheckedChange={(checked) => handleToggle('send_email_company', checked)}
            />
          </div>
          
          {localRule.send_email_company && (
            <div className="space-y-3 pt-2">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Email de notificação da empresa</Label>
                <Input
                  type="email"
                  placeholder="empresa@exemplo.com"
                  value={localRule.company_notification_email || ''}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  onBlur={handleEmailBlur}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Template para empresa</Label>
                <Select
                  value={localRule.company_template_id || 'none'}
                  onValueChange={(value) => handleSelectChange('company_template_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar template..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum (email não será enviado)</SelectItem>
                    {companyTemplates.filter(t => t.is_active).map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.subject} ({template.intent})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!canSendCompanyEmail && localRule.send_email_company && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ Email não será enviado sem template e email configurados
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
