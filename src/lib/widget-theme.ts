// Platform default branding values
export const PLATFORM_DEFAULT_BRANDING = {
  primaryColor: '#6366f1',
  secondaryColor: '#8b5cf6',
  backgroundColor: '#ffffff',
  userMessageColor: '#6366f1',
  agentMessageColor: '#f3f4f6',
  userTextColor: '#ffffff',
  agentTextColor: '#111827',
  buttonColor: '#6366f1',
  themeMode: 'light' as const,
  borderRadius: 'normal' as const,
  size: 'medium' as const,
  headerText: null as string | null,
  avatarUrl: null as string | null,
};

export type WidgetThemeMode = 'light' | 'dark' | 'auto';
export type WidgetBorderRadius = 'normal' | 'rounded' | 'soft';
export type WidgetSize = 'small' | 'medium' | 'large';

export interface WidgetBranding {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  userMessageColor: string;
  agentMessageColor: string;
  userTextColor: string;
  agentTextColor: string;
  buttonColor: string;
  themeMode: WidgetThemeMode;
  borderRadius: WidgetBorderRadius;
  size: WidgetSize;
  headerText: string | null;
  avatarUrl: string | null;
}

export interface RawWidgetBranding {
  widget_primary_color?: string | null;
  widget_secondary_color?: string | null;
  widget_background_color?: string | null;
  widget_user_message_color?: string | null;
  widget_agent_message_color?: string | null;
  widget_agent_text_color?: string | null;
  widget_user_text_color?: string | null;
  widget_button_color?: string | null;
  widget_theme_mode?: WidgetThemeMode | null;
  widget_border_radius?: WidgetBorderRadius | null;
  widget_size?: WidgetSize | null;
  widget_header_text?: string | null;
  widget_avatar_url?: string | null;
}

// Resolve branding with fallback to platform defaults
export function resolveWidgetBranding(empresaBranding?: RawWidgetBranding | null): WidgetBranding {
  return {
    primaryColor: empresaBranding?.widget_primary_color || PLATFORM_DEFAULT_BRANDING.primaryColor,
    secondaryColor: empresaBranding?.widget_secondary_color || PLATFORM_DEFAULT_BRANDING.secondaryColor,
    backgroundColor: empresaBranding?.widget_background_color || PLATFORM_DEFAULT_BRANDING.backgroundColor,
    userMessageColor: empresaBranding?.widget_user_message_color || PLATFORM_DEFAULT_BRANDING.userMessageColor,
    agentMessageColor: empresaBranding?.widget_agent_message_color || PLATFORM_DEFAULT_BRANDING.agentMessageColor,
    userTextColor: empresaBranding?.widget_user_text_color || PLATFORM_DEFAULT_BRANDING.userTextColor,
    agentTextColor: empresaBranding?.widget_agent_text_color || PLATFORM_DEFAULT_BRANDING.agentTextColor,
    buttonColor: empresaBranding?.widget_button_color || PLATFORM_DEFAULT_BRANDING.buttonColor,
    themeMode: empresaBranding?.widget_theme_mode || PLATFORM_DEFAULT_BRANDING.themeMode,
    borderRadius: empresaBranding?.widget_border_radius || PLATFORM_DEFAULT_BRANDING.borderRadius,
    size: empresaBranding?.widget_size || PLATFORM_DEFAULT_BRANDING.size,
    headerText: empresaBranding?.widget_header_text || PLATFORM_DEFAULT_BRANDING.headerText,
    avatarUrl: empresaBranding?.widget_avatar_url || PLATFORM_DEFAULT_BRANDING.avatarUrl,
  };
}

// Convert border radius setting to CSS value
export function getBorderRadiusValue(setting: WidgetBorderRadius): string {
  switch (setting) {
    case 'normal':
      return '4px';
    case 'rounded':
      return '8px';
    case 'soft':
      return '16px';
    default:
      return '4px';
  }
}

// Get message bubble border radius (larger than base)
export function getMessageBorderRadius(setting: WidgetBorderRadius): string {
  switch (setting) {
    case 'normal':
      return '8px';
    case 'rounded':
      return '12px';
    case 'soft':
      return '20px';
    default:
      return '8px';
  }
}

// Get widget dimensions from size setting
export function getWidgetDimensions(size: WidgetSize): { width: number; height: number } {
  switch (size) {
    case 'small':
      return { width: 320, height: 450 };
    case 'large':
      return { width: 420, height: 600 };
    default:
      return { width: 380, height: 520 };
  }
}

// Generate CSS variables for the widget
export function generateWidgetCSSVariables(branding: WidgetBranding): Record<string, string> {
  const isDark = branding.themeMode === 'dark' || 
    (branding.themeMode === 'auto' && 
     typeof window !== 'undefined' && 
     window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  return {
    '--widget-primary': branding.primaryColor,
    '--widget-secondary': branding.secondaryColor,
    '--widget-background': isDark ? '#1f2937' : branding.backgroundColor,
    '--widget-user-message': branding.userMessageColor,
    '--widget-agent-message': isDark ? '#374151' : branding.agentMessageColor,
    '--widget-user-text': branding.userTextColor,
    '--widget-agent-text': isDark ? '#f9fafb' : branding.agentTextColor,
    '--widget-button': branding.buttonColor,
    '--widget-border-radius': getBorderRadiusValue(branding.borderRadius),
    '--widget-message-radius': getMessageBorderRadius(branding.borderRadius),
    '--widget-text-primary': isDark ? '#f9fafb' : '#111827',
    '--widget-text-secondary': isDark ? '#9ca3af' : '#6b7280',
    '--widget-border': isDark ? '#374151' : '#e5e7eb',
  };
}

// Check if a color is light (for text contrast)
export function isLightColor(hex: string): boolean {
  const color = hex.replace('#', '');
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}
