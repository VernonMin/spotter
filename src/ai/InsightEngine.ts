import OpenAI from 'openai';
import { StandardProduct, AIInsight } from '../core/StandardProduct';

/**
 * InsightEngine — 基于 DeepSeek-V3 生成 AI 决策卡片
 * DeepSeek API 兼容 OpenAI SDK，只需替换 baseURL 和 apiKey
 */
export class InsightEngine {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
    });
  }

  async generateInsight(product: StandardProduct): Promise<AIInsight> {
    const { keyword, amazon, financial, score, tiktok } = product;

    const needsPainPoints = amazon.avgRating < 4.2;

    // 构建 TikTok 信号上下文
    const tiktokContext = [
      tiktok.videoDesc ? `- **视频文案**：${tiktok.videoDesc}` : '',
      tiktok.hashtags?.length ? `- **视频标签**：${tiktok.hashtags.map(h => '#' + h).join(' ')}` : '',
    ].filter(Boolean).join('\n');

    // 构建 Amazon 竞品标题上下文
    const amazonTitles = amazon.topProducts
      .slice(0, 5)
      .map((p, i) => `${i + 1}. ${p.title}`)
      .join('\n');

    const prompt = `你是一名跨境电商选品顾问，请根据以下数据为选品"${keyword}"生成决策卡片。

## TikTok 爆发信号
- **爆发倍数**：${tiktok.momentumMultiplier}x（互动率 ${(tiktok.engagementRate * 100).toFixed(2)}%）
${tiktokContext}

## Amazon 市场数据
- **搜索结果**：${amazon.searchResults.toLocaleString()} 条
- **竞品平均分**：${amazon.avgRating.toFixed(2)} / 5.0
- **Top5 竞品标题**：
${amazonTitles}

## 综合评分
- **Spotter Rank (SR)**：${score.sr.toFixed(4)}（满分 1.0）
- **总预算**：$${financial.totalBudget.toLocaleString()}
- **建议首批采购量**：${financial.suggestedOrderQty} 件
- **资金风险等级**：${financial.capitalRiskFlag ? '⚠️ 资金风险极高' : '✅ 风险可控'}
${financial.capitalRiskReason ? `- **风险原因**：${financial.capitalRiskReason}` : ''}

${needsPainPoints ? `## 竞品负面评价分析\n请从评分偏低（${amazon.avgRating.toFixed(2)}分）的情况出发，提炼 2~3 个消费者痛点，这些痛点是产品差异化的切入口。` : ''}

## 输出要求
请严格按如下 JSON 格式返回，不要有任何其他文字：
{
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
      return parsed;
    } catch {
      return {
        viralFeature: '',
        differentiationStrategy: content,
        keyRisks: [],
        actionPlan: '',
        summary: '解析失败，请查看原始输出',
      };
    }
  }
}
