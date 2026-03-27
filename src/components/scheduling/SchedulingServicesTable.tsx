import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmationDialog } from '@/components/admin/ConfirmationDialog';
import { Plus, Pencil, Trash2, Clock, Timer, Layers, Check, X } from 'lucide-react';
import {
  useSchedulingServices,
  useDeleteSchedulingService,
  useServiceResources,
  SchedulingService,
} from '@/hooks/useSchedulingServices';
import { SchedulingServiceFormDialog } from './SchedulingServiceFormDialog';
import { ServiceResourcesDialog } from './ServiceResourcesDialog';

function ResourcesBadge({ serviceId }: { serviceId: string }) {
  const { data: links = [] } = useServiceResources(serviceId);
  if (links.length === 0) {
    return <Badge variant="destructive" className="text-xs">Não configurado</Badge>;
  }
  const required = links.filter(l => l.is_required).length;
  const optional = links.filter(l => !l.is_required).length;
  const parts: string[] = [];
  if (required > 0) parts.push(`${required} obrigatório${required > 1 ? 's' : ''}`);
  if (optional > 0) parts.push(`${optional} opcional${optional > 1 ? 'is' : ''}`);
  return <Badge variant="outline" className="text-xs">{parts.join(' + ')}</Badge>;
}

interface SchedulingServicesTableProps {
  empresaId: string;
}

export function SchedulingServicesTable({ empresaId }: SchedulingServicesTableProps) {
  const { data: services = [], isLoading } = useSchedulingServices(empresaId);
  const deleteMutation = useDeleteSchedulingService(empresaId);
  const [editingService, setEditingService] = useState<SchedulingService | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SchedulingService | null>(null);
  const [resourcesTarget, setResourcesTarget] = useState<SchedulingService | null>(null);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Serviços de Agendamento
              </CardTitle>
              <CardDescription>
                Serviços disponíveis para agendamento com duração e buffers configuráveis.
              </CardDescription>
            </div>
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Novo Serviço
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {services.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhum serviço configurado. Crie um serviço para definir durações de agendamento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Menu</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Buffers</TableHead>
                    <TableHead>Recursos</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((service) => (
                    <TableRow key={service.id}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{service.name}</span>
                          {service.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{service.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {service.show_in_chat_menu ? (
                          <Check className="h-4 w-4 text-primary" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {service.show_in_chat_menu ? service.priority : '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                          {service.duration_minutes} min
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {service.buffer_before_minutes > 0 && `${service.buffer_before_minutes}m antes`}
                          {service.buffer_before_minutes > 0 && service.buffer_after_minutes > 0 && ' · '}
                          {service.buffer_after_minutes > 0 && `${service.buffer_after_minutes}m depois`}
                          {service.buffer_before_minutes === 0 && service.buffer_after_minutes === 0 && '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ResourcesBadge serviceId={service.id} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={service.status === 'active' ? 'default' : 'secondary'}>
                          {service.status === 'active' ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button type="button" variant="ghost" size="icon" onClick={() => setResourcesTarget(service)} title="Recursos">
                            <Layers className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => setEditingService(service)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => setDeleteTarget(service)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <SchedulingServiceFormDialog
        empresaId={empresaId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {editingService && (
        <SchedulingServiceFormDialog
          empresaId={empresaId}
          service={editingService}
          open={!!editingService}
          onOpenChange={(open) => !open && setEditingService(null)}
        />
      )}

      {resourcesTarget && (
        <ServiceResourcesDialog
          empresaId={empresaId}
          service={resourcesTarget}
          open={!!resourcesTarget}
          onOpenChange={(open) => !open && setResourcesTarget(null)}
        />
      )}

      <ConfirmationDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar Serviço"
        description={`Tem a certeza que deseja eliminar o serviço "${deleteTarget?.name}"? Esta ação é irreversível.`}
        confirmLabel="Eliminar"
        isDestructive
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id, {
              onSuccess: () => setDeleteTarget(null),
            });
          }
        }}
      />
    </>
  );
}
