import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEmpresas } from '@/hooks/useEmpresas';
import { useCreateFollowUpRule, FOLLOW_UP_INTENT_OPTIONS, FollowUpRule } from '@/hooks/useFollowUpRules';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

interface CreateFollowUpRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingRules: FollowUpRule[];
}

export function CreateFollowUpRuleDialog({ open, onOpenChange, existingRules }: CreateFollowUpRuleDialogProps) {
  const [empresaId, setEmpresaId] = useState('');
  const [intent, setIntent] = useState('');
  
  const { data: empresas = [] } = useEmpresas();
  const createRule = useCreateFollowUpRule();

  // Get existing intents for selected empresa
  const existingIntents = existingRules
    .filter(r => r.empresa_id === empresaId)
    .map(r => r.intent);

  // Filter out intents that already have rules
  const availableIntents = FOLLOW_UP_INTENT_OPTIONS.filter(
    opt => !existingIntents.includes(opt.value)
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!empresaId || !intent) return;

    createRule.mutate(
      { 
        empresa_id: empresaId, 
        intent,
        // Safe defaults - all follow-up actions disabled
        send_email_client: false,
        send_email_company: false,
        create_appointment: false,
        register_only: true,
        mark_manual_followup: false,
      },
      {
        onSuccess: () => {
          setEmpresaId('');
          setIntent('');
          onOpenChange(false);
        },
      }
    );
  };

  const handleClose = () => {
    setEmpresaId('');
    setIntent('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Regra de Follow-Up</DialogTitle>
        </DialogHeader>
        
        <Alert className="bg-muted/50">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            As regras são criadas com valores seguros por defeito. Nenhuma ação automática 
            será executada até configurar explicitamente.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="empresa">Empresa</Label>
            <Select value={empresaId} onValueChange={setEmpresaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar empresa..." />
              </SelectTrigger>
              <SelectContent>
                {empresas.map((empresa) => (
                  <SelectItem key={empresa.id} value={empresa.id}>
                    {empresa.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="intent">Intenção da Chamada</Label>
            <Select value={intent} onValueChange={setIntent} disabled={!empresaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar intenção..." />
              </SelectTrigger>
              <SelectContent>
                {availableIntents.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {empresaId && availableIntents.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Todas as intenções já têm regras configuradas para esta empresa.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={!empresaId || !intent || createRule.isPending}
            >
              {createRule.isPending ? 'A criar...' : 'Criar Regra'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
