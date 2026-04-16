import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { SpotterScanner } from './core/SpotterScanner';
import { formatReport } from './output/Formatter';
import { ScanInput } from './core/StandardProduct';

async function main() {
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
  if (!deepseekApiKey) {
    console.error('❌ 缺少 DEEPSEEK_API_KEY，请在 .env 文件中配置');
    process.exit(1);
  }

  // 从命令行参数或环境变量读取配置
  const totalBudget = parseFloat(process.env.TOTAL_BUDGET ?? '5000');
  const category = process.env.CATEGORY ?? '家居用品';
  const keywordsRaw = process.env.KEYWORDS ?? 'portable blender,air fryer accessories,posture corrector';
  const keywords = keywordsRaw.split(',').map((k) => k.trim()).filter(Boolean);

  const input: ScanInput = { totalBudget, platform: 'tiktok', category: category || undefined, keywords };

  const scanner = new SpotterScanner({
    tikhubApiKey: process.env.TIKHUB_API_KEY ?? 'MOCK',
    amazonApiKey: process.env.AMAZON_API_KEY ?? 'MOCK',
    deepseekApiKey,
  });

  const products = await scanner.scan(input);

  if (products.length === 0) {
    console.log('⚠️ 未找到符合条件的选品');
    return;
  }

  const report = formatReport(products);

  // 输出到控制台
  console.log('\n' + '='.repeat(60));
  console.log(report);

  // 保存到文件
  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const filename = `spotter_report_${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, report, 'utf-8');
  console.log(`\n📄 报告已保存到：${filepath}`);
}

main().catch((err) => {
  console.error('❌ 运行出错：', err);
  process.exit(1);
});
