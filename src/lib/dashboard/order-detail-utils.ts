import type { HppEntry, MarketplaceId, RawOrder } from "@/lib/types";

export function normalizeOrderId(orderId: string): string {
	return String(orderId ?? "")
		.trim()
		.replace(/^'+/, "")
		.replace(/\.0+$/, "")
		.replace(/\s+/g, "")
		.toLowerCase();
}

function getRawValueByKey(rawData: Record<string, string> | undefined, candidates: string[]): string {
	if (!rawData) return "";
	const normalize = (value: string) =>
		String(value ?? "")
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, " ")
			.replace(/\s+/g, " ");

	const keys = Object.keys(rawData);
	for (const key of keys) {
		const keyNorm = normalize(key);
		if (candidates.some((candidate) => keyNorm.includes(candidate))) {
			return String(rawData[key] ?? "").trim();
		}
	}
	return "";
}

export function resolveLineSku(line: RawOrder): string {
	const direct = String(line.sku ?? "").trim();
	if (direct) return direct;
	return getRawValueByKey(line.rawData, [
		"nomor referensi sku",
		"sku reference no",
		"variation sku",
		"seller sku",
		"master sku",
		"sku",
	]);
}

export function dedupeOrderLines(lines: RawOrder[]): RawOrder[] {
	const seen = new Set<string>();
	const result: RawOrder[] = [];

	for (const line of lines) {
		const lineId = getRawValueByKey(line.rawData, [
			"id pesanan baris",
			"order item id",
			"order line id",
			"line id",
		]);
		const resolvedSku = resolveLineSku(line);

		const signature = lineId
			? `line:${lineId}`
			: [
					normalizeOrderId(line.orderId),
					resolvedSku.trim().toLowerCase(),
					String(line.productName ?? "").trim().toLowerCase(),
					String(line.qty ?? 0),
					String(line.actualPrice ?? 0),
					String(line.orderDate ?? "").trim().toLowerCase(),
			  ].join("|");

		if (seen.has(signature)) continue;
		seen.add(signature);
		result.push(line);
	}

	return result;
}

export function shouldUseAggregatedOrderView(marketplace: MarketplaceId): boolean {
	return marketplace === "lazada" || marketplace === "tokopedia" || marketplace === "shopee";
}

export type HppLookupResult = {
	cost: number;
	matchedEntry: HppEntry | null;
};

export function lookupHppMatchForLine(sku: string, productName: string, hppEntries: HppEntry[]): HppLookupResult {
	if (!hppEntries.length) return { cost: 0, matchedEntry: null };

	const normalizeSku = (value: string) =>
		String(value ?? "")
			.trim()
			.replace(/^'+/, "")
			.replace(/\.0+$/, "")
			.replace(/[^a-zA-Z0-9]+/g, "")
			.toLowerCase();

	const normalizeName = (value: string) =>
		String(value ?? "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, " ")
			.trim();
	const splitSkuAliases = (value: string): string[] =>
		String(value ?? "")
			.split(/[,\n;|/]+/g)
			.map((part) => normalizeSku(part))
			.filter(Boolean);

	const normalizedSku = normalizeSku(sku);
	const normalizedProductName = normalizeName(productName);

	if (normalizedSku) {
		const bySku = hppEntries.find((entry) => {
			if (entry.cost <= 0) return false;
			const aliases = new Set<string>([
				...splitSkuAliases(entry.sku),
				...splitSkuAliases(entry.masterSku || ""),
			]);
			return aliases.has(normalizedSku);
		});
		if (bySku) return { cost: bySku.cost, matchedEntry: bySku };
	}

	const scored = hppEntries
		.map((entry) => {
			const entryName = normalizeName(entry.productName);
			if (!entryName || !normalizedProductName) return { entry, score: 0 };
			if (entryName === normalizedProductName) return { entry, score: 100 };
			if (normalizedProductName.includes(entryName) || entryName.includes(normalizedProductName)) {
				return { entry, score: 80 };
			}

			const a = new Set(normalizedProductName.split(" ").filter(Boolean));
			const b = new Set(entryName.split(" ").filter(Boolean));
			const overlap = [...a].filter((token) => b.has(token)).length;
			return { entry, score: overlap >= 2 ? overlap * 10 : 0 };
		})
		.filter((item) => item.score > 0)
		.sort((x, y) => y.score - x.score);

	const withCost = scored.find((item) => item.entry.cost > 0);
	if (!withCost) {
		return {
			cost: scored[0]?.entry.cost ?? 0,
			matchedEntry: scored[0]?.entry ?? null,
		};
	}
	if (normalizedSku) {
		const distinctCosts = new Set(scored.map((item) => item.entry.cost).filter((cost) => cost > 0));
		if (distinctCosts.size !== 1) {
			return { cost: 0, matchedEntry: null };
		}
	}
	return { cost: withCost.entry.cost, matchedEntry: withCost.entry };
}

export function lookupHppForLine(sku: string, productName: string, hppEntries: HppEntry[]): number {
	return lookupHppMatchForLine(sku, productName, hppEntries).cost;
}

function parseQtyLoose(value: string): number {
	const num = parseInt(String(value ?? "").replace(/[^\d-]/g, ""), 10);
	if (!Number.isFinite(num) || Number.isNaN(num)) return 0;
	return Math.max(0, num);
}

export function normalizeSkuToken(value: string): string {
	return String(value ?? "")
		.trim()
		.replace(/^'+/, "")
		.replace(/\.0+$/, "")
		.replace(/[^a-zA-Z0-9]+/g, "")
		.toLowerCase();
}

export function getReturnedQtyFromOrderLines(lines: RawOrder[]): number {
	return lines.reduce((sum, line) => {
		const returned = getRawValueByKey(line.rawData, [
			"sku quantity of return",
			"qty return",
			"jumlah retur",
			"returned quantity",
		]);
		return sum + parseQtyLoose(returned);
	}, 0);
}

export function adjustLinesWithReturnQty(
	lines: RawOrder[],
	returnedQtyBySku: Map<string, number> | undefined,
	returnedQtyTotal: number,
	hasEmbeddedReturn: boolean,
): RawOrder[] {
	if (lines.length === 0 || hasEmbeddedReturn || returnedQtyTotal <= 0) return lines;

	const adjusted = lines.map((line) => ({ ...line }));
	let remaining = Math.max(0, returnedQtyTotal);

	if (returnedQtyBySku && returnedQtyBySku.size > 0) {
		for (const line of adjusted) {
			const skuKey = normalizeSkuToken(resolveLineSku(line));
			if (!skuKey) continue;
			const skuReturn = Math.max(0, returnedQtyBySku.get(skuKey) ?? 0);
			if (skuReturn <= 0) continue;
			const deduction = Math.min(line.qty, skuReturn, remaining);
			if (deduction > 0) {
				line.qty -= deduction;
				remaining -= deduction;
				returnedQtyBySku.set(skuKey, Math.max(0, skuReturn - deduction));
			}
			if (remaining <= 0) break;
		}
	}

	if (remaining > 0) {
		for (const line of adjusted) {
			if (remaining <= 0) break;
			if (line.qty <= 0) continue;
			const deduction = Math.min(line.qty, remaining);
			line.qty -= deduction;
			remaining -= deduction;
		}
	}

	return adjusted.filter((line) => line.qty > 0);
}

export function toOrderKey(marketplace: MarketplaceId, orderId: string): string {
	return `${marketplace}:${normalizeOrderId(orderId)}`;
}
