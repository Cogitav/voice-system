import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, Building2, Edit2, Loader2, Package, Plus, Zap } from 'lucide-react';
import { useAllCreditsUsage, useUpdateCreditLimit } from '@/hooks/useCredits';
import { useEmpresas } from '@/hooks/useEmpresas';
import { AdminAddPackageDialog } from './AdminAddPackageDialog';
import { 
  getUsagePercentage, 
  getUsageStatus, 
  getUsageColorClass,
  getUsageStatusLabel,
  getCurrentMonth,
  DEFAULT_CREDIT_LIMIT,
} from '@/lib/credits';

interface EmpresaWithUsage {
  id: string;
  nome: string;
  credits_used: number;
  credits_limit: number;
  extra_credits: number;
  effectiveLimit: number;
  percentage: number;
}

export function AdminCreditsOverview() {
  const { data: creditsData, isLoading: creditsLoading } = useAllCreditsUsage();
  const empresasQuery = useEmpresas();
  const empresas = empresasQuery.data;
  const empresasLoading = empresasQuery.isLoading;
  const updateLimit = useUpdateCreditLimit();
  
  const [editingEmpresa, setEditingEmpresa] = useState<EmpresaWithUsage | null>(null);
  const [newLimit, setNewLimit] = useState('');
  const [packageEmpresa, setPackageEmpresa] = useState<{ id: string; nome: string } | null>(null);
  
  const isLoading = creditsLoading || empresasLoading;
  
  // Combine empresas with their usage data
  const empresasWithUsage: EmpresaWithUsage[] = (empresas || []).map((empresa) => {
    const usage = creditsData?.find((u) => u.empresa_id === empresa.id);
    const credits_used = usage?.credits_used || 0;
    const credits_limit = usage?.credits_limit || DEFAULT_CREDIT_LIMIT;
    const extra_credits = (usage as unknown as { extra_credits?: number })?.extra_credits || 0;
    const effectiveLimit = credits_limit + extra_credits;
    const percentage = effectiveLimit > 0 ? Math.round((credits_used / effectiveLimit) * 100) : 0;
    
    return {
      id: empresa.id,
      nome: empresa.nome,
      credits_used,
      credits_limit,
      extra_credits,
      effectiveLimit,
      percentage,
    };
  });
  
  // Sort by usage percentage descending
  const sortedEmpresas = [...empresasWithUsage].sort((a, b) => b.percentage - a.percentage);
  
  const handleEditClick = (empresa: EmpresaWithUsage) => {
    setEditingEmpresa(empresa);
    setNewLimit(empresa.credits_limit.toString());
  };
  
  const handleSaveLimit = async () => {
    if (!editingEmpresa) return;
    
    const limit = parseInt(newLimit, 10);
    if (isNaN(limit) || limit < 0) return;
    
    await updateLimit.mutateAsync({
      empresaId: editingEmpresa.id,
      newLimit: limit,
    });
    
    setEditingEmpresa(null);
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Visão Geral de Créditos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Visão Geral de Créditos
          </CardTitle>
          <CardDescription>
            Mês atual: {getCurrentMonth()} • Utilização de todas as empresas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedEmpresas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma empresa registada.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Utilização</TableHead>
                  <TableHead className="text-right">Consumo</TableHead>
                  <TableHead className="text-right">Limite</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEmpresas.map((empresa) => {
                  const status = getUsageStatus(empresa.percentage);
                  const colorClass = getUsageColorClass(status);
                  const statusLabel = getUsageStatusLabel(status);
                  const showWarning = status === 'warning' || status === 'critical' || status === 'exceeded';
                  
                  return (
                    <TableRow key={empresa.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{empresa.nome}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={status === 'exceeded' ? 'destructive' : status === 'critical' ? 'destructive' : status === 'warning' ? 'secondary' : 'outline'}
                          className="text-xs"
                        >
                          {statusLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-[150px]">
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={Math.min(empresa.percentage, 100)} 
                            className="h-2 flex-1"
                            indicatorClassName={colorClass}
                          />
                          <span className={`text-sm font-medium w-14 text-right ${
                            empresa.percentage >= 100 ? 'text-destructive' : ''
                          }`}>
                            {empresa.percentage}%
                          </span>
                          {showWarning && (
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertTriangle className={`h-4 w-4 ${
                                  status === 'exceeded' ? 'text-destructive' : 'text-yellow-500'
                                }`} />
                              </TooltipTrigger>
                              <TooltipContent>
                                {status === 'exceeded' 
                                  ? 'Limite excedido - serviço continua normalmente' 
                                  : 'A aproximar-se do limite'}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {empresa.credits_used.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <div className="flex flex-col items-end">
                          <span>{empresa.effectiveLimit.toLocaleString()}</span>
                          {empresa.extra_credits > 0 && (
                            <Tooltip>
                              <TooltipTrigger>
                                <span className="text-xs text-primary flex items-center gap-1">
                                  <Package className="h-3 w-3" />
                                  +{empresa.extra_credits.toLocaleString()}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Créditos de packs adicionais
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditClick(empresa)}
                            title="Editar limite"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setPackageEmpresa({ id: empresa.id, nome: empresa.nome })}
                            title="Adicionar pack"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {/* Edit Limit Dialog */}
      <Dialog open={!!editingEmpresa} onOpenChange={() => setEditingEmpresa(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Limite de Créditos</DialogTitle>
            <DialogDescription>
              Definir o limite mensal base de créditos para{' '}
              <strong>{editingEmpresa?.nome}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">Limite mensal base</label>
            <Input
              type="number"
              min="0"
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              placeholder="1000"
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Utilização atual: {editingEmpresa?.credits_used.toLocaleString()} créditos
              {editingEmpresa && editingEmpresa.extra_credits > 0 && (
                <> • Packs extra: +{editingEmpresa.extra_credits.toLocaleString()}</>
              )}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEmpresa(null)}>
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
      
      {/* Add Package Dialog */}
      {packageEmpresa && (
        <AdminAddPackageDialog
          open={!!packageEmpresa}
          onOpenChange={(open) => !open && setPackageEmpresa(null)}
          empresaId={packageEmpresa.id}
          empresaNome={packageEmpresa.nome}
        />
      )}
    </TooltipProvider>
  );
}
