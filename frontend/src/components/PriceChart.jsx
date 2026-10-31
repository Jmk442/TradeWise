import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";

const COLORS = { entry: "hsl(var(--primary))", stop: "hsl(var(--down))", target: "hsl(var(--up))", level: "hsl(var(--muted-foreground))" };

export const PriceChart = ({ data, lines = [], height = 220, intraday = false, testid = "price-chart" }) => {
  if (!data?.length) return <div className="grid h-24 place-items-center text-sm text-muted-foreground">No chart data available</div>;
  const values = data.map((d) => d.c).concat(lines.map((l) => l.y));
  const min = Math.min(...values), max = Math.max(...values);
  const pad = (max - min) * 0.08 || 1;
  const up = data[data.length - 1].c >= data[0].c;
  const stroke = up ? "hsl(var(--up))" : "hsl(var(--down))";
  const fmt = (t) => new Date(t * 1000).toLocaleString([], { timeZone: "Australia/Sydney", ...(intraday ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }) });
  return (
    <div style={{ height }} data-testid={testid}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`g-${testid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.25} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" tickFormatter={fmt} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis domain={[min - pad, max + pad]} width={56} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => v.toFixed(v < 10 ? 2 : 0)} />
          <Tooltip labelFormatter={(t) => `${new Date(t * 1000).toLocaleString([], { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" })} Syd`} formatter={(v) => [v.toFixed(2), "Price"]}
            contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
          {lines.map((l) => (
            <ReferenceLine key={l.label} y={l.y} stroke={COLORS[l.kind] || COLORS.level} strokeDasharray="4 4"
              label={{ value: l.label, position: "insideTopRight", fill: COLORS[l.kind] || COLORS.level, fontSize: 11 }} />
          ))}
          <Area type="monotone" dataKey="c" stroke={stroke} strokeWidth={2} fill={`url(#g-${testid})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
