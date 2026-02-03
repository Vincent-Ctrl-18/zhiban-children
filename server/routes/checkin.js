const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// 获取签到记录列表
router.get('/', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const { date, childId } = req.query;

    let sql = `
      SELECT dc.*, c.name as child_name, c.grade 
      FROM daily_checkins dc 
      JOIN children c ON dc.child_id = c.id 
      WHERE dc.institution_id = ?
    `;
    const params = [institutionId];

    if (date) {
      sql += ' AND dc.checkin_date = ?';
      params.push(date);
    }

    if (childId) {
      sql += ' AND dc.child_id = ?';
      params.push(childId);
    }

    sql += ' ORDER BY dc.checkin_date DESC, dc.checkin_time DESC';

    const [records] = await pool.query(sql, params);
    res.json(records);
  } catch (error) {
    console.error('获取签到记录失败:', error);
    res.status(500).json({ message: '获取签到记录失败' });
  }
});

// 获取今日签到状态（用于批量签到界面）
router.get('/today', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const today = new Date().toISOString().split('T')[0];

    // 获取所有儿童及其今日签到状态
    const [children] = await pool.query(`
      SELECT c.id, c.name, c.grade,
        dc.id as checkin_id, dc.checkin_time, dc.checkout_time, dc.status, dc.checkin_by, dc.checkout_by
      FROM children c
      LEFT JOIN daily_checkins dc ON c.id = dc.child_id AND dc.checkin_date = ?
      WHERE c.institution_id = ? AND c.status = 'active'
      ORDER BY c.name
    `, [today, institutionId]);

    res.json(children);
  } catch (error) {
    console.error('获取今日签到状态失败:', error);
    res.status(500).json({ message: '获取今日签到状态失败' });
  }
});

// 签到
router.post('/checkin', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const { childId, checkinBy, notes } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toTimeString().split(' ')[0];

    // 检查是否已签到
    const [existing] = await pool.query(
      'SELECT id FROM daily_checkins WHERE child_id = ? AND checkin_date = ?',
      [childId, today]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: '今日已签到' });
    }

    const [result] = await pool.query(
      `INSERT INTO daily_checkins (child_id, institution_id, checkin_date, checkin_time, checkin_by, status, notes)
       VALUES (?, ?, ?, ?, ?, 'present', ?)`,
      [childId, institutionId, today, now, checkinBy, notes]
    );

    res.status(201).json({ message: '签到成功', id: result.insertId });
  } catch (error) {
    console.error('签到失败:', error);
    res.status(500).json({ message: '签到失败，请稍后重试' });
  }
});

// 批量签到
router.post('/batch-checkin', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const { childIds, checkinBy } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toTimeString().split(' ')[0];

    let successCount = 0;
    for (const childId of childIds) {
      try {
        await pool.query(
          `INSERT INTO daily_checkins (child_id, institution_id, checkin_date, checkin_time, checkin_by, status)
           VALUES (?, ?, ?, ?, ?, 'present')
           ON DUPLICATE KEY UPDATE checkin_time = ?, checkin_by = ?`,
          [childId, institutionId, today, now, checkinBy, now, checkinBy]
        );
        successCount++;
      } catch (e) {
        console.error(`儿童 ${childId} 签到失败:`, e);
      }
    }

    res.json({ message: `成功签到 ${successCount} 人`, count: successCount });
  } catch (error) {
    console.error('批量签到失败:', error);
    res.status(500).json({ message: '批量签到失败，请稍后重试' });
  }
});

// 签退
router.post('/checkout', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    const { childId, checkoutBy } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toTimeString().split(' ')[0];

    const [result] = await pool.query(
      `UPDATE daily_checkins SET checkout_time = ?, checkout_by = ? 
       WHERE child_id = ? AND checkin_date = ?`,
      [now, checkoutBy, childId, today]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ message: '未找到签到记录，请先签到' });
    }

    res.json({ message: '签退成功' });
  } catch (error) {
    console.error('签退失败:', error);
    res.status(500).json({ message: '签退失败，请稍后重试' });
  }
});

// 标记缺勤
router.post('/absent', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const { childId, notes } = req.body;
    const today = new Date().toISOString().split('T')[0];

    await pool.query(
      `INSERT INTO daily_checkins (child_id, institution_id, checkin_date, status, notes)
       VALUES (?, ?, ?, 'absent', ?)
       ON DUPLICATE KEY UPDATE status = 'absent', notes = ?`,
      [childId, institutionId, today, notes, notes]
    );

    res.json({ message: '已标记缺勤' });
  } catch (error) {
    console.error('标记缺勤失败:', error);
    res.status(500).json({ message: '标记缺勤失败' });
  }
});

module.exports = router;
