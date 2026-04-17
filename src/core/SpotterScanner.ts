import { TikHubAdapter } from '../adapters/TikHubAdapter';
import { AmazonAdapter } from '../adapters/AmazonAdapter';
import { InsightEngine } from '../ai/InsightEngine';
import { calcSpotterRank, getRecommendation } from './SpotterRank';
import { calcFinancialProfile } from './FinancialEngine';
import { StandardProduct, ScanInput, TikTokSignal } from './StandardProduct';

interface SpotterScannerConfig {
  tikhubApiKey: string;
  amazonApiKey: string;
  deepseekApiKey: string;
  amazonProvider?: 'serpapi' | 'mock';
}

export interface FinancialSummary {
  totalBudget: number;
  procurementBudget: number;
  marketingBudget: number;
  reserveBudget: number;
  suggestedOrderQty: number;
  capitalRiskFlag: boolean;
  capitalRiskReason?: string;
}

export interface TikTokDetail {
  videoId: string;
  playCount: number;
  diggCount: number;
  engagementRate: number;
  momentumMultiplier: number;
  authorFollowers: number;
  publishedAt: string;
  videoUrl?: string;
  coverUrl?: string;
}

export interface AmazonDetail {
  searchResults: number;
  saturationIndex: number;
  avgRating: number;
  topProducts: Array<{
    asin: string;
    title: string;
    price: number;
    rating: number;
    reviewCount: number;
    imageUrl?: string;
    productUrl?: string;
  }>;
}

export interface DemandDetail {
  hasDemand: boolean;
  demandReason: string;
  summary: string;
  viralFeature: string;
  demandVideoCount?: number;
  totalVideoCount?: number;
}

export interface ProgressEvent {
  keyword: string;
  step: 1 | 2 | 3 | 4;
  stepName: string;
  status: 'running' | 'done' | 'skipped' | 'error';
  message?: string;
  tiktokDetail?: TikTokDetail;
  tiktokAllVideos?: TikTokDetail[];
  amazonDetail?: AmazonDetail;
  financial?: FinancialSummary;
  demandDetail?: DemandDetail;
}

type ProgressCallback = (event: ProgressEvent) => void;

/**
 * SpotterScanner — 主流程编排器
 *
 * v2 流程：
 * Discovery(TikTok, 不过滤) -> Validation(Amazon) -> 需求判定 + 决策卡片 -> SR 评分 & 资金适配
 *
 * 核心变化：AI 从最后一步提前到第三步作为"守门人"
 * - TikTok 不再做客户端过滤，全部 20 条视频交给 AI 判断
 * - AI 判定是否存在真实商品购买需求
 * - 仅在 AI 确认有需求时才执行 SR 评分
 */
export class SpotterScanner {
  private tiktok: TikHubAdapter;
  private amazon: AmazonAdapter;
  private insight: InsightEngine;
  private onProgress?: ProgressCallback;

  constructor(config: SpotterScannerConfig, onProgress?: ProgressCallback) {
    this.tiktok = new TikHubAdapter({ apiKey: config.tikhubApiKey });
    this.amazon = new AmazonAdapter({
      apiKey: config.amazonApiKey,
      provider: config.amazonProvider ?? (config.amazonApiKey === 'MOCK' ? 'mock' : 'serpapi'),
    });
    this.insight = new InsightEngine(config.deepseekApiKey);
    this.onProgress = onProgress;
  }

  private emit(event: ProgressEvent) {
    // 同时输出到控制台
    const icon = event.status === 'done' ? '✅' : event.status === 'error' ? '❌' : event.status === 'skipped' ? 'ℹ️' : '⏳';
    console.log(`  ${icon} [${event.step}/4] ${event.stepName}${event.message ? ': ' + event.message : ''}`);
    this.onProgress?.(event);
  }

  async scan(input: ScanInput): Promise<StandardProduct[]> {
    const { totalBudget, category, keywords, platform } = input;
    const results: StandardProduct[] = [];
    const categoryLabel = category?.trim() || '全品类';
    const publishTimeDays = input.filter?.publishTimeDays ?? 7;

    console.log(`\n🔍 开始扫描 [${platform.toUpperCase()}] 品类：${categoryLabel}，预算：$${totalBudget.toLocaleString()}`);
    console.log(`📋 关键词列表：${keywords.join(', ')}\n`);

    for (const keyword of keywords) {
      console.log(`\n── ${keyword} ──`);

      // Step 1: TikTok Discovery — 获取全部视频，不做客户端过滤
      this.emit({ keyword, step: 1, stepName: 'TikTok 信号抓取', status: 'running' });
      let allVideos: TikTokSignal[];
      try {
        allVideos = await this.tiktok.fetchAllSignals(keyword, publishTimeDays);
      } catch (err) {
        this.emit({ keyword, step: 1, stepName: 'TikTok 信号抓取', status: 'error', message: String(err) });
        continue;
      }

      if (allVideos.length === 0) {
        this.emit({ keyword, step: 1, stepName: 'TikTok 信号抓取', status: 'skipped', message: '无搜索结果' });
        continue;
      }

      // 按爆发倍数排序，取最优视频用于展示
      const sorted = [...allVideos].sort((a, b) => b.momentumMultiplier - a.momentumMultiplier);
      const topSignal = sorted[0];
      topSignal.keyword = keyword;

      const toDetail = (v: TikTokSignal): TikTokDetail => ({
        videoId: v.videoId,
        playCount: v.playCount,
        diggCount: v.diggCount,
        engagementRate: v.engagementRate,
        momentumMultiplier: v.momentumMultiplier,
        authorFollowers: v.authorFollowers,
        publishedAt: v.publishedAt,
        videoUrl: v.videoUrl,
        coverUrl: v.coverUrl,
      });

      this.emit({
        keyword, step: 1, stepName: 'TikTok 信号抓取', status: 'done',
        message: `${allVideos.length} 条视频`,
        tiktokDetail: toDetail(topSignal),
        tiktokAllVideos: sorted.map(toDetail),
      });

      // Step 2: Amazon Validation
      this.emit({ keyword, step: 2, stepName: 'Amazon 竞争验证', status: 'running' });
      let amazonMetrics;
      try {
        amazonMetrics = await this.amazon.fetchMetrics(keyword);
      } catch (err) {
        this.emit({ keyword, step: 2, stepName: 'Amazon 竞争验证', status: 'error', message: String(err) });
        continue;
      }
      this.emit({
        keyword, step: 2, stepName: 'Amazon 竞争验证', status: 'done',
        message: `搜索量 ${amazonMetrics.searchResults.toLocaleString()}`,
        amazonDetail: {
          searchResults: amazonMetrics.searchResults,
          saturationIndex: amazonMetrics.saturationIndex,
          avgRating: amazonMetrics.avgRating,
          topProducts: amazonMetrics.topProducts.slice(0, 5).map(p => ({
            asin: p.asin,
            title: p.title,
            price: p.price,
            rating: p.rating,
            reviewCount: p.reviewCount,
            imageUrl: p.imageUrl,
            productUrl: p.productUrl,
          })),
        },
      });

      // 先计算资金（AI prompt 需要用到）
      const financial = calcFinancialProfile(totalBudget, amazonMetrics.topProducts, categoryLabel);

      // Step 3: 需求判定 + 决策卡片（守门人）
      this.emit({ keyword, step: 3, stepName: '需求判定', status: 'running' });

      // 临时构建 product 用于传给 AI（score 暂用占位值）
      const tempProduct: StandardProduct = {
        id: `${keyword.replace(/\s+/g, '_')}_${Date.now()}`,
        keyword,
        category: categoryLabel,
        tiktok: topSignal,
        amazon: amazonMetrics,
        financial,
        score: { sr: 0, momentumComponent: 0, saturationComponent: 0, opportunityComponent: 0 },
        recommendation: getRecommendation(0),
      };

      let aiInsight;
      try {
        aiInsight = await this.insight.generateInsight(tempProduct, allVideos);
        const demandCount = aiInsight.demandVideoIndices.length;
        const demandIcon = aiInsight.hasDemand
          ? `✓ ${demandCount}/${allVideos.length} 条视频有商品需求`
          : '✗ 无明显商品需求';
        this.emit({
          keyword, step: 3, stepName: '需求判定', status: 'done',
          message: demandIcon,
          demandDetail: {
            hasDemand: aiInsight.hasDemand,
            demandReason: aiInsight.demandReason,
            summary: aiInsight.summary,
            viralFeature: aiInsight.viralFeature,
            demandVideoCount: demandCount,
            totalVideoCount: allVideos.length,
          },
        });
      } catch (err) {
        this.emit({ keyword, step: 3, stepName: '需求判定', status: 'error', message: String(err) });
        // AI 失败时仍然继续，按有需求处理
        aiInsight = undefined;
      }

      // 根据 AI 标记的商品视频，选出真正的 topSignal
      let demandVideos: TikTokSignal[] = [];
      if (aiInsight?.demandVideoIndices?.length) {
        demandVideos = aiInsight.demandVideoIndices
          .map(i => allVideos[i - 1]) // 1-based → 0-based
          .filter(Boolean);
      }
      // 如果 AI 标记了商品视频，用最优商品视频替换 topSignal
      const bestSignal = demandVideos.length > 0
        ? [...demandVideos].sort((a, b) => b.momentumMultiplier - a.momentumMultiplier)[0]
        : topSignal; // AI 失败或无标记时回退到原始最优
      bestSignal.keyword = keyword;

      // Step 4: SR 评分 & 资金适配
      const hasDemand = aiInsight?.hasDemand ?? true; // AI 失败时默认有需求

      if (hasDemand) {
        this.emit({ keyword, step: 4, stepName: 'SR 评分 & 资金适配', status: 'running' });
        const score = calcSpotterRank(bestSignal, amazonMetrics);
        this.emit({
          keyword, step: 4, stepName: 'SR 评分 & 资金适配', status: 'done',
          message: `SR=${score.sr.toFixed(3)}  风险=${financial.capitalRiskFlag ? '⚠️极高' : '✅可控'}`,
          financial: {
            totalBudget: financial.totalBudget,
            procurementBudget: financial.procurementBudget,
            marketingBudget: financial.marketingBudget,
            reserveBudget: financial.reserveBudget,
            suggestedOrderQty: financial.suggestedOrderQty,
            capitalRiskFlag: financial.capitalRiskFlag,
            capitalRiskReason: financial.capitalRiskReason,
          },
        });

        const product: StandardProduct = {
          ...tempProduct,
          tiktok: bestSignal,
          tiktokDemandVideos: demandVideos.length > 0 ? demandVideos : undefined,
          score,
          recommendation: getRecommendation(score.sr),
          aiInsight,
        };
        results.push(product);
      } else {
        // AI 判定无需求 → 跳过 SR 评分
        this.emit({
          keyword, step: 4, stepName: 'SR 评分 & 资金适配', status: 'skipped',
          message: `无商品需求：${aiInsight?.demandReason ?? ''}`,
        });

        const product: StandardProduct = {
          ...tempProduct,
          score: { sr: 0, momentumComponent: 0, saturationComponent: 0, opportunityComponent: 0 },
          recommendation: {
            level: 'avoid',
            label: '不建议入场',
            title: '无商品需求信号',
            reason: aiInsight?.demandReason ?? 'TikTok 内容未反映真实商品购买需求',
          },
          aiInsight,
        };
        results.push(product);
      }
    }

    return results.sort((a, b) => b.score.sr - a.score.sr);
  }
}
