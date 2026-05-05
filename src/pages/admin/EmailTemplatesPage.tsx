import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { Plus, Mail } from 'lucide-react';
import {
  useEmailTemplates,
  EmailTemplate,
  EmailTemplateFormData,
} from '@/hooks/useEmailTemplates';
import { EmailTemplatesTable } from '@/components/email-templates/EmailTemplatesTable';
import { EmailTemplateFormDialog } from '@/components/email-templates/EmailTemplateFormDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEmpresas } from '@/hooks/useEmpresas';

export default function EmailTemplatesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [duplicateDraft, setDuplicateDraft] = useState<Partial<EmailTemplateFormData> | null>(null);
  const [empresaFilter, setEmpresaFilter] = useState<string>('all');

  const { data: templates = [], isLoading } = useEmailTemplates();
  const { data: empresas = [] } = useEmpresas();

  const filteredTemplates =
    empresaFilter === 'all'
      ? templates
      : templates.filter((t) => t.empresa_id === empresaFilter);

  const handleEdit = (template: EmailTemplate) => {
    setDuplicateDraft(null);
    setEditingTemplate(template);
    setDialogOpen(true);
  };

  const handleDuplicate = (template: EmailTemplate) => {
    setEditingTemplate(null);
    setDuplicateDraft({
      empresa_id: template.empresa_id,
      intent: '',
      subject: template.subject,
      body: template.body,
      is_active: false,
      recipient_type: template.recipient_type,
    });
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingTemplate(null);
      setDuplicateDraft(null);
    }
  };

  return (
    <DashboardLayout>
      <PageLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Templates de Email</h1>
              <p className="text-muted-foreground">
                Os templates são usados para comunicação com clientes. Podem ser
                enviados manualmente ou utilizados em automações.
              </p>
            </div>
          </div>
          <Button className="w-full sm:w-auto" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Template
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filtrar por empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as empresas</SelectItem>
              {empresas.map((empresa) => (
                <SelectItem key={empresa.id} value={empresa.id}>
                  {empresa.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <EmailTemplatesTable
          templates={filteredTemplates}
          isLoading={isLoading}
          onEdit={handleEdit}
          onDuplicate={handleDuplicate}
        />

        {/* Dialog */}
        <EmailTemplateFormDialog
          open={dialogOpen}
          onOpenChange={handleDialogClose}
          template={editingTemplate}
          initialData={duplicateDraft}
          title={duplicateDraft ? 'Duplicar Template de Email' : undefined}
        />
      </div>
      </PageLayout>
    </DashboardLayout>
  );
}
