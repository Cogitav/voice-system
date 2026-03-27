import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CheckCircle2 } from 'lucide-react';

interface ResultStats {
  name: string;
  value: number;
}

interface ConversationsByResultChartProps {
  data: ResultStats[];
  isLoading?: boolean;
}

export function ConversationsByResultChart({ data, isLoading = false }: ConversationsByResultChartProps) {
  const hasData = data.length > 0 && data.some(item => item.value > 0);

  if (isLoading) {
    return (
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center gap-2 mb-6">
          <CheckCircle2 className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Resultado das Conversas</h3>
        </div>
        <div className="h-[300px] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center gap-2 mb-6">
          <CheckCircle2 className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Resultado das Conversas</h3>
        </div>
        <div className="h-[300px] flex flex-col items-center justify-center text-center">
          <CheckCircle2 className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-foreground font-medium">Sem resultados registados</p>
          <p className="text-sm text-muted-foreground">Não existem conversas encerradas com resultado no período</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <CheckCircle2 className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Resultado das Conversas</h3>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 10, right: 30, left: 80, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              type="number"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis 
              type="category"
              dataKey="name"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              width={70}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                color: 'hsl(var(--foreground))',
              }}
            />
            <Bar 
              dataKey="value" 
              fill="hsl(var(--primary))" 
              radius={[0, 4, 4, 0]}
              name="Conversas"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
