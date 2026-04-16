# Spotter 业务规则文档

> 所有核心业务逻辑的唯一说明文档。
> 每次修改规则时，必须同步更新本文件，注明版本、日期和修改原因。

---

## 目录
1. [SR 综合评分](#1-sr-综合评分)
2. [资金适配模型](#2-资金适配模型)
3. [TikTok 信号过滤](#3-tiktok-信号过滤)
4. [Amazon 市场验证](#4-amazon-市场验证)

---

## 1. SR 综合评分

**文件**：`src/core/SpotterRank.ts`

### 当前版本：v2（2026-04-17）

#### 公式
```
SR = (Momentum × 0.5) + (CompetitionScore × 0.3) + (RatingOpportunity × 0.2)
```

#### 各项说明

| 分项 | 权重 | 计算方式 | 说明 |
|------|------|---------|------|
| Momentum | 50% | `min(momentumMultiplier / 10, 1.0)` | TikTok 爆发倍数，10x 为满分 |
| CompetitionScore | 30% | `1 - log10(1 + searchResults/1000) / (log10(...) + 1)` | 对数曲线，保留低竞争市场的区分度 |
| RatingOpportunity | 20% | `max(0, (5.0 - avgRating) / 5.0)` | 竞品均分越低，机会越大 |

#### CompetitionScore 对数曲线示例
| 搜索结果数 | 得分 |
|-----------|------|
| 1,000 | ~0.77 |
| 10,000 | ~0.49 |
| 100,000 | ~0.33 |
| 500,000 | ~0.27 |

#### RatingOpportunity 示例
| 竞品均分 | 得分 |
|---------|------|
| 4.8 | 0.04 |
| 4.2 | 0.16 |
| 3.5 | 0.30 |

#### SR 推荐等级（v1，2026-04-17）

| SR 范围 | 等级代码 | 商业建议 | 状态标题 | 说明 |
|---------|---------|---------|---------|------|
| ≥ 0.75 | strong | 强烈推荐 | 黄金机会 | TikTok 热度极高，亚马逊几乎无竞争，你资金非常充沛。 |
| 0.55 ~ 0.74 | consider | 可以考虑 | 优质潜力 | 有明确的市场需求和流量动能，但需要通过差异化竞争。 |
| 0.35 ~ 0.54 | caution | 谨慎观望 | 平庸机会 | 流量在衰减或者亚马逊已经很卷了，利润空间有限。 |
| < 0.35 | avoid | 不建议入场 | 红海/死海 | 竞争太大且没有爆发动能。 |

#### Momentum 爆发倍数计算方式
```
playMillions = playCount / 1,000,000
engagementBonus = engagementRate >= 5% ? 1.5 : 1.0
momentumMultiplier = max(1, playMillions × engagementBonus × 10)
```

---

### 历史版本

#### v1（初始版本，2026-04-17）
```
SR = (TikTok_Momentum × 0.7) + (1 / Amazon_Saturation × 0.3)
```
**废弃原因**：饱和度用线性映射，搜索结果 < 10 万的市场全部得满分 0.3，失去区分度；缺少竞品评分机会维度。

---

## 2. 资金适配模型

**文件**：`src/core/FinancialEngine.ts`

### 当前版本：v3（2026-04-17）

#### 资金分配比例（4:3:3 模型，未变）
| 用途 | 比例 | 说明 |
|------|------|------|
| 采购备货 | 40% | 首批拿货成本 |
| 营销推广 | 30% | TikTok 投流 + Amazon 广告 |
| 风险备用金 | 30% | 滞销/退货/补货缓冲 |

#### 落地成本计算（v2：按品类区分系数）
```
落地成本 = Top5 竞品价格中位数 × 品类系数
```

| 品类 | 系数 | 原因 |
|------|------|------|
| 服装配饰 | 1.50 | 退货率高、尺码问题多 |
| 电子配件 | 1.45 | FBA 费用相对高 |
| 家居用品 | 1.35 | 体积偏大，运费占比高 |
| 健康保健 | 1.32 | 居中 |
| 运动户外 | 1.32 | 居中 |
| 母婴用品 | 1.35 | 标准 |
| 美妆个护 | 1.28 | 重量轻，运费低 |
| 宠物用品 | 1.35 | 标准 |
| 办公文具 | 1.30 | 偏轻 |
| 其他/全品类 | 1.35 | 默认 |

#### 资金风险判断（v3：固定最小测款量）
```
MIN_VIABLE_QTY = 300（Amazon FBA 最小有意义测款量）
if (落地成本 × 300 > 采购预算) → 标记「资金风险极高」
```
含义：预算连 300 件都买不起，说明资金压力过大，不足以支撑一次有效测款。

#### 建议首批采购量（v2：用中位数定价）
```
中位数定价 = Top5 竞品价格排序后取中间值
建议采购量 = floor(采购预算 / 落地成本)，最少 1 件
```

---

### 历史版本

#### v2（2026-04-17）
- 落地成本系数按品类区分
- 风险判断：采购预算 / 落地成本 × 1.5 倍建议量是否超预算
- 定价：Top5 中位数

**废弃原因**：riskBaseQty = ceil(budget/cost × 1.5) 后再判断 cost × riskBaseQty > budget，恒等于约 1.5× budget > budget，导致风险标记永远为 true。

#### v1（初始版本，2026-04-17）
- 落地成本 = 售价 × 1.35（所有品类统一）
- 风险判断基准：固定 300 件
- 定价：取竞品列表第一名

**废弃原因**：品类系数统一导致服装/电子等品类成本低估；300 件基准不随预算规模调整；第一名定价受排名波动影响大。

---

## 3. TikTok 信号过滤

**文件**：`src/adapters/TikHubAdapter.ts`

### 当前版本：v1（初始版本，2026-04-17）

#### 默认过滤条件

| 参数 | 默认值 | 说明 |
|------|--------|------|
| maxAuthorFollowers | 100,000 | 排除大号，聚焦自然流量爆发 |
| minPlayCount | 100,000 | 过滤无效低流量视频 |
| minEngagementRate | 3%（0.03） | 互动率低说明流量非自然爆发 |
| publishTimeDays | 7 天 | 只看近期爆发信号，过时信号无参考价值 |
| requireCommercialSignal | true | 要求视频含商业意图信号词，过滤生活/娱乐类内容 |

#### 商业意图信号词表（requireCommercialSignal）
视频文案或标签中包含以下任意一词，则认定为商品相关内容：

```
review / haul / unbox / unboxing
shop / shopping / shopwithme / tiktokshop
buy / buying / purchase
amazon / amazonfinds / amazonhaul
tryon / try on / tryonhaul
ad / sponsored / affiliate / collab
discount / code / promo / sale / deal
recommend / recommendation / honest
product / brand / worth it / must have
link in bio / linkinbio
```

**背景**：TikTok 关键词搜索返回所有含该词的视频，不区分商业意图。例如搜索 "underwear" 可能返回生活方式类视频（穿内衣游泳等），与选品无关。开启此过滤后只保留有商业信号的视频。

#### 所有条件均可在页面上覆盖
用户在前端输入框填写即覆盖默认值，不填则使用默认值。requireCommercialSignal 在页面以勾选框形式展示，默认勾选。

#### TikHub API 接口
```
GET /api/v1/tiktok/app/v3/fetch_video_search_result
参数：keyword, count=20, publish_time=7, sort_type=1（最多点赞）, region=US
```

#### 返回字段
| 字段 | 说明 |
|------|------|
| videoUrl | TikTok 视频分享链接（share_url） |
| coverUrl | 视频封面图（有效期约 24 小时，仅用于展示） |
| videoDesc | 视频文案（desc），创作者描述，用于 AI 提炼爆发功能点 |
| hashtags | 视频标签列表（text_extra[].hashtag_name），用于 AI 提炼爆发功能点 |

---

## 4. 爆发功能点识别

**文件**：`src/ai/InsightEngine.ts`

### 当前版本：v1（2026-04-17）

#### 背景

TikTok 爆发的往往不是品类本身，而是某个具体的功能角度（如杯子因「自动搅拌」爆发，而非「杯子」这个品类）。原有 AI 卡片无法回答"为什么爆"。

#### 信号来源（方案 A + B）

| 来源 | 字段 | 说明 |
|------|------|------|
| TikTok 视频文案 | `videoDesc`（API: `desc`） | 创作者直接描述卖点，信号最强 |
| TikTok 视频标签 | `hashtags`（API: `text_extra[].hashtag_name`） | 标签常包含功能词，如 `#selfstirringcup` |
| Amazon 竞品标题 | `topProducts[0..4].title` | 卖家经过优化的标题，功能词在前 |

#### AI 提炼逻辑

将以上三类信号拼入 prompt，要求 DeepSeek-V3 输出：
```
viralFeature：一句话，50字以内，说明该产品为什么会在 TikTok 爆发，核心是哪个功能或卖点触发了传播
```

#### 输出字段

| 字段 | 位置 | 说明 |
|------|------|------|
| `aiInsight.viralFeature` | 结果卡片·AI决策卡片·爆发功能点 | AI 综合三路信号推断的爆发原因，一句话 |

#### 降级处理
- 若 TikHub 未返回 `desc` 或 `text_extra`，则只使用 Amazon 竞品标题推断
- 若 AI 未输出该字段，页面不展示爆发功能点模块（不影响其他内容）

---

## 5. Amazon 市场验证

**文件**：`src/adapters/AmazonAdapter.ts`

### 当前版本：v1（初始版本，2026-04-17）

#### 数据来源
SerpApi Amazon Search Engine

#### 关键数据点
| 字段 | 说明 |
|------|------|
| searchResults | Amazon 搜索结果总数，用于计算饱和度 |
| avgRating | 前 10 名竞品平均分 |
| topProducts | 前 10 名竞品列表（ASIN、标题、价格、评分、评论数、商品图、链接） |

#### 饱和度说明
```
饱和度 = searchResults / 100,000（上限 10）
```
以 10 万条搜索结果 = 饱和度 1.0 为基准，数值越小竞争越少。

#### 竞品均分说明
前 10 名竞品星级评分的算术平均值（满分 5.0）。低于 4.2 触发 AI 痛点提炼。

#### 决策触发规则
```
if (avgRating < 4.2) → AI 自动提炼竞品负面评价中的「可改进痛点」
```
4.2 分为阈值依据：低于此分说明消费者整体不满意，存在产品改进空间。

#### SerpApi 接口
```
GET https://serpapi.com/search.json
参数：engine=amazon, k={keyword}, amazon_domain=amazon.com
```

---

## 修改记录

| 版本 | 日期 | 模块 | 修改内容 |
|------|------|------|---------|
| v1 | 2026-04-17 | 全部 | 初始版本 |
| v2 | 2026-04-17 | SR评分 | 加入 RatingOpportunity 维度；饱和度改对数曲线；权重调整为 5:3:2 |
| v2 | 2026-04-17 | 资金模型 | 落地成本系数按品类区分；风险基准量改为动态计算；定价改用 Top5 中位数 |
| v3 | 2026-04-17 | 资金模型 | 修复风险标记恒为 true 的逻辑 bug；改用固定 MIN_VIABLE_QTY=300 件判断资金是否足够测款 |
| v1 | 2026-04-17 | 爆发功能点 | 新增爆发功能点识别模块；从 TikTok 文案/标签 + Amazon 竞品标题三路信号 AI 提炼 viralFeature |
| v2 | 2026-04-17 | TikTok信号 | 新增 requireCommercialSignal 过滤器（默认开启），过滤生活/娱乐类无商业意图视频 |
| v1 | 2026-04-17 | SR推荐等级 | 新增 4 档推荐等级：strong/consider/caution/avoid，阈值 0.75/0.55/0.35 |
| v2 | 2026-04-17 | TikTok信号 | 新增 videoUrl（视频链接）、coverUrl（封面图）字段 |
| v2 | 2026-04-17 | Amazon验证 | 新增 imageUrl（商品图）、productUrl（amazon.com/dp/ASIN）字段 |
| v2 | 2026-04-17 | Amazon验证 | 补充饱和度和竞品均分的计算说明 |
