const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// 确保上传目录存在
const UPLOAD_DIR = path.join(__dirname, '../uploads/courses');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// multer 配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.mp4', '.webm', '.mov', '.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error(`不支持的文件格式：${ext}`), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

// 获取课程列表
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { type } = req.query;
    let institutionId = req.user.institutionId;

    // 学生可以查看所有机构的课程
    let sql = 'SELECT c.*, u.real_name as uploader_name FROM course_resources c LEFT JOIN users u ON c.uploaded_by = u.id WHERE 1=1';
    const params = [];

    if (type) {
      sql += ' AND c.file_type = ?';
      params.push(type);
    }

    // 机构只查看自己上传的
    if (req.user.role === 'institution' && institutionId) {
      sql += ' AND c.institution_id = ?';
      params.push(institutionId);
    }

    sql += ' ORDER BY c.created_at DESC';

    const conn = await pool.getConnection();
    await conn.query("SET NAMES utf8mb4");
    const [rows] = await conn.query(sql, params);
    conn.release();

    // 确保 file_path 统一有前导斜杠
    const result = rows.map(r => ({
      ...r,
      file_path: r.file_path.startsWith('/') ? r.file_path : `/${r.file_path}`,
    }));

    res.json(result);
  } catch (err) {
    console.error('获取课程列表失败:', err);
    res.status(500).json({ message: '获取失败' });
  }
});

// 上传课程文件（支持多文件）
router.post('/upload', authenticateToken, requireRole('institution'), upload.array('files', 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: '未收到任何文件' });
    }

    const institutionId = req.user.institutionId;
    const uploadedBy = req.user.id;
    const results = [];

    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const fileType = ['.mp4', '.webm', '.mov'].includes(ext) ? 'video' : 'pdf';
      const title = path.basename(file.originalname, ext);
      const filePath = `/uploads/courses/${file.filename}`;

      const [result] = await pool.query(
        'INSERT INTO course_resources (title, file_type, file_path, file_name, file_size, institution_id, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [title, fileType, filePath, file.originalname, file.size, institutionId, uploadedBy]
      );
      results.push({ id: result.insertId, title, fileType });
    }

    res.json({ message: `成功上传 ${results.length} 个文件`, files: results });
  } catch (err) {
    console.error('上传课程文件失败:', err);
    res.status(500).json({ message: '上传失败: ' + err.message });
  }
});

// 删除课程文件
router.delete('/:id', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM course_resources WHERE id = ? AND institution_id = ?',
      [req.params.id, req.user.institutionId]
    );
    if (!rows[0]) return res.status(404).json({ message: '文件不存在或无权限删除' });

    // 删除磁盘文件
    const diskPath = path.join(__dirname, '..', rows[0].file_path);
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);

    await pool.query('DELETE FROM course_resources WHERE id = ?', [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('删除课程文件失败:', err);
    res.status(500).json({ message: '删除失败' });
  }
});

module.exports = router;
