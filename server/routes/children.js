const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// 获取儿童列表（托管机构）
router.get('/', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const { status, search } = req.query;

    let sql = 'SELECT * FROM children WHERE institution_id = ?';
    const params = [institutionId];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (search) {
      sql += ' AND (name LIKE ? OR school LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY created_at DESC';

    const [children] = await pool.query(sql, params);
    res.json(children);
  } catch (error) {
    console.error('获取儿童列表失败:', error);
    res.status(500).json({ message: '获取儿童列表失败' });
  }
});

// 获取单个儿童信息
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const [children] = await pool.query('SELECT * FROM children WHERE id = ?', [req.params.id]);
    
    if (children.length === 0) {
      return res.status(404).json({ message: '未找到该儿童信息' });
    }

    res.json(children[0]);
  } catch (error) {
    console.error('获取儿童信息失败:', error);
    res.status(500).json({ message: '获取儿童信息失败' });
  }
});

// 添加儿童信息
router.post('/', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const {
      name, gender, birthDate, idCard, school, grade,
      guardianName, guardianPhone, guardianRelation,
      healthStatus, notes, parentId
    } = req.body;

    if (!name || !gender) {
      return res.status(400).json({ message: '姓名和性别为必填项' });
    }

    const [result] = await pool.query(
      `INSERT INTO children (institution_id, parent_id, name, gender, birth_date, id_card, school, grade, 
        guardian_name, guardian_phone, guardian_relation, health_status, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [institutionId, parentId || null, name, gender, birthDate, idCard, school, grade,
        guardianName, guardianPhone, guardianRelation, healthStatus, notes]
    );

    res.status(201).json({ message: '添加成功', id: result.insertId });
  } catch (error) {
    console.error('添加儿童信息失败:', error);
    res.status(500).json({ message: '添加失败，请稍后重试' });
  }
});

// 更新儿童信息
router.put('/:id', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    const {
      name, gender, birthDate, idCard, school, grade,
      guardianName, guardianPhone, guardianRelation,
      healthStatus, notes, status, parentId
    } = req.body;

    await pool.query(
      `UPDATE children SET name = ?, gender = ?, birth_date = ?, id_card = ?, 
        school = ?, grade = ?, guardian_name = ?, guardian_phone = ?, 
        guardian_relation = ?, health_status = ?, notes = ?, status = ?, parent_id = ?
       WHERE id = ? AND institution_id = ?`,
      [name, gender, birthDate, idCard, school, grade,
        guardianName, guardianPhone, guardianRelation,
        healthStatus, notes, status || 'active', parentId || null,
        req.params.id, req.user.institutionId]
    );

    res.json({ message: '更新成功' });
  } catch (error) {
    console.error('更新儿童信息失败:', error);
    res.status(500).json({ message: '更新失败，请稍后重试' });
  }
});

// 删除儿童信息
router.delete('/:id', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM children WHERE id = ? AND institution_id = ?',
      [req.params.id, req.user.institutionId]
    );
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除儿童信息失败:', error);
    res.status(500).json({ message: '删除失败，请稍后重试' });
  }
});

// 家长查看自己孩子的信息
router.get('/parent/my-children', authenticateToken, requireRole('parent'), async (req, res) => {
  try {
    const [children] = await pool.query(
      `SELECT c.*, i.name as institution_name 
       FROM children c
       LEFT JOIN institutions i ON c.institution_id = i.id
       WHERE c.parent_id = ?`,
      [req.user.id]
    );
    res.json(children);
  } catch (error) {
    console.error('获取孩子信息失败:', error);
    res.status(500).json({ message: '获取孩子信息失败' });
  }
});

module.exports = router;
