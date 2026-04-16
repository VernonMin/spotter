import { TikTokSignal, FilterConfig, DEFAULT_FILTER } from '../core/StandardProduct';

interface TikHubConfig {
  apiKey: string;
  baseUrl?: string;
}

/**
 * TikHub 适配器
 *
 * 过滤规则：
 * - 排除粉丝数 > 100,000 的大号
 * - 抓取过去 7 天内 play_count > 100,000 且 digg_count 占比 > 3% 的视频
 *
 * 真实接口：GET /api/v1/tiktok/app/v3/fetch_video_search_result
 * 返回结构：data.search_item_list[].aweme_info
 */
export class TikHubAdapter {
  private config: TikHubConfig;

  constructor(config: TikHubConfig) {
    this.config = config;
  }

  async fetchSignals(keyword: string, filter?: Partial<FilterConfig>): Promise<TikTokSignal[]> {
    const f: FilterConfig = { ...DEFAULT_FILTER, ...filter };
    if (this.config.apiKey && this.config.apiKey !== 'MOCK') {
      return this.fetchReal(keyword, f);
    }
    return this.fetchMock(keyword);
  }

  private async fetchReal(keyword: string, f: FilterConfig): Promise<TikTokSignal[]> {
    const baseUrl = this.config.baseUrl ?? 'https://api.tikhub.io';
    // publish_time 映射：7 天内 → 7，其他值用最近一个月兜底
    const publishTime = f.publishTimeDays <= 1 ? 1
      : f.publishTimeDays <= 7 ? 7
      : f.publishTimeDays <= 30 ? 30
      : 0;
    const url = `${baseUrl}/api/v1/tiktok/app/v3/fetch_video_search_result?keyword=${encodeURIComponent(keyword)}&count=20&publish_time=${publishTime}&sort_type=1&region=US`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`TikHub API error: ${res.status} ${res.statusText}`);
    }

    const body = await res.json() as TikHubResponse;
    const searchItems = body?.data?.search_item_list ?? [];

    return searchItems
      .map((item) => this.normalize(item.aweme_info, keyword))
      .filter((s) => this.applyFilters(s, f));
  }

  private normalize(v: RawTikTokVideo, keyword: string): TikTokSignal {
    const playCount = v.statistics?.play_count ?? 0;
    const diggCount = v.statistics?.digg_count ?? 0;
    const engagementRate = playCount > 0 ? diggCount / playCount : 0;

    // 用互动率（点赞/播放）× 播放量级推算爆发倍数
    // 播放量每增加 100 万贡献 1x，互动率超 5% 额外加权
    const playMillions = playCount / 1_000_000;
    const engagementBonus = engagementRate >= 0.05 ? 1.5 : 1.0;
    const momentumMultiplier = parseFloat(
      Math.max(1, playMillions * engagementBonus * 10).toFixed(2)
    );

    return {
      videoId: v.aweme_id,
      keyword,
      playCount,
      diggCount,
      commentCount: v.statistics?.comment_count ?? 0,
      shareCount: v.statistics?.share_count ?? 0,
      authorFollowers: v.author?.follower_count ?? 0,
      publishedAt: new Date(v.create_time * 1000).toISOString(),
      engagementRate: parseFloat(engagementRate.toFixed(4)),
      momentumMultiplier,
    };
  }

  private applyFilters(signal: TikTokSignal, f: FilterConfig): boolean {
    const cutoff = Date.now() - f.publishTimeDays * 24 * 60 * 60 * 1000;
    const publishedRecently = new Date(signal.publishedAt).getTime() >= cutoff;
    return (
      signal.authorFollowers <= f.maxAuthorFollowers &&
      signal.playCount >= f.minPlayCount &&
      signal.engagementRate >= f.minEngagementRate &&
      publishedRecently
    );
  }

  private fetchMock(keyword: string): TikTokSignal[] {
    return [
      {
        videoId: 'mock_001',
        keyword,
        playCount: 850_000,
        diggCount: 42_000,
        commentCount: 3_200,
        shareCount: 8_100,
        authorFollowers: 45_000,
        publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        engagementRate: 0.0494,
        momentumMultiplier: 8.5,
      },
      {
        videoId: 'mock_002',
        keyword,
        playCount: 320_000,
        diggCount: 14_500,
        commentCount: 980,
        shareCount: 2_400,
        authorFollowers: 72_000,
        publishedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        engagementRate: 0.0453,
        momentumMultiplier: 5.2,
      },
      {
        videoId: 'mock_003',
        keyword,
        playCount: 150_000,
        diggCount: 6_800,
        commentCount: 540,
        shareCount: 1_100,
        authorFollowers: 18_000,
        publishedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        engagementRate: 0.0453,
        momentumMultiplier: 3.1,
      },
    ];
  }
}

interface TikHubResponse {
  data?: {
    search_item_list?: Array<{
      aweme_info: RawTikTokVideo;
    }>;
  };
}

interface RawTikTokVideo {
  aweme_id: string;
  create_time: number;
  statistics: {
    play_count: number;
    digg_count: number;
    comment_count: number;
    share_count: number;
  };
  author: {
    follower_count: number;
  };
}
