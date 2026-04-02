import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, Mail, Calendar, FileText, UserCheck } from 'lucide-react';
import {
  FollowUpRule,
  FollowUpRuleFormData,
  useUpdateFollowUpRule,
  FOLLOW_UP_INTENT_OPTIONS,
} from '@/hooks/useFollowUpRules';
import { useEmailTemplates, EmailTemplate } from '@/hooks/useEmailTemplates';

interface FollowUpRuleEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: FollowUpRule | null;
}

export function FollowUpRuleEditDialog({
  open,
  onOpenChange,
  rule,
}: FollowUpRuleEditDialogProps) {
  const { data: templates = [] } = useEmailTemplates();
  const updateRule = useUpdateFollowUpRule();

  const [formData, setFormData] = useState<Partial<FollowUpRuleFormData>>({});

  useEffect(() => {
    if (rule) {
      setFormData({
        register_only: rule.register_only,
        mark_manual_followup: rule.mark_manual_followup,
        create_appointment: rule.create_appointment,
        send_email_client: rule.send_email_client,
        send_email_company: rule.send_email_company,
        client_template_id: rule.client_template_id,
        company_template_id: rule.company_template_id,
        company_notification_email: rule.company_notification_email,
        is_active: rule.is_active,
      });
    }
  }, [rule]);

  if (!rule) return null;

  const clientTemplates = templates.filter(
    (t) => t.empresa_id === rule.empresa_id && t.recipient_type === 'client'
  );
  const companyTemplates = templates.filter(
    (t) => t.empresa_id === rule.empresa_id && t.recipient_type === 'company'
  );

  const intentLabel = FOLLOW_UP_INTENT_OPTIONS.find(
    (o) => o.value === rule.intent
  )?.label || rule.intent;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateRule.mutate(
      { id: rule.id, data: formData },
      {
        onSuccess: () => onOpenChange(false),
      }
    );
  };

  const handleToggle = (field: keyof FollowUpRuleFormData, value: boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Regra de Follow-Up</DialogTitle>
          <DialogDescription>
            {rule.empresa_nome} • {intentLabel}
          </DialogDescription>
        </DialogHeader>

        <Alert className="bg-muted/50">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Configure as ações que serão executadas quando uma chamada com esta
            intenção for concluída. Todas as ações são opcionais.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Actions Grid */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground border-b pb-2">
              Ações Automáticas
            </h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm cursor-pointer">Apenas registar</Label>
                </div>
                <Switch
                  checked={formData.register_only ?? false}
                  onCheckedChange={(checked) => handleToggle('register_only', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm cursor-pointer">Follow-up manual</Label>
                </div>
                <Switch
                  checked={formData.mark_manual_followup ?? false}
                  onCheckedChange={(checked) => handleToggle('mark_manual_followup', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm cursor-pointer">Criar agendamento</Label>
                </div>
                <Switch
                  checked={formData.create_appointment ?? false}
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
                <Label className="text-sm font-medium">Enviar email ao cliente</Label>
              </div>
              <Switch
                checked={formData.send_email_client ?? false}
                onCheckedChange={(checked) => handleToggle('send_email_client', checked)}
              />
            </div>

            {formData.send_email_client && (
              <div className="space-y-2 pt-2">
                <Label className="text-xs text-muted-foreground">Template</Label>
                <Select
                  value={formData.client_template_id || 'none'}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      client_template_id: value === 'none' ? null : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar template..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {clientTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.subject}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.send_email_client && !formData.client_template_id && (
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
                <Label className="text-sm font-medium">Enviar email à empresa</Label>
              </div>
              <Switch
                checked={formData.send_email_company ?? false}
                onCheckedChange={(checked) => handleToggle('send_email_company', checked)}
              />
            </div>

            {formData.send_email_company && (
              <div className="space-y-3 pt-2">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Email destino</Label>
                  <Input
                    type="email"
                    placeholder="empresa@exemplo.com"
                    value={formData.company_notification_email || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        company_notification_email: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Template</Label>
                  <Select
                    value={formData.company_template_id || 'none'}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        company_template_id: value === 'none' ? null : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar template..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {companyTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.subject}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {formData.send_email_company &&
                  (!formData.company_template_id || !formData.company_notification_email) && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      ⚠️ Email não será enviado sem template e email configurados
                    </p>
                  )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateRule.isPending}>
              {updateRule.isPending ? 'A guardar...' : 'Guardar Alterações'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
