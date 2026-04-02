import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Target } from 'lucide-react';

interface IntentStats {
  name: string;
  value: number;
}

interface CallsByIntentChartProps {
  data: IntentStats[];
  isLoading?: boolean;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(199, 89%, 48%)',
  'hsl(280, 65%, 60%)',
  'hsl(38, 92%, 50%)',
  'hsl(340, 82%, 52%)',
];

export function CallsByIntentChart({ data, isLoading = false }: CallsByIntentChartProps) {
  const hasData = data.length > 0 && data.some(item => item.value > 0);

  if (isLoading) {
    return (
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center gap-2 mb-6">
          <Target className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Chamadas por Intenção</h3>
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
          <Target className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Chamadas por Intenção</h3>
        </div>
        <div className="h-[300px] flex flex-col items-center justify-center text-center">
          <Target className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-foreground font-medium">Sem intenções detetadas</p>
          <p className="text-sm text-muted-foreground">Não existem chamadas com intenções no período selecionado</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <Target className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Chamadas por Intenção</h3>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={4}
              dataKey="value"
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
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
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
