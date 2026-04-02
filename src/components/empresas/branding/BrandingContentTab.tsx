import { UseFormReturn } from 'react-hook-form';
import { Type, Image, MessageSquare } from 'lucide-react';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface BrandingContentTabProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
}

export function BrandingContentTab({ form }: BrandingContentTabProps) {
  return (
    <div className="space-y-5">
      {/* Header Text */}
      <FormField
        control={form.control}
        name="widget_header_text"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-2">
              <Type className="h-4 w-4" />
              Texto do Cabeçalho
            </FormLabel>
            <FormControl>
              <Input
                placeholder="Usa o nome da empresa por padrão"
                {...field}
                value={field.value || ''}
              />
            </FormControl>
            <FormDescription>
              Título exibido no topo do widget
            </FormDescription>
          </FormItem>
        )}
      />

      {/* Avatar URL */}
      <FormField
        control={form.control}
        name="widget_avatar_url"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              URL do Avatar
            </FormLabel>
            <FormControl>
              <Input
                placeholder="https://..."
                type="url"
                {...field}
                value={field.value || ''}
              />
            </FormControl>
            <FormDescription>
              Imagem do agente (64×64px recomendado)
            </FormDescription>
          </FormItem>
        )}
      />
      
      {/* Avatar Preview */}
      {form.watch('widget_avatar_url') && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <img 
            src={form.watch('widget_avatar_url')} 
            alt="Avatar preview"
            className="w-12 h-12 rounded-full object-cover border-2 border-border"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <span className="text-sm text-muted-foreground">Pré-visualização</span>
        </div>
      )}

      {/* Welcome Message - This uses the empresa's default_welcome_message field if available */}
      <FormField
        control={form.control}
        name="default_welcome_message"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Mensagem de Boas-Vindas
            </FormLabel>
            <FormControl>
              <Textarea
                placeholder="Olá! Como posso ajudar?"
                className="min-h-[80px] resize-none"
                {...field}
                value={field.value || ''}
              />
            </FormControl>
            <FormDescription>
              Primeira mensagem enviada ao visitante
            </FormDescription>
          </FormItem>
        )}
      />
    </div>
  );
}
