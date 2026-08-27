const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 生成8位邀请码
const generateInviteCode = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

// 邮件发送器（懒加载，仅在 SMTP 配置存在时初始化）
let transporter = null;
const getTransporter = () => {
  if (!transporter && process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 465,
      secure: (parseInt(process.env.SMTP_PORT) || 465) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
};

// 发送验证邮件
const sendVerifyEmail = async (email, userId) => {
  const t = getTransporter();
  if (!t) return false;

  const token = jwt.sign({ userId, email }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const link = `${frontendUrl}/verify-email?token=${token}`;

  await t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: '智伴乡童 - 邮箱验证',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#f8f9fa;border-radius:12px;">
        <img src="cid:logo" alt="智伴乡童" style="height:60px;margin-bottom:20px;" />
        <h2 style="color:#1d1d1f;margin-bottom:12px;">验证您的邮箱</h2>
        <p style="color:#6b7280;line-height:1.8;margin-bottom:28px;">感谢注册智伴乡童！点击下方按钮验证您的邮箱地址，链接 <strong>10 分钟内有效</strong>。</p>
        <a href="${link}" style="display:inline-block;background:#4F7942;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">验证邮箱</a>
        <p style="color:#9ca3af;font-size:12px;margin-top:32px;">若无法点击按钮，请复制以下链接到浏览器：<br/>${link}</p>
      </div>
    `,
  });
  return true;
};

// 用户注册
router.post('/register', async (req, res) => {
  try {
    const { username, password, role, realName, phone, email, organization, inviteCode, isNewInstitution } = req.body;

    // 验证必填字段
    if (!username || !password || !role) {
      return res.status(400).json({ message: '用户名、密码和角色为必填项' });
    }

    // 检查用户名是否已存在
    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(400).json({ message: '用户名已存在' });
    }

    // 检查邮箱是否已存在
    if (email) {
      const [existingEmail] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      if (existingEmail.length > 0) {
        return res.status(400).json({ message: '该邮箱已被注册' });
      }
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
          'INSERT INTO users (username, password, role, real_name, phone, email, organization) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [username, hashedPassword, role, realName, phone, email || null, organization]
        );

        const newInviteCode = generateInviteCode();
        const [instResult] = await pool.query(
          'INSERT INTO institutions (user_id, name, contact_person, contact_phone, invite_code) VALUES (?, ?, ?, ?, ?)',
          [userResult.insertId, organization, realName, phone, newInviteCode]
        );

        // 更新用户的 institution_id
        await pool.query('UPDATE users SET institution_id = ? WHERE id = ?', [instResult.insertId, userResult.insertId]);

        // 发送验证邮件（如有邮箱）
        let needVerify = false;
        if (email) {
          needVerify = await sendVerifyEmail(email, userResult.insertId);
        }

        return res.status(201).json({
          message: '注册成功，机构创建成功',
          userId: userResult.insertId,
          inviteCode: newInviteCode,
          institutionName: organization,
          needVerify,
        });
      } else {
        return res.status(400).json({ message: '请选择创建新机构或输入邀请码加入现有机构' });
      }
    }

    // 插入用户（普通用户或使用邀请码加入机构的用户）
    const [result] = await pool.query(
      'INSERT INTO users (username, password, role, real_name, phone, email, organization, institution_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [username, hashedPassword, role, realName, phone, email || null, organization, institutionId]
    );

    // 发送验证邮件（如有邮箱）
    let needVerify = false;
    if (email) {
      needVerify = await sendVerifyEmail(email, result.insertId);
    }

    res.status(201).json({ message: '注册成功', userId: result.insertId, needVerify });
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

// =====================================================
// 邮箱注册（在现有 register 接口中顺带处理邮箱）
// 注意：用户也可以在现有 /register 接口传入 email 字段，
// 这里新增独立的邮箱验证、邮箱登录接口
// =====================================================

// 发送/重新发送验证邮件（注册时自动调用，也可手动触发）
router.post('/send-verify-email', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.query('SELECT email, email_verified FROM users WHERE id = ?', [req.user.id]);
    if (!users[0]?.email) return res.status(400).json({ message: '请先绑定邮箱' });
    if (users[0].email_verified) return res.status(400).json({ message: '邮箱已验证' });

    const sent = await sendVerifyEmail(users[0].email, req.user.id);
    if (!sent) return res.status(503).json({ message: 'SMTP未配置，无法发送邮件' });
    res.json({ message: '验证邮件已发送，请查收' });
  } catch (err) {
    res.status(500).json({ message: '发送失败' });
  }
});

// 验证邮箱（点击邮件链接触发）
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ message: '缺少验证 token' });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ message: '验证链接已过期或无效，请重新注册' });
    }

    const [users] = await pool.query('SELECT * FROM users WHERE id = ? AND email = ?', [payload.userId, payload.email]);
    if (!users[0]) return res.status(404).json({ message: '用户不存在' });

    await pool.query('UPDATE users SET email_verified = 1 WHERE id = ?', [payload.userId]);

    const user = users[0];
    let institutionId = user.institution_id || null;
    if (user.role === 'institution' && !institutionId) {
      const [inst] = await pool.query('SELECT id FROM institutions WHERE user_id = ?', [user.id]);
      if (inst[0]) institutionId = inst[0].id;
    }

    const jwtToken = jwt.sign(
      { id: user.id, username: user.username, role: user.role, institutionId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: '邮箱验证成功',
      token: jwtToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        realName: user.real_name,
        phone: user.phone,
        email: user.email,
        organization: user.organization,
        institutionId,
      },
    });
  } catch (err) {
    console.error('验证邮箱失败:', err);
    res.status(500).json({ message: '验证失败，请稍后重试' });
  }
});

// 邮箱登录
router.post('/login-email', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: '请输入邮箱和密码' });

    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!users[0]) return res.status(401).json({ message: '邮箱或密码错误' });

    const user = users[0];
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ message: '邮箱或密码错误' });

    let institutionId = user.institution_id || null;
    let institutionName = null;
    if (user.role === 'institution') {
      if (!institutionId) {
        const [inst] = await pool.query('SELECT id, name FROM institutions WHERE user_id = ?', [user.id]);
        if (inst[0]) { institutionId = inst[0].id; institutionName = inst[0].name; }
      } else {
        const [inst] = await pool.query('SELECT name FROM institutions WHERE id = ?', [institutionId]);
        if (inst[0]) institutionName = inst[0].name;
      }
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, institutionId },
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
        email: user.email,
        organization: user.organization,
        institutionId,
        institutionName,
      },
    });
  } catch (err) {
    console.error('邮箱登录失败:', err);
    res.status(500).json({ message: '登录失败，请稍后重试' });
  }
});

module.exports = router;
