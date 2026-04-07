"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { MarketplaceSummary } from "@/lib/types";
import { formatRupiah } from "@/lib/utils";

interface Props {
  marketplaces: MarketplaceSummary[];
}

const FEE_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"];

export default function FeePieChart({ marketplaces }: Props) {
  const combined = marketplaces.reduce(
    (acc, m) => ({
      commission: acc.commission + m.feeBreakdown.commission,
      transactionFee: acc.transactionFee + m.feeBreakdown.transactionFee,
      freeShipping: acc.freeShipping + m.feeBreakdown.freeShipping,
      orderProcessing: acc.orderProcessing + m.feeBreakdown.orderProcessing,
      voucher: acc.voucher + m.feeBreakdown.voucher,
      affiliate: acc.affiliate + m.feeBreakdown.affiliate,
      other: acc.other + m.feeBreakdown.other,
    }),
    {
      commission: 0,
      transactionFee: 0,
      freeShipping: 0,
      orderProcessing: 0,
      voucher: 0,
      affiliate: 0,
      other: 0,
    }
  );

  const data = [
    { name: "Komisi Platform", value: combined.commission },
    { name: "Transaction Fee", value: combined.transactionFee },
    { name: "Subsidi Ongkir", value: combined.freeShipping },
    { name: "Order Processing", value: combined.orderProcessing },
    { name: "Voucher Seller", value: combined.voucher },
    { name: "Komisi Affiliate", value: combined.affiliate },
    { name: "Biaya Lain", value: combined.other },
  ].filter((d) => d.value > 0);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((_, index) => (
            <Cell key={index} fill={FEE_COLORS[index % FEE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number, name: string) => [formatRupiah(value), name]}
          contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
