import { useState } from 'react';
import { MessageSquare, ArrowLeft } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageLayout } from '@/components/layout/PageLayout';
import { SplitView } from '@/components/layout/SplitView';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConversationsList } from '@/components/conversations/ConversationsList';
import { ConversationFilters } from '@/components/conversations/ConversationFilters';
import { ConversationView } from '@/components/conversations/ConversationView';
import { useConversations } from '@/hooks/useConversations';
import { useIsMobile } from '@/hooks/use-mobile';
import type { Conversation, ConversationFilters as Filters } from '@/types/conversations';

export default function ClienteConversationsPage() {
  const [filters, setFilters] = useState<Filters>({ status: 'all', channel: 'all', owner: 'all' });
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const isMobile = useIsMobile();
  
  const { data: conversations, isLoading } = useConversations(filters);

  // Mobile: full-screen conversation view
  if (isMobile && selectedConversation) {
    return (
      <AppShell>
        <div className="flex flex-col h-[calc(100dvh-3.5rem)]">
          <div className="flex items-center gap-2 p-3 border-b border-border bg-background flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedConversation(null)}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <span className="text-sm font-medium truncate">Voltar às conversas</span>
          </div>
          <div className="flex-1 min-h-0">
            <ConversationView 
              conversationId={selectedConversation.id}
              onClose={() => setSelectedConversation(null)}
            />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageLayout fluid>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">Conversas</h1>
            <p className="text-muted-foreground">
              Gerencie as conversas com os seus clientes
            </p>
          </div>

          <SplitView>
            <Card className="flex flex-col overflow-hidden min-h-0">
              <ConversationFilters filters={filters} onChange={setFilters} />
              <ConversationsList
                conversations={conversations || []}
                selectedId={selectedConversation?.id}
                onSelect={setSelectedConversation}
                isLoading={isLoading}
              />
            </Card>

            <Card className="hidden lg:flex flex-col overflow-hidden min-h-0">
              {selectedConversation ? (
                <ConversationView 
                  conversationId={selectedConversation.id}
                  onClose={() => setSelectedConversation(null)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">Selecione uma conversa</p>
                  <p className="text-sm">Escolha uma conversa da lista para visualizar</p>
                </div>
              )}
            </Card>
          </SplitView>
        </div>
      </PageLayout>
    </AppShell>
  );
}
