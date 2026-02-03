const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// 获取所有家长用户列表（供托管机构选择绑定）
router.get('/', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    const { search } = req.query;

    let sql = `
      SELECT id, username, real_name, phone 
      FROM users 
      WHERE role = 'parent'
    `;
    const params = [];

    if (search) {
      sql += ' AND (real_name LIKE ? OR phone LIKE ? OR username LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY real_name ASC';

    const [parents] = await pool.query(sql, params);
    res.json(parents);
  } catch (error) {
    console.error('获取家长列表失败:', error);
    res.status(500).json({ message: '获取家长列表失败' });
  }
});

module.exports = router;
