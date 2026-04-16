import { TikTokSignal, AmazonMetrics, SpotterScore, Recommendation } from './StandardProduct';

/**
 * SR 评分算法 — 详见 docs/business-rules.md § 1
 *
 * v2 公式：
 * SR = (Momentum × 0.5) + (CompetitionScore × 0.3) + (RatingOpportunity × 0.2)
 */
export function calcSpotterRank(tiktok: TikTokSignal, amazon: AmazonMetrics): SpotterScore {
  // ── Momentum（流量爆发，0~1）──────────────────────────────
  // 以 10 倍爆发为满分，超过 10 倍不额外加分
  const normalizedMomentum = Math.min(tiktok.momentumMultiplier / 10, 1.0);

  // ── CompetitionScore（竞争空间，0~1）─────────────────────
  // 对数曲线：避免低竞争市场全部拿满分，保留区分度
  // log10(1 + searchResults/1000)：
  //   1,000  条结果 → log10(2)   ≈ 0.30 → score ≈ 0.77
  //   10,000 条结果 → log10(11)  ≈ 1.04 → score ≈ 0.49
  //   100,000条结果 → log10(101) ≈ 2.00 → score ≈ 0.33
  //   500,000条结果 → log10(501) ≈ 2.70 → score ≈ 0.27
  const logSaturation = Math.log10(1 + Math.max(amazon.searchResults, 0) / 1000);
  const competitionScore = Math.max(0, 1 - logSaturation / (logSaturation + 1));

  // ── RatingOpportunity（评分机会，0~1）────────────────────
  // 竞品均分越低，说明消费者越不满意，改进空间越大
  // 以满分 5.0 为基准，低于 4.2 开始明显加分
  // 均分 4.8 → 0.04，均分 4.2 → 0.16，均分 3.5 → 0.30
  const ratingOpportunity = Math.max(0, (5.0 - amazon.avgRating) / 5.0);

  const momentumComponent     = parseFloat((normalizedMomentum  * 0.5).toFixed(4));
  const saturationComponent   = parseFloat((competitionScore    * 0.3).toFixed(4));
  const opportunityComponent  = parseFloat((ratingOpportunity   * 0.2).toFixed(4));
  const sr = parseFloat((momentumComponent + saturationComponent + opportunityComponent).toFixed(4));

  return { sr, momentumComponent, saturationComponent, opportunityComponent };
}

/**
 * SR 评分 → 4 档推荐等级
 * 阈值规则详见 docs/business-rules.md § 1
 */
export function getRecommendation(sr: number): Recommendation {
  if (sr >= 0.75) {
    return {
      level: 'strong',
      label: '强烈推荐',
      title: '黄金机会',
      reason: 'TikTok 热度极高，亚马逊几乎无竞争，你资金非常充沛。',
    };
  }
  if (sr >= 0.55) {
    return {
      level: 'consider',
      label: '可以考虑',
      title: '优质潜力',
      reason: '有明确的市场需求和流量动能，但需要通过差异化竞争。',
    };
  }
  if (sr >= 0.35) {
    return {
      level: 'caution',
      label: '谨慎观望',
      title: '平庸机会',
      reason: '流量在衰减或者亚马逊已经很卷了，利润空间有限。',
    };
  }
  return {
    level: 'avoid',
    label: '不建议入场',
    title: '红海/死海',
    reason: '竞争太大且没有爆发动能。',
  };
}
