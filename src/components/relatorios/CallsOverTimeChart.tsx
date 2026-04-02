import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp } from 'lucide-react';

interface CallsOverTimeChartProps {
  data: Array<{
    name: string;
    chamadas: number;
    agendamentos: number;
  }>;
  isLoading?: boolean;
}

export function CallsOverTimeChart({ data, isLoading = false }: CallsOverTimeChartProps) {
  const hasData = data.some(item => item.chamadas > 0 || item.agendamentos > 0);

  if (isLoading) {
    return (
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Chamadas ao Longo do Tempo</h3>
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
          <h3 className="font-semibold text-foreground">Chamadas ao Longo do Tempo</h3>
        </div>
        <div className="h-[300px] flex flex-col items-center justify-center text-center">
          <TrendingUp className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-foreground font-medium">Sem dados disponíveis</p>
          <p className="text-sm text-muted-foreground">Não existem chamadas no período selecionado</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Chamadas ao Longo do Tempo</h3>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorChamadas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorAgendamentos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="name" 
              stroke="hsl(var(--muted-foreground))" 
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))" 
              fontSize={12}
              tickLine={false}
              axisLine={false}
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
              formatter={(value) => <span className="text-muted-foreground text-sm">{value}</span>}
            />
            <Area
              type="monotone"
              dataKey="chamadas"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorChamadas)"
              name="Chamadas"
            />
            <Area
              type="monotone"
              dataKey="agendamentos"
              stroke="hsl(var(--success))"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorAgendamentos)"
              name="Agendamentos"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
