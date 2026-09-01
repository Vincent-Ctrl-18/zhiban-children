const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getPublicImpact } = require('../services/metricsService');

const router = express.Router();

// 对外仅返回全局汇总；不返回个人、机构明细或 AI 原始内容。
router.get('/impact', async (req, res) => {
  try {
    const data = await getPublicImpact();
    res.json({
      updatedAt: new Date().toISOString(),
      metrics: data.totals,
      trend: data.trend,
      note: '成果数据按成功业务动作统计，按日更新。',
    });
  } catch (error) {
    console.error('获取公开成果统计失败:', error);
    res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500).json({ message: '成果数据暂不可用', code: error.code });
  }
});

router.get('/impact/institutions', authenticateToken, requireRole('government'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.institution_id AS institutionId, COALESCE(i.name, '未绑定机构') AS institutionName,
         SUM(f.usage_count) AS usageCount, SUM(f.completion_count) AS completionCount,
         SUM(f.unique_users) AS uniqueUsers
       FROM feature_usage_daily f LEFT JOIN institutions i ON i.id = f.institution_id
       WHERE f.institution_id <> 0 GROUP BY f.institution_id, i.name ORDER BY usageCount DESC LIMIT 100`
    );
    res.json(rows.map((row) => ({ ...row, usageCount: Number(row.usageCount || 0), completionCount: Number(row.completionCount || 0), uniqueUsers: Number(row.uniqueUsers || 0) })));
  } catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500).json({ message: '机构成果数据暂不可用', code: error.code }); }
});

// 获取数据看板统计（公开/政府）
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    // 获取总服务儿童数
    const [childrenCount] = await pool.query(
      'SELECT COUNT(*) as total FROM children WHERE status = "active"'
    );

    // 获取总活动数
    const [activitiesCount] = await pool.query(
      'SELECT COUNT(*) as total FROM activities'
    );

    // 获取志愿者参与次数（资源方用户数作为替代）
    const [volunteersCount] = await pool.query(
      'SELECT COUNT(*) as total FROM users WHERE role = "resource"'
    );

    // 获取合作资源数
    const [resourcesCount] = await pool.query(
      'SELECT COUNT(*) as total FROM resources WHERE status = "approved"'
    );

    // 获取托管机构数
    const [institutionsCount] = await pool.query(
      'SELECT COUNT(*) as total FROM institutions WHERE status = "active"'
    );

    // 获取本月新增儿童数
    const [monthlyChildren] = await pool.query(`
      SELECT COUNT(*) as total FROM children 
      WHERE MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())
    `);

    // 获取本月活动数
    const [monthlyActivities] = await pool.query(`
      SELECT COUNT(*) as total FROM activities 
      WHERE MONTH(activity_date) = MONTH(CURDATE()) AND YEAR(activity_date) = YEAR(CURDATE())
    `);

    res.json({
      totalChildren: childrenCount[0].total,
      totalActivities: activitiesCount[0].total,
      totalVolunteers: volunteersCount[0].total,
      totalResources: resourcesCount[0].total,
      totalInstitutions: institutionsCount[0].total,
      monthlyChildren: monthlyChildren[0].total,
      monthlyActivities: monthlyActivities[0].total
    });
  } catch (error) {
    console.error('获取统计数据失败:', error);
    res.status(500).json({ message: '获取统计数据失败' });
  }
});

// 获取活动趋势（近6个月）
router.get('/activity-trend', authenticateToken, async (req, res) => {
  try {
    const [trend] = await pool.query(`
      SELECT 
        DATE_FORMAT(activity_date, '%Y-%m') as month,
        COUNT(*) as count,
        SUM(participant_count) as participants
      FROM activities
      WHERE activity_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(activity_date, '%Y-%m')
      ORDER BY month ASC
    `);

    res.json(trend);
  } catch (error) {
    console.error('获取活动趋势失败:', error);
    res.status(500).json({ message: '获取活动趋势失败' });
  }
});

// 获取活动类型分布
router.get('/activity-types', authenticateToken, async (req, res) => {
  try {
    const [types] = await pool.query(`
      SELECT 
        activity_type as type,
        COUNT(*) as count
      FROM activities
      GROUP BY activity_type
    `);

    res.json(types);
  } catch (error) {
    console.error('获取活动类型分布失败:', error);
    res.status(500).json({ message: '获取活动类型分布失败' });
  }
});

// 获取资源类型分布
router.get('/resource-types', authenticateToken, async (req, res) => {
  try {
    const [types] = await pool.query(`
      SELECT 
        resource_type as type,
        COUNT(*) as count
      FROM resources
      WHERE status = 'approved'
      GROUP BY resource_type
    `);

    res.json(types);
  } catch (error) {
    console.error('获取资源类型分布失败:', error);
    res.status(500).json({ message: '获取资源类型分布失败' });
  }
});

// 获取各机构儿童数排名
router.get('/institution-ranking', authenticateToken, requireRole('government'), async (req, res) => {
  try {
    const [ranking] = await pool.query(`
      SELECT 
        i.name as institution_name,
        COUNT(c.id) as children_count,
        i.capacity
      FROM institutions i
      LEFT JOIN children c ON i.id = c.institution_id AND c.status = 'active'
      WHERE i.status = 'active'
      GROUP BY i.id
      ORDER BY children_count DESC
      LIMIT 10
    `);

    res.json(ranking);
  } catch (error) {
    console.error('获取机构排名失败:', error);
    res.status(500).json({ message: '获取机构排名失败' });
  }
});

module.exports = router;
