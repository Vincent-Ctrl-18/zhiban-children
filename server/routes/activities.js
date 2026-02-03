const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// 获取活动记录列表
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { institutionId, startDate, endDate, type } = req.query;
    
    // 根据角色确定查询范围
    let queryInstitutionId = institutionId;
    if (req.user.role === 'institution') {
      queryInstitutionId = req.user.institutionId;
    }

    // 家长只能看到绑定孩子所在机构的活动
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
      SELECT a.*, i.name as institution_name, u.real_name as recorder_name
      FROM activities a
      LEFT JOIN institutions i ON a.institution_id = i.id
      LEFT JOIN users u ON a.recorder_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // 家长按绑定孩子的机构过滤
    if (req.user.role === 'parent' && parentInstitutionIds.length > 0) {
      sql += ` AND a.institution_id IN (${parentInstitutionIds.map(() => '?').join(',')})`;
      params.push(...parentInstitutionIds);
    } else if (queryInstitutionId) {
      sql += ' AND a.institution_id = ?';
      params.push(queryInstitutionId);
    }

    if (startDate) {
      sql += ' AND a.activity_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND a.activity_date <= ?';
      params.push(endDate);
    }

    if (type) {
      sql += ' AND a.activity_type = ?';
      params.push(type);
    }

    sql += ' ORDER BY a.activity_date DESC, a.start_time DESC';

    const [activities] = await pool.query(sql, params);
    
    // 处理 photos 字段 - MySQL 可能已经自动解析了 JSON
    activities.forEach(activity => {
      if (activity.photos) {
        // 如果已经是数组，直接使用
        if (Array.isArray(activity.photos)) {
          // 已经是数组，不需要处理
        } else if (typeof activity.photos === 'string') {
          // 如果是字符串，尝试解析
          try {
            activity.photos = JSON.parse(activity.photos);
          } catch (e) {
            activity.photos = [];
          }
        } else {
          activity.photos = [];
        }
      } else {
        activity.photos = [];
      }
    });

    res.json(activities);
  } catch (error) {
    console.error('获取活动记录失败:', error);
    res.status(500).json({ message: '获取活动记录失败' });
  }
});

// 获取单个活动详情
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const [activities] = await pool.query(`
      SELECT a.*, i.name as institution_name, u.real_name as recorder_name
      FROM activities a
      LEFT JOIN institutions i ON a.institution_id = i.id
      LEFT JOIN users u ON a.recorder_id = u.id
      WHERE a.id = ?
    `, [req.params.id]);

    if (activities.length === 0) {
      return res.status(404).json({ message: '未找到该活动记录' });
    }

    const activity = activities[0];
    if (activity.photos) {
      // 如果已经是数组，直接使用；如果是字符串，尝试解析
      if (!Array.isArray(activity.photos)) {
        try {
          activity.photos = JSON.parse(activity.photos);
        } catch (e) {
          activity.photos = [];
        }
      }
    } else {
      activity.photos = [];
    }

    res.json(activity);
  } catch (error) {
    console.error('获取活动详情失败:', error);
    res.status(500).json({ message: '获取活动详情失败' });
  }
});

// 添加活动记录
router.post('/', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const recorderId = req.user.id;

    const {
      activityDate,
      activityType,
      title,
      description,
      startTime,
      endTime,
      participantCount,
      photos
    } = req.body;

    if (!activityDate || !activityType || !title) {
      return res.status(400).json({ message: '日期、类型和标题为必填项' });
    }

    const [result] = await pool.query(
      `INSERT INTO activities (institution_id, activity_date, activity_type, title, description, 
        start_time, end_time, participant_count, photos, recorder_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [institutionId, activityDate, activityType, title, description,
        startTime, endTime, participantCount || 0, 
        photos ? JSON.stringify(photos) : null, recorderId]
    );

    res.status(201).json({ message: '活动记录添加成功', id: result.insertId });
  } catch (error) {
    console.error('添加活动记录失败:', error);
    res.status(500).json({ message: '添加活动记录失败' });
  }
});

// 更新活动记录
router.put('/:id', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    const {
      activityDate,
      activityType,
      title,
      description,
      startTime,
      endTime,
      participantCount,
      photos
    } = req.body;

    await pool.query(
      `UPDATE activities SET activity_date = ?, activity_type = ?, title = ?, 
        description = ?, start_time = ?, end_time = ?, participant_count = ?, photos = ?
       WHERE id = ? AND institution_id = ?`,
      [activityDate, activityType, title, description, startTime, endTime,
        participantCount, photos ? JSON.stringify(photos) : null,
        req.params.id, req.user.institutionId]
    );

    res.json({ message: '活动记录更新成功' });
  } catch (error) {
    console.error('更新活动记录失败:', error);
    res.status(500).json({ message: '更新活动记录失败' });
  }
});

// 删除活动记录
router.delete('/:id', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM activities WHERE id = ? AND institution_id = ?',
      [req.params.id, req.user.institutionId]
    );
    res.json({ message: '活动记录删除成功' });
  } catch (error) {
    console.error('删除活动记录失败:', error);
    res.status(500).json({ message: '删除活动记录失败' });
  }
});

module.exports = router;
