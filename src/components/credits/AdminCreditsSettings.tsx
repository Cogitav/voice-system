import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Building2, Edit2, Loader2, Zap, TrendingUp } from 'lucide-react';
import { useEmpresas } from '@/hooks/useEmpresas';
import { useEmpresaCredits, useUpdateCreditLimit } from '@/hooks/useCredits';
import { CreditUsageCard } from './CreditUsageCard';
import { CreditEventsSummary } from './CreditEventsSummary';
import { DEFAULT_CREDIT_LIMIT } from '@/lib/credits';
import { SettingKey } from '@/hooks/useSettings';

interface AdminCreditsSettingsProps {
  settings: Record<string, any>;
  onSettingChange: (key: SettingKey, value: any) => void;
}

export function AdminCreditsSettings({ settings, onSettingChange }: AdminCreditsSettingsProps) {
  const empresasQuery = useEmpresas();
  const empresas = empresasQuery.data;
  const empresasLoading = empresasQuery.isLoading;
  const updateLimit = useUpdateCreditLimit();
  
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string | null>(null);
  const [editingLimit, setEditingLimit] = useState(false);
  const [newLimit, setNewLimit] = useState('');
  
  const { data: credits, isLoading: creditsLoading } = useEmpresaCredits(selectedEmpresaId);
  
  const selectedEmpresa = empresas?.find(e => e.id === selectedEmpresaId);
  
  const handleEditLimit = () => {
    if (credits) {
      setNewLimit(credits.credits_limit.toString());
      setEditingLimit(true);
    }
  };
  
  const handleSaveLimit = async () => {
    if (!selectedEmpresaId) return;
    
    const limit = parseInt(newLimit, 10);
    if (isNaN(limit) || limit < 0) return;
    
    await updateLimit.mutateAsync({
      empresaId: selectedEmpresaId,
      newLimit: limit,
    });
    
    setEditingLimit(false);
  };
  
  if (empresasLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Gestão de Créditos por Empresa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }
  
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Gestão de Créditos por Empresa
          </CardTitle>
          <CardDescription>
            Selecione uma empresa para ver e configurar os seus limites de créditos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Company Selector */}
          <div className="space-y-2">
            <Label>Empresa</Label>
            <Select
              value={selectedEmpresaId || ''}
              onValueChange={(value) => setSelectedEmpresaId(value || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma empresa" />
              </SelectTrigger>
              <SelectContent>
                {empresas?.map((empresa) => (
                  <SelectItem key={empresa.id} value={empresa.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      {empresa.nome}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Selected Company Details */}
          {selectedEmpresaId && (
            <div className="space-y-6 pt-4 border-t">
              {creditsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-40 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : (
                <>
                  {/* Credit Usage */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <CreditUsageCard
                        creditsUsed={credits?.credits_used || 0}
                        creditsLimit={credits?.credits_limit || DEFAULT_CREDIT_LIMIT}
                        empresaNome={selectedEmpresa?.nome}
                        showCompanyName
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleEditLimit}
                      className="gap-2 shrink-0"
                    >
                      <Edit2 className="h-4 w-4" />
                      Editar Limite
                    </Button>
                  </div>
                  
                  {/* Events Summary */}
                  <CreditEventsSummary empresaId={selectedEmpresaId} />
                </>
              )}
            </div>
          )}
          
          {!selectedEmpresaId && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <TrendingUp className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">
                Selecione uma empresa para ver a utilização de créditos
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Edit Limit Dialog */}
      <Dialog open={editingLimit} onOpenChange={setEditingLimit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Limite de Créditos</DialogTitle>
            <DialogDescription>
              Definir o limite mensal de créditos para{' '}
              <strong>{selectedEmpresa?.nome}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Limite mensal de créditos</Label>
            <Input
              type="number"
              min="0"
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              placeholder="1000"
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Utilização atual: {credits?.credits_used?.toLocaleString() || 0} créditos
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLimit(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveLimit}
              disabled={updateLimit.isPending}
            >
              {updateLimit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
