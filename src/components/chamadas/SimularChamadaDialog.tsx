import { useState } from 'react';
import { Phone, Loader2, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useEmpresas } from '@/hooks/useEmpresas';
import { useAgentes } from '@/hooks/useAgentes';
import { useSimularChamada } from '@/hooks/useSimularChamada';

export function SimularChamadaDialog() {
  const [open, setOpen] = useState(false);
  const [empresaId, setEmpresaId] = useState<string>('');
  const [agenteId, setAgenteId] = useState<string>('');

  const { data: empresas = [], isLoading: loadingEmpresas } = useEmpresas();
  const { data: agentes = [], isLoading: loadingAgentes } = useAgentes();
  const simularChamada = useSimularChamada();

  // Filter agentes by selected empresa
  const agentesDisponiveis = empresaId
    ? agentes.filter((a) => a.empresa_id === empresaId && a.status === 'ativo')
    : [];

  const handleSubmit = async () => {
    if (!empresaId || !agenteId) return;

    await simularChamada.mutateAsync({ empresaId, agenteId });
    setOpen(false);
    setEmpresaId('');
    setAgenteId('');
  };

  const handleEmpresaChange = (value: string) => {
    setEmpresaId(value);
    setAgenteId(''); // Reset agente when empresa changes
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Phone className="w-4 h-4 mr-2" />
          Simular Chamada
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Simular Chamada</DialogTitle>
          <DialogDescription>
            Crie uma chamada simulada para testar o sistema antes da integração real.
          </DialogDescription>
        </DialogHeader>

        <Alert className="bg-amber-50 border-amber-200">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            Esta é uma simulação. Dados gerados automaticamente para testes.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="empresa">Empresa</Label>
            <Select
              value={empresaId}
              onValueChange={handleEmpresaChange}
              disabled={loadingEmpresas}
            >
              <SelectTrigger id="empresa">
                <SelectValue placeholder="Selecione uma empresa" />
              </SelectTrigger>
              <SelectContent>
                {empresas
                  .filter((e) => e.status === 'ativo')
                  .map((empresa) => (
                    <SelectItem key={empresa.id} value={empresa.id}>
                      {empresa.nome}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="agente">Agente</Label>
            <Select
              value={agenteId}
              onValueChange={setAgenteId}
              disabled={!empresaId || loadingAgentes}
            >
              <SelectTrigger id="agente">
                <SelectValue
                  placeholder={
                    !empresaId
                      ? 'Selecione primeiro uma empresa'
                      : agentesDisponiveis.length === 0
                      ? 'Nenhum agente disponível'
                      : 'Selecione um agente'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {agentesDisponiveis.map((agente) => (
                  <SelectItem key={agente.id} value={agente.id}>
                    {agente.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!empresaId || !agenteId || simularChamada.isPending}
          >
            {simularChamada.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                A simular...
              </>
            ) : (
              <>
                <Phone className="w-4 h-4 mr-2" />
                Simular
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
