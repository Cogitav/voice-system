import { UseFormReturn } from 'react-hook-form';
import { Bot, User, Send, X, MessageCircle } from 'lucide-react';

interface LiveWidgetPreviewProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  empresaNome?: string;
}

const PLATFORM_DEFAULTS = {
  primaryColor: '#6366f1',
  secondaryColor: '#8b5cf6',
  backgroundColor: '#ffffff',
  userMessageColor: '#6366f1',
  agentMessageColor: '#f3f4f6',
  userTextColor: '#ffffff',
  agentTextColor: '#111827',
  buttonColor: '#6366f1',
  inputBackgroundColor: '#f3f4f6',
  inputTextColor: '#111827',
};

function getBorderRadius(setting: string): { base: string; message: string; button: string } {
  switch (setting) {
    case 'rounded':
      return { base: '16px', message: '16px', button: '50%' };
    case 'soft':
      return { base: '24px', message: '20px', button: '50%' };
    default:
      return { base: '8px', message: '12px', button: '50%' };
  }
}

function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

export function LiveWidgetPreview({ form, empresaNome }: LiveWidgetPreviewProps) {
  // Watch all branding fields
  const primaryColor = form.watch('widget_primary_color') || PLATFORM_DEFAULTS.primaryColor;
  const backgroundColor = form.watch('widget_background_color') || PLATFORM_DEFAULTS.backgroundColor;
  const userMessageColor = form.watch('widget_user_message_color') || PLATFORM_DEFAULTS.userMessageColor;
  const agentMessageColor = form.watch('widget_agent_message_color') || PLATFORM_DEFAULTS.agentMessageColor;
  const userTextColor = form.watch('widget_user_text_color') || PLATFORM_DEFAULTS.userTextColor;
  const agentTextColor = form.watch('widget_agent_text_color') || PLATFORM_DEFAULTS.agentTextColor;
  const buttonColor = form.watch('widget_button_color') || PLATFORM_DEFAULTS.buttonColor;
  const inputBackgroundColor = form.watch('widget_input_background_color') || PLATFORM_DEFAULTS.inputBackgroundColor;
  const inputTextColor = form.watch('widget_input_text_color') || PLATFORM_DEFAULTS.inputTextColor;
  const borderRadiusSetting = form.watch('widget_border_radius') || 'normal';
  const headerText = form.watch('widget_header_text') || empresaNome || 'Assistente';
  const avatarUrl = form.watch('widget_avatar_url');

  const radii = getBorderRadius(borderRadiusSetting);
  const headerTextColor = isLightColor(primaryColor) ? '#111827' : '#ffffff';
  const buttonTextColor = isLightColor(buttonColor) ? '#111827' : '#ffffff';

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Floating Button Preview */}
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg cursor-pointer transition-transform hover:scale-105"
        style={{ backgroundColor: buttonColor }}
      >
        <MessageCircle className="h-6 w-6" style={{ color: buttonTextColor }} />
      </div>

      {/* Mini Widget Preview */}
      <div
        className="w-full max-w-[280px] shadow-xl border border-border overflow-hidden"
        style={{ 
          backgroundColor,
          borderRadius: radii.base,
        }}
      >
        {/* Header */}
        <div 
          className="px-4 py-3 flex items-center justify-between"
          style={{ backgroundColor: primaryColor }}
        >
          <div className="flex items-center gap-2">
            {avatarUrl ? (
              <img 
                src={avatarUrl} 
                alt="Avatar"
                className="w-8 h-8 rounded-full object-cover border-2"
                style={{ borderColor: headerTextColor + '30' }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: headerTextColor + '20' }}
              >
                <Bot className="h-4 w-4" style={{ color: headerTextColor }} />
              </div>
            )}
            <span 
              className="font-medium text-sm truncate max-w-[140px]"
              style={{ color: headerTextColor }}
            >
              {headerText}
            </span>
          </div>
          <button 
            className="p-1 rounded-full transition-colors"
            style={{ backgroundColor: headerTextColor + '10' }}
          >
            <X className="h-4 w-4" style={{ color: headerTextColor }} />
          </button>
        </div>

        {/* Messages */}
        <div className="p-3 space-y-2 min-h-[140px]">
          {/* Agent Message */}
          <div className="flex items-end gap-2">
            <div 
              className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: agentMessageColor }}
            >
              <Bot className="h-3 w-3" style={{ color: agentTextColor }} />
            </div>
            <div
              className="px-3 py-2 max-w-[85%]"
              style={{
                backgroundColor: agentMessageColor,
                color: agentTextColor,
                borderRadius: radii.message,
                fontSize: '13px',
              }}
            >
              Olá! Como posso ajudar?
            </div>
          </div>

          {/* User Message */}
          <div className="flex justify-end">
            <div
              className="px-3 py-2 max-w-[85%]"
              style={{
                backgroundColor: userMessageColor,
                color: userTextColor,
                borderRadius: radii.message,
                fontSize: '13px',
              }}
            >
              Preciso de ajuda!
            </div>
          </div>

          {/* Agent Reply */}
          <div className="flex items-end gap-2">
            <div 
              className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: agentMessageColor }}
            >
              <Bot className="h-3 w-3" style={{ color: agentTextColor }} />
            </div>
            <div
              className="px-3 py-2 max-w-[85%]"
              style={{
                backgroundColor: agentMessageColor,
                color: agentTextColor,
                borderRadius: radii.message,
                fontSize: '13px',
              }}
            >
              Claro, estou aqui para ajudar!
            </div>
          </div>
        </div>

        {/* Input */}
        <div 
          className="px-3 py-2 border-t flex items-center gap-2"
          style={{ borderColor: agentMessageColor }}
        >
          <div 
            className="flex-1 px-3 py-2 rounded-full text-xs"
            style={{ 
              backgroundColor: inputBackgroundColor,
              color: inputTextColor + '80',
            }}
          >
            Escreva a sua mensagem...
          </div>
          <button
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: primaryColor }}
          >
            <Send className="h-4 w-4" style={{ color: headerTextColor }} />
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Pré-visualização em tempo real
      </p>
    </div>
  );
}
