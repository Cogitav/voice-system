import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Layers } from 'lucide-react';
import {
  useServiceResources,
  useLinkServiceResource,
  useUnlinkServiceResource,
  useUpdateServiceResourceRequired,
  SchedulingService,
} from '@/hooks/useSchedulingServices';
import { useSchedulingResources } from '@/hooks/useSchedulingResources';

interface Props {
  empresaId: string;
  service: SchedulingService;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ServiceResourcesDialog({ empresaId, service, open, onOpenChange }: Props) {
  const { data: resources = [], isLoading: resourcesLoading } = useSchedulingResources(empresaId);
  const { data: links = [], isLoading: linksLoading } = useServiceResources(service.id);
  const linkMutation = useLinkServiceResource(service.id);
  const unlinkMutation = useUnlinkServiceResource(service.id);
  const updateRequiredMutation = useUpdateServiceResourceRequired(service.id);

  const linkedMap = new Map(links.map(l => [l.resource_id, l]));
  const isLoading = resourcesLoading || linksLoading;

  const handleToggle = (resourceId: string, checked: boolean) => {
    if (checked) {
      linkMutation.mutate(resourceId);
    } else {
      unlinkMutation.mutate(resourceId);
    }
  };

  const handleRequiredToggle = (linkId: string, isRequired: boolean) => {
    updateRequiredMutation.mutate({ linkId, isRequired });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Recursos do Serviço
          </DialogTitle>
          <DialogDescription>
            Associe recursos ao serviço "{service.name}". Marque como obrigatório se o recurso é necessário para cada marcação.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : resources.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum recurso de agendamento configurado para esta empresa.
          </p>
        ) : (
          <div className="space-y-3">
            {resources.map((resource) => {
              const link = linkedMap.get(resource.id);
              const isLinked = !!link;
              const isPending = linkMutation.isPending || unlinkMutation.isPending || updateRequiredMutation.isPending;

              return (
                <div
                  key={resource.id}
                  className="flex items-center gap-3 p-3 rounded-lg border"
                >
                  <Checkbox
                    id={`resource-${resource.id}`}
                    checked={isLinked}
                    disabled={isPending}
                    onCheckedChange={(checked) => handleToggle(resource.id, !!checked)}
                  />
                  <div className="flex-1 min-w-0">
                    <Label htmlFor={`resource-${resource.id}`} className="cursor-pointer font-medium text-sm">
                      {resource.name}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {resource.type === 'person' ? 'Pessoa' : resource.type === 'room' ? 'Sala' : 'Equipamento'}
                      {' · '}{resource.default_appointment_duration_minutes} min padrão
                    </p>
                  </div>
                  {isLinked && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`required-${resource.id}`} className="text-xs text-muted-foreground whitespace-nowrap">
                        Obrigatório
                      </Label>
                      <Switch
                        id={`required-${resource.id}`}
                        checked={link.is_required}
                        disabled={isPending}
                        onCheckedChange={(checked) => handleRequiredToggle(link.id, checked)}
                      />
                    </div>
                  )}
                  <Badge variant={resource.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                    {resource.status === 'active' ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
