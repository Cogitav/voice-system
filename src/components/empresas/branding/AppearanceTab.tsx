import { UseFormReturn } from 'react-hook-form';
import { CircleDot, Maximize2, Palette } from 'lucide-react';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

interface AppearanceTabProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
}

const PLATFORM_DEFAULTS = {
  buttonColor: '#6366f1',
};

export function AppearanceTab({ form }: AppearanceTabProps) {
  return (
    <div className="space-y-5">
      {/* Theme Mode */}
      <FormField
        control={form.control}
        name="widget_theme_mode"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-2">
              <CircleDot className="h-4 w-4" />
              Modo de Tema
            </FormLabel>
            <Select onValueChange={field.onChange} value={field.value || 'light'}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o modo" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="light">Claro</SelectItem>
                <SelectItem value="dark">Escuro</SelectItem>
                <SelectItem value="auto">Automático (sistema)</SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>
              Define o esquema de cores base do widget
            </FormDescription>
          </FormItem>
        )}
      />

      {/* Border Radius */}
      <FormField
        control={form.control}
        name="widget_border_radius"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-2">
              <CircleDot className="h-4 w-4" />
              Cantos do Widget
            </FormLabel>
            <Select onValueChange={field.onChange} value={field.value || 'normal'}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o estilo" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="normal">Normal (8px)</SelectItem>
                <SelectItem value="rounded">Arredondado (16px)</SelectItem>
                <SelectItem value="soft">Suave (24px)</SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>
              Estilo dos cantos arredondados
            </FormDescription>
          </FormItem>
        )}
      />

      {/* Widget Size */}
      <FormField
        control={form.control}
        name="widget_size"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-2">
              <Maximize2 className="h-4 w-4" />
              Tamanho do Widget
            </FormLabel>
            <Select onValueChange={field.onChange} value={field.value || 'medium'}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tamanho" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="small">Pequeno (350×450px)</SelectItem>
                <SelectItem value="medium">Médio (380×520px)</SelectItem>
                <SelectItem value="large">Grande (420×600px)</SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>
              Dimensões da janela de chat expandida
            </FormDescription>
          </FormItem>
        )}
      />

      {/* Floating Button Color */}
      <FormField
        control={form.control}
        name="widget_button_color"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Cor do Botão Flutuante
            </FormLabel>
            <FormControl>
              <div className="flex gap-2">
                <div 
                  className="w-10 h-10 rounded-lg border border-border flex-shrink-0"
                  style={{ backgroundColor: field.value || PLATFORM_DEFAULTS.buttonColor }}
                />
                <Input
                  type="color"
                  {...field}
                  value={field.value || PLATFORM_DEFAULTS.buttonColor}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input
                  type="text"
                  placeholder={PLATFORM_DEFAULTS.buttonColor}
                  value={field.value || ''}
                  onChange={(e) => field.onChange(e.target.value)}
                  className="flex-1 font-mono text-sm"
                />
              </div>
            </FormControl>
            <FormDescription>
              Cor do botão que abre o chat
            </FormDescription>
          </FormItem>
        )}
      />
    </div>
  );
}
