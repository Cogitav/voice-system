import { useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, AlertCircle, Info, List } from 'lucide-react';
import { useFollowUpRules, FOLLOW_UP_INTENT_OPTIONS, FollowUpRule } from '@/hooks/useFollowUpRules';
import { useDuplicateFollowUpRule } from '@/hooks/useDuplicateFollowUpRule';
import { useEmpresas } from '@/hooks/useEmpresas';
import { FollowUpRulesTable } from '@/components/follow-up-rules/FollowUpRulesTable';
import { FollowUpRuleEditDialog } from '@/components/follow-up-rules/FollowUpRuleEditDialog';
import { CreateFollowUpRuleDialog } from '@/components/follow-up-rules/CreateFollowUpRuleDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function FollowUpRulesPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<FollowUpRule | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEmpresa, setFilterEmpresa] = useState('all');
  const [filterIntent, setFilterIntent] = useState('all');

  const { data: rules = [], isLoading } = useFollowUpRules();
  const { data: empresas = [] } = useEmpresas();
  const duplicateRule = useDuplicateFollowUpRule();

  // Filter rules
  const filteredRules = rules.filter(rule => {
    const matchesSearch = rule.empresa_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      FOLLOW_UP_INTENT_OPTIONS.find(o => o.value === rule.intent)?.label.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEmpresa = filterEmpresa === 'all' || rule.empresa_id === filterEmpresa;
    const matchesIntent = filterIntent === 'all' || rule.intent === filterIntent;
    return matchesSearch && matchesEmpresa && matchesIntent;
  });

  const handleEdit = useCallback((rule: FollowUpRule) => {
    setEditingRule(rule);
  }, []);

  const handleDuplicate = useCallback((rule: FollowUpRule) => {
    duplicateRule.mutate(rule);
  }, [duplicateRule]);

  return (
    <DashboardLayout>
      <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <List className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Regras de Follow-Up</h1>
              <p className="text-muted-foreground">
                Configure ações automáticas por intenção de chamada
              </p>
            </div>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Regra
          </Button>
        </div>

        {/* Important Notice */}
        <Alert className="bg-muted/50 border-primary/20">
          <Info className="h-4 w-4" />
          <AlertTitle>Sistema Flexível e Opcional</AlertTitle>
          <AlertDescription className="text-sm">
            Esta plataforma <strong>não substitui</strong> os seus sistemas existentes. Todos os follow-ups são 
            opcionais e só executam se explicitamente configurados. Por defeito, apenas o registo da chamada é feito.
            <strong> Nenhuma ação automática ocorre sem regra ativa.</strong>
          </AlertDescription>
        </Alert>

        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
            <SelectTrigger className="w-full sm:w-[180px]">
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
          <Select value={filterIntent} onValueChange={setFilterIntent}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filtrar por intenção" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as intenções</SelectItem>
              {FOLLOW_UP_INTENT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Content */}
        {isLoading ? (
          <Skeleton className="h-[400px] rounded-lg" />
        ) : filteredRules.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Sem regras configuradas</AlertTitle>
            <AlertDescription>
              {rules.length === 0 
                ? 'Clique em "Nova Regra" para criar a primeira regra de follow-up.'
                : 'Nenhuma regra corresponde aos filtros aplicados.'}
            </AlertDescription>
          </Alert>
        ) : (
          <FollowUpRulesTable
            rules={filteredRules}
            isLoading={isLoading}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
          />
        )}

        {/* Dialogs */}
        <CreateFollowUpRuleDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          existingRules={rules}
        />

        <FollowUpRuleEditDialog
          open={!!editingRule}
          onOpenChange={(open) => !open && setEditingRule(null)}
          rule={editingRule}
        />
      </div>
      </PageContainer>
    </DashboardLayout>
  );
}
