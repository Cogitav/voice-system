import { useState } from 'react';
import { X, FileText, AlertCircle, CheckCircle, UserX, MessageSquareOff, Ban, HelpCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type ClosureReason = 
  | 'resolved'
  | 'no_response'
  | 'spam'
  | 'duplicate'
  | 'transferred'
  | 'other';

interface ClosureReasonOption {
  value: ClosureReason;
  label: string;
  icon: React.ReactNode;
}

const CLOSURE_REASONS: ClosureReasonOption[] = [
  { value: 'resolved', label: 'Resolvido', icon: <CheckCircle className="w-4 h-4 text-success" /> },
  { value: 'no_response', label: 'Sem resposta do cliente', icon: <UserX className="w-4 h-4 text-muted-foreground" /> },
  { value: 'spam', label: 'Spam / Irrelevante', icon: <Ban className="w-4 h-4 text-destructive" /> },
  { value: 'duplicate', label: 'Duplicado', icon: <MessageSquareOff className="w-4 h-4 text-warning" /> },
  { value: 'transferred', label: 'Transferido', icon: <AlertCircle className="w-4 h-4 text-primary" /> },
  { value: 'other', label: 'Outro', icon: <HelpCircle className="w-4 h-4 text-muted-foreground" /> },
];

interface CloseConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: ClosureReason, note?: string) => void;
  isLoading?: boolean;
}

export function CloseConversationDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: CloseConversationDialogProps) {
  const [reason, setReason] = useState<ClosureReason>('resolved');
  const [note, setNote] = useState('');

  const handleConfirm = () => {
    onConfirm(reason, note.trim() || undefined);
    // Reset state after confirm
    setReason('resolved');
    setNote('');
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setReason('resolved');
      setNote('');
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <X className="w-5 h-5 text-destructive" />
            Encerrar Conversa
          </DialogTitle>
          <DialogDescription>
            Selecione o motivo do encerramento. Um resumo será gerado automaticamente pela IA.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo do encerramento</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as ClosureReason)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um motivo" />
              </SelectTrigger>
              <SelectContent>
                {CLOSURE_REASONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      {option.icon}
                      <span>{option.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note" className="flex items-center gap-1.5">
              <FileText className="w-4 h-4" />
              Nota interna (opcional)
            </Label>
            <Textarea
              id="note"
              placeholder="Adicione uma nota para referência futura..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[80px] resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? 'Encerrando...' : 'Encerrar Conversa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
