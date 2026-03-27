import { Bot, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SETTING_KEYS, AGENT_TONES, SettingKey } from '@/hooks/useSettings';

interface AgentDefaultsSettingsProps {
  settings: Record<string, any>;
  onSettingChange: (key: SettingKey, value: any) => void;
  isLoading?: boolean;
}

export function AgentDefaultsSettings({ 
  settings, 
  onSettingChange,
  isLoading 
}: AgentDefaultsSettingsProps) {
  const agentTone = settings[SETTING_KEYS.AGENT_DEFAULT_TONE] || 'balanced';

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-secondary/50">
            <Bot className="h-5 w-5 text-secondary-foreground" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">Comportamento dos Agentes</CardTitle>
            <CardDescription className="mt-1">
              Defina os valores padrão para novos agentes de atendimento. 
              Cada agente pode ter configurações personalizadas posteriormente.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert className="bg-muted/50 border-muted-foreground/20">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Estas definições aplicam-se apenas a <strong>novos agentes</strong> criados após esta alteração. 
            Os agentes existentes mantêm as suas configurações individuais.
          </AlertDescription>
        </Alert>

        {/* Agent Tone */}
        <div className="p-4 rounded-lg border bg-muted/30">
          <Label htmlFor="agent-tone" className="font-medium">
            Tom de comunicação padrão
          </Label>
          <p className="text-sm text-muted-foreground mt-1 mb-3">
            Define como os novos agentes comunicam com os clientes por defeito.
          </p>
          <Select
            value={agentTone}
            onValueChange={(value) => onSettingChange(SETTING_KEYS.AGENT_DEFAULT_TONE, value)}
            disabled={isLoading}
          >
            <SelectTrigger className="max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGENT_TONES.map((tone) => (
                <SelectItem key={tone.value} value={tone.value}>
                  {tone.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Tone Preview */}
          <div className="mt-3 p-3 rounded-md bg-background border">
            <p className="font-medium text-sm text-foreground mb-1">
              {AGENT_TONES.find(t => t.value === agentTone)?.label}:
            </p>
            <p className="text-sm text-muted-foreground">
              {AGENT_TONES.find(t => t.value === agentTone)?.description}
            </p>
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground mb-1.5">Exemplo de saudação:</p>
              <p className="text-sm italic text-foreground">
                {agentTone === 'formal' && '"Bom dia. Em que posso ajudá-lo?"'}
                {agentTone === 'balanced' && '"Olá! Como posso ajudar hoje?"'}
                {agentTone === 'friendly' && '"Olá! 😊 Fico feliz em ajudar! O que precisa?"'}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}