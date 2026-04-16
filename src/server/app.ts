import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { SpotterScanner } from '../core/SpotterScanner';
import { formatReport } from '../output/Formatter';
import { ScanInput, DEFAULT_FILTER } from '../core/StandardProduct';
// ScanInput['platform'] used for type cast below

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

/**
 * POST /api/scan
 * Body: ScanInput + filter overrides
 * 使用 SSE 流式推送进度和最终报告
 */
app.post('/api/scan', async (req: Request, res: Response) => {
  const {
    totalBudget,
    platform = 'tiktok',
    category,
    keywords: rawKeywords,
    filter,
  } = req.body as {
    totalBudget: number;
    platform?: string;
    category?: string;
    keywords: string | string[];
    filter?: Partial<typeof DEFAULT_FILTER>;
  };

  if (!totalBudget) {
    res.status(400).json({ error: '缺少必填参数：totalBudget' });
    return;
  }
  if (!rawKeywords || (Array.isArray(rawKeywords) ? rawKeywords.length === 0 : !rawKeywords.trim())) {
    res.status(400).json({ error: '请至少输入一个关键词' });
    return;
  }

  const keywords = Array.isArray(rawKeywords)
    ? rawKeywords
    : rawKeywords.split(',').map((k: string) => k.trim()).filter(Boolean);

  const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
  if (!deepseekApiKey) {
    res.status(500).json({ error: '服务端缺少 DEEPSEEK_API_KEY 配置' });
    return;
  }

  // SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no'); // 禁止 Render/Nginx 代理缓冲
  res.setHeader('Connection', 'keep-alive');

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const input: ScanInput = {
    totalBudget: Number(totalBudget),
    platform: (platform as ScanInput['platform']) ?? 'tiktok',
    category: category?.trim() || undefined,
    keywords,
    filter,
  };

  const mergedFilter = { ...DEFAULT_FILTER, ...filter };

  send('start', {
    message: `开始扫描 ${keywords.length} 个关键词`,
    filter: mergedFilter,
  });

  const scanner = new SpotterScanner(
    {
      tikhubApiKey: process.env.TIKHUB_API_KEY ?? 'MOCK',
      amazonApiKey: process.env.AMAZON_API_KEY ?? 'MOCK',
      deepseekApiKey,
    },
    (event) => send('progress', event)   // 进度回调
  );

  try {
    const products = await scanner.scan(input);

    if (products.length === 0) {
      send('done', { products: [], report: '', message: '未找到符合过滤条件的商品，建议放宽过滤参数' });
    } else {
      const report = formatReport(products);
      send('done', { products, report });
    }
  } catch (err) {
    send('error', { message: String(err) });
  }

  res.end();
});

/**
 * GET /api/defaults
 * 返回默认过滤参数
 */
app.get('/api/defaults', (_req: Request, res: Response) => {
  res.json({ filter: DEFAULT_FILTER });
});

export default app;
