import { StandardProduct } from '../core/StandardProduct';

/**
 * 输出格式：Markdown 表格 + AI 总结
 *
 * 必含字段：
 * 商品 ID、爆发倍数、预估毛利、建议采购量、亚马逊竞争指数、AI 打法建议
 */
export function formatReport(products: StandardProduct[]): string {
  const lines: string[] = [];

  lines.push('# Spotter 选品报告\n');
  lines.push(`生成时间：${new Date().toLocaleString('zh-CN')}\n`);

  // ── 汇总表格 ──────────────────────────────────────────────
  lines.push('## 选品汇总\n');
  lines.push(
    '| # | 关键词 | SR 评分 | 爆发倍数 | 互动率 | 亚马逊搜索量 | 饱和度 | 均分 | 建议采购量 | 预估毛利率 | 资金风险 |'
  );
  lines.push(
    '|---|--------|---------|---------|--------|------------|--------|------|-----------|-----------|---------|'
  );

  products.forEach((p, i) => {
    const { keyword, tiktok, amazon, financial, score } = p;
    const grossMarginRate = estimateGrossMargin(p);
    const riskBadge = financial.capitalRiskFlag ? '⚠️ 极高' : '✅ 可控';

    lines.push(
      `| ${i + 1} | ${keyword} | ${score.sr.toFixed(3)} | ${tiktok.momentumMultiplier}x | ${(tiktok.engagementRate * 100).toFixed(1)}% | ${amazon.searchResults.toLocaleString()} | ${amazon.saturationIndex.toFixed(2)} | ${amazon.avgRating.toFixed(1)} | ${financial.suggestedOrderQty} 件 | ${grossMarginRate}% | ${riskBadge} |`
    );
  });

  // ── 每个商品详情 ───────────────────────────────────────────
  products.forEach((p, i) => {
    lines.push(`\n---\n`);
    lines.push(`## ${i + 1}. ${p.keyword}\n`);

    // 资金分配
    lines.push('### 资金分配 (4:3:3)\n');
    lines.push(`| 用途 | 金额 |`);
    lines.push(`|------|------|`);
    lines.push(`| 采购备货 (40%) | $${p.financial.procurementBudget.toFixed(0)} |`);
    lines.push(`| 营销推广 (30%) | $${p.financial.marketingBudget.toFixed(0)} |`);
    lines.push(`| 风险备用金 (30%) | $${p.financial.reserveBudget.toFixed(0)} |\n`);

    if (p.financial.capitalRiskFlag && p.financial.capitalRiskReason) {
      lines.push(`> ⚠️ **资金风险极高**：${p.financial.capitalRiskReason}\n`);
    }

    // 竞品 Top 5
    lines.push('### Amazon 竞品 Top 5\n');
    lines.push('| ASIN | 标题 | 评分 | 评论数 | 定价 | 落地成本 |');
    lines.push('|------|------|------|--------|------|---------|');
    p.amazon.topProducts.slice(0, 5).forEach((prod) => {
      lines.push(
        `| ${prod.asin} | ${prod.title.slice(0, 30)}... | ${prod.rating} | ${prod.reviewCount.toLocaleString()} | $${prod.price} | $${prod.estimatedLandedCost.toFixed(2)} |`
      );
    });

    // AI 决策卡片
    if (p.aiInsight) {
      lines.push('\n### AI 决策卡片\n');
      lines.push(`**总结**：${p.aiInsight.summary}\n`);
      lines.push(`**差异化策略**：${p.aiInsight.differentiationStrategy}\n`);
      lines.push(`**行动计划**：${p.aiInsight.actionPlan}\n`);
      if (p.aiInsight.keyRisks.length > 0) {
        lines.push('**关键风险**：');
        p.aiInsight.keyRisks.forEach((r) => lines.push(`- ${r}`));
      }
      lines.push('');
    }
  });

  return lines.join('\n');
}

function estimateGrossMargin(p: StandardProduct): string {
  const topProduct = p.amazon.topProducts[0];
  if (!topProduct || topProduct.price === 0) return 'N/A';
  const margin = ((topProduct.price - topProduct.estimatedLandedCost) / topProduct.price) * 100;
  return margin.toFixed(1);
}
