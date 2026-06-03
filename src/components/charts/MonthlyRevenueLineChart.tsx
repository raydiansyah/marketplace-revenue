"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatRupiah } from "@/lib/utils";

interface TrendPoint {
  dayLabel: string;
  revenue: number;
  netProfit: number;
}

interface Props {
  data: TrendPoint[];
}

export default function MonthlyRevenueLineChart({ data }: Props) {
  const formatYAxis = (value: number) => {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}jt`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}rb`;
    return String(value);
  };

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis
          dataKey="dayLabel"
          tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
          axisLine={{ stroke: "var(--chart-grid)" }}
          tickLine={{ stroke: "var(--chart-grid)" }}
        />
        <YAxis
          tickFormatter={formatYAxis}
          tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
          axisLine={{ stroke: "var(--chart-grid)" }}
          tickLine={{ stroke: "var(--chart-grid)" }}
        />
        <Tooltip
          formatter={(value: number, name: string) => [formatRupiah(value), name]}
          contentStyle={{
            borderRadius: 12,
            border: "1px solid var(--chart-tooltip-border)",
            fontSize: 12,
            backgroundColor: "var(--chart-tooltip-bg)",
            color: "var(--foreground)",
          }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--chart-axis)" }} />
        <Line
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke="var(--chart-revenue)"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="netProfit"
          name="Net Profit"
          stroke="var(--chart-net)"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
