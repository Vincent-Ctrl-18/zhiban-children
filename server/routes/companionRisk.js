const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, requireRole('institution', 'admin'), async (req, res) => {
  try {
    const status = ['new', 'acknowledged', 'resolved'].includes(req.query.status) ? req.query.status : null;
    const params = [];
    let sql = `SELECT id, institution_id, session_id, category, severity, status, created_at, updated_at
      FROM companion_risk_events WHERE `;
    if (req.user.role === 'institution') { sql += 'institution_id = ?'; params.push(req.user.institutionId); }
    else { sql += '(institution_id IS NULL OR created_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 24 HOUR))'; }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY FIELD(severity, \'critical\', \'high\', \'medium\', \'low\'), created_at DESC LIMIT 100';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500).json({ message: '风险队列暂不可用', code: error.code }); }
});

router.post('/:id/status', authenticateToken, requireRole('institution', 'admin'), async (req, res) => {
  const status = req.body?.status;
  if (!['acknowledged', 'resolved'].includes(status)) return res.status(400).json({ message: '状态无效', code: 'INVALID_RISK_STATUS' });
  try {
    const [result] = req.user.role === 'institution'
      ? await pool.query('UPDATE companion_risk_events SET status = ? WHERE id = ? AND institution_id = ?', [status, req.params.id, req.user.institutionId])
      : await pool.query('UPDATE companion_risk_events SET status = ? WHERE id = ?', [status, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: '风险事件不存在', code: 'RISK_NOT_FOUND' });
    res.json({ id: req.params.id, status });
  } catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500).json({ message: '更新风险状态失败', code: error.code }); }
});

module.exports = router;
