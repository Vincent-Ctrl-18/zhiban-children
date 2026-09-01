const { processOneSummaryJob } = require('../services/summaryService');

async function main() {
  const limit = Math.min(Math.max(Number(process.argv[2]) || 20, 1), 100);
  let processed = 0;
  for (let index = 0; index < limit; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const handled = await processOneSummaryJob();
    if (!handled) break;
    processed += 1;
  }
  console.log(`AI 摘要任务处理完成：${processed} 条`);
}

main().catch((error) => { console.error('AI 摘要任务处理失败:', error); process.exitCode = 1; });
