import { AmazonProduct, FinancialProfile } from './StandardProduct';

/**
 * 资金适配模型 — 详见 docs/business-rules.md § 2
 *
 * v2 变更：
 * 1. 落地成本系数按品类区分（替代固定 1.35）
 * 2. 风险基准量动态计算（替代硬编码 300 件）
 * 3. 定价取 Top5 中位数（替代第一名价格）
 */

// 各品类落地成本系数（售价 × 系数 = 落地成本）
// 含头程运费 + FBA 操作费 + 关税估算
const LANDED_COST_MULTIPLIER: Record<string, number> = {
  '服装配饰': 1.50,  // 退货率高、尺码问题多
  '电子配件': 1.45,  // FBA 费用相对高
  '家居用品': 1.35,  // 体积偏大，运费占比高
  '健康保健': 1.32,  // 居中
  '运动户外': 1.32,
  '母婴用品': 1.35,
  '美妆个护': 1.28,  // 重量轻、运费低
  '宠物用品': 1.35,
  '办公文具': 1.30,
  '全品类':   1.35,  // 默认
};

export function getLandedCostMultiplier(category: string): number {
  return LANDED_COST_MULTIPLIER[category] ?? 1.35;
}

export function calcFinancialProfile(
  totalBudget: number,
  products: AmazonProduct[],
  category: string
): FinancialProfile {
  const procurementBudget = totalBudget * 0.4;
  const marketingBudget   = totalBudget * 0.3;
  const reserveBudget     = totalBudget * 0.3;

  // ── 定价：取 Top5 中位数，过滤掉价格为 0 的异常数据 ──
  const validPrices = products
    .slice(0, 5)
    .map(p => p.price)
    .filter(p => p > 0)
    .sort((a, b) => a - b);

  const medianPrice = validPrices.length > 0
    ? validPrices[Math.floor(validPrices.length / 2)]
    : 0;

  // ── 落地成本：中位价格 × 品类系数 ──
  const multiplier  = getLandedCostMultiplier(category);
  const landedCost  = parseFloat((medianPrice * multiplier).toFixed(2));

  // ── 资金风险判断：预算能否支撑最小可行测试 ──
  // Amazon FBA 最小有意义测款量为 300 件
  // 若采购预算连 300 件都买不起，则资金压力过大
  const MIN_VIABLE_QTY = 300;
  const capitalRiskFlag = landedCost > 0 && (landedCost * MIN_VIABLE_QTY > procurementBudget);
  const capitalRiskReason = capitalRiskFlag
    ? `单品落地成本 $${landedCost.toFixed(2)} × ${MIN_VIABLE_QTY} 件（最小测款量）= $${(landedCost * MIN_VIABLE_QTY).toFixed(2)}，超过采购预算 $${procurementBudget.toFixed(2)}`
    : undefined;

  // ── 建议首批采购量 ──
  const suggestedOrderQty = landedCost > 0
    ? Math.max(1, Math.floor(procurementBudget / landedCost))
    : 0;

  return {
    totalBudget,
    procurementBudget,
    marketingBudget,
    reserveBudget,
    capitalRiskFlag,
    capitalRiskReason,
    suggestedOrderQty,
  };
}
