import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Package } from 'lucide-react';
import { CreditPackageType, CREDIT_PACKAGES } from '@/lib/credits';
import { useAddCreditPackage } from '@/hooks/useCreditPackages';

interface AdminAddPackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresaId: string;
  empresaNome: string;
}

export function AdminAddPackageDialog({
  open,
  onOpenChange,
  empresaId,
  empresaNome,
}: AdminAddPackageDialogProps) {
  const [selectedPackage, setSelectedPackage] = useState<CreditPackageType>('EXTRA_M');
  const [notes, setNotes] = useState('');
  const addPackage = useAddCreditPackage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    await addPackage.mutateAsync({
      empresaId,
      packageType: selectedPackage,
      notes: notes.trim() || undefined,
    });
    
    onOpenChange(false);
    setNotes('');
    setSelectedPackage('EXTRA_M');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Adicionar Pack de Créditos
          </DialogTitle>
          <DialogDescription>
            Adicionar créditos extra para <strong>{empresaNome}</strong> no mês atual.
            Os créditos não transitam para o próximo mês.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <Label>Selecione o pack</Label>
            <RadioGroup 
              value={selectedPackage} 
              onValueChange={(v) => setSelectedPackage(v as CreditPackageType)}
              className="space-y-3"
            >
              {(Object.entries(CREDIT_PACKAGES) as [CreditPackageType, typeof CREDIT_PACKAGES[CreditPackageType]][]).map(([type, config]) => (
                <label
                  key={type}
                  className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedPackage === type 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <RadioGroupItem value={type} id={type} />
                    <div>
                      <p className="font-medium">{config.label}</p>
                      <p className="text-xs text-muted-foreground">{config.description}</p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-primary">
                    +{config.credits.toLocaleString()}
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              placeholder="Ex: Campanha de Natal, pico de utilização..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={addPackage.isPending}>
              {addPackage.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Adicionar Pack
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
