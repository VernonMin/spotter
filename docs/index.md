# Spotter 页面字段计算索引

> 本文件列出页面上所有展示字段的名称、来源和完整计算公式。
> **规则：每次新增或修改计算字段，必须同步更新本文件，否则不允许提交代码。**

---

## 目录

1. [TikTok 信号字段](#1-tiktok-信号字段)
2. [Amazon 市场字段](#2-amazon-市场字段)
3. [SR 综合评分字段](#3-sr-综合评分字段)
4. [推荐等级字段](#4-推荐等级字段)
5. [资金适配字段](#5-资金适配字段)

---

## 1. TikTok 信号字段

**来源文件**：`src/adapters/TikHubAdapter.ts`

| 字段名 | 展示位置 | 计算公式 |
|--------|---------|---------|
| `playCount` | 进度·播放量 | API 原始值：`statistics.play_count` |
| `diggCount` | 进度·点赞数 | API 原始值：`statistics.digg_count` |
| `engagementRate` | 进度·互动率 | `diggCount / playCount`（playCount = 0 时取 0） |
| `momentumMultiplier` | 进度·爆发倍数 / 结果·爆发倍数 | `max(1, (playCount / 1,000,000) × engagementBonus × 10)`<br>其中 `engagementBonus = 1.5（engagementRate ≥ 5%）或 1.0` |
| `authorFollowers` | 进度·作者粉丝 | API 原始值：`author.follower_count` |
| `publishedAt` | 进度·发布时间（x 天前） | `new Date(create_time × 1000).toISOString()`，页面展示：`floor((now - publishedAt) / 86400000)` 天 |
| `videoUrl` | 进度·查看视频 / 结果·封面链接 | API 原始值：`share_url` |
| `coverUrl` | 进度·封面图 / 结果·封面图 | API 原始值：`video.cover.url_list[0]` |
| `videoDesc` | 不直接展示，传给 AI | API 原始值：`desc`（视频文案） |
| `hashtags` | 不直接展示，传给 AI | API 原始值：`text_extra[].hashtag_name` 过滤空值后组成数组 |

---

## 2. Amazon 市场字段

**来源文件**：`src/adapters/AmazonAdapter.ts`

| 字段名 | 展示位置 | 计算公式 |
|--------|---------|---------|
| `searchResults` | 进度·搜索结果 / 结果·Amazon搜索量 | API 原始值：`search_information.total_results` |
| `saturationIndex` | 进度·饱和度 | `min(searchResults / 100,000, 10)`<br>以 10 万条 = 1.0 为基准，上限 10 |
| `avgRating` | 进度·竞品均分 / 结果·竞品均分 | `sum(rating[0..9]) / count`（取前 10 名算术平均）<br>低于 4.2 触发 AI 痛点提炼 |
| `topProducts[].price` | 进度·竞品价格 | API 原始值：`extracted_price` |
| `topProducts[].rating` | 进度·竞品评分 | API 原始值：`rating` |
| `topProducts[].reviewCount` | 进度·竞品评论数 | API 原始值：`reviews` |
| `topProducts[].imageUrl` | 进度·竞品缩略图 | API 原始值：`thumbnail` |
| `topProducts[].productUrl` | 进度·竞品链接 | 构造：`"https://www.amazon.com/dp/" + asin` |

---

## 3. SR 综合评分字段

**来源文件**：`src/core/SpotterRank.ts`

| 字段名 | 展示位置 | 计算公式 |
|--------|---------|---------|
| `momentumComponent` | 结果·SR 分项·爆发 | `min(momentumMultiplier / 10, 1.0) × 0.5` |
| `saturationComponent` | 结果·SR 分项·竞争 | `max(0, 1 - L / (L + 1)) × 0.3`<br>其中 `L = log10(1 + searchResults / 1000)` |
| `opportunityComponent` | 结果·SR 分项·机会 | `max(0, (5.0 - avgRating) / 5.0) × 0.2` |
| `sr` | 结果·SR 徽章 / 推荐横幅 | `momentumComponent + saturationComponent + opportunityComponent`<br>范围 0 ~ 1，精确到小数点后 4 位 |

### saturationComponent 示例

| searchResults | L = log10(1 + n/1000) | competitionScore | saturationComponent（×0.3） |
|--------------|----------------------|------------------|-----------------------------|
| 1,000 | 0.301 | 0.769 | 0.231 |
| 10,000 | 1.041 | 0.490 | 0.147 |
| 100,000 | 2.004 | 0.334 | 0.100 |
| 500,000 | 2.699 | 0.270 | 0.081 |

---

## 4. 推荐等级字段

**来源文件**：`src/core/SpotterRank.ts`

| 字段名 | 展示位置 | 计算公式 |
|--------|---------|---------|
| `recommendation.level` | 推荐横幅 CSS class | `sr ≥ 0.75 → "strong"`<br>`sr ≥ 0.55 → "consider"`<br>`sr ≥ 0.35 → "caution"`<br>`sr < 0.35 → "avoid"` |
| `recommendation.label` | 推荐横幅·标签 | `"强烈推荐" / "可以考虑" / "谨慎观望" / "不建议入场"` |
| `recommendation.title` | 推荐横幅·标题 | `"黄金机会" / "优质潜力" / "平庸机会" / "红海/死海"` |
| `recommendation.reason` | 推荐横幅·说明文字 | 固定文案，与 level 一一对应（见 `getRecommendation` 函数） |

---

## 6. AI 决策卡片字段

**来源文件**：`src/ai/InsightEngine.ts`

| 字段名 | 展示位置 | 计算公式 |
|--------|---------|---------|
| `aiInsight.viralFeature` | 结果·AI卡片·爆发功能点 | DeepSeek-V3 综合 `videoDesc` + `hashtags` + Top5 竞品标题推断，50字以内 |
| `aiInsight.summary` | 结果·AI卡片·摘要 | DeepSeek-V3 生成，50字以内一句话总结 |
| `aiInsight.differentiationStrategy` | 结果·AI卡片·差异化策略 | DeepSeek-V3 生成，100字以内 |
| `aiInsight.actionPlan` | 结果·AI卡片·行动建议 | DeepSeek-V3 生成，150字以内，含选品/定价/营销方向 |
| `aiInsight.keyRisks` | 结果·AI卡片·风险标签 | DeepSeek-V3 生成，3条风险词组成数组 |

---

## 5. 资金适配字段

**来源文件**：`src/core/FinancialEngine.ts`

| 字段名 | 展示位置 | 计算公式 |
|--------|---------|---------|
| `procurementBudget` | 进度·采购40% / 结果·采购40% | `totalBudget × 0.4` |
| `marketingBudget` | 进度·营销30% / 结果·营销30% | `totalBudget × 0.3` |
| `reserveBudget` | 进度·备用金30% / 结果·备用金30% | `totalBudget × 0.3` |
| `landedCost` | 不直接展示，用于下方两字段 | `medianPrice × 品类系数`<br>`medianPrice` = Top5 竞品价格升序后取中间值，过滤 price = 0 |
| `suggestedOrderQty` | 进度·建议采购量 / 结果·建议采购量 | `max(1, floor(procurementBudget / landedCost))` |
| `capitalRiskFlag` | 进度·资金风险 / 结果·风险徽章 | `landedCost × 300 > procurementBudget`<br>300 件 = Amazon FBA 最小有效测款量 |
| `capitalRiskReason` | 结果·警告框（仅 flag = true 时显示） | `"单品落地成本 $X × 300 件 = $Y，超过采购预算 $Z"` |

### 品类系数表

| 品类 | 系数 | 原因 |
|------|------|------|
| 服装配饰 | 1.50 | 退货率高、尺码问题多 |
| 电子配件 | 1.45 | FBA 费用相对高 |
| 家居用品 | 1.35 | 体积偏大，运费占比高 |
| 母婴用品 | 1.35 | 标准 |
| 宠物用品 | 1.35 | 标准 |
| 健康保健 | 1.32 | 居中 |
| 运动户外 | 1.32 | 居中 |
| 办公文具 | 1.30 | 偏轻 |
| 美妆个护 | 1.28 | 重量轻，运费低 |
| 全品类（默认） | 1.35 | 无品类时使用 |

---

## 修改记录

| 日期 | 字段 | 变更内容 |
|------|------|---------|
| 2026-04-17 | 全部 | 初始版本，梳理页面所有字段及完整计算公式 |
| 2026-04-17 | TikTok信号 / AI卡片 | 新增 videoDesc、hashtags 字段；新增第6节 AI 决策卡片字段（含 viralFeature） |
