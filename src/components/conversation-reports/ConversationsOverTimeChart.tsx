import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, MessageSquare } from 'lucide-react';

interface ChartDataPoint {
  name: string;
  conversations: number;
  closed: number;
}

interface ConversationsOverTimeChartProps {
  data: ChartDataPoint[];
  isLoading?: boolean;
}

export function ConversationsOverTimeChart({ data, isLoading = false }: ConversationsOverTimeChartProps) {
  const hasData = data.length > 0 && data.some(item => item.conversations > 0 || item.closed > 0);

  if (isLoading) {
    return (
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Conversas ao Longo do Tempo</h3>
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
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Conversas ao Longo do Tempo</h3>
        </div>
        <div className="h-[300px] flex flex-col items-center justify-center text-center">
          <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-foreground font-medium">Sem dados disponíveis</p>
          <p className="text-sm text-muted-foreground">Não existem conversas no período selecionado</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Conversas ao Longo do Tempo</h3>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorConversations" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorClosed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="name" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                color: 'hsl(var(--foreground))',
              }}
            />
            <Legend 
              formatter={(value) => (
                <span className="text-muted-foreground text-sm">
                  {value === 'conversations' ? 'Total' : 'Encerradas'}
                </span>
              )}
            />
            <Area
              type="monotone"
              dataKey="conversations"
              name="conversations"
              stroke="hsl(var(--primary))"
              fill="url(#colorConversations)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="closed"
              name="closed"
              stroke="hsl(var(--success))"
              fill="url(#colorClosed)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
