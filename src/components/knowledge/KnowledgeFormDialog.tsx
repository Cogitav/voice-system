import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { KnowledgeItem, KnowledgeFormData, KnowledgeType } from '@/hooks/useKnowledgeBase';
import { useEmpresas } from '@/hooks/useEmpresas';
import { useAgentes } from '@/hooks/useAgentes';
import { HelpCircle, FileText, Globe, StickyNote, Info, Upload, X, AlertCircle } from 'lucide-react';

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_FILE_TYPES = ['.pdf', '.docx', '.txt'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

interface KnowledgeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: KnowledgeFormData) => void;
  selectedItem?: KnowledgeItem | null;
  isLoading?: boolean;
}

const typeOptions: { value: KnowledgeType; label: string; icon: React.ElementType; description: string }[] = [
  { value: 'faq', label: 'FAQ', icon: HelpCircle, description: 'Pergunta e resposta frequente' },
  { value: 'document', label: 'Documento', icon: FileText, description: 'Ficheiro PDF, DOCX ou TXT' },
  { value: 'website', label: 'Website', icon: Globe, description: 'URL com informação relevante' },
  { value: 'notes', label: 'Notas', icon: StickyNote, description: 'Texto livre com informação' },
];

export function KnowledgeFormDialog({
  open,
  onOpenChange,
  onSubmit,
  selectedItem,
  isLoading = false,
}: KnowledgeFormDialogProps) {
  const { data: empresas = [] } = useEmpresas();
  const { data: agentes = [] } = useAgentes();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Partial<KnowledgeFormData>>({
    empresa_id: '',
    agent_id: null,
    title: '',
    type: 'notes',
    content: '',
    source_url: '',
    status: 'active',
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedItem) {
      setFormData({
        empresa_id: selectedItem.empresa_id,
        agent_id: selectedItem.agent_id,
        title: selectedItem.title,
        type: selectedItem.type,
        content: selectedItem.content || '',
        source_url: selectedItem.source_url || '',
        status: selectedItem.status,
      });
    } else {
      setFormData({
        empresa_id: empresas[0]?.id || '',
        agent_id: null,
        title: '',
        type: 'notes',
        content: '',
        source_url: '',
        status: 'active',
      });
    }
    // Reset file state when dialog opens/closes
    setSelectedFile(null);
    setFileError(null);
  }, [selectedItem, empresas, open]);

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return 'O ficheiro excede o tamanho máximo permitido (5 MB).';
    }
    
    // Check file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return 'Tipo de ficheiro não suportado. Use PDF, DOCX ou TXT.';
    }
    
    return null;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);
    
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const error = validateFile(file);
    if (error) {
      setFileError(error);
      setSelectedFile(null);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setSelectedFile(file);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredAgentes = agentes.filter(
    (a) => a.empresa_id === formData.empresa_id
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.empresa_id || !formData.title || !formData.type) {
      return;
    }
    onSubmit(formData as KnowledgeFormData);
  };

  const isEdit = !!selectedItem;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar Conhecimento' : 'Adicionar Conhecimento'}
          </DialogTitle>
          <DialogDescription>
            <div className="flex items-start gap-2 mt-2 p-3 bg-muted/50 rounded-lg">
              <Info className="w-4 h-4 mt-0.5 text-primary" />
              <span className="text-sm">
                Esta informação é utilizada para melhorar a precisão e qualidade das respostas dos agentes.
                Este conteúdo não substitui o comportamento base do agente (system prompt).
              </span>
            </div>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section: Basic Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground border-b pb-2">
              Informação Básica
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="empresa_id">
                  Empresa <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.empresa_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, empresa_id: value, agent_id: null })
                  }
                  disabled={isEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map((empresa) => (
                      <SelectItem key={empresa.id} value={empresa.id}>
                        {empresa.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  A empresa a que este conhecimento pertence
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent_id">Agente (opcional)</Label>
                <Select
                  value={formData.agent_id || 'all'}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      agent_id: value === 'all' ? null : value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os agentes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os agentes</SelectItem>
                    {filteredAgentes.map((agente) => (
                      <SelectItem key={agente.id} value={agente.id}>
                        {agente.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Deixe vazio para aplicar a todos os agentes da empresa
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">
                Título <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="Ex: Horário de funcionamento"
                required
              />
              <p className="text-xs text-muted-foreground">
                Um título descritivo para identificar este conhecimento
              </p>
            </div>
          </div>

          {/* Section: Type & Content */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground border-b pb-2">
              Tipo e Conteúdo
            </h3>

            <div className="space-y-2">
              <Label htmlFor="type">
                Tipo <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.type}
                onValueChange={(value: KnowledgeType) =>
                  setFormData({ ...formData, type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" />
                          <span>{option.label}</span>
                          <span className="text-muted-foreground text-xs">
                            - {option.description}
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic content based on type */}
            {formData.type === 'faq' && (
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                <div className="space-y-2">
                  <Label>Pergunta (no título)</Label>
                  <p className="text-xs text-muted-foreground">
                    Use o campo "Título" acima para a pergunta
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="content">
                    Resposta <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="content"
                    value={formData.content}
                    onChange={(e) =>
                      setFormData({ ...formData, content: e.target.value })
                    }
                    placeholder="A resposta à pergunta frequente..."
                    rows={4}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    A resposta que o agente deve dar a esta pergunta
                  </p>
                </div>
              </div>
            )}

            {formData.type === 'website' && (
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                <div className="space-y-2">
                  <Label htmlFor="source_url">
                    URL do Website <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="source_url"
                    type="url"
                    value={formData.source_url}
                    onChange={(e) =>
                      setFormData({ ...formData, source_url: e.target.value })
                    }
                    placeholder="https://exemplo.com/pagina"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    O URL da página com informação relevante
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="content">Notas adicionais (opcional)</Label>
                  <Textarea
                    id="content"
                    value={formData.content}
                    onChange={(e) =>
                      setFormData({ ...formData, content: e.target.value })
                    }
                    placeholder="Notas sobre o conteúdo do website..."
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Informação adicional sobre o que se encontra neste website
                  </p>
                </div>
              </div>
            )}

            {formData.type === 'document' && (
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                <div className="space-y-2">
                  <Label>Upload de Ficheiro</Label>
                  
                  {/* File Error Alert */}
                  {fileError && (
                    <Alert variant="destructive" className="py-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-sm">
                        {fileError}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* File Upload Area */}
                  {!selectedFile ? (
                    <div 
                      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/50 ${fileError ? 'border-destructive/50' : 'border-muted-foreground/25'}`}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm font-medium">
                        Clique para selecionar um ficheiro
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        PDF, DOCX ou TXT • Máximo 5 MB
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={ALLOWED_FILE_TYPES.join(',')}
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-3 bg-muted rounded-lg border">
                      <FileText className="h-8 w-8 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(selectedFile.size)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleRemoveFile}
                        className="shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    O ficheiro será processado e indexado para uso pelo agente
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="content">Conteúdo do Documento (opcional)</Label>
                  <Textarea
                    id="content"
                    value={formData.content}
                    onChange={(e) =>
                      setFormData({ ...formData, content: e.target.value })
                    }
                    placeholder="Cole aqui texto adicional ou deixe vazio para usar apenas o ficheiro..."
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    Texto adicional para complementar o conteúdo do ficheiro
                  </p>
                </div>
              </div>
            )}

            {formData.type === 'notes' && (
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                <div className="space-y-2">
                  <Label htmlFor="content">
                    Conteúdo <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="content"
                    value={formData.content}
                    onChange={(e) =>
                      setFormData({ ...formData, content: e.target.value })
                    }
                    placeholder="Informação relevante para o agente..."
                    rows={6}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Texto livre com informação de negócio, políticas, ou outros dados relevantes
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Section: Status */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground border-b pb-2">
              Estado
            </h3>

            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Apenas conhecimentos ativos serão utilizados pelos agentes
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'A guardar...' : isEdit ? 'Guardar Alterações' : 'Criar Conhecimento'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
