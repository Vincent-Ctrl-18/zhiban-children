const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getPrompt } = require('../config/promptManager');
const { UPLOAD_DIR } = require('../config/paths');
const { callDoubaoAPI } = require('../services/aiProvider');
const {
  HomeworkServiceError,
  createSessionAndProcess,
  addMessageAndProcess,
  retryMessage,
  getRecentSession,
  completeSession,
  abandonSession,
  ALLOWED_IMAGE_TYPES,
  createHomeworkRecognition,
  confirmHomeworkRecognition,
  streamMessageAndProcess,
  streamSessionAndProcess,
} = require('../services/homeworkService');
const { getRecentCompanionSession, sendCompanionMessage, completeCompanionSession } = require('../services/companionService');
const { generateLearningReport, listReports } = require('../services/learningReportService');
const { listSessions, listCompanionSessions, getSessionDetail, getCompanionSessionDetail, updateTitle, resumeSession } = require('../services/historyService');
const { listMemories, updateMemory, forgetMemory, setMemoryEnabled } = require('../services/memoryService');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();
router.use(createRateLimiter({ windowMs: 60_000, max: 20, key: (req) => `${req.ip}:${req.headers.authorization || 'anonymous'}` }));

function requireHistoryV2(req, res, next) {
  if (process.env.AI_HISTORY_V2_ENABLED === 'false') {
    return res.status(404).json({ message: 'AI 历史与记忆功能当前未开放', code: 'AI_HISTORY_V2_DISABLED' });
  }
  return next();
}

const homeworkUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dateDir = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const targetDir = path.join(UPLOAD_DIR, 'ai-homework', dateDir);
      fs.mkdirSync(targetDir, { recursive: true });
      cb(null, targetDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) return cb(null, true);
    return cb(new HomeworkServiceError('只支持 JPG、PNG、WEBP 格式的图片', {
      code: 'INVALID_IMAGE_TYPE',
    }));
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

function sendHomeworkError(res, error) {
  const schemaMissing = error.code === 'ER_NO_SUCH_TABLE';
  const status = error.status || (schemaMissing ? 503 : 500);
  res.status(status).json({
    message: schemaMissing ? '作业辅导尚未完成数据库迁移，请联系管理员' : (error.message || '作业辅导请求失败'),
    code: schemaMissing ? 'HOMEWORK_SCHEMA_NOT_READY' : (error.code || 'HOMEWORK_ERROR'),
    retryable: Boolean(error.retryable),
    ...(error.details || {}),
  });
}

function logHomeworkError(label, error) {
  const logger = error?.status && error.status < 500 ? console.warn : console.error;
  logger(`${label}:`, error?.message || error);
}

// ===== 智能作业辅导 =====
router.post('/homework', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const { question, image } = req.body;

    if (!question && !image) {
      return res.status(400).json({ message: '请提供问题或题目图片' });
    }

    const promptConfig = getPrompt('homework');

    const messages = [
      { role: 'system', content: promptConfig.systemPrompt },
    ];

    // 如果有图片，使用多模态格式
    if (image) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${image}`,
            },
          },
          {
            type: 'text',
            text: question || '请帮我看看这道题怎么做，给出详细的解题思路',
          },
        ],
      });
    } else {
      messages.push({ role: 'user', content: question });
    }

    const reply = await callDoubaoAPI(messages, promptConfig.maxTokens, promptConfig.temperature);
    res.json({ reply });
  } catch (error) {
    console.error('作业辅导接口错误:', error);
    res.status(500).json({ message: error.message || '服务器内部错误' });
  }
});

// ===== 个性化学习报告 =====
router.post('/learning-report', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const { grade, subjects, strengths, weaknesses, studyHours, goals } = req.body;

    if (!grade || !subjects) {
      return res.status(400).json({ message: '请提供年级和学习科目信息' });
    }

    const promptConfig = getPrompt('learningReport');

    const userContent = `请根据以下信息生成学习报告：
- 年级：${grade}
- 学习科目：${Array.isArray(subjects) ? subjects.join('、') : subjects}
- 擅长的方面：${strengths || '未填写'}
- 需要提升的方面：${weaknesses || '未填写'}
- 每天学习时间：${studyHours || '未填写'}小时
- 学习目标：${goals || '未填写'}`;

    const messages = [
      { role: 'system', content: promptConfig.systemPrompt },
      { role: 'user', content: userContent },
    ];

    const reply = await callDoubaoAPI(messages, promptConfig.maxTokens, promptConfig.temperature);
    res.json({ reply });
  } catch (error) {
    console.error('学习报告接口错误:', error);
    res.status(500).json({ message: error.message || '服务器内部错误' });
  }
});

// ===== 谈心伙伴 =====
router.post('/chat', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const { messages: userMessages } = req.body;

    if (!userMessages || !Array.isArray(userMessages) || userMessages.length === 0) {
      return res.status(400).json({ message: '请提供聊天内容' });
    }
    // 兼容旧客户端时也只接受最后一条文本；角色、历史上下文和安全 Prompt 全部由服务端管理。
    const latest = [...userMessages].reverse().find((item) => typeof item?.content === 'string' && item.content.trim());
    if (!latest) return res.status(400).json({ message: '请提供聊天内容' });
    const result = await sendCompanionMessage({
      userId: req.user.id,
      institutionId: req.user.institutionId,
      content: latest.content,
      requestId: req.body?.requestId,
    });
    res.json({ reply: result.assistantMessage?.content || '', sessionId: result.session?.id });
  } catch (error) {
    console.error('谈心伙伴接口错误:', error);
    res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : (error.status || 500)).json({ message: error.message || '服务器内部错误', code: error.code, retryable: error.retryable });
  }
});

router.post('/learning-report/generate', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    res.json(await generateLearningReport({ userId: req.user.id, input: req.body || {} }));
  } catch (error) {
    console.error('生成数据驱动学习报告失败:', error);
    res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : (error.status || 502)).json({ message: error.message || '报告暂时无法生成，请稍后重试', code: error.code || 'REPORT_ERROR', retryable: error.retryable !== false });
  }
});

router.get('/learning-report/history', authenticateToken, requireRole('student'), async (req, res) => {
  try { res.json(await listReports(req.user.id, req.query.limit)); }
  catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500).json({ message: '报告历史暂不可用', code: error.code }); }
});

// ===== 谈心小屋服务端会话（旧 /chat 保留兼容） =====
router.get('/chat/sessions/recent', authenticateToken, requireRole('student'), async (req, res) => {
  try { res.json(await getRecentCompanionSession(req.user.id)); }
  catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : (error.status || 500)).json({ message: error.message || '获取谈心记录失败', code: error.code }); }
});

router.get('/chat/sessions', authenticateToken, requireRole('student'), requireHistoryV2, async (req, res) => {
  try { res.json(await listCompanionSessions(req.user.id, req.query)); }
  catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : (error.status || 500)).json({ message: error.message || '谈心历史暂不可用', code: error.code }); }
});

router.get('/chat/sessions/:sessionId', authenticateToken, requireRole('student'), requireHistoryV2, async (req, res) => {
  try { res.json(await getCompanionSessionDetail(req.user.id, req.params.sessionId)); }
  catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : (error.status || 500)).json({ message: error.message || '谈心记录不存在', code: error.code }); }
});

router.post('/chat/sessions/:sessionId/messages', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    res.json(await sendCompanionMessage({ userId: req.user.id, institutionId: req.user.institutionId, sessionId: req.params.sessionId, content: req.body?.content, requestId: req.body?.requestId }));
  } catch (error) {
    console.error('谈心消息失败:', error);
    res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : (error.status || 500)).json({ message: error.message || '发送失败，请稍后重试', code: error.code, retryable: error.retryable, ...(error.details || {}) });
  }
});

router.post('/chat/sessions', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    res.status(201).json(await sendCompanionMessage({ userId: req.user.id, institutionId: req.user.institutionId, content: req.body?.content, requestId: req.body?.requestId }));
  } catch (error) {
    console.error('创建谈心会话失败:', error);
    res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : (error.status || 500)).json({ message: error.message || '发送失败，请稍后重试', code: error.code, retryable: error.retryable, ...(error.details || {}) });
  }
});

router.post('/chat/sessions/:sessionId/complete', authenticateToken, requireRole('student'), async (req, res) => {
  try { res.json(await completeCompanionSession({ userId: req.user.id, institutionId: req.user.institutionId, sessionId: req.params.sessionId })); }
  catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : (error.status || 500)).json({ message: error.message || '结束谈心失败', code: error.code }); }
});

// ===== 第一阶段作业辅导会话 =====
router.get('/homework/sessions/recent', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    res.json(await getRecentSession(req.user.id));
  } catch (error) {
    console.error('获取最近作业会话失败:', error);
    sendHomeworkError(res, error);
  }
});

router.post('/homework/recognitions', authenticateToken, requireRole('student'), homeworkUpload.single('image'), async (req, res) => {
  try {
    res.status(201).json(await createHomeworkRecognition({ userId: req.user.id, file: req.file }));
  } catch (error) {
    if (req.file && error.code !== 'IMAGE_READ_ERROR') {
      try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch {}
    }
    sendHomeworkError(res, error);
  }
});

router.patch('/homework/recognitions/:recognitionId', authenticateToken, requireRole('student'), async (req, res) => {
  try { res.json(await confirmHomeworkRecognition({ userId: req.user.id, recognitionId: req.params.recognitionId, text: req.body?.text })); }
  catch (error) { sendHomeworkError(res, error); }
});

router.post('/homework/sessions/stream', authenticateToken, requireRole('student'), homeworkUpload.single('image'), async (req, res) => {
  res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  const write = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  try {
    write('status', { status: 'started' });
    const result = await streamSessionAndProcess({
      userId: req.user.id,
      question: req.body.question,
      file: req.file,
      recognitionId: req.body.recognitionId,
      requestId: req.body.requestId,
      signal: controller.signal,
      onDelta: async (delta) => write('delta', { text: delta }),
    });
    write('done', result);
    res.end();
  } catch (error) {
    if (req.file && !error.details?.userMessageId) {
      try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch {}
    }
    write('error', { message: error.message || '生成失败，请重试', code: error.code, retryable: error.retryable, ...(error.details || {}) });
    res.end();
  }
});

router.post(
  '/homework/sessions',
  authenticateToken,
  requireRole('student'),
  homeworkUpload.single('image'),
  async (req, res) => {
    try {
      const result = await createSessionAndProcess({
        userId: req.user.id,
        question: req.body.question,
        file: req.file,
        recognitionId: req.body.recognitionId,
        requestId: req.body.requestId,
      });
      res.status(201).json(result);
    } catch (error) {
      logHomeworkError('创建作业会话失败', error);
      if (req.file && !error.details?.userMessageId) {
        try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch (cleanupError) { console.warn('清理作业图片失败:', cleanupError.message); }
      }
      sendHomeworkError(res, error);
    }
  }
);

router.post(
  '/homework/sessions/:sessionId/messages',
  authenticateToken,
  requireRole('student'),
  homeworkUpload.single('image'),
  async (req, res) => {
    try {
      const result = await addMessageAndProcess({
        userId: req.user.id,
        sessionId: req.params.sessionId,
        question: req.body.question,
        file: req.file,
        recognitionId: req.body.recognitionId,
        requestId: req.body.requestId,
      });
      res.json(result);
    } catch (error) {
      logHomeworkError('追加作业消息失败', error);
      if (req.file && !error.details?.userMessageId) {
        try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch (cleanupError) { console.warn('清理作业图片失败:', cleanupError.message); }
      }
      sendHomeworkError(res, error);
    }
  }
);

router.post(
  '/homework/sessions/:sessionId/messages/stream',
  authenticateToken,
  requireRole('student'),
  homeworkUpload.single('image'),
  async (req, res) => {
    res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders?.();
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    const write = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
    try {
      write('status', { status: 'started' });
      const result = await streamMessageAndProcess({
        userId: req.user.id,
        sessionId: req.params.sessionId,
        question: req.body.question,
        file: req.file,
        recognitionId: req.body.recognitionId,
        requestId: req.body.requestId,
        signal: controller.signal,
        onDelta: async (delta) => write('delta', { text: delta }),
      });
      write('done', result);
      res.end();
    } catch (error) {
      if (req.file && !error.details?.userMessageId) {
        try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch {}
      }
      write('error', { message: error.message || '生成失败，请重试', code: error.code, retryable: error.retryable, ...(error.details || {}) });
      res.end();
    }
  }
);

router.post('/homework/sessions/:sessionId/messages/:messageId/feedback', authenticateToken, requireRole('student'), async (req, res) => {
  const rating = req.body?.rating;
  if (!['helpful', 'not_helpful'].includes(rating)) return res.status(400).json({ message: '反馈类型无效', code: 'INVALID_FEEDBACK' });
  try {
    const [messageRows] = await pool.query(
      `SELECT m.id FROM ai_messages m JOIN ai_sessions s ON s.id = m.session_id AND s.user_id = ? AND s.agent_type = 'homework'
       WHERE m.id = ? AND m.session_id = ? AND m.role = 'assistant' LIMIT 1`, [req.user.id, req.params.messageId, req.params.sessionId]
    );
    if (!messageRows[0]) return res.status(404).json({ message: '回复不存在', code: 'MESSAGE_NOT_FOUND' });
    await pool.query(
      `INSERT INTO ai_feedback (user_id, session_id, message_id, rating, reason) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating), reason = VALUES(reason)`,
      [req.user.id, req.params.sessionId, req.params.messageId, rating, String(req.body?.reason || '').slice(0, 200) || null]
    );
    res.json({ rating });
  } catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500).json({ message: '反馈暂不可用', code: error.code }); }
});

router.post(
  '/homework/sessions/:sessionId/messages/:messageId/retry',
  authenticateToken,
  requireRole('student'),
  async (req, res) => {
    try {
      const result = await retryMessage({
        userId: req.user.id,
        sessionId: req.params.sessionId,
        messageId: req.params.messageId,
        requestId: req.body?.requestId,
      });
      res.json(result);
    } catch (error) {
      logHomeworkError('重试作业消息失败', error);
      sendHomeworkError(res, error);
    }
  }
);

router.post('/homework/sessions/:sessionId/complete', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    res.json(await completeSession(req.user.id, req.params.sessionId));
  } catch (error) {
    logHomeworkError('完成作业会话失败', error);
    sendHomeworkError(res, error);
  }
});

// ===== 学生 AI 历史会话 =====
router.get('/memories', authenticateToken, requireRole('student'), requireHistoryV2, async (req, res) => {
  try { res.json(await listMemories(req.user.id, req.query)); }
  catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : (error.status || 500)).json({ message: error.code === 'ER_NO_SUCH_TABLE' ? 'AI 记忆尚未完成数据库迁移' : 'AI 记忆暂不可用', code: error.code }); }
});

router.patch('/memory-settings', authenticateToken, requireRole('student'), requireHistoryV2, async (req, res) => {
  try { res.json(await setMemoryEnabled(req.user.id, req.body?.enabled === true || req.body?.enabled === 1)); }
  catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500).json({ message: 'AI 记忆设置暂不可用', code: error.code }); }
});

router.patch('/memories/:memoryId', authenticateToken, requireRole('student'), requireHistoryV2, async (req, res) => {
  try { res.json(await updateMemory(req.user.id, req.params.memoryId, req.body || {})); }
  catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : (error.status || 500)).json({ message: error.message || '修改记忆失败', code: error.code }); }
});

router.delete('/memories/:memoryId', authenticateToken, requireRole('student'), requireHistoryV2, async (req, res) => {
  try { res.json(await forgetMemory(req.user.id, req.params.memoryId)); }
  catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : (error.status || 500)).json({ message: error.message || '忘记记忆失败', code: error.code }); }
});

router.get('/sessions', authenticateToken, requireRole('student'), requireHistoryV2, async (req, res) => {
  try { res.json(await listSessions(req.user.id, req.query)); }
  catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500).json({ message: '历史会话暂不可用', code: error.code }); }
});

router.get('/sessions/:sessionId', authenticateToken, requireRole('student'), requireHistoryV2, async (req, res) => {
  try { res.json(await getSessionDetail(req.user.id, req.params.sessionId)); }
  catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : (error.status || 500)).json({ message: error.message || '会话不存在', code: error.code }); }
});

router.post('/sessions/:sessionId/resume', authenticateToken, requireRole('student'), requireHistoryV2, async (req, res) => {
  try { res.json(await resumeSession(req.user.id, req.params.sessionId)); }
  catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : (error.status || 500)).json({ message: error.message || '会话不存在', code: error.code }); }
});

router.patch('/sessions/:sessionId/title', authenticateToken, requireRole('student'), requireHistoryV2, async (req, res) => {
  try { res.json(await updateTitle(req.user.id, req.params.sessionId, req.body?.title)); }
  catch (error) { res.status(error.code === 'ER_NO_SUCH_TABLE' ? 503 : (error.status || 500)).json({ message: error.message || '更新标题失败', code: error.code }); }
});

router.post('/homework/sessions/:sessionId/abandon', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    res.json(await abandonSession(req.user.id, req.params.sessionId));
  } catch (error) {
    logHomeworkError('放弃作业会话失败', error);
    sendHomeworkError(res, error);
  }
});

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: '图片不能超过 5MB', code: 'IMAGE_TOO_LARGE' });
    }
    return res.status(400).json({ message: '图片上传失败，请重试', code: error.code });
  }
  if (error instanceof HomeworkServiceError) return sendHomeworkError(res, error);
  return next(error);
});

module.exports = router;
