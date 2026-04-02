import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Pencil, Trash2, FileText, HelpCircle, Globe, StickyNote, BookOpen, Info } from 'lucide-react';
import { KnowledgeItem, KnowledgeType } from '@/hooks/useKnowledgeBase';

interface KnowledgeTableProps {
  knowledge: KnowledgeItem[];
  isLoading: boolean;
  readOnly?: boolean;
  onEdit?: (item: KnowledgeItem) => void;
  onDelete?: (id: string) => void;
  onAdd?: () => void;
}

const typeConfig: Record<KnowledgeType, { label: string; icon: React.ElementType; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  faq: { label: 'FAQ', icon: HelpCircle, variant: 'default' },
  document: { label: 'Documento', icon: FileText, variant: 'secondary' },
  website: { label: 'Website', icon: Globe, variant: 'outline' },
  notes: { label: 'Notas', icon: StickyNote, variant: 'default' },
};

export function KnowledgeTable({
  knowledge,
  isLoading,
  readOnly = false,
  onEdit,
  onDelete,
  onAdd,
}: KnowledgeTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (knowledge.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg border-dashed bg-muted/20">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">Sem conhecimento registado</h3>
          <p className="text-sm text-muted-foreground max-w-md mb-4">
            Adicione FAQs, documentos ou notas para enriquecer as respostas dos seus agentes. 
            O conhecimento aqui registado complementa o comportamento base do agente.
          </p>
          {!readOnly && onAdd && (
            <Button onClick={onAdd}>
              Adicionar primeiro conhecimento
            </Button>
          )}
        </div>
        
        <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/50">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertDescription className="text-blue-800 dark:text-blue-200">
            <strong>Nota:</strong> Os agentes funcionam mesmo sem base de conhecimento, utilizando apenas o prompt e contexto configurados. 
            A base de conhecimento é opcional e serve para adicionar informação factual específica.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Título</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Agente</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Criado em</TableHead>
            {!readOnly && <TableHead className="text-right">Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {knowledge.map((item) => {
            const config = typeConfig[item.type];
            const TypeIcon = config.icon;

            return (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.title}</TableCell>
                <TableCell>
                  <Badge variant={config.variant} className="gap-1">
                    <TypeIcon className="w-3 h-3" />
                    {config.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  {item.agente?.nome || (
                    <span className="text-muted-foreground italic">Todos os agentes</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={item.status === 'active' ? 'default' : 'secondary'}>
                    {item.status === 'active' ? 'Ativo' : 'Inativo'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {new Date(item.created_at).toLocaleDateString('pt-PT')}
                </TableCell>
                {!readOnly && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit?.(item)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete?.(item.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
