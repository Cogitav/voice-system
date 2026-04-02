import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MobileHeaderProps {
  onMenuToggle: () => void;
}

export function MobileHeader({ onMenuToggle }: MobileHeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background px-4 lg:hidden">
      <Button
        variant="ghost"
        size="icon"
        onClick={onMenuToggle}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <span className="text-sm font-semibold text-foreground">VoiceAI</span>
    </header>
  );
}
