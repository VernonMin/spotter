import { AmazonMetrics, AmazonProduct } from '../core/StandardProduct';

interface AmazonAdapterConfig {
  apiKey: string;
  provider?: 'serpapi' | 'mock';
}

/**
 * Amazon 验证器 — 数据来源：SerpApi Amazon Search
 *
 * 数据点：
 * - Search_Results：搜索结果总数
 * - Avg_Rating：前 10 名竞品平均分
 *
 * 决策点：avgRating < 4.2 时，负面痛点由 InsightEngine 提炼
 */
export class AmazonAdapter {
  private config: AmazonAdapterConfig;

  constructor(config: AmazonAdapterConfig) {
    this.config = config;
  }

  async fetchMetrics(keyword: string): Promise<AmazonMetrics> {
    const provider = this.config.provider ?? (this.config.apiKey === 'MOCK' ? 'mock' : 'serpapi');

    if (provider === 'mock') {
      return this.fetchMock(keyword);
    }
    return this.fetchSerpApi(keyword);
  }

  private async fetchSerpApi(keyword: string): Promise<AmazonMetrics> {
    const url = `https://serpapi.com/search.json?engine=amazon&k=${encodeURIComponent(keyword)}&amazon_domain=amazon.com&api_key=${this.config.apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`SerpApi error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json() as SerpApiResponse;
    const results = data.organic_results?.slice(0, 10) ?? [];

    const topProducts: AmazonProduct[] = results.map((r) => {
      const price = r.extracted_price ?? 0;
      const asin = r.asin ?? '';
      return {
        asin,
        title: r.title ?? '',
        rating: r.rating ?? 0,
        reviewCount: r.reviews ?? 0,
        price,
        estimatedLandedCost: parseFloat((price * 1.35).toFixed(2)),
        imageUrl: r.thumbnail ?? undefined,
        productUrl: asin ? `https://www.amazon.com/dp/${asin}` : undefined,
      };
    });

    const avgRating =
      topProducts.length > 0
        ? topProducts.reduce((sum, p) => sum + p.rating, 0) / topProducts.length
        : 0;

    const searchResults = data.search_information?.total_results ?? 0;
    const saturationIndex = calcSaturation(searchResults);

    return {
      keyword,
      searchResults,
      topProducts,
      avgRating: parseFloat(avgRating.toFixed(2)),
      saturationIndex,
    };
  }

  private fetchMock(keyword: string): AmazonMetrics {
    const topProducts: AmazonProduct[] = [
      { asin: 'B001MOCK01', title: `${keyword} Premium Set`, rating: 4.4, reviewCount: 12400, price: 28.99, estimatedLandedCost: 39.14 },
      { asin: 'B001MOCK02', title: `${keyword} Basic Kit`, rating: 3.9, reviewCount: 5600, price: 19.99, estimatedLandedCost: 26.99 },
      { asin: 'B001MOCK03', title: `${keyword} Pro Bundle`, rating: 4.1, reviewCount: 8800, price: 34.99, estimatedLandedCost: 47.24 },
      { asin: 'B001MOCK04', title: `Best ${keyword} 2024`, rating: 4.6, reviewCount: 31000, price: 45.99, estimatedLandedCost: 62.09 },
      { asin: 'B001MOCK05', title: `${keyword} Starter Pack`, rating: 3.8, reviewCount: 2100, price: 15.99, estimatedLandedCost: 21.59 },
    ];

    const avgRating = parseFloat(
      (topProducts.reduce((s, p) => s + p.rating, 0) / topProducts.length).toFixed(2)
    );
    const searchResults = 42_800;
    const saturationIndex = calcSaturation(searchResults);

    return { keyword, searchResults, topProducts, avgRating, saturationIndex };
  }
}

// 饱和度指数：以 10 万条结果 = 1.0 为基准，上限 10
function calcSaturation(searchResults: number): number {
  return parseFloat(Math.min(searchResults / 100_000, 10).toFixed(4));
}

interface SerpApiResponse {
  search_information?: {
    total_results: number;
  };
  organic_results?: Array<{
    asin?: string;
    title?: string;
    rating?: number;
    reviews?: number;
    extracted_price?: number;
    thumbnail?: string;
    link?: string;
  }>;
}
