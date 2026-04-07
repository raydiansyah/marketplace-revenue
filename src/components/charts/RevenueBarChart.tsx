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
import { MARKETPLACE_LABELS, MARKETPLACE_COLORS } from "@/lib/types";
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
    color: MARKETPLACE_COLORS[m.marketplace],
  }));

  const formatYAxis = (value: number) => {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}jt`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}rb`;
    return String(value);
  };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value: number, name: string) => [formatRupiah(value), name]}
          contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Gross Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Net Profit" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Biaya Platform" fill="#ef4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
