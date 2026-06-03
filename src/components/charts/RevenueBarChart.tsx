"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { MarketplaceSummary } from "@/lib/types";
import { MARKETPLACE_LABELS } from "@/lib/types";
import { formatRupiah } from "@/lib/utils";

interface Props {
  marketplaces: MarketplaceSummary[];
}

export default function RevenueBarChart({ marketplaces }: Props) {
  const data = marketplaces.map((m) => ({
    name: MARKETPLACE_LABELS[m.marketplace],
    Revenue: m.totalRevenue,
    "Gross Profit": m.totalGrossProfit,
    "Net Profit": m.totalNetProfit,
    "Biaya Platform": m.totalPlatformFees,
  }));

  const formatYAxis = (value: number) => {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}jt`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}rb`;
    return String(value);
  };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--chart-axis)" }} axisLine={{ stroke: "var(--chart-grid)" }} tickLine={{ stroke: "var(--chart-grid)" }} />
        <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11, fill: "var(--chart-axis)" }} axisLine={{ stroke: "var(--chart-grid)" }} tickLine={{ stroke: "var(--chart-grid)" }} />
        <Tooltip
          formatter={(value: number, name: string) => [formatRupiah(value), name]}
          cursor={{ fill: "transparent" }}
          contentStyle={{
            borderRadius: 12,
            border: "1px solid var(--chart-tooltip-border)",
            fontSize: 12,
            backgroundColor: "var(--chart-tooltip-bg)",
            color: "var(--foreground)",
          }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--chart-axis)" }} />
        <Bar
          dataKey="Revenue"
          fill="var(--chart-revenue)"
          radius={[5, 5, 0, 0]}
          activeBar={{ stroke: "var(--foreground)", strokeOpacity: 0.4, strokeWidth: 1.3, fillOpacity: 1 }}
        />
        <Bar
          dataKey="Gross Profit"
          fill="var(--chart-gross)"
          radius={[5, 5, 0, 0]}
          activeBar={{ stroke: "var(--foreground)", strokeOpacity: 0.4, strokeWidth: 1.3, fillOpacity: 1 }}
        />
        <Bar
          dataKey="Net Profit"
          fill="var(--chart-net)"
          radius={[5, 5, 0, 0]}
          activeBar={{ stroke: "var(--foreground)", strokeOpacity: 0.4, strokeWidth: 1.3, fillOpacity: 1 }}
        />
        <Bar
          dataKey="Biaya Platform"
          fill="var(--chart-fee)"
          radius={[5, 5, 0, 0]}
          activeBar={{ stroke: "var(--foreground)", strokeOpacity: 0.4, strokeWidth: 1.3, fillOpacity: 1 }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
