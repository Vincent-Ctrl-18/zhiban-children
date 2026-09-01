const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pool } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  UPLOAD_DIR,
  PRIVATE_UPLOAD_DIR,
  resolveStoredUploadPath,
  resolvePrivateUploadPath,
  toPublicPath,
} = require('../config/paths');
const { startCourse, completeCourse, getUserProgress, updateCourseProgress } = require('../services/courseProgressService');
const { recordEvent } = require('../services/eventService');

const router = express.Router();
const COURSE_UPLOAD_DIR = path.join(UPLOAD_DIR, 'courses');
const BOOK_UPLOAD_DIR = path.join(PRIVATE_UPLOAD_DIR, 'books');
const COVER_UPLOAD_DIR = path.join(UPLOAD_DIR, 'course-covers');
const BOOK_MAX_SIZE = 100 * 1024 * 1024;
const COVER_MAX_SIZE = 5 * 1024 * 1024;
const BOOK_CATEGORIES = ['文学故事', '科普百科', '学习辅导', '传统文化', '心理成长', '其他'];

for (const directory of [COURSE_UPLOAD_DIR, BOOK_UPLOAD_DIR, COVER_UPLOAD_DIR]) {
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
}

const uniqueFilename = (originalName) => {
  const ext = path.extname(originalName || '').toLowerCase();
  return `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${ext}`;
};

const isPdfFile = (filePath) => {
  try {
    const header = Buffer.alloc(5);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, header, 0, 5, 0);
    fs.closeSync(fd);
    return header.toString('ascii') === '%PDF-';
  } catch {
    return false;
  }
};

const safeInt = (value, fallback = 0) => {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

const serializeCourse = (row) => {
  const result = { ...row };
  result.resource_kind = result.resource_kind || (result.file_type === 'video' ? 'video' : 'document');
  result.review_status = result.review_status || 'published';
  result.allow_download = Boolean(result.allow_download ?? true);
  if (result.cover_path) result.cover_path = toPublicPath(result.cover_path);
  if (result.resource_kind === 'ebook') {
    // 电子书只通过受保护 API 读取，绝不把私有磁盘路径返回到浏览器。
    result.file_path = null;
    result.private_file_path = undefined;
    result.content_url = toPublicPath(`/api/courses/${result.id}/content`);
    result.download_url = result.allow_download ? toPublicPath(`/api/courses/${result.id}/download`) : null;
  } else if (result.file_path) {
    result.file_path = toPublicPath(result.file_path.startsWith('/') ? result.file_path : `/${result.file_path}`);
  }
  return result;
};

const getCourseForRequest = async (id, user) => {
  const [rows] = await pool.query('SELECT c.*, u.real_name AS uploader_name FROM course_resources c LEFT JOIN users u ON c.uploaded_by = u.id WHERE c.id = ? LIMIT 1', [id]);
  const course = rows[0];
  if (!course) return null;
  const kind = course.resource_kind || (course.file_type === 'video' ? 'video' : 'document');
  if (user.role === 'student') {
    if (kind === 'ebook' && course.review_status !== 'published') return null;
  } else if (user.role === 'institution') {
    if (course.institution_id !== user.institutionId) return null;
  }
  return course;
};

const sendPrivateBook = (res, course, disposition) => {
  const stored = course.private_file_path || course.file_path;
  if (!stored) return res.status(404).json({ message: '电子书文件不存在' });
  let diskPath;
  try {
    diskPath = course.private_file_path
      ? resolvePrivateUploadPath(stored)
      : resolveStoredUploadPath(stored);
  } catch {
    return res.status(404).json({ message: '电子书文件路径无效' });
  }
  if (!fs.existsSync(diskPath)) return res.status(404).json({ message: '电子书文件不存在' });
  const filename = String(course.file_name || `${course.title}.pdf`).replace(/[\\/:*?"<>|]/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  return res.sendFile(diskPath);
};

// 学生课程/电子书进度
router.get('/progress/me', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    res.json(await getUserProgress(req.user.id));
  } catch (error) {
    console.error('获取课程进度失败:', error);
    res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500).json({ message: '课程进度暂不可用', code: error.code });
  }
});

router.post('/:id/start', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    res.json(await startCourse({ userId: req.user.id, institutionId: req.user.institutionId, courseId: req.params.id }));
  } catch (error) {
    console.error('开始课程失败:', error);
    res.status(error.status || (error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500)).json({ message: error.message || '开始课程失败', code: error.code });
  }
});

router.post('/:id/complete', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    res.json(await completeCourse({ userId: req.user.id, institutionId: req.user.institutionId, courseId: req.params.id }));
  } catch (error) {
    console.error('完成课程失败:', error);
    res.status(error.status || (error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500)).json({ message: error.message || '完成课程失败', code: error.code });
  }
});

router.patch('/:id/progress', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const course = await getCourseForRequest(req.params.id, req.user);
    if (!course) return res.status(404).json({ message: '资源不存在或暂未发布' });
    const progress = await updateCourseProgress({
      userId: req.user.id,
      institutionId: req.user.institutionId,
      courseId: req.params.id,
      lastPage: safeInt(req.body.lastPage),
      totalPages: safeInt(req.body.totalPages),
      progressPercent: Number(req.body.progressPercent),
    });
    res.json({ course: serializeCourse(course), progress });
  } catch (error) {
    console.error('保存课程进度失败:', error);
    res.status(error.status || (error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500)).json({ message: error.message || '保存进度失败', code: error.code });
  }
});

// 受保护的电子书在线内容接口，支持 PDF.js 的 Range 请求。
router.get('/:id/content', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const course = await getCourseForRequest(req.params.id, req.user);
    if (!course || (course.resource_kind || (course.file_type === 'video' ? 'video' : 'document')) !== 'ebook') {
      return res.status(404).json({ message: '电子书不存在或暂未发布' });
    }
    return sendPrivateBook(res, course, 'inline');
  } catch (error) {
    console.error('读取电子书失败:', error);
    return res.status(500).json({ message: '读取电子书失败' });
  }
});

router.get('/:id/download', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const course = await getCourseForRequest(req.params.id, req.user);
    if (!course || (course.resource_kind || (course.file_type === 'video' ? 'video' : 'document')) !== 'ebook') {
      return res.status(404).json({ message: '电子书不存在或暂未发布' });
    }
    if (!Boolean(course.allow_download)) return res.status(403).json({ message: '该电子书暂不允许下载' });
    await recordEvent({ eventName: 'ebook_downloaded', userId: req.user.id, userRole: 'student', institutionId: req.user.institutionId, objectId: course.id });
    return sendPrivateBook(res, course, 'attachment');
  } catch (error) {
    console.error('下载电子书失败:', error);
    return res.status(500).json({ message: '下载电子书失败' });
  }
});

// 获取课程/学习资源列表
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { type, kind, category, keyword } = req.query;
    let sql = 'SELECT c.*, u.real_name AS uploader_name FROM course_resources c LEFT JOIN users u ON c.uploaded_by = u.id WHERE 1=1';
    const params = [];
    if (type) { sql += ' AND c.file_type = ?'; params.push(type); }
    if (kind) { sql += ' AND COALESCE(c.resource_kind, IF(c.file_type = \'video\', \'video\', \'document\')) = ?'; params.push(kind); }
    if (category) { sql += ' AND c.category = ?'; params.push(category); }
    if (keyword) { sql += ' AND (c.title LIKE ? OR COALESCE(c.author, \'\') LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    if (req.user.role === 'student') {
      sql += " AND (COALESCE(c.resource_kind, IF(c.file_type = 'video', 'video', 'document')) <> 'ebook' OR COALESCE(c.review_status, 'published') = 'published')";
    }
    if (req.user.role === 'institution' && req.user.institutionId) {
      sql += ' AND c.institution_id = ?'; params.push(req.user.institutionId);
    }
    sql += ' ORDER BY c.featured DESC, c.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows.map(serializeCourse));
  } catch (err) {
    console.error('获取课程列表失败:', err);
    res.status(err.code === 'ER_NO_SUCH_TABLE' ? 503 : 500).json({ message: '获取失败', code: err.code });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const course = await getCourseForRequest(req.params.id, req.user);
    if (!course) return res.status(404).json({ message: '资源不存在或暂未发布' });
    res.json(serializeCourse(course));
  } catch (error) {
    res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500).json({ message: '获取资源详情失败', code: error.code });
  }
});

// 现有课程文件上传保持兼容；视频和普通学习资料仍然即时发布。
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, COURSE_UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, uniqueFilename(file.originalname)),
});
const fileFilter = (req, file, cb) => {
  const allowed = ['.mp4', '.webm', '.mov', '.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error(`不支持的文件格式：${ext}`), false);
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 500 * 1024 * 1024 } });

const ebookStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, file.fieldname === 'cover' ? COVER_UPLOAD_DIR : BOOK_UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, uniqueFilename(file.originalname)),
});
const ebookUpload = multer({
  storage: ebookStorage,
  limits: { fileSize: BOOK_MAX_SIZE, files: 2 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'file' && ext !== '.pdf') return cb(new Error('电子书仅支持 PDF 格式'));
    if (file.fieldname === 'cover' && !['.jpg', '.jpeg', '.png'].includes(ext)) return cb(new Error('封面仅支持 JPG 或 PNG 格式'));
    if (file.fieldname === 'file' && file.mimetype && !['application/pdf', 'application/octet-stream'].includes(file.mimetype)) return cb(new Error('电子书文件类型必须是 PDF'));
    if (file.fieldname === 'cover' && file.mimetype && !['image/jpeg', 'image/png'].includes(file.mimetype)) return cb(new Error('封面文件类型必须是 JPG 或 PNG'));
    cb(null, true);
  },
});

router.post('/upload', authenticateToken, requireRole('institution'), upload.array('files', 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ message: '未收到任何文件' });
    const results = [];
    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const fileType = ['.mp4', '.webm', '.mov'].includes(ext) ? 'video' : 'pdf';
      const title = path.basename(file.originalname, ext);
      const filePath = `/uploads/courses/${file.filename}`;
      const [result] = await pool.query(
        `INSERT INTO course_resources
         (title, file_type, file_path, file_name, file_size, institution_id, uploaded_by, resource_kind, review_status, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', CURRENT_TIMESTAMP)`,
        [title, fileType, filePath, file.originalname, file.size, req.user.institutionId, req.user.id, fileType === 'video' ? 'video' : 'document']
      );
      await recordEvent({ eventName: 'course_uploaded', userId: req.user.id, userRole: 'institution', institutionId: req.user.institutionId, objectId: result.insertId });
      results.push({ id: result.insertId, title, fileType });
    }
    res.json({ message: `成功上传 ${results.length} 个文件`, files: results });
  } catch (err) {
    console.error('上传课程文件失败:', err);
    res.status(500).json({ message: '上传失败: ' + err.message });
  }
});

// 电子书单本上传：文件进入私有目录，资源固定待审核。
router.post('/ebooks', authenticateToken, requireRole('institution'), ebookUpload.fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), async (req, res) => {
  const book = req.files?.file?.[0];
  const cover = req.files?.cover?.[0];
  try {
    const { title, author, category, gradeMin, gradeMax, description, sourceNote } = req.body;
    if (!book) return res.status(400).json({ message: '请上传 PDF 电子书' });
    if (!title || !author || !category || !gradeMin || !gradeMax || !description || !sourceNote) {
      return res.status(400).json({ message: '请完整填写书名、作者、分类、适读年级、简介和来源说明' });
    }
    if (!BOOK_CATEGORIES.includes(category)) return res.status(400).json({ message: '电子书分类无效' });
    if (!isPdfFile(book.path)) return res.status(400).json({ message: '文件不是有效的 PDF' });
    if (cover && cover.size > COVER_MAX_SIZE) return res.status(400).json({ message: '封面不能超过 5MB' });
    const privatePath = path.relative(PRIVATE_UPLOAD_DIR, book.path).replace(/\\/g, '/');
    const coverPath = cover ? `/uploads/course-covers/${cover.filename}` : null;
    const allowDownload = req.body.allowDownload === undefined || ['true', '1', 'on', 'yes'].includes(String(req.body.allowDownload).toLowerCase());
    const [result] = await pool.query(
      `INSERT INTO course_resources
       (title, file_type, file_path, private_file_path, file_name, file_size, institution_id, uploaded_by,
        resource_kind, author, description, category, grade_min, grade_max, cover_path, source_note,
        allow_download, review_status)
       VALUES (?, 'pdf', '', ?, ?, ?, ?, ?, 'ebook', ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [title.trim(), privatePath, book.originalname, book.size, req.user.institutionId, req.user.id,
        author.trim(), description.trim(), category, gradeMin, gradeMax, coverPath, sourceNote.trim(), allowDownload ? 1 : 0]
    );
    await recordEvent({ eventName: 'ebook_uploaded', userId: req.user.id, userRole: 'institution', institutionId: req.user.institutionId, objectId: result.insertId });
    res.status(201).json({ message: '电子书已提交审核', id: result.insertId });
  } catch (error) {
    if (book?.path && fs.existsSync(book.path)) fs.unlinkSync(book.path);
    if (cover?.path && fs.existsSync(cover.path)) fs.unlinkSync(cover.path);
    console.error('上传电子书失败:', error);
    res.status(error.code === 'ER_BAD_FIELD_ERROR' ? 503 : 500).json({ message: error.message || '上传电子书失败', code: error.code });
  }
});

router.delete('/:id', authenticateToken, requireRole('institution'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM course_resources WHERE id = ? AND institution_id = ?', [req.params.id, req.user.institutionId]);
    if (!rows[0]) return res.status(404).json({ message: '文件不存在或无权限删除' });
    const course = rows[0];
    const diskPath = course.private_file_path ? resolvePrivateUploadPath(course.private_file_path) : resolveStoredUploadPath(course.file_path);
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
    if (course.cover_path) {
      const coverPath = resolveStoredUploadPath(course.cover_path);
      if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
    }
    await pool.query('DELETE FROM course_resources WHERE id = ?', [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('删除课程文件失败:', err);
    res.status(500).json({ message: '删除失败' });
  }
});

module.exports = router;
module.exports.BOOK_CATEGORIES = BOOK_CATEGORIES;
module.exports.sendPrivateBook = sendPrivateBook;
