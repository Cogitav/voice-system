import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Users } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageLayout } from '@/components/layout/PageLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useLeads, useUpdateLeadStatus, type Lead } from '@/hooks/useLeads';

const LEAD_STATUSES: Array<{ value: Lead['status']; label: string }> = [
  { value: 'new', label: 'Novo' },
  { value: 'contacted', label: 'Contactado' },
  { value: 'qualified', label: 'Qualificado' },
  { value: 'converted', label: 'Convertido' },
  { value: 'lost', label: 'Perdido' },
];

const INTENT_FILTERS = [
  'Marcação',
  'Informação',
  'Preço',
  'Remarcação',
  'Cancelamento',
  'Atendimento humano',
  'Outro',
] as const;

type DateRangeFilter = 'all' | 'today' | 'last_7_days' | 'last_30_days';
type SourceFilter = 'all' | 'chat' | 'voice';
type PriorityFilter = 'all' | 'high' | 'medium' | 'low';
type SortBy = 'created_desc' | 'created_asc' | 'priority_desc' | 'name_asc';

function getContact(lead: Lead) {
  return [lead.phone, lead.email].filter(Boolean).join(' / ') || 'Sem contacto';
}

function getLeadPriority(lead: Lead): { value: 'high' | 'medium' | 'low'; label: string } {
  if (lead.email && lead.phone) {
    return { value: 'high', label: 'Alta' };
  }

  if (lead.email || lead.phone) {
    return { value: 'medium', label: 'Média' };
  }

  return { value: 'low', label: 'Baixa' };
}

function getPriorityRank(lead: Lead) {
  const ranks = { high: 3, medium: 2, low: 1 };
  return ranks[getLeadPriority(lead).value];
}

function getLeadIntentSource(lead: Lead) {
  const context = lead.conversations?.conversation_context;
  const currentIntent = context && typeof context === 'object'
    ? context.current_intent
    : null;

  return typeof currentIntent === 'string' && currentIntent.trim().length > 0
    ? currentIntent
    : lead.conversations?.main_intent ?? null;
}

function getIntentLabel(intent?: string | null) {
  const labels: Record<string, string> = {
    BOOKING_NEW: 'Marcação',
    INFO_REQUEST: 'Informação',
    PRICE_REQUEST: 'Preço',
    RESCHEDULE: 'Remarcação',
    CANCEL: 'Cancelamento',
    HUMAN_REQUEST: 'Atendimento humano',
    CONFIRMATION: 'Marcação',
    SLOT_SELECTION: 'Marcação',
    TIME_BASED_SELECTION: 'Marcação',
    DATE_CHANGE: 'Marcação',
    CORRECTION: 'Marcação',
    EXPLICIT_RESTART: 'Outro',
    OFF_TOPIC: 'Outro',
    UNCLEAR: 'Outro',
    UNKNOWN: 'Outro',
    OTHER: 'Outro',
    Agendamento: 'Marcação',
    Cancelamento: 'Cancelamento',
    'Atendimento humano': 'Atendimento humano',
    'Chamada de voz': 'Chamada de voz',
    'Não determinado': 'Outro',
  };

  if (intent && labels[intent]) return labels[intent];

  switch (intent) {
    case 'BOOKING_NEW':
      return 'Marcação';
    case 'INFO_REQUEST':
      return 'Informação';
    case 'PRICE_REQUEST':
      return 'Preço';
    case 'RESCHEDULE':
      return 'Remarcação';
    case 'CANCEL':
      return 'Cancelamento';
    case 'HUMAN_REQUEST':
      return 'Atendimento humano';
    case 'CONFIRMATION':
    case 'SLOT_SELECTION':
    case 'TIME_BASED_SELECTION':
    case 'DATE_CHANGE':
    case 'CORRECTION':
      return 'Marcação';
    case 'EXPLICIT_RESTART':
    case 'OFF_TOPIC':
    case 'OTHER':
    case 'UNCLEAR':
    case 'UNKNOWN':
    default:
      return 'Outro';
  }
}

function getSource(lead: Lead) {
  return lead.source || lead.conversations?.channel || 'chat';
}

function matchesDateRange(createdAt: string, range: DateRangeFilter) {
  if (range === 'all') return true;

  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;

  const now = new Date();
  if (range === 'today') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return created >= startOfToday;
  }

  const days = range === 'last_7_days' ? 7 : 30;
  const threshold = new Date(now);
  threshold.setDate(now.getDate() - days);
  return created >= threshold;
}

export default function LeadsPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: leads = [], isLoading, error } = useLeads();
  const updateLeadStatus = useUpdateLeadStatus();
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [dateRange, setDateRange] = useState<DateRangeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<Lead['status'] | 'all'>('all');
  const [intentFilter, setIntentFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('created_desc');

  const companyOptions = useMemo(() => {
    const companies = new Map<string, string>();
    leads.forEach((lead) => {
      if (lead.empresa_id) {
        companies.set(lead.empresa_id, lead.empresas?.nome || 'Empresa sem nome');
      }
    });
    return Array.from(companies.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return leads.filter((lead) => {
      if (normalizedSearch) {
        const searchable = [lead.name, lead.email, lead.phone]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(normalizedSearch)) return false;
      }

      if (isAdmin && companyFilter !== 'all' && lead.empresa_id !== companyFilter) {
        return false;
      }

      if (!matchesDateRange(lead.created_at, dateRange)) return false;

      if (statusFilter !== 'all' && lead.status !== statusFilter) return false;

      if (intentFilter !== 'all' && getIntentLabel(getLeadIntentSource(lead)) !== intentFilter) {
        return false;
      }

      if (sourceFilter !== 'all' && getSource(lead) !== sourceFilter) return false;

      if (priorityFilter !== 'all' && getLeadPriority(lead).value !== priorityFilter) {
        return false;
      }

      return true;
    });
  }, [companyFilter, dateRange, intentFilter, isAdmin, leads, priorityFilter, search, sourceFilter, statusFilter]);

  const sortedLeads = useMemo(() => {
    return [...filteredLeads].sort((a, b) => {
      if (sortBy === 'created_asc') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }

      if (sortBy === 'priority_desc') {
        const priorityDiff = getPriorityRank(b) - getPriorityRank(a);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }

      if (sortBy === 'name_asc') {
        return (a.name || '').localeCompare(b.name || '', 'pt');
      }

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [filteredLeads, sortBy]);

  const activeFiltersCount = [
    search.trim().length > 0,
    isAdmin && companyFilter !== 'all',
    dateRange !== 'all',
    statusFilter !== 'all',
    intentFilter !== 'all',
    sourceFilter !== 'all',
    priorityFilter !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearch('');
    setCompanyFilter('all');
    setDateRange('all');
    setStatusFilter('all');
    setIntentFilter('all');
    setSourceFilter('all');
    setPriorityFilter('all');
  };

  return (
    <AppShell>
      <PageLayout fluid>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-1">Leads</h1>
            <p className="text-sm text-muted-foreground">
              Gestão simples de oportunidades captadas por conversas e chamadas.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Leads captados
              </CardTitle>
              <CardDescription>
                Atualize o estado e abra a conversa associada quando existir.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Input
                  placeholder="Pesquisar por nome, email ou telefone"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />

                {isAdmin && (
                  <Select value={companyFilter} onValueChange={setCompanyFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as empresas</SelectItem>
                      {companyOptions.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Select value={dateRange} onValueChange={(value: DateRangeFilter) => setDateRange(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as datas</SelectItem>
                    <SelectItem value="today">Hoje</SelectItem>
                    <SelectItem value="last_7_days">Últimos 7 dias</SelectItem>
                    <SelectItem value="last_30_days">Últimos 30 dias</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={(value: Lead['status'] | 'all') => setStatusFilter(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os estados</SelectItem>
                    {LEAD_STATUSES.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={intentFilter} onValueChange={setIntentFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Intent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as intenções</SelectItem>
                    {INTENT_FILTERS.map((intent) => (
                      <SelectItem key={intent} value={intent}>
                        {intent}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={sourceFilter} onValueChange={(value: SourceFilter) => setSourceFilter(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as origens</SelectItem>
                    <SelectItem value="chat">Chat</SelectItem>
                    <SelectItem value="voice">Voice</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={priorityFilter} onValueChange={(value: PriorityFilter) => setPriorityFilter(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Prioridade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as prioridades</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="low">Baixa</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={(value: SortBy) => setSortBy(value)}>
                  <SelectTrigger className="xl:col-start-4">
                    <SelectValue placeholder="Ordenar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_desc">Mais recentes</SelectItem>
                    <SelectItem value="created_asc">Mais antigos</SelectItem>
                    <SelectItem value="priority_desc">Prioridade</SelectItem>
                    <SelectItem value="name_asc">Nome (A-Z)</SelectItem>
                  </SelectContent>
                </Select>

                {activeFiltersCount > 1 && (
                  <Button type="button" variant="outline" onClick={clearFilters}>
                    Limpar filtros
                  </Button>
                )}
              </div>

              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 w-full" />
                  ))}
                </div>
              ) : error ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  Erro ao carregar leads.
                </div>
              ) : leads.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center rounded-md border border-dashed text-muted-foreground">
                  <Users className="mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm">Ainda não existem leads.</p>
                </div>
              ) : filteredLeads.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center rounded-md border border-dashed text-muted-foreground">
                  <Users className="mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm">Nenhum lead corresponde aos filtros.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Contacto</TableHead>
                      <TableHead>Prioridade</TableHead>
                      <TableHead>Intent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedLeads.map((lead) => {
                      const priority = getLeadPriority(lead);

                      return (
                      <TableRow key={lead.id}>
                        <TableCell className="font-medium">{lead.name || 'Sem nome'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{getContact(lead)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={priority.value === 'high' ? 'default' : 'outline'}
                            className={priority.value === 'low' ? 'text-muted-foreground' : undefined}
                          >
                            {priority.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{getIntentLabel(getLeadIntentSource(lead))}</Badge>
                        </TableCell>
                        <TableCell className="min-w-40">
                          <Select
                            value={lead.status}
                            onValueChange={(status: Lead['status']) => {
                              updateLeadStatus.mutate({ leadId: lead.id, status });
                            }}
                            disabled={updateLeadStatus.isPending}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LEAD_STATUSES.map((status) => (
                                <SelectItem key={status.value} value={status.value}>
                                  {status.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>{getSource(lead)}</TableCell>
                        <TableCell>
                          {format(new Date(lead.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!lead.conversation_id}
                            onClick={() => lead.conversation_id && navigate(`/admin/conversas/${lead.conversation_id}`)}
                          >
                            <Eye className="mr-1.5 h-4 w-4" />
                            Ver conversa
                          </Button>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    </AppShell>
  );
}
