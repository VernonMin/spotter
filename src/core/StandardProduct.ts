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
  engagementRate: number;
  momentumMultiplier: number;
  videoUrl?: string;   // TikTok 视频链接
  coverUrl?: string;   // 视频封面图（有效期约 24h）
  videoDesc?: string;  // 视频文案（创作者描述）
  hashtags?: string[]; // 视频标签列表
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
  estimatedLandedCost: number;
  imageUrl?: string;   // 商品主图
  productUrl?: string; // Amazon 商品页链接
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
  tiktokDemandVideos?: TikTokSignal[];  // AI 标记的所有商品需求视频
  amazon: AmazonMetrics;
  financial: FinancialProfile;
  score: SpotterScore;

  recommendation: Recommendation;

  // AI 生成的决策卡片
  aiInsight?: AIInsight;
}

export interface AIInsight {
  hasDemand: boolean;              // AI 判定：TikTok 视频是否反映真实商品购买需求
  demandReason: string;            // AI 判定理由
  demandVideoIndices: number[];    // AI 标记的商品需求视频序号（1-based）
  viralFeature: string;            // 爆发功能点：一句话说明该品为何爆发
  differentiationStrategy: string;
  keyRisks: string[];
  actionPlan: string;
  summary: string;
}

export interface FilterConfig {
  maxAuthorFollowers: number;      // 排除粉丝超过此值的大号，默认 100,000
  minPlayCount: number;            // 最低播放量，默认 100,000
  minEngagementRate: number;       // 最低互动率（digg/play），默认 0.03 = 3%
  publishTimeDays: number;         // 只看最近 N 天内发布的视频，默认 7
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
