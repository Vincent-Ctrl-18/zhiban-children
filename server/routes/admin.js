const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');
const { getPrompts, updatePrompt, resetPrompts, resetPrompt } = require('../config/promptManager');
const { getProjectMetrics } = require('../services/metricsService');
const { evaluatePromptVersion } = require('../services/promptEvaluationService');
const { recordEvent } = require('../services/eventService');
const coursesRouter = require('./courses');

const router = express.Router();

// 自动迁移：确保 resources 表包含审核相关字段
(async () => {
  try { await pool.query(`ALTER TABLE resources MODIFY COLUMN status ENUM('pending','approved','rejected','matched','completed') DEFAULT 'pending'`); } catch(e) {}
  try { await pool.query(`ALTER TABLE resources ADD COLUMN reject_reason VARCHAR(500) DEFAULT NULL AFTER status`); } catch(e) {}
  try { await pool.query(`ALTER TABLE resources ADD COLUMN reviewed_at TIMESTAMP NULL DEFAULT NULL AFTER reject_reason`); } catch(e) {}
  try { await pool.query(`ALTER TABLE resources ADD COLUMN reviewed_by VARCHAR(50) DEFAULT NULL AFTER reviewed_at`); } catch(e) {}
})();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// 管理员 token 验证中间件
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: '未提供认证令牌' });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err || decoded.role !== 'admin') {
      return res.status(403).json({ message: '无管理员权限' });
    }
    req.user = decoded;
    next();
  });
};

// ===== 管理员登录 =====
router.post('/login', (req, res) => {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return res.status(503).json({ message: '管理员账号尚未配置' });
  }
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = jwt.sign(
      { id: 0, username: 'admin', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({
      token,
      user: { id: 0, username: 'admin', role: 'admin', realName: '开发者' },
    });
  } else {
    res.status(401).json({ message: '账号或密码错误' });
  }
});

// ===== 全局统计数据 =====
router.get('/statistics', authenticateAdmin, async (req, res) => {
  try {
    // 各角色用户数
    const [usersByRole] = await pool.query(
      `SELECT role, COUNT(*) as count FROM users GROUP BY role`
    );

    // 总用户数
    const [totalUsers] = await pool.query('SELECT COUNT(*) as total FROM users');

    // 机构数
    const [instCount] = await pool.query(
      `SELECT COUNT(*) as total FROM institutions WHERE status = 'active'`
    );

    // 儿童数
    const [childCount] = await pool.query(
      `SELECT COUNT(*) as total FROM children WHERE status = 'active'`
    );

    // 活动数
    const [activityCount] = await pool.query('SELECT COUNT(*) as total FROM activities');

    // 签到记录数
    const [checkinCount] = await pool.query('SELECT COUNT(*) as total FROM daily_checkins');

    // 安全检查数
    const [safetyCount] = await pool.query('SELECT COUNT(*) as total FROM safety_checks');

    // 资源数（按状态）
    const [resourcesByStatus] = await pool.query(
      `SELECT status, COUNT(*) as count FROM resources GROUP BY status`
    );

    // 通知数
    const [notifCount] = await pool.query('SELECT COUNT(*) as total FROM notifications');

    // 今日新增用户
    const [todayUsers] = await pool.query(
      `SELECT COUNT(*) as total FROM users WHERE DATE(created_at) = CURDATE()`
    );

    // 今日签到数
    const [todayCheckins] = await pool.query(
      `SELECT COUNT(*) as total FROM daily_checkins WHERE checkin_date = CURDATE()`
    );

    // 最近7天用户注册趋势
    const [userTrend] = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count 
      FROM users 
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) 
      GROUP BY DATE(created_at) ORDER BY date ASC
    `);

    // 角色分布 map
    const roleMap = {};
    usersByRole.forEach(r => { roleMap[r.role] = r.count; });

    const resourceStatusMap = {};
    resourcesByStatus.forEach(r => { resourceStatusMap[r.status] = r.count; });

    res.json({
      users: {
        total: totalUsers[0].total,
        parent: roleMap.parent || 0,
        institution: roleMap.institution || 0,
        resource: roleMap.resource || 0,
        government: roleMap.government || 0,
        student: roleMap.student || 0,
        todayNew: todayUsers[0].total,
      },
      institutions: instCount[0].total,
      children: childCount[0].total,
      activities: activityCount[0].total,
      checkins: checkinCount[0].total,
      safetyChecks: safetyCount[0].total,
      resources: {
        total: resourcesByStatus.reduce((sum, r) => sum + r.count, 0),
        pending: resourceStatusMap.pending || 0,
        approved: resourceStatusMap.approved || 0,
        rejected: resourceStatusMap.rejected || 0,
        matched: resourceStatusMap.matched || 0,
        completed: resourceStatusMap.completed || 0,
      },
      notifications: notifCount[0].total,
      todayCheckins: todayCheckins[0].total,
      userTrend,
    });
  } catch (error) {
    console.error('获取管理统计失败:', error);
    res.status(500).json({ message: '获取统计数据失败' });
  }
});

// ===== AI 作业辅导成果统计 =====
router.get('/statistics/homework', authenticateAdmin, async (req, res) => {
  const range = ['7d', '30d', 'all'].includes(req.query.range) ? req.query.range : '7d';
  const where = [
    `feature_code = 'homework'`,
    `environment = 'production'`,
    `(user_id IS NULL OR user_id NOT IN (SELECT id FROM users WHERE is_test_account = 1))`,
    `event_name IN (
      'homework_session_started',
      'homework_request_started',
      'homework_request_succeeded',
      'homework_request_failed',
      'homework_session_completed'
    )`,
  ];
  const params = [];
  if (range !== 'all') {
    const days = range === '30d' ? 29 : 6;
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - days);
    const pad = (value) => String(value).padStart(2, '0');
    const fromSql = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())} 00:00:00`;
    where.push('occurred_at >= ?');
    params.push(fromSql);
  }
  const whereSql = where.join(' AND ');

  try {
    const [totalsRows] = await pool.query(
      `SELECT
        SUM(event_name = 'homework_session_started') AS sessions_started,
        SUM(event_name = 'homework_request_started') AS attempts,
        SUM(event_name = 'homework_request_succeeded') AS successes,
        SUM(event_name = 'homework_request_failed') AS failures,
        SUM(event_name = 'homework_session_completed') AS completed_sessions,
        COUNT(DISTINCT CASE WHEN event_name = 'homework_request_started' THEN user_id END) AS unique_students,
        COUNT(DISTINCT CASE WHEN event_name = 'homework_request_succeeded' THEN session_id END) AS successful_sessions
       FROM product_events WHERE ${whereSql}`,
      params
    );
    const [trendRows] = await pool.query(
      `SELECT
        DATE_FORMAT(occurred_at, '%Y-%m-%d') AS date,
        SUM(event_name = 'homework_request_started') AS attempts,
        SUM(event_name = 'homework_request_succeeded') AS successes,
        SUM(event_name = 'homework_request_failed') AS failures,
        SUM(event_name = 'homework_session_completed') AS completions,
        COUNT(DISTINCT CASE WHEN event_name = 'homework_request_started' THEN user_id END) AS unique_students
       FROM product_events WHERE ${whereSql}
       GROUP BY DATE_FORMAT(occurred_at, '%Y-%m-%d') ORDER BY date ASC`,
      params
    );

    const totals = totalsRows[0] || {};
    const attempts = Number(totals.attempts || 0);
    const successes = Number(totals.successes || 0);
    const completedSessions = Number(totals.completed_sessions || 0);
    const successfulSessions = Number(totals.successful_sessions || 0);
    res.json({
      range,
      totals: {
        sessionsStarted: Number(totals.sessions_started || 0),
        attempts,
        successes,
        failures: Number(totals.failures || 0),
        completedSessions,
        uniqueStudents: Number(totals.unique_students || 0),
        successRate: attempts ? Number((successes / attempts).toFixed(4)) : 0,
        completionRate: successfulSessions ? Number((completedSessions / successfulSessions).toFixed(4)) : 0,
      },
      trend: trendRows.map((row) => ({
        date: row.date,
        attempts: Number(row.attempts || 0),
        successes: Number(row.successes || 0),
        failures: Number(row.failures || 0),
        completions: Number(row.completions || 0),
        uniqueStudents: Number(row.unique_students || 0),
      })),
    });
  } catch (error) {
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) {
      return res.json({
        range,
        totals: {
          sessionsStarted: 0,
          attempts: 0,
          successes: 0,
          failures: 0,
          completedSessions: 0,
          uniqueStudents: 0,
          successRate: 0,
          completionRate: 0,
        },
        trend: [],
        unavailable: true,
      });
    }
    console.error('获取 AI 作业统计失败:', error);
    res.status(500).json({ message: '获取 AI 作业统计失败' });
  }
});

// ===== 全站成果统计（仅汇总，不返回 AI 正文） =====
router.get('/statistics/project', authenticateAdmin, async (req, res) => {
  const range = ['7d', '30d', 'all'].includes(req.query.range) ? req.query.range : '7d';
  try {
    const data = await getProjectMetrics({
      range,
      featureCode: req.query.featureCode || null,
      role: req.query.role || null,
      institutionId: req.query.institutionId || null,
    });
    res.json({ ...data, definitions: {
      usageCount: '成功业务动作次数；不含页面刷新和按钮点击',
      completionCount: '学生或工作人员主动完成任务次数',
      uniqueUsers: '统计范围内去重的成功使用者',
    } });
  } catch (error) {
    console.error('获取全站成果统计失败:', error);
    const schemaMissing = ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code);
    res.status(schemaMissing ? 503 : 500).json({
      message: error.code === 'ER_NO_SUCH_TABLE' ? '成果统计表尚未迁移' : '获取成果统计失败',
      code: error.code || 'PROJECT_STATISTICS_ERROR',
    });
  }
});

router.get('/statistics/project.csv', authenticateAdmin, async (req, res) => {
  const range = ['7d', '30d', 'all'].includes(req.query.range) ? req.query.range : '7d';
  const rangeStart = { '7d': 'DATE_SUB(CURDATE(), INTERVAL 6 DAY)', '30d': 'DATE_SUB(CURDATE(), INTERVAL 29 DAY)', all: "CAST('1000-01-01' AS DATE)" }[range];
  const filters = [`occurred_at >= ${rangeStart}`, `environment = 'production'`, `COALESCE(user_role, '') <> 'admin'`, `(user_id IS NULL OR user_id NOT IN (SELECT id FROM users WHERE is_test_account = 1))`];
  const params = [];
  if (req.query.featureCode) { filters.push('feature_code = ?'); params.push(req.query.featureCode); }
  if (req.query.role) { filters.push('user_role = ?'); params.push(req.query.role); }
  if (req.query.institutionId) { filters.push('institution_id = ?'); params.push(req.query.institutionId); }
  try {
    const [rows] = await pool.query(
      `SELECT DATE(occurred_at) AS stat_date, feature_code, user_role, institution_id, result,
          COUNT(*) AS event_count, COUNT(DISTINCT user_id) AS unique_users
       FROM product_events WHERE ${filters.join(' AND ')}
       GROUP BY DATE(occurred_at), feature_code, user_role, institution_id, result
       ORDER BY stat_date ASC, feature_code ASC, result ASC`, params
    );
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['date', 'feature_code', 'user_role', 'institution_id', 'result', 'event_count', 'unique_users'].join(','),
      ...rows.map((row) => [row.stat_date, row.feature_code, row.user_role, row.institution_id, row.result, Number(row.event_count || 0), Number(row.unique_users || 0)].map(escape).join(',')),
    ];
    res.setHeader('Content-Disposition', 'attachment; filename="project-metrics.csv"');
    res.type('text/csv; charset=utf-8').send(`\uFEFF${lines.join('\n')}`);
  } catch (error) {
    res.status(['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code) ? 503 : 500).json({ message: 'CSV 导出暂不可用', code: error.code });
  }
});

router.get('/statistics/companion-risk', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT category, severity, status, COUNT(*) AS count
       FROM companion_risk_events
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       GROUP BY category, severity, status ORDER BY count DESC`
    );
    res.json(rows.map((row) => ({ ...row, count: Number(row.count) })));
  } catch (error) {
    res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500).json({ message: '风险统计暂不可用', code: error.code });
  }
});

// ===== ARK API Key 管理 =====
router.get('/api-key', authenticateAdmin, (req, res) => {
  const key = process.env.ARK_API_KEY || '';
  // 脱敏显示
  let masked = '';
  if (key && key !== 'your_doubao_api_key_here') {
    masked = key.substring(0, 8) + '****' + key.substring(key.length - 4);
  }
  res.json({ masked, isSet: key && key !== 'your_doubao_api_key_here' });
});

router.post('/api-key', authenticateAdmin, (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ message: '请提供有效的 API Key' });
  }
  try {
    // 写入 .env 文件
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = fs.readFileSync(envPath, 'utf-8');
    if (envContent.includes('ARK_API_KEY=')) {
      envContent = envContent.replace(/ARK_API_KEY=.*/, `ARK_API_KEY=${apiKey.trim()}`);
    } else {
      envContent += `\nARK_API_KEY=${apiKey.trim()}\n`;
    }
    fs.writeFileSync(envPath, envContent, 'utf-8');
    // 同时更新内存中的环境变量
    process.env.ARK_API_KEY = apiKey.trim();
    res.json({ message: 'API Key 已更新，即时生效' });
  } catch (error) {
    console.error('更新 API Key 失败:', error);
    res.status(500).json({ message: '更新失败' });
  }
});

// ===== 资源审核相关（复用 resources 表） =====
// 获取全部资源（管理员视角）
router.get('/resources', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT r.*, u.real_name as submitter_name, u.phone as submitter_phone
      FROM resources r 
      LEFT JOIN users u ON r.user_id = u.id
    `;
    const params = [];
    if (status) {
      sql += ' WHERE r.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY r.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('获取资源列表失败:', error);
    res.status(500).json({ message: '获取资源列表失败' });
  }
});

// 审核资源（增强版：支持拒绝原因、审核时间戳）
router.post('/resources/:id/approve', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectReason } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: '无效的审核状态' });
    }
    await pool.query(
      `UPDATE resources SET status = ?, reject_reason = ?, reviewed_at = NOW(), reviewed_by = ? WHERE id = ?`,
      [status, status === 'rejected' ? (rejectReason || null) : null, 'admin', id]
    );
    res.json({ message: status === 'approved' ? '已通过审核' : '已拒绝' });
  } catch (error) {
    console.error('审核操作失败:', error);
    res.status(500).json({ message: '操作失败' });
  }
});

// ===== API Key 连接测试 =====
router.post('/api-key/test', authenticateAdmin, async (req, res) => {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey || apiKey === 'your_doubao_api_key_here') {
    return res.json({ success: false, message: 'API Key 未配置' });
  }
  try {
    let fetchFn;
    try { fetchFn = (await import('node-fetch')).default; } catch { fetchFn = global.fetch; }
    const response = await fetchFn('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'doubao-seed-1-8-251228',
        messages: [{ role: 'user', content: '你好' }],
        max_tokens: 10,
      }),
    });
    if (response.ok) {
      res.json({ success: true, message: 'API Key 有效，连接正常 ✅' });
    } else {
      res.json({ success: false, message: `验证失败 (HTTP ${response.status})` });
    }
  } catch (error) {
    res.json({ success: false, message: `连接失败: ${error.message}` });
  }
});

// ===== 用户管理 =====
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const { role, keyword, page = 1, pageSize = 20 } = req.query;
    const offset = (Math.max(1, Number(page)) - 1) * Number(pageSize);
    const limit = Math.min(100, Math.max(1, Number(pageSize)));

    let where = 'WHERE 1=1';
    const params = [];
    if (role) {
      where += ' AND u.role = ?';
      params.push(role);
    }
    if (keyword) {
      where += ' AND (u.username LIKE ? OR u.real_name LIKE ? OR u.phone LIKE ? OR u.email LIKE ? OR u.organization LIKE ?)';
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw, kw, kw);
    }

    const countSql = `SELECT COUNT(*) as total FROM users u ${where}`;
    const [countResult] = await pool.query(countSql, params);
    const total = countResult[0].total;

    const dataSql = `
      SELECT u.id, u.username, u.role, u.real_name, u.phone, u.email, u.organization,
             u.email_verified, u.institution_id, u.created_at, u.updated_at,
             i.name as institution_name
      FROM users u
      LEFT JOIN institutions i ON u.institution_id = i.id
      ${where}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(dataSql, [...params, limit, offset]);

    res.json({ total, page: Number(page), pageSize: limit, list: rows });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ message: '获取用户列表失败' });
  }
});

// ===== Prompt 管理 =====
router.get('/prompts', authenticateAdmin, (req, res) => {
  try {
    const prompts = getPrompts();
    res.json(prompts);
  } catch (error) {
    console.error('获取 Prompt 配置失败:', error);
    res.status(500).json({ message: '获取 Prompt 配置失败' });
  }
});

// ===== 电子书审核 =====
router.get('/courses', authenticateAdmin, async (req, res) => {
  try {
    const status = ['pending', 'published', 'rejected', 'disabled'].includes(req.query.status) ? req.query.status : null;
    const params = [];
    let sql = `
      SELECT c.id, c.title, c.file_type, c.file_name, c.file_size, c.author, c.description,
             c.category, c.grade_min, c.grade_max, c.cover_path, c.source_note,
             c.allow_download, c.review_status, c.reject_reason, c.created_at, c.published_at,
             u.real_name AS uploader_name
      FROM course_resources c
      LEFT JOIN users u ON u.id = c.uploaded_by
      WHERE COALESCE(c.resource_kind, IF(c.file_type = 'video', 'video', 'document')) = 'ebook'`;
    if (status) { sql += ' AND c.review_status = ?'; params.push(status); }
    sql += ' ORDER BY FIELD(c.review_status, \'pending\', \'published\', \'rejected\', \'disabled\'), c.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('获取电子书审核列表失败:', error);
    res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500).json({ message: '获取电子书列表失败', code: error.code });
  }
});

router.get('/courses/:id/content', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM course_resources
       WHERE id = ? AND COALESCE(resource_kind, IF(file_type = 'video', 'video', 'document')) = 'ebook' LIMIT 1`, [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: '电子书不存在' });
    return coursesRouter.sendPrivateBook(res, rows[0], 'inline');
  } catch (error) {
    console.error('管理员预览电子书失败:', error);
    return res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500).json({ message: '预览电子书失败', code: error.code });
  }
});

router.post('/courses/:id/review', authenticateAdmin, async (req, res) => {
  const status = String(req.body?.status || '');
  const rejectReason = String(req.body?.rejectReason || '').trim();
  if (!['published', 'rejected', 'disabled'].includes(status)) {
    return res.status(400).json({ message: '无效的电子书审核状态' });
  }
  if (status === 'rejected' && !rejectReason) return res.status(400).json({ message: '拒绝时必须填写原因' });
  try {
    const [rows] = await pool.query(
      `SELECT id, title FROM course_resources
       WHERE id = ? AND COALESCE(resource_kind, IF(file_type = 'video', 'video', 'document')) = 'ebook' LIMIT 1`, [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: '电子书不存在' });
    await pool.query(
      `UPDATE course_resources
       SET review_status = ?, reject_reason = ?, published_by = ?,
           published_at = CASE WHEN ? = 'published' THEN CURRENT_TIMESTAMP ELSE published_at END
       WHERE id = ?`,
      [status, status === 'rejected' ? rejectReason : null, req.user.id || 0, status, req.params.id]
    );
    await recordEvent({
      eventName: status === 'published' ? 'ebook_published' : 'ebook_reviewed',
      userId: req.user.id || 0, userRole: 'admin', objectId: req.params.id,
      metadata: { reviewStatus: status },
    });
    res.json({ id: Number(req.params.id), status, message: status === 'published' ? '电子书已发布' : status === 'disabled' ? '电子书已下架' : '电子书已拒绝' });
  } catch (error) {
    console.error('审核电子书失败:', error);
    res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500).json({ message: '审核电子书失败', code: error.code });
  }
});

router.patch('/courses/:id/download-policy', authenticateAdmin, async (req, res) => {
  if (typeof req.body?.allowDownload !== 'boolean') return res.status(400).json({ message: 'allowDownload 必须是布尔值' });
  try {
    const [result] = await pool.query(
      `UPDATE course_resources SET allow_download = ?
       WHERE id = ? AND COALESCE(resource_kind, IF(file_type = 'video', 'video', 'document')) = 'ebook'`,
      [req.body.allowDownload ? 1 : 0, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: '电子书不存在' });
    res.json({ id: Number(req.params.id), allowDownload: req.body.allowDownload });
  } catch (error) {
    res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500).json({ message: '更新下载权限失败', code: error.code });
  }
});

// Prompt 版本生命周期（旧 JSON Prompt 接口继续兼容）
router.get('/prompts/versions', authenticateAdmin, async (req, res) => {
  try {
    const params = [];
    let sql = 'SELECT id, agent_type, version, status, change_note, created_by, created_at FROM ai_prompt_versions';
    if (req.query.agentType) { sql += ' WHERE agent_type = ?'; params.push(req.query.agentType); }
    sql += ' ORDER BY created_at DESC LIMIT 100';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500).json({ message: 'Prompt 版本表尚未迁移', code: error.code }); }
});

router.post('/prompts/versions', authenticateAdmin, async (req, res) => {
  const agentType = ['homework', 'report', 'companion'].includes(req.body?.agentType) ? req.body.agentType : null;
  if (!agentType || !req.body?.config) return res.status(400).json({ message: 'agentType 和 config 为必填项' });
  try {
    const version = String(req.body.version || `draft-${Date.now()}`).slice(0, 40);
    const [result] = await pool.query(
      `INSERT INTO ai_prompt_versions (agent_type, version, status, config, change_note, created_by) VALUES (?, ?, 'draft', ?, ?, ?)`,
      [agentType, version, JSON.stringify(req.body.config), String(req.body.changeNote || '').slice(0, 500) || null, req.user.id || 0]
    );
    res.status(201).json({ id: result.insertId, agentType, version, status: 'draft' });
  } catch (error) { res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ message: error.message || '创建 Prompt 版本失败', code: error.code }); }
});

router.post('/prompts/versions/:id/test', authenticateAdmin, async (req, res) => {
  try {
    const result = await evaluatePromptVersion(req.params.id, req.user.id);
    res.json(result);
  } catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : (error.status || 500)).json({ message: error.message || 'Prompt 测试失败', code: error.code }); }
});

router.post('/prompts/versions/:id/publish', authenticateAdmin, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM ai_prompt_versions WHERE id = ? LIMIT 1 FOR UPDATE', [req.params.id]);
    if (!rows[0]) { await connection.rollback(); return res.status(404).json({ message: 'Prompt 版本不存在' }); }
    if (!['tested', 'published'].includes(rows[0].status)) { await connection.rollback(); return res.status(409).json({ message: 'Prompt 必须先通过测试' }); }
    await connection.query('UPDATE ai_prompt_versions SET status = \'published\' WHERE id = ?', [req.params.id]);
    await connection.query('INSERT INTO ai_prompt_deployments (agent_type, prompt_version, rollout_percent, deployed_by) VALUES (?, ?, ?, ?)', [rows[0].agent_type, rows[0].version, Math.min(100, Math.max(1, Number(req.body?.rolloutPercent) || 100)), req.user.id || 0]);
    await connection.commit();
    res.json({ id: rows[0].id, agentType: rows[0].agent_type, version: rows[0].version, status: 'published' });
  } catch (error) { await connection.rollback(); res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500).json({ message: '发布 Prompt 失败', code: error.code }); }
  finally { connection.release(); }
});

router.post('/prompts/versions/:id/rollback', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM ai_prompt_versions WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Prompt 版本不存在' });
    await pool.query('UPDATE ai_prompt_deployments SET rolled_back_at = CURRENT_TIMESTAMP WHERE agent_type = ? AND prompt_version = ? AND rolled_back_at IS NULL', [rows[0].agent_type, rows[0].version]);
    await pool.query('UPDATE ai_prompt_versions SET status = \'archived\' WHERE id = ?', [req.params.id]);
    res.json({ id: rows[0].id, status: 'archived' });
  } catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500).json({ message: '回滚 Prompt 失败', code: error.code }); }
});

router.put('/prompts/:type', authenticateAdmin, (req, res) => {
  try {
    const { type } = req.params;
    const { systemPrompt, maxTokens, temperature, name, role, description } = req.body;
    const updates = {};
    if (systemPrompt !== undefined) updates.systemPrompt = systemPrompt;
    if (maxTokens !== undefined) updates.maxTokens = Number(maxTokens);
    if (temperature !== undefined) updates.temperature = Number(temperature);
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (description !== undefined) updates.description = description;
    const updated = updatePrompt(type, updates);
    res.json({ message: 'Prompt 已更新，即时生效', prompt: updated });
  } catch (error) {
    console.error('更新 Prompt 失败:', error);
    res.status(400).json({ message: error.message || '更新失败' });
  }
});

router.post('/prompts/reset', authenticateAdmin, (req, res) => {
  try {
    const { type } = req.body;
    if (type) {
      const prompt = resetPrompt(type);
      res.json({ message: `「${prompt.name}」已重置为默认值`, prompt });
    } else {
      const prompts = resetPrompts();
      res.json({ message: '所有 Prompt 已重置为默认值', prompts });
    }
  } catch (error) {
    console.error('重置 Prompt 失败:', error);
    res.status(400).json({ message: error.message || '重置失败' });
  }
});

module.exports = router;
