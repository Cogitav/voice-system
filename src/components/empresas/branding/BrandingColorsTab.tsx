import { UseFormReturn } from 'react-hook-form';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

interface BrandingColorsTabProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
}

const PLATFORM_DEFAULTS = {
  primaryColor: '#6366f1',
  secondaryColor: '#8b5cf6',
  backgroundColor: '#ffffff',
  userMessageColor: '#6366f1',
  agentMessageColor: '#f3f4f6',
  userTextColor: '#ffffff',
  agentTextColor: '#111827',
  inputBackgroundColor: '#f3f4f6',
  inputTextColor: '#111827',
};

function ColorPickerField({ 
  form, 
  name, 
  label, 
  description, 
  defaultValue 
}: { 
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  name: string;
  label: string;
  description: string;
  defaultValue: string;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="flex items-center gap-2 text-sm">
            <div 
              className="w-4 h-4 rounded border border-border"
              style={{ backgroundColor: field.value || defaultValue }}
            />
            {label}
          </FormLabel>
          <FormControl>
            <div className="flex gap-2">
              <Input
                type="color"
                {...field}
                value={field.value || defaultValue}
                className="w-10 h-9 p-1 cursor-pointer flex-shrink-0"
              />
              <Input
                type="text"
                placeholder={defaultValue}
                value={field.value || ''}
                onChange={(e) => field.onChange(e.target.value)}
                className="flex-1 font-mono text-sm"
              />
            </div>
          </FormControl>
          <FormDescription className="text-xs">{description}</FormDescription>
        </FormItem>
      )}
    />
  );
}

export function BrandingColorsTab({ form }: BrandingColorsTabProps) {
  return (
    <div className="space-y-6">
      {/* Primary Colors */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground border-b pb-2">Cores Primárias</h4>
        <div className="grid grid-cols-1 gap-4">
          <ColorPickerField
            form={form}
            name="widget_primary_color"
            label="Cor Primária"
            description="Cabeçalho e destaques"
            defaultValue={PLATFORM_DEFAULTS.primaryColor}
          />
          <ColorPickerField
            form={form}
            name="widget_secondary_color"
            label="Cor Secundária"
            description="Acentos e estados hover"
            defaultValue={PLATFORM_DEFAULTS.secondaryColor}
          />
          <ColorPickerField
            form={form}
            name="widget_background_color"
            label="Fundo do Widget"
            description="Cor de fundo da janela"
            defaultValue={PLATFORM_DEFAULTS.backgroundColor}
          />
        </div>
      </div>

      {/* Visitor Messages */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground border-b pb-2">Mensagens do Visitante</h4>
        <div className="grid grid-cols-1 gap-4">
          <ColorPickerField
            form={form}
            name="widget_user_message_color"
            label="Fundo da Bolha"
            description="Cor de fundo das mensagens"
            defaultValue={PLATFORM_DEFAULTS.userMessageColor}
          />
          <ColorPickerField
            form={form}
            name="widget_user_text_color"
            label="Cor do Texto"
            description="Cor do texto do visitante"
            defaultValue={PLATFORM_DEFAULTS.userTextColor}
          />
        </div>
      </div>

      {/* Agent Messages */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground border-b pb-2">Mensagens do Agente</h4>
        <div className="grid grid-cols-1 gap-4">
          <ColorPickerField
            form={form}
            name="widget_agent_message_color"
            label="Fundo da Bolha"
            description="Cor de fundo das mensagens"
            defaultValue={PLATFORM_DEFAULTS.agentMessageColor}
          />
          <ColorPickerField
            form={form}
            name="widget_agent_text_color"
            label="Cor do Texto"
            description="Cor do texto do agente"
            defaultValue={PLATFORM_DEFAULTS.agentTextColor}
          />
        </div>
      </div>

      {/* Input Area */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground border-b pb-2">Campo de Entrada</h4>
        <div className="grid grid-cols-1 gap-4">
          <ColorPickerField
            form={form}
            name="widget_input_background_color"
            label="Fundo do Campo"
            description="Cor de fundo da caixa de texto"
            defaultValue={PLATFORM_DEFAULTS.inputBackgroundColor}
          />
          <ColorPickerField
            form={form}
            name="widget_input_text_color"
            label="Cor do Texto"
            description="Cor do texto digitado"
            defaultValue={PLATFORM_DEFAULTS.inputTextColor}
          />
        </div>
      </div>
    </div>
  );
}
