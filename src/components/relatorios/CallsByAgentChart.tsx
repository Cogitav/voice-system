import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Users } from 'lucide-react';

interface AgentStats {
  id: string;
  nome: string;
  chamadas: number;
  sucesso: number;
  taxaSucesso: number;
}

interface CallsByAgentChartProps {
  data: AgentStats[];
  isLoading?: boolean;
}

export function CallsByAgentChart({ data, isLoading = false }: CallsByAgentChartProps) {
  const hasData = data.length > 0;

  if (isLoading) {
    return (
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center gap-2 mb-6">
          <Users className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Chamadas por Agente</h3>
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
          <Users className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Chamadas por Agente</h3>
        </div>
        <div className="h-[300px] flex flex-col items-center justify-center text-center">
          <Users className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-foreground font-medium">Sem dados disponíveis</p>
          <p className="text-sm text-muted-foreground">Não existem chamadas com agentes no período selecionado</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <Users className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Chamadas por Agente</h3>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              type="number"
              stroke="hsl(var(--muted-foreground))" 
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              dataKey="nome"
              type="category"
              stroke="hsl(var(--muted-foreground))" 
              fontSize={12}
              tickLine={false}
              axisLine={false}
              width={100}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                color: 'hsl(var(--foreground))',
              }}
              formatter={(value, name) => {
                if (name === 'chamadas') return [value, 'Total Chamadas'];
                if (name === 'sucesso') return [value, 'Sucesso'];
                return [value, name];
              }}
            />
            <Legend
              formatter={(value) => {
                if (value === 'chamadas') return <span className="text-muted-foreground text-sm">Total Chamadas</span>;
                if (value === 'sucesso') return <span className="text-muted-foreground text-sm">Sucesso</span>;
                return <span className="text-muted-foreground text-sm">{value}</span>;
              }}
            />
            <Bar dataKey="chamadas" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="chamadas" />
            <Bar dataKey="sucesso" fill="hsl(var(--success))" radius={[0, 4, 4, 0]} name="sucesso" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
