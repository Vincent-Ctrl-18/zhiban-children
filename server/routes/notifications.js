const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// 获取通知列表
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { institutionId } = req.query;
    
    // 家长只能看到绑定孩子所在机构的通知
    let parentInstitutionIds = [];
    if (req.user.role === 'parent') {
      const [children] = await pool.query(
        'SELECT DISTINCT institution_id FROM children WHERE parent_id = ?',
        [req.user.id]
      );
      parentInstitutionIds = children.map(c => c.institution_id).filter(id => id);
      if (parentInstitutionIds.length === 0) {
        return res.json([]); // 没有绑定孩子，返回空数组
      }
    }

    let sql = `
      SELECT n.*, i.name as institution_name, u.real_name as creator_name
      FROM notifications n
      LEFT JOIN institutions i ON n.institution_id = i.id
      LEFT JOIN users u ON n.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    // 家长按绑定孩子的机构过滤，且只能看公开通知
    if (req.user.role === 'parent') {
      sql += ' AND n.is_public = TRUE';
      sql += ` AND n.institution_id IN (${parentInstitutionIds.map(() => '?').join(',')})`;
      params.push(...parentInstitutionIds);
    }

    // 托管机构只能看自己发布的
    if (req.user.role === 'institution') {
      sql += ' AND n.institution_id = ?';
      params.push(req.user.institutionId);
    }

    if (institutionId) {
      sql += ' AND n.institution_id = ?';
      params.push(institutionId);
    }

    sql += ' ORDER BY n.created_at DESC';

    const [notifications] = await pool.query(sql, params);
    res.json(notifications);
  } catch (error) {
    console.error('获取通知列表失败:', error);
    res.status(500).json({ message: '获取通知列表失败' });
  }
});

// 发布通知
router.post('/', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const createdBy = req.user.id;

    const { title, content, type, isPublic } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: '标题和内容为必填项' });
    }

    const [result] = await pool.query(
      `INSERT INTO notifications (institution_id, title, content, type, is_public, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [institutionId, title, content, type || 'announcement', isPublic !== false, createdBy]
    );

    res.status(201).json({ message: '通知发布成功', id: result.insertId });
  } catch (error) {
    console.error('发布通知失败:', error);
    res.status(500).json({ message: '发布通知失败' });
  }
});

// 删除通知
router.delete('/:id', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM notifications WHERE id = ? AND institution_id = ?',
      [req.params.id, req.user.institutionId]
    );
    res.json({ message: '通知删除成功' });
  } catch (error) {
    console.error('删除通知失败:', error);
    res.status(500).json({ message: '删除通知失败' });
  }
});

module.exports = router;
