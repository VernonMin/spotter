/**
 * StandardProduct — 统一数据接口
 * 将 TikTok 信号与 Amazon 数据归一化为同一结构
 */

export interface TikTokSignal {
  videoId: string;
  keyword: string;
  playCount: number;
  diggCount: number;
  commentCount: number;
  shareCount: number;
  authorFollowers: number;
  publishedAt: string;
  // 互动率 = diggCount / playCount
  engagementRate: number;
  // 7天内播放量爆发倍数（相对基线）
  momentumMultiplier: number;
}

export interface AmazonMetrics {
  keyword: string;
  searchResults: number;
  topProducts: AmazonProduct[];
  avgRating: number;
  // 饱和度指数：搜索结果越多越高
  saturationIndex: number;
  // 负面痛点（avgRating < 4.2 时由 AI 提炼）
  negativePainPoints?: string[];
}

export interface AmazonProduct {
  asin: string;
  title: string;
  rating: number;
  reviewCount: number;
  price: number;
  // 落地成本 = 采购价 + 国际运费 + FBA 费用
  estimatedLandedCost: number;
}

export interface FinancialProfile {
  totalBudget: number;
  procurementBudget: number;   // 40%
  marketingBudget: number;     // 30%
  reserveBudget: number;       // 30%
  // 是否触发资金风险警告
  capitalRiskFlag: boolean;
  capitalRiskReason?: string;
  // 建议首批采购数量
  suggestedOrderQty: number;
}

export interface SpotterScore {
  sr: number;
  momentumComponent: number;    // TikTok 爆发 × 0.5
  saturationComponent: number;  // 竞争空间 × 0.3
  opportunityComponent: number; // 评分机会 × 0.2
}

export type RecommendationLevel = 'strong' | 'consider' | 'caution' | 'avoid';

export interface Recommendation {
  level: RecommendationLevel;
  label: string;   // 商业建议，例：强烈推荐
  title: string;   // 状态标题，例：黄金机会
  reason: string;  // 状态说明
}

export interface StandardProduct {
  id: string;
  keyword: string;
  category: string;

  tiktok: TikTokSignal;
  amazon: AmazonMetrics;
  financial: FinancialProfile;
  score: SpotterScore;

  recommendation: Recommendation;

  // AI 生成的决策卡片
  aiInsight?: AIInsight;
}

export interface AIInsight {
  differentiationStrategy: string;
  keyRisks: string[];
  actionPlan: string;
  summary: string;
}

export interface FilterConfig {
  maxAuthorFollowers: number;  // 排除粉丝超过此值的大号，默认 100,000
  minPlayCount: number;        // 最低播放量，默认 100,000
  minEngagementRate: number;   // 最低互动率（digg/play），默认 0.03 = 3%
  publishTimeDays: number;     // 只看最近 N 天内发布的视频，默认 7
}

export const DEFAULT_FILTER: FilterConfig = {
  maxAuthorFollowers: 100_000,
  minPlayCount: 100_000,
  minEngagementRate: 0.03,
  publishTimeDays: 7,
};

export type SocialPlatform = 'tiktok'; // 后续扩展：'instagram' | 'youtube' | 'xiaohongshu'

export interface ScanInput {
  totalBudget: number;
  platform: SocialPlatform;
  category?: string;          // 可选，为空则不限品类
  keywords: string[];
  filter?: Partial<FilterConfig>;
}
