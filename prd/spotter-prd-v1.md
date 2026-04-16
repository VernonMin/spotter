# Spotter 项目产品需求文档 (PRD) v1.0

**项目状态**：初始化架构阶段
**项目目标**：利用 TikTok 爆发信号与 Amazon 竞争数据，结合个人资金规模实现自动化选品。

---

## 1. 业务逻辑闭环 (Business Loop)
1. **输入阶段**：用户输入 `Total_Budget` (总预算) 和目标品类。
2. **探测阶段**：通过 TikHub 抓取 TikTok 互动率增速最快的种子商品。
3. **校验阶段**：反查 Amazon 搜索量，验证竞争饱和度。
4. **适配阶段**：基于 4:3:3 资金模型计算首批拿货成本与现金流安全边际。
5. **输出阶段**：生成 AI 决策卡片，包含差异化打法建议。

---

## 2. 核心算法逻辑 (Core Algorithms)

### 2.1 Spotter Rank (SR) 综合评分
$$SR = (TikTok\_Momentum \times 0.7) + (1 / Amazon\_Saturation \times 0.3)$$
*注：倾向于社媒早期的流量爆发，同时惩罚过度饱和的电商市场。*

### 2.2 资金适配模型 (Financial Engine)
- **分配比例**：采购备货 (40%)、营销推广 (30%)、风险备用金 (30%)。
- **硬性过滤**：
    - `Landed_Cost` (单品落地成本) = 采购价 + 国际运费 + FBA费用。
    - `if (Landed_Cost * 300 > Total_Budget * 0.4)` -> 标记为 **"资金风险极高"**。

---

## 3. 功能模块规格 (System Specifications)

### 3.1 TikHub 适配器 (TikTok Signal)
- **接口**：`tiktok/search/video`
- **过滤规则**：
    - 排除粉丝数 > 100,000 的大号。
    - 抓取过去 7 天内 `play_count` 超过 100,000 且 `digg_count` 占比 > 3% 的视频。

### 3.2 Amazon 验证器 (Market Validator)
- **数据点**：
    - `Search_Results`：搜索结果总数。
    - `Avg_Rating`：前 10 名竞品的平均分。
- **决策点**：若平均分 < 4.2，AI 自动提炼负面评价中的“可改进痛点”。

---

## 4. 给 Claude Code 的实现指南

### 第一阶段：项目脚手架
实现 `src/core/StandardProduct.ts` 模型，定义统一的数据接口，确保不同平台的数据能归一化处理。

### 第二阶段：异步逻辑链
实现一个 `SpotterScanner` 类，依次执行：
`Discovery(TikTok)` -> `Filter(Budget)` -> `Validation(Amazon)` -> `Insight(LLM)`。

---

## 5. 交互与输出规范
- **输出格式**：Markdown 表格 + AI 总结。
- **必含字段**：商品 ID、爆发倍数、预估毛利、建议采购量、亚马逊竞争指数、AI 打法建议。
