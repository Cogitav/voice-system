import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { useEmpresas } from '@/hooks/useEmpresas';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Check, ExternalLink, Code2, Globe } from 'lucide-react';
import { toast } from 'sonner';

const PUBLISHED_URL = 'https://ai-call-chorus12.lovable.app';

export default function WidgetsPage() {
  const { data: empresas, isLoading } = useEmpresas();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const getWidgetUrl = (slug: string | null) => {
    if (!slug) return null;
    return `${PUBLISHED_URL}/chat/${slug}`;
  };

  const getEmbedCode = (slug: string | null) => {
    if (!slug) return null;
    return `<script 
  src="${PUBLISHED_URL}/chat-widget.js"
  data-empresa="${slug}">
</script>`;
  };

  const handleCopy = async (text: string, id: string, type: 'url' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(`${id}-${type}`);
      toast.success(type === 'url' ? 'URL copiado!' : 'Código copiado!');
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      toast.error('Erro ao copiar');
    }
  };

  const activeEmpresas = empresas?.filter(e => e.status === 'ativo' && e.slug) || [];
  const inactiveEmpresas = empresas?.filter(e => e.status !== 'ativo' || !e.slug) || [];

  return (
    <DashboardLayout>
      <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestão de Widgets</h1>
          <p className="text-muted-foreground">
            Gerir códigos de integração do chat widget para cada empresa
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total de Empresas</CardDescription>
              <CardTitle className="text-3xl">{empresas?.length || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Widgets Ativos</CardDescription>
              <CardTitle className="text-3xl text-green-600">{activeEmpresas.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Sem Slug Configurado</CardDescription>
              <CardTitle className="text-3xl text-amber-600">{inactiveEmpresas.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Widget Cards */}
        {!isLoading && (
          <div className="space-y-4">
            {/* Active Widgets */}
            {activeEmpresas.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Globe className="w-5 h-5 text-green-600" />
                  Widgets Ativos ({activeEmpresas.length})
                </h2>
                <div className="grid gap-4">
                  {activeEmpresas.map((empresa) => (
                    <WidgetCard
                      key={empresa.id}
                      empresa={empresa}
                      widgetUrl={getWidgetUrl(empresa.slug)}
                      embedCode={getEmbedCode(empresa.slug)}
                      copiedId={copiedId}
                      onCopy={handleCopy}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Inactive or Missing Slug */}
            {inactiveEmpresas.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-muted-foreground flex items-center gap-2">
                  Empresas sem Widget ({inactiveEmpresas.length})
                </h2>
                <div className="grid gap-4">
                  {inactiveEmpresas.map((empresa) => (
                    <Card key={empresa.id} className="border-dashed opacity-60">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{empresa.nome}</CardTitle>
                          <Badge variant="secondary">
                            {!empresa.slug ? 'Sem Slug' : 'Inativo'}
                          </Badge>
                        </div>
                        <CardDescription>
                          {!empresa.slug 
                            ? 'Configure um slug na página de empresas para ativar o widget'
                            : 'Empresa inativa - ative a empresa para usar o widget'
                          }
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {empresas?.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Code2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhuma empresa registada</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
      </PageContainer>
    </DashboardLayout>
  );
}

interface WidgetCardProps {
  empresa: {
    id: string;
    nome: string;
    slug?: string | null;
    status: string;
  };
  widgetUrl: string | null;
  embedCode: string | null;
  copiedId: string | null;
  onCopy: (text: string, id: string, type: 'url' | 'code') => void;
}

function WidgetCard({ empresa, widgetUrl, embedCode, copiedId, onCopy }: WidgetCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{empresa.nome}</CardTitle>
          <Badge variant="default" className="bg-green-600">
            Ativo
          </Badge>
        </div>
        <CardDescription>Slug: {empresa.slug}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Widget URL */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">URL do Widget</label>
          <div className="flex gap-2">
            <Input 
              value={widgetUrl || ''} 
              readOnly 
              className="font-mono text-sm bg-muted"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => widgetUrl && onCopy(widgetUrl, empresa.id, 'url')}
              title="Copiar URL"
            >
              {copiedId === `${empresa.id}-url` ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => widgetUrl && window.open(widgetUrl, '_blank')}
              title="Abrir em nova aba"
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Embed Code */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Código de Integração</label>
          <div className="relative">
            <Textarea 
              value={embedCode || ''} 
              readOnly 
              rows={4}
              className="font-mono text-sm bg-muted resize-none pr-12"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2"
              onClick={() => embedCode && onCopy(embedCode, empresa.id, 'code')}
              title="Copiar código"
            >
              {copiedId === `${empresa.id}-code` ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Cole este código antes da tag &lt;/body&gt; do website do cliente
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
