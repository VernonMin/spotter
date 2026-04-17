# Spotter 项目产品需求文档 (PRD) v1.1

**项目状态**：核心流程已实现
**项目目标**：利用 TikTok 爆发信号与 Amazon 竞争数据，结合个人资金规模实现自动化选品。

---

## 1. 业务逻辑闭环 (Business Loop)
1. **输入阶段**：用户输入 `Total_Budget` (总预算) 和目标品类。
2. **探测阶段**：通过 TikHub 抓取 TikTok 视频搜索结果（全部返回，不做客户端过滤）。
3. **校验阶段**：反查 Amazon 搜索量，验证竞争饱和度。
4. **AI 判定阶段**：将全部 TikTok 视频 + Amazon 数据交给 DeepSeek-V3，判断是否存在真实商品购买需求，并生成决策卡片。
5. **评分阶段**：仅在 AI 确认有需求时，执行 SR 评分和资金适配计算。
6. **输出阶段**：生成包含需求判定、SR 评分、资金风险、AI 决策卡片的完整报告。

---

## 2. 核心算法逻辑 (Core Algorithms)

### 2.1 Spotter Rank (SR) 综合评分
```
SR = (Momentum × 0.5) + (CompetitionScore × 0.3) + (RatingOpportunity × 0.2)
```
- **Momentum**：`min(momentumMultiplier / 10, 1.0)`，TikTok 爆发倍数
- **CompetitionScore**：`1 - log10(1 + searchResults/1000) / (log10(...) + 1)`，对数竞争空间
- **RatingOpportunity**：`max(0, (5.0 - avgRating) / 5.0)`，竞品评分机会

*注：仅在 AI 判定 `hasDemand = true` 时执行。无需求时 SR = 0。*

### 2.2 资金适配模型 (Financial Engine)
- **分配比例**：采购备货 (40%)、营销推广 (30%)、风险备用金 (30%)。
- **硬性过滤**：
    - `Landed_Cost` (单品落地成本) = 竞品中位价 × 品类系数。
    - `if (Landed_Cost * 300 > Total_Budget * 0.4)` -> 标记为 **"资金风险极高"**。

### 2.3 AI 需求判定 (Demand Assessment)
- **输入**：全部 TikTok 搜索结果（最多 20 条视频的完整信息）+ Amazon Top5 竞品数据
- **输出**：`hasDemand`（布尔值）+ `demandReason`（判定理由）+ 决策卡片（viralFeature、策略、风险、建议）
- **设计原则**：不用规则过滤噪音，让 AI 综合判断视频内容是否反映真实商品购买需求

---

## 3. 功能模块规格 (System Specifications)

### 3.1 TikHub 适配器 (TikTok Signal)
- **接口**：`/api/v1/tiktok/app/v3/fetch_video_search_result`
- **参数**：`keyword`, `count=20`, `publish_time` (映射自 publishTimeDays), `sort_type=0` (最新发布), `region=US`
- **返回**：全部视频（不做客户端内容过滤），包含播放量、点赞、互动率、粉丝数、文案、标签等
- **基础过滤**（仅 fetchSignals 方法）：粉丝 > 100k 排除、播放量 < 100k 排除、互动率 < 3% 排除、超出时间窗口排除

### 3.2 Amazon 验证器 (Market Validator)
- **数据点**：
    - `Search_Results`：搜索结果总数。
    - `Avg_Rating`：前 10 名竞品的平均分。
- **决策点**：若平均分 < 4.2，AI 自动提炼负面评价中的"可改进痛点"。

### 3.3 AI 引擎 (InsightEngine)
- **模型**：DeepSeek-V3（通过 OpenAI 兼容 SDK 调用）
- **角色**：流程第三步"守门人"，决定是否继续评分
- **输入**：全部 TikTok 视频摘要 + Amazon 竞品数据 + 资金数据
- **输出**：需求判定（hasDemand + demandReason）+ 决策卡片（viralFeature + strategy + risks + actionPlan + summary）

---

## 4. 流程编排 (Pipeline)

```
Step 1: TikTok 信号抓取
        └─ fetchAllSignals(keyword) → 全部 20 条视频（不过滤）
        └─ 0 条视频 → 跳过此关键词

Step 2: Amazon 竞争验证
        └─ fetchMetrics(keyword) → 搜索量、竞品数据

Step 3: AI 需求判定 + 决策卡片
        └─ 输入：全部视频 + Amazon 数据
        └─ hasDemand = true → 继续 Step 4
        └─ hasDemand = false → 跳过 Step 4，标记"不建议入场·无商品需求信号"

Step 4: SR 评分 & 资金适配（仅 hasDemand = true）
        └─ calcSpotterRank() → SR 综合评分
        └─ calcFinancialProfile() → 资金分配 + 风险判断
```

---

## 5. 交互与输出规范
- **输出格式**：Web UI（SSE 流式推送进度 + 最终报告）
- **必含字段**：SR 评分、爆发倍数、互动率、Amazon 搜索量、竞品均分、资金分配、建议采购量、风险标记、AI 需求判定、AI 决策卡片
- **推荐等级**：强烈推荐 (SR ≥ 0.75) / 可以考虑 (≥ 0.55) / 谨慎观望 (≥ 0.35) / 不建议入场 (< 0.35 或 hasDemand = false)
