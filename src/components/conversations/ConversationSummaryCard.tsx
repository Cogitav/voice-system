import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { FileText, Target, CheckCircle, ArrowRight, Calendar, User, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { Conversation } from '@/types/conversations';

interface ConversationSummaryCardProps {
  conversation: Conversation;
}

const CLOSURE_REASON_LABELS: Record<string, string> = {
  resolved: 'Resolvido',
  no_response: 'Sem resposta',
  spam: 'Spam',
  duplicate: 'Duplicado',
  transferred: 'Transferido',
  other: 'Outro',
};

export function ConversationSummaryCard({ conversation }: ConversationSummaryCardProps) {
  if (conversation.status !== 'closed' || !conversation.summary) {
    return null;
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="w-4 h-4 text-primary" />
            Conversa Encerrada
          </CardTitle>
          <Badge variant="secondary" className="font-normal">
            {CLOSURE_REASON_LABELS[conversation.closure_reason || ''] || 'Encerrado'}
          </Badge>
        </div>
        {conversation.closed_at && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {format(new Date(conversation.closed_at), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <FileText className="w-4 h-4" />
            Resumo
          </div>
          <p className="text-sm leading-relaxed">{conversation.summary}</p>
        </div>

        <Separator className="bg-border/50" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Main Intent */}
          {conversation.main_intent && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Target className="w-3.5 h-3.5" />
                Intenção
              </div>
              <p className="text-sm font-medium">{conversation.main_intent}</p>
            </div>
          )}

          {/* Result */}
          {conversation.result && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <CheckCircle className="w-3.5 h-3.5" />
                Resultado
              </div>
              <p className="text-sm font-medium">{conversation.result}</p>
            </div>
          )}

          {/* Next Action */}
          {conversation.next_action && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <ArrowRight className="w-3.5 h-3.5" />
                Próxima Ação
              </div>
              <p className="text-sm font-medium">{conversation.next_action}</p>
            </div>
          )}
        </div>

        {/* Closure Note */}
        {conversation.closure_note && (
          <>
            <Separator className="bg-border/50" />
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <User className="w-3.5 h-3.5" />
                Nota do operador
              </div>
              <p className="text-sm italic text-muted-foreground">"{conversation.closure_note}"</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
