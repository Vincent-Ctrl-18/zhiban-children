const { aggregateDate } = require('../services/metricsService');
const { pool } = require('../config/database');

function dateArg() {
  const index = process.argv.indexOf('--date');
  const value = index >= 0 ? process.argv[index + 1] : null;
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function rangeArgs() {
  const fromIndex = process.argv.indexOf('--from');
  const toIndex = process.argv.indexOf('--to');
  const from = fromIndex >= 0 ? process.argv[fromIndex + 1] : null;
  const to = toIndex >= 0 ? process.argv[toIndex + 1] : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) return [dateArg()];
  const dates = [];
  for (let cursor = new Date(`${from}T00:00:00Z`), end = new Date(`${to}T00:00:00Z`); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) dates.push(cursor.toISOString().slice(0, 10));
  return dates;
}

(async () => {
  try {
    const results = [];
    for (const date of rangeArgs()) results.push(await aggregateDate(date));
    console.log(JSON.stringify(results.length === 1 ? results[0] : results));
  } catch (error) {
    console.error('指标聚合失败:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
