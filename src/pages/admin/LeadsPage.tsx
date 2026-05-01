import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { Eye, Users } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageLayout } from '@/components/layout/PageLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useLeads, useUpdateLeadStatus, type Lead } from '@/hooks/useLeads';

const LEAD_STATUSES: Array<{ value: Lead['status']; label: string }> = [
  { value: 'new', label: 'Novo' },
  { value: 'contacted', label: 'Contactado' },
  { value: 'qualified', label: 'Qualificado' },
  { value: 'converted', label: 'Convertido' },
  { value: 'lost', label: 'Perdido' },
];

function getContact(lead: Lead) {
  return [lead.phone, lead.email].filter(Boolean).join(' / ') || 'Sem contacto';
}

function getIntent(lead: Lead) {
  return lead.conversations?.main_intent || lead.notes?.replace(/^Intent:\s*/i, '') || 'N/A';
}

function getSource(lead: Lead) {
  return lead.source || lead.conversations?.channel || 'chat';
}

export default function LeadsPage() {
  const navigate = useNavigate();
  const { data: leads = [], isLoading, error } = useLeads();
  const updateLeadStatus = useUpdateLeadStatus();

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
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Contacto</TableHead>
                      <TableHead>Intent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell className="font-medium">{lead.name || 'Sem nome'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{getContact(lead)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{getIntent(lead)}</Badge>
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
                    ))}
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
