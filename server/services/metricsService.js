const { pool } = require('../config/database');

const RANGE_SQL = {
  '7d': 'DATE_SUB(CURDATE(), INTERVAL 6 DAY)',
  '30d': 'DATE_SUB(CURDATE(), INTERVAL 29 DAY)',
  all: 'CAST(\'1000-01-01\' AS DATE)',
};

function rangeStart(range = '7d') {
  return RANGE_SQL[range] ? RANGE_SQL[range] : RANGE_SQL['7d'];
}

async function getProjectMetrics({ range = '7d', featureCode = null, role = null, institutionId = null } = {}) {
  const start = rangeStart(range);
  const filters = [`occurred_at >= ${start}`, `environment = 'production'`, `COALESCE(user_role, '') <> 'admin'`, `(user_id IS NULL OR user_id NOT IN (SELECT id FROM users WHERE is_test_account = 1))`];
  const params = [];
  if (featureCode) { filters.push('feature_code = ?'); params.push(featureCode); }
  if (role) { filters.push('user_role = ?'); params.push(role); }
  if (institutionId) { filters.push('institution_id = ?'); params.push(institutionId); }
  const where = filters.join(' AND ');
  const [totalsRows] = await pool.query(
    `SELECT
       COUNT(CASE WHEN result IN ('started','success','completed') THEN 1 END) AS usageCount,
       COUNT(CASE WHEN result = 'success' THEN 1 END) AS successCount,
       COUNT(CASE WHEN result = 'completed' THEN 1 END) AS completionCount,
       COUNT(DISTINCT CASE WHEN result IN ('success','completed') THEN user_id END) AS uniqueUsers,
       COUNT(CASE WHEN event_name = 'course_completed' THEN 1 END) AS completedCourses,
       COUNT(DISTINCT CASE WHEN event_name = 'homework_session_completed' THEN session_id END) AS completedHomework,
       COUNT(CASE WHEN event_name = 'learning_report_generated' THEN 1 END) AS reportsGenerated,
       COUNT(CASE WHEN event_name = 'companion_session_started' THEN 1 END) AS companionUses
     FROM product_events WHERE ${where}`,
    params
  );
  const [trend] = await pool.query(
    `SELECT DATE(occurred_at) AS date,
       COUNT(CASE WHEN result IN ('started','success','completed') THEN 1 END) AS usageCount,
       COUNT(CASE WHEN result = 'success' THEN 1 END) AS successCount,
       COUNT(CASE WHEN result = 'completed' THEN 1 END) AS completionCount,
       COUNT(DISTINCT CASE WHEN result IN ('success','completed') THEN user_id END) AS uniqueUsers
     FROM product_events WHERE ${where}
     GROUP BY DATE(occurred_at) ORDER BY date ASC`,
    params
  );
  const [byFeature] = await pool.query(
    `SELECT feature_code AS featureCode,
       COUNT(CASE WHEN result IN ('started','success','completed') THEN 1 END) AS usageCount,
       COUNT(CASE WHEN result = 'completed' THEN 1 END) AS completionCount,
       COUNT(DISTINCT CASE WHEN result IN ('success','completed') THEN user_id END) AS uniqueUsers
     FROM product_events WHERE ${where}
     GROUP BY feature_code ORDER BY usageCount DESC`,
    params
  );
  const totals = totalsRows[0] || {};
  return {
    range,
    totals: {
      usageCount: Number(totals.usageCount || 0),
      successCount: Number(totals.successCount || 0),
      completionCount: Number(totals.completionCount || 0),
      uniqueUsers: Number(totals.uniqueUsers || 0),
      completedCourses: Number(totals.completedCourses || 0),
      completedHomework: Number(totals.completedHomework || 0),
      reportsGenerated: Number(totals.reportsGenerated || 0),
      companionUses: Number(totals.companionUses || 0),
    },
    trend: trend.map((row) => ({
      date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
      usageCount: Number(row.usageCount || 0),
      successCount: Number(row.successCount || 0),
      completionCount: Number(row.completionCount || 0),
      uniqueUsers: Number(row.uniqueUsers || 0),
    })),
    byFeature: byFeature.map((row) => ({
      featureCode: row.featureCode,
      usageCount: Number(row.usageCount || 0),
      completionCount: Number(row.completionCount || 0),
      uniqueUsers: Number(row.uniqueUsers || 0),
    })),
  };
}

async function aggregateDate(date) {
  // 先清理当天旧快照，保证事件明细删改后可安全重算，不残留已不存在的分组。
  await pool.query('DELETE FROM feature_usage_daily WHERE stat_date = ?', [date]);
  await pool.query('DELETE FROM user_activity_daily WHERE stat_date = ?', [date]);
  const [featureRows] = await pool.query(
    `SELECT feature_code AS featureCode, user_role AS userRole, institution_id AS institutionId,
       COUNT(CASE WHEN result IN ('started','success','completed') THEN 1 END) AS usageCount,
       COUNT(CASE WHEN result = 'success' THEN 1 END) AS successCount,
       COUNT(CASE WHEN result = 'completed' THEN 1 END) AS completionCount,
       COUNT(DISTINCT CASE WHEN result IN ('success','completed') THEN user_id END) AS uniqueUsers
     FROM product_events
     WHERE DATE(occurred_at) = ? AND environment = 'production'
       AND (user_id IS NULL OR user_id NOT IN (SELECT id FROM users WHERE is_test_account = 1))
     GROUP BY feature_code, user_role, institution_id`, [date]
  );
  for (const row of featureRows) {
    await pool.query(
      `INSERT INTO feature_usage_daily
        (stat_date, feature_code, user_role, institution_id, usage_count, success_count, completion_count, unique_users)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE usage_count = VALUES(usage_count), success_count = VALUES(success_count),
         completion_count = VALUES(completion_count), unique_users = VALUES(unique_users)`,
      [date, row.featureCode, row.userRole || 'unknown', row.institutionId || 0,
        row.usageCount || 0, row.successCount || 0, row.completionCount || 0, row.uniqueUsers || 0]
    );
  }
  const [userRows] = await pool.query(
    `SELECT user_id AS userId,
       COUNT(CASE WHEN event_name = 'auth_login_succeeded' THEN 1 END) AS loginCount,
       COUNT(DISTINCT CASE WHEN feature_code <> 'account' THEN feature_code END) AS activeFeatureCount,
       COUNT(CASE WHEN feature_code <> 'account' AND result IN ('success','completed') THEN 1 END) AS validTaskCount
     FROM product_events WHERE DATE(occurred_at) = ? AND environment = 'production' AND user_id IS NOT NULL
       AND user_id NOT IN (SELECT id FROM users WHERE is_test_account = 1)
     GROUP BY user_id`, [date]
  );
  for (const row of userRows) {
    await pool.query(
      `INSERT INTO user_activity_daily (stat_date, user_id, login_count, active_feature_count, valid_task_count)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE login_count = VALUES(login_count), active_feature_count = VALUES(active_feature_count), valid_task_count = VALUES(valid_task_count)`,
      [date, row.userId, row.loginCount || 0, row.activeFeatureCount || 0, row.validTaskCount || 0]
    );
  }
  const [registeredRows] = await pool.query('SELECT COUNT(*) AS count FROM users WHERE DATE(created_at) <= ?', [date]);
  const [servedChildrenRows] = await pool.query("SELECT COUNT(*) AS count FROM children WHERE status = 'active' AND DATE(created_at) <= ?", [date]);
  const usageCount = featureRows.reduce((sum, row) => sum + Number(row.usageCount || 0), 0);
  const completionCount = featureRows.reduce((sum, row) => sum + Number(row.completionCount || 0), 0);
  await pool.query(
    `INSERT INTO project_metrics_daily
      (stat_date, registered_users, served_children, active_users, feature_usage_count, valid_completion_count)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE registered_users = VALUES(registered_users), served_children = VALUES(served_children),
       active_users = VALUES(active_users), feature_usage_count = VALUES(feature_usage_count), valid_completion_count = VALUES(valid_completion_count)`,
    [date, registeredRows[0]?.count || 0, servedChildrenRows[0]?.count || 0, userRows.filter((row) => Number(row.activeFeatureCount || 0) > 0).length, usageCount, completionCount]
  );
  return { date, featureRows: featureRows.length, userRows: userRows.length };
}

async function getPublicImpact() {
  const [latest] = await pool.query('SELECT * FROM project_metrics_daily ORDER BY stat_date DESC LIMIT 1');
  if (!latest[0]) return getProjectMetrics({ range: 'all' });
  const [usage] = await pool.query(
    `SELECT SUM(usage_count) AS usageCount, SUM(completion_count) AS completionCount,
       COUNT(DISTINCT CASE WHEN feature_code = 'course' THEN stat_date END) AS courseDays,
       SUM(CASE WHEN feature_code = 'course' THEN completion_count ELSE 0 END) AS completedCourses,
       SUM(CASE WHEN feature_code = 'homework' THEN completion_count ELSE 0 END) AS completedHomework,
       SUM(CASE WHEN feature_code = 'learning_report' THEN success_count ELSE 0 END) AS reportsGenerated,
       SUM(CASE WHEN feature_code = 'companion' THEN success_count ELSE 0 END) AS companionUses
     FROM feature_usage_daily WHERE feature_code <> 'account'`,
  );
  const [users] = await pool.query('SELECT COUNT(DISTINCT user_id) AS uniqueUsers FROM user_activity_daily WHERE active_feature_count > 0');
  const row = usage[0] || {};
  return {
    range: 'all',
    totals: {
      usageCount: Number(row.usageCount || latest[0].feature_usage_count || 0),
      successCount: 0,
      completionCount: Number(row.completionCount || latest[0].valid_completion_count || 0),
      uniqueUsers: Number(users[0]?.uniqueUsers || 0),
      completedCourses: Number(row.completedCourses || 0),
      completedHomework: Number(row.completedHomework || 0),
      reportsGenerated: Number(row.reportsGenerated || 0),
      companionUses: Number(row.companionUses || 0),
    },
    trend: [],
  };
}

module.exports = { getProjectMetrics, getPublicImpact, aggregateDate, rangeStart };
