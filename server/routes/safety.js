const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// 获取安全检查记录列表
router.get('/', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const { startDate, endDate } = req.query;

    let sql = `
      SELECT sc.*, u.real_name as checker_name 
      FROM safety_checks sc 
      LEFT JOIN users u ON sc.checker_id = u.id 
      WHERE sc.institution_id = ?
    `;
    const params = [institutionId];

    if (startDate) {
      sql += ' AND sc.check_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND sc.check_date <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY sc.check_date DESC';

    const [records] = await pool.query(sql, params);
    res.json(records);
  } catch (error) {
    console.error('获取安全检查记录失败:', error);
    res.status(500).json({ message: '获取安全检查记录失败' });
  }
});

// 获取今日安全检查状态
router.get('/today', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const today = new Date().toISOString().split('T')[0];

    const [records] = await pool.query(
      'SELECT * FROM safety_checks WHERE institution_id = ? AND check_date = ?',
      [institutionId, today]
    );

    if (records.length === 0) {
      return res.json({ checked: false, data: null });
    }

    res.json({ checked: true, data: records[0] });
  } catch (error) {
    console.error('获取今日安全检查状态失败:', error);
    res.status(500).json({ message: '获取今日安全检查状态失败' });
  }
});

// 提交安全检查
router.post('/', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const checkerId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    const {
      venueClean,
      furnitureSafe,
      electricalNormal,
      fireExitClear,
      extinguisherReady,
      waterHygieneOk,
      attendanceDone,
      pickupVerified,
      firstaidComplete,
      hasIncident,
      incidentNotes
    } = req.body;

    // 使用 UPSERT 确保每天只有一条记录
    await pool.query(
      `INSERT INTO safety_checks (
        institution_id, check_date, checker_id,
        venue_clean, furniture_safe, electrical_normal, fire_exit_clear,
        extinguisher_ready, water_hygiene_ok, attendance_done, pickup_verified,
        firstaid_complete, has_incident, incident_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        checker_id = ?, venue_clean = ?, furniture_safe = ?, electrical_normal = ?,
        fire_exit_clear = ?, extinguisher_ready = ?, water_hygiene_ok = ?,
        attendance_done = ?, pickup_verified = ?, firstaid_complete = ?,
        has_incident = ?, incident_notes = ?`,
      [
        institutionId, today, checkerId,
        venueClean, furnitureSafe, electricalNormal, fireExitClear,
        extinguisherReady, waterHygieneOk, attendanceDone, pickupVerified,
        firstaidComplete, hasIncident, incidentNotes,
        // UPDATE values
        checkerId, venueClean, furnitureSafe, electricalNormal,
        fireExitClear, extinguisherReady, waterHygieneOk,
        attendanceDone, pickupVerified, firstaidComplete,
        hasIncident, incidentNotes
      ]
    );

    res.json({ message: '安全检查提交成功' });
  } catch (error) {
    console.error('提交安全检查失败:', error);
    res.status(500).json({ message: '提交安全检查失败' });
  }
});

// 获取安全检查统计（近30天完成率）
router.get('/stats', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    const institutionId = req.user.institutionId;

    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_checks,
        SUM(CASE WHEN venue_clean AND furniture_safe AND electrical_normal AND fire_exit_clear 
            AND extinguisher_ready AND water_hygiene_ok AND attendance_done AND pickup_verified 
            AND firstaid_complete AND NOT has_incident THEN 1 ELSE 0 END) as perfect_checks,
        SUM(has_incident) as incident_count
      FROM safety_checks 
      WHERE institution_id = ? AND check_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `, [institutionId]);

    res.json(stats[0]);
  } catch (error) {
    console.error('获取安全检查统计失败:', error);
    res.status(500).json({ message: '获取安全检查统计失败' });
  }
});

module.exports = router;
