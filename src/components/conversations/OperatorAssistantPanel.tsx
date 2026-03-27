import { useEffect } from 'react';
import { 
  Sparkles, 
  MessageSquare, 
  Target, 
  Lightbulb, 
  ChevronRight, 
  RefreshCw,
  Copy,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useOperatorAssistant } from '@/hooks/useOperatorAssistant';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface OperatorAssistantPanelProps {
  conversationId: string;
  isOpen: boolean;
  onSelectReply: (reply: string) => void;
  onAction?: (action: string) => void;
}

export function OperatorAssistantPanel({ 
  conversationId, 
  isOpen,
  onSelectReply,
  onAction 
}: OperatorAssistantPanelProps) {
  const { suggestions, isLoading, error, fetchSuggestions } = useOperatorAssistant(conversationId);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Fetch suggestions when panel opens
  useEffect(() => {
    if (isOpen && !suggestions && !isLoading) {
      fetchSuggestions();
    }
  }, [isOpen, suggestions, isLoading, fetchSuggestions]);

  const handleCopyReply = (reply: string, index: number) => {
    navigator.clipboard.writeText(reply);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleUseReply = (reply: string) => {
    onSelectReply(reply);
  };

  if (!isOpen) return null;

  return (
    <div className="w-72 xl:w-80 border-l bg-muted/20 flex flex-col h-full flex-shrink-0 min-h-0">
      {/* Header */}
      <div className="p-3 border-b bg-gradient-to-r from-violet-500/10 to-purple-500/10 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-violet-100 dark:bg-violet-900/50 rounded-md">
              <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Assistente IA</h3>
              <p className="text-xs text-muted-foreground">Sugestões internas</p>
            </div>
          </div>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-8 w-8"
            onClick={fetchSuggestions}
            disabled={isLoading}
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-3 min-h-0">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-12" />
            <Skeleton className="h-32" />
            <Skeleton className="h-24" />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground mb-3">{error}</p>
            <Button size="sm" variant="outline" onClick={fetchSuggestions}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Tentar novamente
            </Button>
          </div>
        ) : suggestions ? (
          <div className="space-y-4">
            {/* Summary */}
            <Card className="border-violet-200 dark:border-violet-800/50 bg-violet-50/50 dark:bg-violet-950/20">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs font-medium text-violet-700 dark:text-violet-400 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Resumo
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="text-sm">{suggestions.summary}</p>
              </CardContent>
            </Card>

            {/* Detected Intent */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                <Target className="w-3.5 h-3.5" />
                Intenção Detectada
              </div>
              <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100">
                {suggestions.detectedIntent}
              </Badge>
            </div>

            <Separator />

            {/* Suggested Replies */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-3">
                <Lightbulb className="w-3.5 h-3.5" />
                Sugestões de Resposta
              </div>
              <div className="space-y-2">
                {suggestions.suggestedReplies.map((reply, index) => (
                  <div 
                    key={index}
                    className="group p-3 bg-background border rounded-lg text-sm hover:border-primary/50 transition-colors"
                  >
                    <p className="mb-2 line-clamp-3">{reply}</p>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleCopyReply(reply, index)}
                      >
                        {copiedIndex === index ? (
                          <Check className="w-3 h-3 mr-1" />
                        ) : (
                          <Copy className="w-3 h-3 mr-1" />
                        )}
                        {copiedIndex === index ? 'Copiado' : 'Copiar'}
                      </Button>
                      <Button 
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleUseReply(reply)}
                      >
                        Usar
                        <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Next Actions */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-3">
                <ChevronRight className="w-3.5 h-3.5" />
                Próximas Ações
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestions.nextActions.map((action, index) => (
                  <Button
                    key={index}
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => onAction?.(action)}
                  >
                    {action}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Clique em atualizar para obter sugestões</p>
          </div>
        )}
      </ScrollArea>

      {/* Footer disclaimer */}
      <div className="p-3 border-t bg-muted/30 flex-shrink-0">
        <p className="text-xs text-muted-foreground text-center">
          💡 Sugestões apenas para uso interno
        </p>
      </div>
    </div>
  );
}
