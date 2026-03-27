import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { 
  Mail, 
  Edit2, 
  Eye, 
  Save, 
  Loader2, 
  AlertTriangle, 
  CheckCircle2,
  Code,
  FileText
} from 'lucide-react';
import { 
  useSystemEmailTemplates, 
  useUpdateSystemEmailTemplate,
  replaceTemplateVariables,
  getTemplatePreviewData,
  SystemEmailTemplate 
} from '@/hooks/useSystemEmailTemplates';
import { SETTING_KEYS } from '@/hooks/useSettings';

interface SystemEmailTemplateEditorProps {
  settings: Record<string, any>;
}

export function SystemEmailTemplateEditor({ settings }: SystemEmailTemplateEditorProps) {
  const { data: templates, isLoading } = useSystemEmailTemplates();
  const updateTemplate = useUpdateSystemEmailTemplate();
  
  const [editingTemplate, setEditingTemplate] = useState<SystemEmailTemplate | null>(null);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBodyHtml, setEditedBodyHtml] = useState('');
  const [editedBodyText, setEditedBodyText] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<SystemEmailTemplate | null>(null);

  useEffect(() => {
    if (editingTemplate) {
      setEditedSubject(editingTemplate.subject);
      setEditedBodyHtml(editingTemplate.body_html);
      setEditedBodyText(editingTemplate.body_text);
    }
  }, [editingTemplate]);

  const handleSave = async () => {
    if (!editingTemplate) return;
    
    await updateTemplate.mutateAsync({
      id: editingTemplate.id,
      updates: {
        subject: editedSubject,
        body_html: editedBodyHtml,
        body_text: editedBodyText,
      },
    });
    
    setEditingTemplate(null);
  };

  const handleToggleActive = async (template: SystemEmailTemplate) => {
    await updateTemplate.mutateAsync({
      id: template.id,
      updates: { is_active: !template.is_active },
    });
  };

  const getPreviewHtml = (template: SystemEmailTemplate) => {
    const previewData = {
      ...getTemplatePreviewData(),
      platform_logo_url: settings[SETTING_KEYS.PLATFORM_LOGO_URL] || '',
      platform_signature: settings[SETTING_KEYS.PLATFORM_SIGNATURE] || '— Equipa AI Call Platform',
      platform_footer_text: settings[SETTING_KEYS.PLATFORM_FOOTER_TEXT] || 'Este é um email automático.',
    };
    
    return replaceTemplateVariables(template.body_html, previewData);
  };

  const getAlertTypeColor = (key: string) => {
    if (key === 'credits_70') return 'bg-blue-500/10 text-blue-700 border-blue-500/30';
    if (key === 'credits_85') return 'bg-amber-500/10 text-amber-700 border-amber-500/30';
    if (key === 'credits_100') return 'bg-red-500/10 text-red-700 border-red-500/30';
    return '';
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Templates de Email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Templates de Alertas de Créditos
          </CardTitle>
          <CardDescription>
            Edite o conteúdo dos emails de alerta enviados automaticamente pelo sistema
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {templates?.map((template) => (
            <div
              key={template.id}
              className={`p-4 rounded-lg border ${getAlertTypeColor(template.template_key)}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium">{template.name}</h4>
                    {template.is_active ? (
                      <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/30 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500/30 text-xs">
                        Inativo
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{template.description}</p>
                  <p className="text-sm font-mono bg-background/50 px-2 py-1 rounded truncate">
                    {template.subject}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPreviewTemplate(template);
                      setPreviewOpen(true);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Preview
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingTemplate(template)}
                  >
                    <Edit2 className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                  <Switch
                    checked={template.is_active}
                    onCheckedChange={() => handleToggleActive(template)}
                    disabled={updateTemplate.isPending}
                  />
                </div>
              </div>
            </div>
          ))}

          {/* Variables Reference */}
          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Code className="h-4 w-4" />
              Variáveis disponíveis
            </h4>
            <div className="flex flex-wrap gap-2">
              {['empresa_nome', 'percentagem_utilizacao', 'creditos_usados', 'creditos_limite', 'mes', 'plano_nome'].map((v) => (
                <code key={v} className="text-xs bg-muted px-2 py-1 rounded">
                  {`{{${v}}}`}
                </code>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Template: {editingTemplate?.name}</DialogTitle>
            <DialogDescription>
              Edite o assunto e corpo do email. Use {'{{variavel}}'} para inserir dados dinâmicos.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Assunto</Label>
              <Input
                value={editedSubject}
                onChange={(e) => setEditedSubject(e.target.value)}
                placeholder="Assunto do email"
              />
            </div>
            
            <Tabs defaultValue="html">
              <TabsList>
                <TabsTrigger value="html">HTML</TabsTrigger>
                <TabsTrigger value="text">Texto Simples</TabsTrigger>
              </TabsList>
              <TabsContent value="html" className="space-y-2">
                <Label>Corpo (HTML)</Label>
                <Textarea
                  value={editedBodyHtml}
                  onChange={(e) => setEditedBodyHtml(e.target.value)}
                  placeholder="Corpo do email em HTML"
                  rows={12}
                  className="font-mono text-xs"
                />
              </TabsContent>
              <TabsContent value="text" className="space-y-2">
                <Label>Corpo (Texto)</Label>
                <Textarea
                  value={editedBodyText}
                  onChange={(e) => setEditedBodyText(e.target.value)}
                  placeholder="Corpo do email em texto simples"
                  rows={12}
                  className="font-mono text-xs"
                />
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={updateTemplate.isPending}>
              {updateTemplate.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Preview: {previewTemplate?.name}
            </DialogTitle>
            <DialogDescription>
              Pré-visualização do email com dados de exemplo
            </DialogDescription>
          </DialogHeader>
          
          {previewTemplate && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-sm text-muted-foreground">Assunto:</p>
                <p className="font-medium">
                  {replaceTemplateVariables(previewTemplate.subject, getTemplatePreviewData())}
                </p>
              </div>
              
              <div className="border rounded-lg overflow-hidden">
                <div 
                  className="p-4 bg-white"
                  dangerouslySetInnerHTML={{ __html: getPreviewHtml(previewTemplate) }}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
