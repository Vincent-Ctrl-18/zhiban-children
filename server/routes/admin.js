const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');
const { getPrompts, updatePrompt, resetPrompts, resetPrompt } = require('../config/promptManager');

const router = express.Router();

// 自动迁移：确保 resources 表包含审核相关字段
(async () => {
  try { await pool.query(`ALTER TABLE resources MODIFY COLUMN status ENUM('pending','approved','rejected','matched','completed') DEFAULT 'pending'`); } catch(e) {}
  try { await pool.query(`ALTER TABLE resources ADD COLUMN reject_reason VARCHAR(500) DEFAULT NULL AFTER status`); } catch(e) {}
  try { await pool.query(`ALTER TABLE resources ADD COLUMN reviewed_at TIMESTAMP NULL DEFAULT NULL AFTER reject_reason`); } catch(e) {}
  try { await pool.query(`ALTER TABLE resources ADD COLUMN reviewed_by VARCHAR(50) DEFAULT NULL AFTER reviewed_at`); } catch(e) {}
})();

// 管理员硬编码凭据
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = "asdfghjkl;'";

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
