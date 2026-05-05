import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEmpresas } from '@/hooks/useEmpresas';
import {
  useCreateEmailTemplate,
  useUpdateEmailTemplate,
  EmailTemplate,
  EmailTemplateFormData,
  INTENT_OPTIONS,
  TEMPLATE_VARIABLES,
} from '@/hooks/useEmailTemplates';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';
import { toast } from 'sonner';

interface EmailTemplateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: EmailTemplate | null;
  initialData?: Partial<EmailTemplateFormData> | null;
  title?: string;
}

export function EmailTemplateFormDialog({
  open,
  onOpenChange,
  template,
  initialData,
  title,
}: EmailTemplateFormDialogProps) {
  const { data: empresas = [] } = useEmpresas();
  const createTemplate = useCreateEmailTemplate();
  const updateTemplate = useUpdateEmailTemplate();

  const [formData, setFormData] = useState<EmailTemplateFormData>({
    empresa_id: '',
    intent: '',
    subject: '',
    body: '',
    is_active: true,
    recipient_type: 'client',
  });

  const isEditing = !!template;

  useEffect(() => {
    if (template) {
      setFormData({
        empresa_id: template.empresa_id,
        intent: template.intent,
        subject: template.subject,
        body: template.body,
        is_active: template.is_active,
        recipient_type: template.recipient_type || 'client',
      });
    } else if (initialData) {
      setFormData({
        empresa_id: initialData.empresa_id ?? '',
        intent: initialData.intent ?? '',
        subject: initialData.subject ?? '',
        body: initialData.body ?? '',
        is_active: initialData.is_active ?? true,
        recipient_type: initialData.recipient_type ?? 'client',
      });
    } else {
      setFormData({
        empresa_id: '',
        intent: '',
        subject: '',
        body: '',
        is_active: true,
        recipient_type: 'client',
      });
    }
  }, [template, initialData, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.intent) {
      toast.error('Selecione uma categoria antes de guardar o template.');
      return;
    }

    try {
      if (isEditing && template) {
        await updateTemplate.mutateAsync({ id: template.id, data: formData });
      } else {
        await createTemplate.mutateAsync(formData);
      }
      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const insertVariable = (variable: string) => {
    setFormData((prev) => ({
      ...prev,
      body: prev.body + variable,
    }));
  };

  const isLoading = createTemplate.isPending || updateTemplate.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {title ?? (isEditing ? 'Editar Template de Email' : 'Novo Template de Email')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="empresa_id">Empresa *</Label>
              <Select
                value={formData.empresa_id}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, empresa_id: value }))
                }
                disabled={isEditing}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((empresa) => (
                    <SelectItem key={empresa.id} value={empresa.id}>
                      {empresa.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="intent">Categoria do Template *</Label>
              <Select
                value={formData.intent}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, intent: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar categoria" />
                </SelectTrigger>
                <SelectContent>
                  {INTENT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipient_type">Destinatário *</Label>
            <Select
              value={formData.recipient_type}
              onValueChange={(value: 'client' | 'company' | 'internal') =>
                setFormData((prev) => ({ ...prev, recipient_type: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar destinatário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="client">Cliente</SelectItem>
                <SelectItem value="company">Empresa (interno)</SelectItem>
                <SelectItem value="internal">Notificação Interna</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Indique se este template é para enviar ao cliente ou para notificações internas da empresa.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Assunto *</Label>
            <Input
              id="subject"
              value={formData.subject}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, subject: e.target.value }))
              }
              placeholder="Ex: Obrigado pelo seu contacto"
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="body">Corpo do Email *</Label>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Info className="h-3 w-3" />
                Clique nas variáveis para inserir
              </div>
            </div>
            
            <div className="flex flex-wrap gap-1 mb-2">
              {TEMPLATE_VARIABLES.map((v) => (
                <Badge
                  key={v.variable}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10 transition-colors"
                  onClick={() => insertVariable(v.variable)}
                  title={v.description}
                >
                  {v.variable}
                </Badge>
              ))}
            </div>
            
            <Textarea
              id="body"
              value={formData.body}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, body: e.target.value }))
              }
              placeholder={`Olá {{cliente_nome}},\n\nObrigado pelo seu contacto com a {{empresa_nome}}.\n\n...`}
              rows={8}
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, is_active: checked }))
              }
            />
            <Label htmlFor="is_active">Template ativo</Label>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'A guardar...' : isEditing ? 'Guardar' : 'Criar Template'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
