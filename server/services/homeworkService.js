const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { pool } = require('../config/database');
const { getPrompt } = require('../config/promptManager');
const {
  UPLOAD_DIR,
  resolveStoredUploadPath,
  toPublicPath,
} = require('../config/paths');
const aiProvider = require('./aiProvider');
const { recordModelCall } = require('./eventService');
const { consumeAiQuota } = require('../middleware/rateLimit');
const { buildAgentContext } = require('./contextBuilderService');
const { scheduleSummaryRefresh } = require('./summaryService');
const { upsertGenerationRequest: markGenerationRequest } = require('./generationService');

const MAX_QUESTION_LENGTH = 2000;
const MAX_USER_MESSAGES = 20;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

class HomeworkServiceError extends Error {
  constructor(message, {
    status = 400,
    code = 'HOMEWORK_ERROR',
    retryable = false,
    details = {},
  } = {}) {
    super(message);
    this.name = 'HomeworkServiceError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

function makeRequestId(value) {
  if (!value) return crypto.randomUUID();
  const requestId = String(value).trim();
  if (!/^[a-zA-Z0-9:_-]{8,100}$/.test(requestId)) {
    throw new HomeworkServiceError('请求标识无效，请重试', { code: 'INVALID_REQUEST_ID' });
  }
  return requestId;
}

function parseSessionId(value) {
  const sessionId = String(value || '').trim();
  if (!/^\d+$/.test(sessionId) || BigInt(sessionId) <= 0n) {
    throw new HomeworkServiceError('会话不存在', { status: 404, code: 'SESSION_NOT_FOUND' });
  }
  return sessionId;
}

function normalizeQuestion(question, file) {
  const normalized = String(question || '').trim();
  if (!normalized && !file) {
    throw new HomeworkServiceError('请输入问题或上传题目图片', { code: 'EMPTY_QUESTION' });
  }
  if (normalized.length > MAX_QUESTION_LENGTH) {
    throw new HomeworkServiceError(`问题不能超过 ${MAX_QUESTION_LENGTH} 个字符`, {
      code: 'QUESTION_TOO_LONG',
    });
  }
  if (file && !ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
    throw new HomeworkServiceError('只支持 JPG、PNG、WEBP 格式的图片', {
      code: 'INVALID_IMAGE_TYPE',
    });
  }
  return normalized || '请帮我分析这道题，给出解题思路。';
}

function validateQuestionShape(question, file, recognitionId) {
  const normalized = String(question || '').trim();
  if (normalized.length > MAX_QUESTION_LENGTH) normalizeQuestion(question, file);
  if (!normalized && !file && !recognitionId) normalizeQuestion(question, file);
}

function canonicalUploadPath(filePath) {
  const relative = path.relative(UPLOAD_DIR, filePath).replace(/\\/g, '/');
  return `/uploads/${relative}`;
}

function removeUploadedFile(file) {
  if (!file?.path) return;
  try {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  } catch (error) {
    console.warn('清理未使用的作业图片失败:', error.message);
  }
}

function imageMimeFromPath(imagePath) {
  const ext = path.extname(imagePath || '').toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function readImageAsDataUrl(imagePath) {
  try {
    const diskPath = resolveStoredUploadPath(imagePath);
    const buffer = fs.readFileSync(diskPath);
    return `data:${imageMimeFromPath(imagePath)};base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.error('读取作业图片失败:', error.message);
    return null;
  }
}

function serializeSession(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    userId: Number(row.user_id),
    agentType: row.agent_type,
    status: row.status,
    title: row.title || null,
    titleSource: row.title_source || 'automatic',
    summary: row.summary || null,
    summaryJson: row.summary_json ? (typeof row.summary_json === 'string' ? (() => { try { return JSON.parse(row.summary_json); } catch { return null; } })() : row.summary_json) : null,
    parentSessionId: row.parent_session_id ? String(row.parent_session_id) : null,
    subject: row.subject || null,
    stage: row.stage || null,
    startedAt: row.started_at,
    lastActiveAt: row.last_active_at,
    completedAt: row.completed_at,
  };
}

function serializeMessage(row) {
  let structured = null;
  if (row?.content_json) {
    try { structured = typeof row.content_json === 'string' ? JSON.parse(row.content_json) : row.content_json; } catch { structured = null; }
  }
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: row.role,
    content: row.content,
    imageUrl: row.image_path ? toPublicPath(row.image_path) : null,
    replyToMessageId: row.reply_to_message_id ? String(row.reply_to_message_id) : null,
    requestId: row.request_id || null,
    sequenceNo: Number(row.sequence_no),
    createdAt: row.created_at,
    structured,
    generationStatus: row.generation_status || 'completed',
    requestStatus: row.request_status || null,
    requestErrorCode: row.request_error_code || null,
  };
}

function parseStructuredHomeworkReply(reply) {
  try {
    const value = JSON.parse(String(reply || '').replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (!('summary' in value) && !('steps' in value)) return null;
    return value;
  } catch { return null; }
}

async function getConfirmedRecognition(userId, recognitionId) {
  if (!recognitionId) return null;
  const [rows] = await pool.query(
    'SELECT * FROM ai_homework_inputs WHERE id = ? AND user_id = ? LIMIT 1',
    [recognitionId, userId]
  );
  const input = rows[0];
  if (!input || input.status !== 'confirmed' || !input.confirmed_text || new Date(input.expires_at).getTime() < Date.now()) {
    throw new HomeworkServiceError('请先确认题目识别结果，再开始作业辅导', {
      status: 409,
      code: 'RECOGNITION_REQUIRED',
    });
  }
  return input;
}

async function getSession(userId, sessionId, executor = pool, { forUpdate = false } = {}) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await executor.query(
    `SELECT * FROM ai_sessions WHERE id = ? AND user_id = ? AND agent_type = 'homework' LIMIT 1${lock}`,
    [sessionId, userId]
  );
  return rows[0] || null;
}

async function getMessages(sessionId, executor = pool) {
  try {
    const [rows] = await executor.query(
      `SELECT m.*, r.status AS request_status, r.error_code AS request_error_code
       FROM ai_messages m LEFT JOIN ai_generation_requests r ON r.user_message_id = m.id
       WHERE m.session_id = ? ORDER BY m.sequence_no ASC`,
      [sessionId]
    );
    return rows;
  } catch (error) {
    if (error.code && error.code !== 'ER_NO_SUCH_TABLE') throw error;
    const [rows] = await executor.query('SELECT * FROM ai_messages WHERE session_id = ? ORDER BY sequence_no ASC', [sessionId]);
    return rows;
  }
}

async function getRecentSession(userId) {
  const [rows] = await pool.query(
    `SELECT * FROM ai_sessions
     WHERE user_id = ? AND agent_type = 'homework' AND status = 'active'
     ORDER BY last_active_at DESC, id DESC LIMIT 1`,
    [userId]
  );
  if (!rows[0]) return null;
  const messages = await getMessages(rows[0].id);
  return {
    session: serializeSession(rows[0]),
    messages: messages.map(serializeMessage),
  };
}

async function insertEvent(connection, {
  eventName,
  userId,
  userRole = 'student',
  sessionId = null,
  objectId = null,
  requestId = null,
  result,
  errorCode = null,
  latencyMs = null,
  metadata = null,
}) {
  await connection.query(
    `INSERT INTO product_events
      (event_id, event_name, feature_code, user_id, user_role, session_id, object_id,
       request_id, result, error_code, latency_ms, metadata)
     VALUES (?, ?, 'homework', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      eventName,
      userId,
      userRole,
      sessionId,
      objectId == null ? null : String(objectId),
      requestId,
      result,
      errorCode,
      latencyMs,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
}

async function findExistingRequest(userId, requestId) {
  const [startedRows] = await pool.query(
    `SELECT * FROM product_events
     WHERE user_id = ? AND request_id = ? AND event_name = 'homework_request_started'
     LIMIT 1`,
    [userId, requestId]
  );
  if (!startedRows[0]) return null;

  const started = startedRows[0];
  const [successRows] = await pool.query(
    `SELECT * FROM product_events
     WHERE user_id = ? AND request_id = ? AND event_name = 'homework_request_succeeded'
     LIMIT 1`,
    [userId, requestId]
  );
  const [failureRows] = await pool.query(
    `SELECT * FROM product_events
     WHERE user_id = ? AND request_id = ? AND event_name = 'homework_request_failed'
     LIMIT 1`,
    [userId, requestId]
  );
  const [userMessageRows] = await pool.query(
    `SELECT * FROM ai_messages
     WHERE id = ? AND user_id = ? AND role = 'user' LIMIT 1`,
    [started.object_id, userId]
  );

  const userMessage = userMessageRows[0] || null;
  let assistantMessage = null;
  if (userMessage) {
    const [assistantRows] = await pool.query(
      `SELECT * FROM ai_messages
       WHERE reply_to_message_id = ? AND role = 'assistant'
       ORDER BY id DESC LIMIT 1`,
      [userMessage.id]
    );
    assistantMessage = assistantRows[0] || null;
  }

  if (successRows[0] && userMessage && assistantMessage) {
    const session = await getSession(userId, started.session_id);
    return {
      status: 'succeeded',
      session,
      userMessage,
      assistantMessage,
      latencyMs: successRows[0].latency_ms,
    };
  }
  if (failureRows[0]) {
    return {
      status: 'failed',
      session: await getSession(userId, started.session_id),
      userMessage,
      errorCode: failureRows[0].error_code,
    };
  }
  return {
    status: 'started',
    session: await getSession(userId, started.session_id),
    userMessage,
  };
}

async function buildModelMessages(sessionId, userId, currentText = '') {
  const context = await buildAgentContext({ agentType: 'homework', userId, sessionId, currentText });
  return { messages: context.messages, promptConfig: context.prompt, memories: context.memories, summary: context.summary };
}

async function persistRequestStart({ userId, requestId, sessionId, userMessageId, eventName = 'homework_request_started' }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await insertEvent(connection, {
      eventName,
      userId,
      sessionId,
      objectId: userMessageId,
      requestId,
      result: 'started',
    });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function persistRequestResult({ userId, sessionId, userMessageId, requestId, reply, latencyMs, error }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (error) {
      await insertEvent(connection, {
        eventName: 'homework_request_failed',
        userId,
        sessionId,
        objectId: userMessageId,
        requestId,
        result: 'failure',
        errorCode: error.code || 'AI_PROVIDER_ERROR',
        latencyMs,
      });
      await markGenerationRequest({ requestId, userId, sessionId, userMessageId, status: 'failed', errorCode: error.code || 'AI_PROVIDER_ERROR', latencyMs, connection });
      await connection.query(
        'UPDATE ai_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
        [sessionId, userId]
      );
    } else {
      const [sequenceRows] = await connection.query(
        'SELECT COALESCE(MAX(sequence_no), 0) AS max_sequence FROM ai_messages WHERE session_id = ? FOR UPDATE',
        [sessionId]
      );
      const nextSequence = Number(sequenceRows[0].max_sequence) + 1;
      const [assistantResult] = await connection.query(
        `INSERT INTO ai_messages
          (session_id, user_id, role, content, reply_to_message_id, sequence_no)
         VALUES (?, ?, 'assistant', ?, ?, ?)`,
        [sessionId, userId, reply, userMessageId, nextSequence]
      );
      const structured = parseStructuredHomeworkReply(reply);
      if (structured) await connection.query('UPDATE ai_messages SET content_json = ? WHERE id = ?', [JSON.stringify(structured), assistantResult.insertId]);
      await insertEvent(connection, {
        eventName: 'homework_request_succeeded',
        userId,
        sessionId,
        objectId: userMessageId,
        requestId,
        result: 'success',
        latencyMs,
      });
      await markGenerationRequest({ requestId, userId, sessionId, userMessageId, assistantMessageId: assistantResult.insertId, status: 'succeeded', latencyMs, connection });
      await connection.query(
        'UPDATE ai_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
        [sessionId, userId]
      );
      await connection.commit();
      try { await scheduleSummaryRefresh({ userId, sessionId }); } catch (summaryError) { console.warn('创建 AI 摘要任务失败:', summaryError.message); }
      return assistantResult.insertId;
    }
    await connection.commit();
    return null;
  } catch (dbError) {
    await connection.rollback();
    throw dbError;
  } finally {
    connection.release();
  }
}

async function loadMessage(userId, sessionId, messageId) {
  const [rows] = await pool.query(
    `SELECT m.* FROM ai_messages m
     JOIN ai_sessions s ON s.id = m.session_id AND s.user_id = ? AND s.agent_type = 'homework'
     WHERE m.id = ? AND m.session_id = ? AND m.role = 'user' LIMIT 1`,
    [userId, messageId, sessionId]
  );
  return rows[0] || null;
}

async function processProviderRequest({ userId, sessionId, userMessageId, requestId }) {
  const startedAt = Date.now();
  let promptConfig;
  try {
    const sourceMessage = await loadMessage(userId, sessionId, userMessageId);
    const context = await buildModelMessages(sessionId, userId, sourceMessage?.content || '');
    const messages = context.messages;
    promptConfig = context.promptConfig;
    const providerResult = await aiProvider.callDoubaoAPI(messages, promptConfig.maxTokens, promptConfig.temperature, {
      timeoutMs: 45000,
      returnMeta: true,
    });
    const reply = providerResult.reply || providerResult;
    const latencyMs = Date.now() - startedAt;
    await recordModelCall({
      requestId,
      sessionId,
      userId,
      agentType: 'homework',
      model: providerResult.model || aiProvider.DOUBAO_MODEL,
      status: 'success',
      latencyMs,
      inputTokens: providerResult.inputTokens,
      outputTokens: providerResult.outputTokens,
    });
    const assistantMessageId = await persistRequestResult({
      userId,
      sessionId,
      userMessageId,
      requestId,
      reply,
      latencyMs,
    });
    const session = await getSession(userId, sessionId);
    const userMessage = await loadMessage(userId, sessionId, userMessageId);
    const assistantMessage = assistantMessageId
      ? (await pool.query('SELECT * FROM ai_messages WHERE id = ?', [assistantMessageId]))[0][0]
      : null;
    return {
      session: serializeSession(session),
      userMessage: serializeMessage(userMessage),
      assistantMessage: serializeMessage(assistantMessage),
      request: { requestId, status: 'succeeded', latencyMs },
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    await recordModelCall({ requestId, sessionId, userId, agentType: 'homework', model: aiProvider.DOUBAO_MODEL, status: error.code === 'AI_CANCELLED' ? 'stopped' : 'failure', latencyMs, errorCode: error.code });
    try {
      await persistRequestResult({
        userId,
        sessionId,
        userMessageId,
        requestId,
        latencyMs,
        error,
      });
    } catch (persistError) {
      console.error('记录作业辅导失败事件失败:', persistError);
    }
    const serviceError = error instanceof HomeworkServiceError
      ? error
      : new HomeworkServiceError(error.message || 'AI 服务暂时不可用，请稍后重试', {
        status: error.status || 502,
        code: error.code || 'AI_PROVIDER_ERROR',
        retryable: error.retryable !== false,
      });
    serviceError.details = {
      ...serviceError.details,
      sessionId: String(sessionId),
      userMessageId: String(userMessageId),
      requestId,
      retryable: serviceError.retryable,
    };
    try {
      const failedMessage = await loadMessage(userId, sessionId, userMessageId);
      if (failedMessage?.image_path) {
        serviceError.details.imageUrl = toPublicPath(failedMessage.image_path);
      }
    } catch (loadError) {
      console.warn('读取失败作业消息详情失败:', loadError.message);
    }
    throw serviceError;
  }
}

async function createSessionAndProcess({ userId, question, file, recognitionId = null, requestId: rawRequestId }) {
  validateQuestionShape(question, file, recognitionId);
  const requestId = makeRequestId(rawRequestId);
  const existing = await findExistingRequest(userId, requestId);
  if (existing) {
    removeUploadedFile(file);
    return resolveExistingRequest(existing, requestId);
  }
  const recognition = await getConfirmedRecognition(userId, recognitionId);
  if (file && !recognition) {
    throw new HomeworkServiceError('图片题目需要先完成识别确认', { code: 'RECOGNITION_REQUIRED' });
  }
  const questionText = normalizeQuestion(recognition?.confirmed_text || question, recognition ? null : file);
  consumeAiQuota(userId, 'homework');

  const imagePath = recognition?.image_path || (file ? canonicalUploadPath(file.path) : null);
  if (recognition) removeUploadedFile(file);
  const connection = await pool.getConnection();
  let sessionId;
  let userMessageId;
  try {
    await connection.beginTransaction();
    const [sessionResult] = await connection.query(
      `INSERT INTO ai_sessions (user_id, agent_type, status)
       VALUES (?, 'homework', 'active')`,
      [userId]
    );
    sessionId = sessionResult.insertId;
    const [messageResult] = await connection.query(
      `INSERT INTO ai_messages
        (session_id, user_id, role, content, image_path, request_id, sequence_no)
       VALUES (?, ?, 'user', ?, ?, ?, 1)`,
      [sessionId, userId, questionText, imagePath, requestId]
    );
    userMessageId = messageResult.insertId;
    await markGenerationRequest({ requestId, userId, sessionId, userMessageId, status: 'pending', connection });
    await insertEvent(connection, {
      eventName: 'homework_session_started',
      userId,
      sessionId,
      objectId: sessionId,
      result: 'started',
    });
    await insertEvent(connection, {
      eventName: 'homework_request_started',
      userId,
      sessionId,
      objectId: userMessageId,
      requestId,
      result: 'started',
    });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      const duplicate = await findExistingRequest(userId, requestId);
      if (duplicate) return resolveExistingRequest(duplicate, requestId);
    }
    throw error;
  } finally {
    connection.release();
  }

  return processProviderRequest({ userId, sessionId, userMessageId, requestId });
}

async function addMessageAndProcess({ userId, sessionId: rawSessionId, question, file, recognitionId = null, requestId: rawRequestId }) {
  validateQuestionShape(question, file, recognitionId);
  const requestId = makeRequestId(rawRequestId);
  const existing = await findExistingRequest(userId, requestId);
  if (existing) {
    removeUploadedFile(file);
    return resolveExistingRequest(existing, requestId);
  }
  const sessionId = parseSessionId(rawSessionId);
  const recognition = await getConfirmedRecognition(userId, recognitionId);
  if (file && !recognition) {
    throw new HomeworkServiceError('图片题目需要先完成识别确认', { code: 'RECOGNITION_REQUIRED' });
  }
  const questionText = normalizeQuestion(recognition?.confirmed_text || question, recognition ? null : file);
  consumeAiQuota(userId, 'homework');

  const connection = await pool.getConnection();
  let userMessageId;
  try {
    await connection.beginTransaction();
    const session = await getSession(userId, sessionId, connection, { forUpdate: true });
    if (!session) {
      throw new HomeworkServiceError('会话不存在或无权访问', { status: 404, code: 'SESSION_NOT_FOUND' });
    }
    if (session.status !== 'active') {
      throw new HomeworkServiceError('本次辅导已经结束，请开始新题目', {
        status: 409,
        code: 'SESSION_CLOSED',
      });
    }
    const [countRows] = await connection.query(
      `SELECT COUNT(*) AS count FROM ai_messages
       WHERE session_id = ? AND role = 'user'`,
      [sessionId]
    );
    if (Number(countRows[0].count) >= MAX_USER_MESSAGES) {
      throw new HomeworkServiceError('这次辅导消息较多，请开始一个新题目', {
        status: 400,
        code: 'SESSION_MESSAGE_LIMIT',
      });
    }
    const [sequenceRows] = await connection.query(
      'SELECT COALESCE(MAX(sequence_no), 0) AS max_sequence FROM ai_messages WHERE session_id = ? FOR UPDATE',
      [sessionId]
    );
    const nextSequence = Number(sequenceRows[0].max_sequence) + 1;
    const imagePath = recognition?.image_path || (file ? canonicalUploadPath(file.path) : null);
    if (recognition) removeUploadedFile(file);
    const [messageResult] = await connection.query(
      `INSERT INTO ai_messages
        (session_id, user_id, role, content, image_path, request_id, sequence_no)
       VALUES (?, ?, 'user', ?, ?, ?, ?)`,
      [sessionId, userId, questionText, imagePath, requestId, nextSequence]
    );
    userMessageId = messageResult.insertId;
    await markGenerationRequest({ requestId, userId, sessionId, userMessageId, status: 'pending', connection });
    await insertEvent(connection, {
      eventName: 'homework_request_started',
      userId,
      sessionId,
      objectId: userMessageId,
      requestId,
      result: 'started',
    });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      const duplicate = await findExistingRequest(userId, requestId);
      if (duplicate) return resolveExistingRequest(duplicate, requestId);
    }
    throw error;
  } finally {
    connection.release();
  }

  return processProviderRequest({ userId, sessionId, userMessageId, requestId });
}

async function retryMessage({ userId, sessionId: rawSessionId, messageId, requestId: rawRequestId }) {
  const requestId = makeRequestId(rawRequestId);
  const existing = await findExistingRequest(userId, requestId);
  if (existing) return resolveExistingRequest(existing, requestId);
  const sessionId = parseSessionId(rawSessionId);
  consumeAiQuota(userId, 'homework');

  const userMessage = await loadMessage(userId, sessionId, messageId);
  if (!userMessage) {
    throw new HomeworkServiceError('原问题不存在或无权访问', { status: 404, code: 'MESSAGE_NOT_FOUND' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const session = await getSession(userId, sessionId, connection, { forUpdate: true });
    if (!session) {
      throw new HomeworkServiceError('会话不存在或无权访问', { status: 404, code: 'SESSION_NOT_FOUND' });
    }
    if (session.status !== 'active') {
      throw new HomeworkServiceError('本次辅导已经结束，请开始新题目', {
        status: 409,
        code: 'SESSION_CLOSED',
      });
    }
    await insertEvent(connection, {
      eventName: 'homework_request_started',
      userId,
      sessionId,
      objectId: userMessage.id,
      requestId,
      result: 'started',
      metadata: { retryOfMessageId: String(messageId) },
    });
    await markGenerationRequest({ requestId, userId, sessionId, userMessageId: userMessage.id, status: 'pending', connection });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return processProviderRequest({
    userId,
    sessionId,
    userMessageId: userMessage.id,
    requestId,
  });
}

function resolveExistingRequest(existing, requestId) {
  if (existing.status === 'succeeded') {
    return {
      session: serializeSession(existing.session),
      userMessage: serializeMessage(existing.userMessage),
      assistantMessage: serializeMessage(existing.assistantMessage),
      request: { requestId, status: 'succeeded', latencyMs: existing.latencyMs, duplicate: true },
    };
  }
  if (existing.status === 'failed') {
    throw new HomeworkServiceError('该请求此前处理失败，请点击重新尝试', {
      status: 409,
      code: existing.errorCode || 'REQUEST_FAILED',
      retryable: true,
      details: {
        sessionId: existing.session ? String(existing.session.id) : null,
        userMessageId: existing.userMessage ? String(existing.userMessage.id) : null,
        requestId,
      },
    });
  }
  throw new HomeworkServiceError('该请求正在处理中，请稍候', {
    status: 409,
    code: 'REQUEST_IN_PROGRESS',
    retryable: true,
    details: { requestId },
  });
}

async function completeSession(userId, rawSessionId) {
  const sessionId = parseSessionId(rawSessionId);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const session = await getSession(userId, sessionId, connection, { forUpdate: true });
    if (!session) {
      throw new HomeworkServiceError('会话不存在或无权访问', { status: 404, code: 'SESSION_NOT_FOUND' });
    }
    if (session.status === 'completed') {
      await connection.commit();
      return { session: serializeSession(session), alreadyCompleted: true };
    }
    if (session.status === 'abandoned') {
      throw new HomeworkServiceError('已放弃的会话不能标记为完成', { status: 409, code: 'SESSION_CLOSED' });
    }
    const [replyRows] = await connection.query(
      `SELECT COUNT(*) AS count FROM ai_messages
       WHERE session_id = ? AND role = 'assistant' AND COALESCE(generation_status, 'completed') = 'completed'`,
      [sessionId]
    );
    if (Number(replyRows[0].count) === 0) {
      throw new HomeworkServiceError('收到一次有效回复后才能标记已解决', {
        code: 'NO_SUCCESSFUL_REPLY',
      });
    }
    await connection.query(
      `UPDATE ai_sessions
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP, last_active_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [sessionId, userId]
    );
    await insertEvent(connection, {
      eventName: 'homework_session_completed',
      userId,
      sessionId,
      objectId: sessionId,
      requestId: crypto.randomUUID(),
      result: 'completed',
    });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  try { await scheduleSummaryRefresh({ userId, sessionId, force: true }); } catch (summaryError) { console.warn('创建作业完成摘要任务失败:', summaryError.message); }
  return { session: serializeSession(await getSession(userId, sessionId)) };
}

async function abandonSession(userId, rawSessionId) {
  const sessionId = parseSessionId(rawSessionId);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const session = await getSession(userId, sessionId, connection, { forUpdate: true });
    if (!session) {
      throw new HomeworkServiceError('会话不存在或无权访问', { status: 404, code: 'SESSION_NOT_FOUND' });
    }
    if (session.status === 'abandoned') {
      await connection.commit();
      return { session: serializeSession(session), alreadyAbandoned: true };
    }
    if (session.status === 'completed') {
      throw new HomeworkServiceError('已完成的会话不能放弃', { status: 409, code: 'SESSION_CLOSED' });
    }
    await connection.query(
      `UPDATE ai_sessions SET status = 'abandoned', last_active_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [sessionId, userId]
    );
    await insertEvent(connection, {
      eventName: 'homework_session_abandoned',
      userId,
      sessionId,
      objectId: sessionId,
      requestId: crypto.randomUUID(),
      result: 'abandoned',
    });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return { session: serializeSession(await getSession(userId, sessionId)) };
}

async function createHomeworkRecognition({ userId, file }) {
  if (!file || !ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
    throw new HomeworkServiceError('请上传 JPG、PNG 或 WEBP 图片', { code: 'INVALID_IMAGE_TYPE' });
  }
  const imagePath = canonicalUploadPath(file.path);
  const recognitionId = crypto.randomUUID();
  let startedAt = Date.now();
  try {
    consumeAiQuota(userId, 'homework');
    const imageUrl = readImageAsDataUrl(imagePath);
    if (!imageUrl) throw new HomeworkServiceError('读取题目图片失败，请重新上传', { code: 'IMAGE_READ_ERROR', retryable: true });
    const prompt = getPrompt('homework');
    startedAt = Date.now();
    const providerResult = await aiProvider.callDoubaoAPI([
      { role: 'system', content: '你是题目识别助手。只提取图片中可见的题目文字，保留公式、选项和题号，不要解题，不确定处用【不清楚】标记。' },
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text', text: '请识别这道题的完整文字。' },
      ] },
    ], Math.min(prompt.maxTokens || 1200, 1200), 0.1, { timeoutMs: 45000, returnMeta: true });
    await recordModelCall({
      requestId: recognitionId,
      userId,
      agentType: 'homework_ocr',
      model: providerResult.model || aiProvider.DOUBAO_MODEL,
      status: 'success',
      latencyMs: Date.now() - startedAt,
      inputTokens: providerResult.inputTokens,
      outputTokens: providerResult.outputTokens,
    });
    const result = providerResult.reply || providerResult;
    await pool.query(
      `INSERT INTO ai_homework_inputs (id, user_id, image_path, recognized_text, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 MINUTE))`,
      [recognitionId, userId, imagePath, String(result || '').trim()]
    );
    return { id: recognitionId, imageUrl: toPublicPath(imagePath), recognizedText: String(result || '').trim(), expiresInSeconds: 1800 };
  } catch (error) {
    await recordModelCall({ requestId: recognitionId, userId, agentType: 'homework_ocr', model: aiProvider.DOUBAO_MODEL, status: 'failure', latencyMs: Date.now() - startedAt, errorCode: error.code });
    removeUploadedFile(file);
    if (error instanceof HomeworkServiceError) throw error;
    throw new HomeworkServiceError(error.message || '题目识别失败，请稍后重试', { code: error.code || 'OCR_ERROR', status: error.status || 502, retryable: error.retryable !== false });
  }
}

async function confirmHomeworkRecognition({ userId, recognitionId, text }) {
  const normalized = String(text || '').trim();
  if (!normalized || normalized.length > MAX_QUESTION_LENGTH) {
    throw new HomeworkServiceError(`题目文字需为 1-${MAX_QUESTION_LENGTH} 个字符`, { code: 'INVALID_RECOGNIZED_TEXT' });
  }
  const [rows] = await pool.query('SELECT * FROM ai_homework_inputs WHERE id = ? AND user_id = ? LIMIT 1', [recognitionId, userId]);
  const input = rows[0];
  if (!input) throw new HomeworkServiceError('识别结果不存在或已过期', { status: 404, code: 'RECOGNITION_NOT_FOUND' });
  if (input.status !== 'recognized' || new Date(input.expires_at).getTime() < Date.now()) {
    throw new HomeworkServiceError('识别结果已过期，请重新上传图片', { status: 409, code: 'RECOGNITION_EXPIRED' });
  }
  await pool.query(`UPDATE ai_homework_inputs SET confirmed_text = ?, status = 'confirmed' WHERE id = ? AND user_id = ?`, [normalized, recognitionId, userId]);
  return { id: String(recognitionId), confirmedText: normalized, imagePath: input.image_path, imageUrl: toPublicPath(input.image_path) };
}

async function insertStreamingUserMessage({ userId, sessionId, question, file, recognitionId = null, requestId }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const session = await getSession(userId, sessionId, connection, { forUpdate: true });
    if (!session) throw new HomeworkServiceError('会话不存在或无权访问', { status: 404, code: 'SESSION_NOT_FOUND' });
    if (session.status !== 'active') throw new HomeworkServiceError('本次辅导已经结束，请开始新题目', { status: 409, code: 'SESSION_CLOSED' });
    const [countRows] = await connection.query(`SELECT COUNT(*) AS count FROM ai_messages WHERE session_id = ? AND role = 'user'`, [sessionId]);
    if (Number(countRows[0].count) >= MAX_USER_MESSAGES) throw new HomeworkServiceError('这次辅导消息较多，请开始一个新题目', { code: 'SESSION_MESSAGE_LIMIT' });
    const recognition = await getConfirmedRecognition(userId, recognitionId);
    if (file && !recognition) throw new HomeworkServiceError('图片题目需要先完成识别确认', { code: 'RECOGNITION_REQUIRED' });
    const [sequenceRows] = await connection.query('SELECT COALESCE(MAX(sequence_no), 0) AS max_sequence FROM ai_messages WHERE session_id = ? FOR UPDATE', [sessionId]);
    const imagePath = recognition?.image_path || (file ? canonicalUploadPath(file.path) : null);
    if (recognition) removeUploadedFile(file);
    const nextSequence = Number(sequenceRows[0].max_sequence) + 1;
    const [messageResult] = await connection.query(
      `INSERT INTO ai_messages (session_id, user_id, role, content, image_path, request_id, sequence_no)
       VALUES (?, ?, 'user', ?, ?, ?, ?)`, [sessionId, userId, question, imagePath, requestId, nextSequence]
    );
    await markGenerationRequest({ requestId, userId, sessionId, userMessageId: messageResult.insertId, status: 'pending', connection });
    await insertEvent(connection, { eventName: 'homework_request_started', userId, sessionId, objectId: messageResult.insertId, requestId, result: 'started' });
    await connection.commit();
    return { sessionId, userMessageId: messageResult.insertId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

async function insertInitialStreamingUserMessage({ userId, question, file, recognition, requestId }) {
  const imagePath = recognition?.image_path || (file ? canonicalUploadPath(file.path) : null);
  if (recognition) removeUploadedFile(file);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [sessionResult] = await connection.query(
      `INSERT INTO ai_sessions (user_id, agent_type, status) VALUES (?, 'homework', 'active')`,
      [userId]
    );
    const sessionId = sessionResult.insertId;
    const [messageResult] = await connection.query(
      `INSERT INTO ai_messages (session_id, user_id, role, content, image_path, request_id, sequence_no)
       VALUES (?, ?, 'user', ?, ?, ?, 1)`,
      [sessionId, userId, question, imagePath, requestId]
    );
    await markGenerationRequest({ requestId, userId, sessionId, userMessageId: messageResult.insertId, status: 'pending', connection });
    await insertEvent(connection, { eventName: 'homework_session_started', userId, sessionId, objectId: sessionId, result: 'started' });
    await insertEvent(connection, { eventName: 'homework_request_started', userId, sessionId, objectId: messageResult.insertId, requestId, result: 'started' });
    await connection.commit();
    return { sessionId, userMessageId: messageResult.insertId };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      const duplicate = await findExistingRequest(userId, requestId);
      if (duplicate) return { duplicate };
    }
    throw error;
  } finally { connection.release(); }
}

async function processStreamingProviderRequest({ userId, sessionId, userMessageId, requestId, questionText, onDelta, signal }) {
  const startedAt = Date.now();
  let partialReply = '';
  try {
    const context = await buildModelMessages(sessionId, userId, questionText);
    const { messages, promptConfig } = context;
    const result = await aiProvider.streamDoubaoAPI(messages, promptConfig.maxTokens, promptConfig.temperature, {
      timeoutMs: 45000,
      onDelta: async (delta) => { partialReply += delta; return onDelta?.(delta); },
      signal,
    });
    const latencyMs = Date.now() - startedAt;
    await recordModelCall({ requestId, sessionId, userId, agentType: 'homework', model: result.model || aiProvider.DOUBAO_MODEL, status: 'success', latencyMs });
    const assistantMessageId = await persistRequestResult({ userId, sessionId, userMessageId, requestId, reply: result.reply || result, latencyMs });
    const session = await getSession(userId, sessionId);
    const userMessage = await loadMessage(userId, sessionId, userMessageId);
    const assistantMessage = (await pool.query('SELECT * FROM ai_messages WHERE id = ?', [assistantMessageId]))[0][0];
    return { session: serializeSession(session), userMessage: serializeMessage(userMessage), assistantMessage: serializeMessage(assistantMessage), request: { requestId, status: 'succeeded', latencyMs } };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    await recordModelCall({ requestId, sessionId, userId, agentType: 'homework', model: aiProvider.DOUBAO_MODEL, status: error.code === 'AI_CANCELLED' ? 'stopped' : 'failure', latencyMs, errorCode: error.code });
    try {
      if (error.code === 'AI_CANCELLED') await persistStoppedReply({ userId, sessionId, userMessageId, requestId, reply: partialReply, latencyMs });
      else await persistRequestResult({ userId, sessionId, userMessageId, requestId, latencyMs, error });
    } catch (persistError) { console.error('记录流式作业失败事件失败:', persistError); }
    const serviceError = error instanceof HomeworkServiceError ? error : new HomeworkServiceError(error.message || 'AI 服务暂时不可用，请稍后重试', { status: error.status || 502, code: error.code || 'AI_PROVIDER_ERROR', retryable: error.retryable !== false });
    serviceError.details = { ...serviceError.details, sessionId: String(sessionId), userMessageId: String(userMessageId), requestId };
    throw serviceError;
  }
}

async function streamSessionAndProcess({ userId, question, file, recognitionId = null, requestId: rawRequestId, onDelta, signal }) {
  validateQuestionShape(question, file, recognitionId);
  const requestId = makeRequestId(rawRequestId);
  const existing = await findExistingRequest(userId, requestId);
  if (existing) { removeUploadedFile(file); return resolveExistingRequest(existing, requestId); }
  const recognition = await getConfirmedRecognition(userId, recognitionId);
  if (file && !recognition) throw new HomeworkServiceError('图片题目需要先完成识别确认', { code: 'RECOGNITION_REQUIRED' });
  const questionText = normalizeQuestion(recognition?.confirmed_text || question, recognition ? null : file);
  consumeAiQuota(userId, 'homework');
  const inserted = await insertInitialStreamingUserMessage({ userId, question: questionText, file, recognition, requestId });
  if (inserted.duplicate) return resolveExistingRequest(inserted.duplicate, requestId);
  return processStreamingProviderRequest({ userId, ...inserted, requestId, questionText, onDelta, signal });
}

async function streamMessageAndProcess({ userId, sessionId: rawSessionId, question, file, recognitionId = null, requestId: rawRequestId, onDelta, signal }) {
  validateQuestionShape(question, file, recognitionId);
  const requestId = makeRequestId(rawRequestId);
  const existing = await findExistingRequest(userId, requestId);
  if (existing) { removeUploadedFile(file); return resolveExistingRequest(existing, requestId); }
  const sessionId = parseSessionId(rawSessionId);
  const recognition = await getConfirmedRecognition(userId, recognitionId);
  if (file && !recognition) throw new HomeworkServiceError('图片题目需要先完成识别确认', { code: 'RECOGNITION_REQUIRED' });
  const questionText = normalizeQuestion(recognition?.confirmed_text || question, recognition ? null : file);
  consumeAiQuota(userId, 'homework');
  const inserted = await insertStreamingUserMessage({ userId, sessionId, question: questionText, file, recognitionId, requestId });
  return processStreamingProviderRequest({ userId, sessionId, userMessageId: inserted.userMessageId, requestId, questionText, onDelta, signal });
}

async function persistStoppedReply({ userId, sessionId, userMessageId, requestId, reply, latencyMs }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [sequenceRows] = await connection.query(
      'SELECT COALESCE(MAX(sequence_no), 0) AS max_sequence FROM ai_messages WHERE session_id = ? FOR UPDATE',
      [sessionId]
    );
    await connection.query(
      `INSERT INTO ai_messages (session_id, user_id, role, content, reply_to_message_id, sequence_no, generation_status)
       VALUES (?, ?, 'assistant', ?, ?, ?, 'stopped')`,
      [sessionId, userId, reply, userMessageId, Number(sequenceRows[0].max_sequence) + 1]
    );
    await markGenerationRequest({ requestId, userId, sessionId, userMessageId, status: 'stopped', errorCode: 'AI_CANCELLED', latencyMs, connection });
    await insertEvent(connection, {
      eventName: 'homework_generation_stopped',
      userId,
      sessionId,
      objectId: userMessageId,
      requestId,
      result: 'abandoned',
      latencyMs,
    });
    await connection.query('UPDATE ai_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', [sessionId, userId]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

module.exports = {
  HomeworkServiceError,
  makeRequestId,
  normalizeQuestion,
  parseSessionId,
  createSessionAndProcess,
  addMessageAndProcess,
  retryMessage,
  getRecentSession,
  completeSession,
  abandonSession,
  createHomeworkRecognition,
  confirmHomeworkRecognition,
  streamMessageAndProcess,
  streamSessionAndProcess,
  getConfirmedRecognition,
  parseStructuredHomeworkReply,
  ALLOWED_IMAGE_TYPES,
};
