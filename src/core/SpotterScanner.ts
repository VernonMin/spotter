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
  }>;
}

export interface ProgressEvent {
  keyword: string;
  step: 1 | 2 | 3 | 4;
  stepName: string;
  status: 'running' | 'done' | 'skipped' | 'error';
  message?: string;
  tiktokDetail?: TikTokDetail;
  amazonDetail?: AmazonDetail;
  financial?: FinancialSummary;
}

type ProgressCallback = (event: ProgressEvent) => void;

/**
 * SpotterScanner — 主流程编排器
 *
 * Discovery(TikTok) -> Filter(Budget) -> Validation(Amazon) -> Insight(LLM)
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

    console.log(`\n🔍 开始扫描 [${platform.toUpperCase()}] 品类：${categoryLabel}，预算：$${totalBudget.toLocaleString()}`);
    console.log(`📋 关键词列表：${keywords.join(', ')}\n`);

    for (const keyword of keywords) {
      console.log(`\n── ${keyword} ──`);

      // Step 1: TikTok Discovery
      this.emit({ keyword, step: 1, stepName: 'TikTok 信号抓取', status: 'running' });
      let signals: TikTokSignal[];
      try {
        signals = await this.tiktok.fetchSignals(keyword, input.filter);
      } catch (err) {
        this.emit({ keyword, step: 1, stepName: 'TikTok 信号抓取', status: 'error', message: String(err) });
        continue;
      }

      if (signals.length === 0) {
        this.emit({ keyword, step: 1, stepName: 'TikTok 信号抓取', status: 'skipped', message: '无符合条件的视频' });
        continue;
      }
      const topSignalRaw = signals.sort((a, b) => b.momentumMultiplier - a.momentumMultiplier)[0];
      this.emit({
        keyword, step: 1, stepName: 'TikTok 信号抓取', status: 'done',
        message: `${signals.length} 条信号`,
        tiktokDetail: {
          videoId: topSignalRaw.videoId,
          playCount: topSignalRaw.playCount,
          diggCount: topSignalRaw.diggCount,
          engagementRate: topSignalRaw.engagementRate,
          momentumMultiplier: topSignalRaw.momentumMultiplier,
          authorFollowers: topSignalRaw.authorFollowers,
          publishedAt: topSignalRaw.publishedAt,
        },
      });

      const topSignal = topSignalRaw;
      topSignal.keyword = keyword;

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
          })),
        },
      });

      // Step 3: Score & Financial
      this.emit({ keyword, step: 3, stepName: 'SR 评分 & 资金适配', status: 'running' });
      const score = calcSpotterRank(topSignal, amazonMetrics);
      const financial = calcFinancialProfile(totalBudget, amazonMetrics.topProducts, categoryLabel);
      this.emit({
        keyword, step: 3, stepName: 'SR 评分 & 资金适配', status: 'done',
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
        id: `${keyword.replace(/\s+/g, '_')}_${Date.now()}`,
        keyword,
        category: categoryLabel,
        tiktok: topSignal,
        amazon: amazonMetrics,
        financial,
        score,
        recommendation: getRecommendation(score.sr),
      };

      // Step 4: AI Insight
      this.emit({ keyword, step: 4, stepName: 'DeepSeek-V3 决策卡片', status: 'running' });
      try {
        product.aiInsight = await this.insight.generateInsight(product);
        this.emit({ keyword, step: 4, stepName: 'DeepSeek-V3 决策卡片', status: 'done' });
      } catch (err) {
        this.emit({ keyword, step: 4, stepName: 'DeepSeek-V3 决策卡片', status: 'error', message: String(err) });
      }

      results.push(product);
    }

    return results.sort((a, b) => b.score.sr - a.score.sr);
  }
}
