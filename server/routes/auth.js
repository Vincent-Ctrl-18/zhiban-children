const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 生成8位邀请码
const generateInviteCode = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

// 用户注册
router.post('/register', async (req, res) => {
  try {
    const { username, password, role, realName, phone, organization, inviteCode, isNewInstitution } = req.body;

    // 验证必填字段
    if (!username || !password || !role) {
      return res.status(400).json({ message: '用户名、密码和角色为必填项' });
    }

    // 检查用户名是否已存在
    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(400).json({ message: '用户名已存在' });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    let institutionId = null;

    // 托管机构角色特殊处理
    if (role === 'institution') {
      if (inviteCode) {
        // 使用邀请码加入现有机构
        const [institutions] = await pool.query(
          'SELECT id, name FROM institutions WHERE invite_code = ?',
          [inviteCode]
        );
        if (institutions.length === 0) {
          return res.status(400).json({ message: '邀请码无效，请检查后重试' });
        }
        institutionId = institutions[0].id;
      } else if (isNewInstitution && organization) {
        // 创建新机构 - 先插入用户，再创建机构
        const [userResult] = await pool.query(
          'INSERT INTO users (username, password, role, real_name, phone, organization) VALUES (?, ?, ?, ?, ?, ?)',
          [username, hashedPassword, role, realName, phone, organization]
        );

        const newInviteCode = generateInviteCode();
        const [instResult] = await pool.query(
          'INSERT INTO institutions (user_id, name, contact_person, contact_phone, invite_code) VALUES (?, ?, ?, ?, ?)',
          [userResult.insertId, organization, realName, phone, newInviteCode]
        );

        // 更新用户的 institution_id
        await pool.query('UPDATE users SET institution_id = ? WHERE id = ?', [instResult.insertId, userResult.insertId]);

        return res.status(201).json({ 
          message: '注册成功，机构创建成功', 
          userId: userResult.insertId,
          inviteCode: newInviteCode,
          institutionName: organization
        });
      } else {
        return res.status(400).json({ message: '请选择创建新机构或输入邀请码加入现有机构' });
      }
    }

    // 插入用户（普通用户或使用邀请码加入机构的用户）
    const [result] = await pool.query(
      'INSERT INTO users (username, password, role, real_name, phone, organization, institution_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [username, hashedPassword, role, realName, phone, organization, institutionId]
    );

    res.status(201).json({ message: '注册成功', userId: result.insertId });
  } catch (error) {
    console.error('注册失败:', error);
    res.status(500).json({ message: '注册失败，请稍后重试' });
  }
});

// 用户登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: '请输入用户名和密码' });
    }

    // 查询用户
    const [users] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    const user = users[0];

    // 验证密码
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    // 如果是托管机构，获取机构ID（优先使用 institution_id 字段）
    let institutionId = null;
    let institutionName = null;
    if (user.role === 'institution') {
      if (user.institution_id) {
        institutionId = user.institution_id;
        const [inst] = await pool.query('SELECT name FROM institutions WHERE id = ?', [institutionId]);
        if (inst.length > 0) {
          institutionName = inst[0].name;
        }
      } else {
        // 兼容旧数据：通过 user_id 查找
        const [institutions] = await pool.query('SELECT id, name FROM institutions WHERE user_id = ?', [user.id]);
        if (institutions.length > 0) {
          institutionId = institutions[0].id;
          institutionName = institutions[0].name;
        }
      }
    }

    // 生成JWT
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role,
        institutionId 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: '登录成功',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        realName: user.real_name,
        phone: user.phone,
        organization: user.organization,
        institutionId,
        institutionName
      }
    });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ message: '登录失败，请稍后重试' });
  }
});

// 获取当前用户信息
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, username, role, real_name, phone, email, organization, avatar, institution_id FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }

    const user = users[0];
    
    // 如果是托管机构，获取机构信息
    if (user.role === 'institution') {
      let institutionId = user.institution_id;
      // 兼容旧数据
      if (!institutionId) {
        const [oldInst] = await pool.query('SELECT id FROM institutions WHERE user_id = ?', [user.id]);
        if (oldInst.length > 0) {
          institutionId = oldInst[0].id;
        }
      }
      if (institutionId) {
        const [institutions] = await pool.query('SELECT * FROM institutions WHERE id = ?', [institutionId]);
        if (institutions.length > 0) {
          user.institution = institutions[0];
        }
      }
    }

    res.json(user);
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({ message: '获取用户信息失败' });
  }
});

// 获取机构邀请码（仅机构管理员）
router.get('/institution/invite-code', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'institution' || !req.user.institutionId) {
      return res.status(403).json({ message: '无权限访问' });
    }

    const [institutions] = await pool.query(
      'SELECT invite_code, name FROM institutions WHERE id = ?',
      [req.user.institutionId]
    );

    if (institutions.length === 0) {
      return res.status(404).json({ message: '机构不存在' });
    }

    res.json({ 
      inviteCode: institutions[0].invite_code,
      institutionName: institutions[0].name
    });
  } catch (error) {
    console.error('获取邀请码失败:', error);
    res.status(500).json({ message: '获取邀请码失败' });
  }
});

// 获取机构成员列表
router.get('/institution/members', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'institution' || !req.user.institutionId) {
      return res.status(403).json({ message: '无权限访问' });
    }

    const [members] = await pool.query(
      `SELECT id, username, real_name, phone, created_at 
       FROM users 
       WHERE institution_id = ? AND role = 'institution'
       ORDER BY created_at ASC`,
      [req.user.institutionId]
    );

    res.json(members);
  } catch (error) {
    console.error('获取机构成员失败:', error);
    res.status(500).json({ message: '获取机构成员失败' });
  }
});

module.exports = router;
