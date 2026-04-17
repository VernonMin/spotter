import OpenAI from 'openai';
import { StandardProduct, AIInsight, TikTokSignal, AmazonMetrics } from '../core/StandardProduct';

/**
 * InsightEngine — 基于 DeepSeek-V3 进行需求判定 + 生成 AI 决策卡片
 *
 * v2 改动：AI 从最后一步"锦上添花"变为第三步"守门人"
 * 输入：全部 TikTok 视频（不经过滤）+ Amazon 市场数据
 * 输出：hasDemand（需求判定）+ 完整决策卡片
 */
export class InsightEngine {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
    });
  }

  async generateInsight(
    product: StandardProduct,
    allVideos: TikTokSignal[],
  ): Promise<AIInsight> {
    const { keyword, amazon, financial } = product;

    const needsPainPoints = amazon.avgRating < 4.2;

    // 构建全部 TikTok 视频摘要
    const videoSummaries = allVideos.map((v, i) => {
      const daysAgo = Math.round(
        (Date.now() - new Date(v.publishedAt).getTime()) / 86_400_000
      );
      const desc = v.videoDesc ? `文案：${v.videoDesc.slice(0, 80)}` : '文案：(无)';
      const tags = v.hashtags?.length
        ? `标签：${v.hashtags.map(h => '#' + h).join(' ')}`
        : '标签：(无)';
      return `${i + 1}. 播放${fmtNum(v.playCount)} | 点赞${fmtNum(v.diggCount)} | 互动率${(v.engagementRate * 100).toFixed(1)}% | 粉丝${fmtNum(v.authorFollowers)} | ${daysAgo}天前\n   ${desc}\n   ${tags}`;
    }).join('\n');

    // 构建 Amazon 竞品标题上下文
    const amazonTitles = amazon.topProducts
      .slice(0, 5)
      .map((p, i) => `${i + 1}. ${p.title}`)
      .join('\n');

    const prompt = `你是一名跨境电商选品顾问。请根据以下数据判断关键词"${keyword}"是否存在真实的商品购买需求，并生成决策卡片。

## TikTok 搜索结果（共 ${allVideos.length} 条视频）
${videoSummaries}

## Amazon 市场数据
- **搜索结果**：${amazon.searchResults.toLocaleString()} 条
- **竞品平均分**：${amazon.avgRating.toFixed(2)} / 5.0
- **Top5 竞品标题**：
${amazonTitles}

## 综合参考
- **总预算**：$${financial.totalBudget.toLocaleString()}
- **建议首批采购量**：${financial.suggestedOrderQty} 件
- **资金风险等级**：${financial.capitalRiskFlag ? '资金风险极高' : '风险可控'}
${financial.capitalRiskReason ? `- **风险原因**：${financial.capitalRiskReason}` : ''}

${needsPainPoints ? `## 竞品负面评价分析\n请从评分偏低（${amazon.avgRating.toFixed(2)}分）的情况出发，提炼 2~3 个消费者痛点，这些痛点是产品差异化的切入口。` : ''}

## 第一步：需求判定
请逐条分析以上 ${allVideos.length} 条 TikTok 视频，判断每条视频是否反映了对"${keyword}"相关商品的真实购买需求。
- 商品需求视频特征：开箱、测评、推荐、试用、购物分享、商品展示等
- 非商品视频特征：搞笑、舞蹈、日常记录、生活分享等碰巧含关键词的内容

请在 demandVideoIndices 中列出所有属于商品需求的视频序号（即上方列表中的编号，从 1 开始）。
- 如果没有任何商品需求视频，demandVideoIndices 为空数组，hasDemand 为 false。
- 如果有至少 1 条商品需求视频，hasDemand 为 true。

## 第二步：决策卡片
无论需求判定结果如何，都请生成完整的 JSON 输出。

## 输出要求
请严格按如下 JSON 格式返回，不要有任何其他文字：
{
  "hasDemand": true或false,
  "demandReason": "需求判定的一句话理由，50字以内",
  "demandVideoIndices": [1, 5, 12],
  "viralFeature": "一句话，50字以内，说明该产品为什么会在 TikTok 爆发，核心是哪个功能或卖点触发了传播",
  "differentiationStrategy": "一段话，100字以内，说明如何差异化切入该市场",
  "keyRisks": ["风险1", "风险2", "风险3"],
  "actionPlan": "一段话，150字以内，具体行动建议（选品、定价、营销）",
  "summary": "一句话总结，50字以内"
}`;

    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content ?? '{}';

    try {
      const parsed = JSON.parse(content) as AIInsight;
      // 确保字段类型正确
      parsed.hasDemand = !!parsed.hasDemand;
      parsed.demandReason = parsed.demandReason || '';
      parsed.demandVideoIndices = Array.isArray(parsed.demandVideoIndices)
        ? parsed.demandVideoIndices.filter(i => typeof i === 'number')
        : [];
      // 如果标记了视频但 hasDemand 是 false，以视频列表为准
      if (parsed.demandVideoIndices.length > 0) parsed.hasDemand = true;
      if (parsed.demandVideoIndices.length === 0) parsed.hasDemand = false;
      return parsed;
    } catch {
      return {
        hasDemand: false,
        demandReason: 'AI 输出解析失败',
        demandVideoIndices: [],
        viralFeature: '',
        differentiationStrategy: content,
        keyRisks: [],
        actionPlan: '',
        summary: '解析失败，请查看原始输出',
      };
    }
  }
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}
