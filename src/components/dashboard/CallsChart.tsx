import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';

interface CallsChartProps {
  data: Array<{
    name: string;
    chamadas: number;
    sucesso: number;
  }>;
  title?: string;
  isLoading?: boolean;
}

export function CallsChart({ data, title = 'Volume de Chamadas', isLoading = false }: CallsChartProps) {
  const hasData = data.some(item => item.chamadas > 0);

  if (isLoading) {
    return (
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">{title}</h3>
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
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>
        <div className="h-[300px] flex flex-col items-center justify-center text-center">
          <TrendingUp className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-foreground font-medium">Sem chamadas registadas</p>
          <p className="text-sm text-muted-foreground">Não existem chamadas nos últimos 7 dias</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorChamadas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(173, 80%, 40%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(173, 80%, 40%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorSucesso" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 17%)" />
            <XAxis 
              dataKey="name" 
              stroke="hsl(215, 20%, 55%)" 
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke="hsl(215, 20%, 55%)" 
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(222, 47%, 8%)',
                border: '1px solid hsl(217, 33%, 17%)',
                borderRadius: '8px',
                color: 'hsl(210, 40%, 98%)',
                padding: '8px 12px',
                fontSize: '13px',
              }}
              labelStyle={{ color: 'hsl(215, 20%, 55%)', marginBottom: '4px' }}
              itemStyle={{ padding: '2px 0' }}
            />
            <Area
              type="monotone"
              dataKey="chamadas"
              stroke="hsl(173, 80%, 40%)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorChamadas)"
              name="Total Chamadas"
            />
            <Area
              type="monotone"
              dataKey="sucesso"
              stroke="hsl(142, 76%, 36%)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorSucesso)"
              name="Sucesso"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
