import { useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { Palette, Layout, Type, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AppearanceTab } from './branding/AppearanceTab';
import { BrandingColorsTab } from './branding/BrandingColorsTab';
import { BrandingContentTab } from './branding/BrandingContentTab';
import { LiveWidgetPreview } from './branding/LiveWidgetPreview';

interface WidgetBrandingSettingsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  empresaNome?: string;
}

const SUB_TABS = [
  { id: 'appearance', label: 'Aparência', icon: Layout },
  { id: 'colors', label: 'Cores', icon: Palette },
  { id: 'content', label: 'Conteúdo', icon: Type },
] as const;

type SubTabId = typeof SUB_TABS[number]['id'];

export function WidgetBrandingSettings({ form, empresaNome }: WidgetBrandingSettingsProps) {
  const [activeTab, setActiveTab] = useState<SubTabId>('appearance');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'appearance':
        return <AppearanceTab form={form} />;
      case 'colors':
        return <BrandingColorsTab form={form} />;
      case 'content':
        return <BrandingContentTab form={form} />;
      default:
        return null;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr,280px] gap-6">
      {/* Left: Configuration Controls */}
      <div className="space-y-4">
        {/* Sub-tabs Navigation */}
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
          {SUB_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center',
                  activeTab === tab.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content with internal scroll */}
        <ScrollArea className="h-[calc(90vh-340px)] min-h-[320px] max-h-[450px]">
          <div className="pr-4 pb-8">
            {renderTabContent()}
          </div>
        </ScrollArea>
      </div>

      {/* Right: Sticky Live Preview */}
      <div className="lg:sticky lg:top-0 lg:self-start">
        <div className="bg-muted/30 rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Preview</span>
          </div>
          <LiveWidgetPreview form={form} empresaNome={empresaNome} />
        </div>
      </div>
    </div>
  );
}
