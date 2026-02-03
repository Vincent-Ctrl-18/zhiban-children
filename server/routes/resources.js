const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// 获取资源列表（公开）
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { orgType, resourceType, status } = req.query;

    let sql = `
      SELECT r.*, u.real_name as provider_name
      FROM resources r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // 资源方只能看自己的，其他角色可以看所有已审核的
    if (req.user.role === 'resource') {
      sql += ' AND r.user_id = ?';
      params.push(req.user.id);
    } else {
      sql += ' AND r.status != "pending"';
    }

    if (orgType) {
      sql += ' AND r.org_type = ?';
      params.push(orgType);
    }

    if (resourceType) {
      sql += ' AND r.resource_type = ?';
      params.push(resourceType);
    }

    if (status) {
      sql += ' AND r.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY r.created_at DESC';

    const [resources] = await pool.query(sql, params);
    res.json(resources);
  } catch (error) {
    console.error('获取资源列表失败:', error);
    res.status(500).json({ message: '获取资源列表失败' });
  }
});

// 获取所有资源（政府/管理员查看，包括待审核）
router.get('/all', authenticateToken, requireRole('government'), async (req, res) => {
  try {
    const { status } = req.query;

    let sql = `
      SELECT r.*, u.real_name as provider_name
      FROM resources r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND r.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY r.created_at DESC';

    const [resources] = await pool.query(sql, params);
    res.json(resources);
  } catch (error) {
    console.error('获取资源列表失败:', error);
    res.status(500).json({ message: '获取资源列表失败' });
  }
});

// 获取单个资源详情
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const [resources] = await pool.query(`
      SELECT r.*, u.real_name as provider_name
      FROM resources r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.id = ?
    `, [req.params.id]);

    if (resources.length === 0) {
      return res.status(404).json({ message: '未找到该资源' });
    }

    res.json(resources[0]);
  } catch (error) {
    console.error('获取资源详情失败:', error);
    res.status(500).json({ message: '获取资源详情失败' });
  }
});

// 提交资源登记
router.post('/', authenticateToken, requireRole('resource'), async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      orgType,
      orgName,
      resourceType,
      resourceTitle,
      resourceDescription,
      contactName,
      contactPhone,
      contactEmail
    } = req.body;

    if (!orgType || !orgName || !resourceType || !resourceTitle) {
      return res.status(400).json({ message: '组织类型、名称、资源类型和标题为必填项' });
    }

    const [result] = await pool.query(
      `INSERT INTO resources (user_id, org_type, org_name, resource_type, resource_title, 
        resource_description, contact_name, contact_phone, contact_email, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [userId, orgType, orgName, resourceType, resourceTitle,
        resourceDescription, contactName, contactPhone, contactEmail]
    );

    res.status(201).json({ message: '资源登记提交成功，等待审核', id: result.insertId });
  } catch (error) {
    console.error('提交资源登记失败:', error);
    res.status(500).json({ message: '提交资源登记失败' });
  }
});

// 更新资源信息
router.put('/:id', authenticateToken, requireRole('resource'), async (req, res) => {
  try {
    const {
      orgType,
      orgName,
      resourceType,
      resourceTitle,
      resourceDescription,
      contactName,
      contactPhone,
      contactEmail
    } = req.body;

    await pool.query(
      `UPDATE resources SET org_type = ?, org_name = ?, resource_type = ?, 
        resource_title = ?, resource_description = ?, contact_name = ?, 
        contact_phone = ?, contact_email = ?
       WHERE id = ? AND user_id = ?`,
      [orgType, orgName, resourceType, resourceTitle, resourceDescription,
        contactName, contactPhone, contactEmail,
        req.params.id, req.user.id]
    );

    res.json({ message: '资源信息更新成功' });
  } catch (error) {
    console.error('更新资源信息失败:', error);
    res.status(500).json({ message: '更新资源信息失败' });
  }
});

// 审核资源（政府/管理员）
router.post('/:id/approve', authenticateToken, requireRole('government'), async (req, res) => {
  try {
    const { status } = req.body; // approved 或 rejected

    await pool.query(
      'UPDATE resources SET status = ? WHERE id = ?',
      [status, req.params.id]
    );

    res.json({ message: status === 'approved' ? '资源已审核通过' : '资源已拒绝' });
  } catch (error) {
    console.error('审核资源失败:', error);
    res.status(500).json({ message: '审核资源失败' });
  }
});

// 删除资源
router.delete('/:id', authenticateToken, requireRole('resource'), async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM resources WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    res.json({ message: '资源删除成功' });
  } catch (error) {
    console.error('删除资源失败:', error);
    res.status(500).json({ message: '删除资源失败' });
  }
});

module.exports = router;
