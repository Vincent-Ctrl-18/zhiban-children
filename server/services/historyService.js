const { pool } = require('../config/database');
const { toPublicPath } = require('../config/paths');

const LEARNING_AGENTS = new Set(['homework', 'report']);

function serializeSession(row) {
  return {
    id: String(row.id),
    agentType: row.agent_type,
    status: row.status,
    title: row.title || null,
    titleSource: row.title_source || 'automatic',
    summary: row.summary || null,
    summaryJson: row.summary_json ? (typeof row.summary_json === 'string' ? safeJson(row.summary_json) : row.summary_json) : null,
    subject: row.subject || null,
    stage: row.stage || null,
    parentSessionId: row.parent_session_id ? String(row.parent_session_id) : null,
    startedAt: row.started_at,
    lastActiveAt: row.last_active_at,
    completedAt: row.completed_at,
  };
}

function safeJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function normalizePage(value, fallback = 1) {
  const page = Number(value);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : fallback;
}

function buildFilters(userId, { agentType, status, subject, from, to, includeCompanion = false } = {}) {
  const filters = ['user_id = ?'];
  const params = [userId];
  if (includeCompanion) filters.push("agent_type = 'companion'");
  else filters.push("agent_type IN ('homework', 'report')");
  if (LEARNING_AGENTS.has(agentType)) { filters.push('agent_type = ?'); params.push(agentType); }
  if (['active', 'completed', 'abandoned'].includes(status)) { filters.push('status = ?'); params.push(status); }
  if (typeof subject === 'string' && subject.trim()) { filters.push('subject = ?'); params.push(subject.trim().slice(0, 40)); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(from || '')) { filters.push('DATE(last_active_at) >= ?'); params.push(from); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to || '')) { filters.push('DATE(last_active_at) <= ?'); params.push(to); }
  return { filters, params };
}

async function listSessions(userId, options = {}) {
  const { filters, params } = buildFilters(userId, options);
  const size = Math.min(Math.max(Number(options.pageSize) || 20, 1), 50);
  const page = normalizePage(options.page);
  const offset = (page - 1) * size;
  const [rows] = await pool.query(
    `SELECT * FROM ai_sessions WHERE ${filters.join(' AND ')} ORDER BY last_active_at DESC LIMIT ? OFFSET ?`,
    [...params, size, offset]
  );
  const items = rows.map(serializeSession);
  if (String(options.withTotal).toLowerCase() !== 'true' && String(options.withTotal) !== '1') return items;
  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM ai_sessions WHERE ${filters.join(' AND ')}`, params);
  return { items, page, pageSize: size, total: Number(countRows[0]?.total || 0) };
}

async function listCompanionSessions(userId, { status, from, to, page = 1, pageSize = 20 } = {}) {
  const result = await listSessions(userId, { status, from, to, page, pageSize, includeCompanion: true });
  const sanitize = (item) => ({ id: item.id, agentType: 'companion', status: item.status, title: '谈心记录', startedAt: item.startedAt, lastActiveAt: item.lastActiveAt, completedAt: item.completedAt });
  if (Array.isArray(result)) return result.map(sanitize);
  return { ...result, items: result.items.map(sanitize) };
}

async function queryMessages(sessionId) {
  try {
    const [rows] = await pool.query(
      `SELECT m.*, r.status AS request_status, r.error_code AS request_error_code
       FROM ai_messages m LEFT JOIN ai_generation_requests r ON r.user_message_id = m.id
       WHERE m.session_id = ? ORDER BY m.sequence_no ASC`,
      [sessionId]
    );
    return rows;
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
    const [rows] = await pool.query('SELECT * FROM ai_messages WHERE session_id = ? ORDER BY sequence_no ASC', [sessionId]);
    return rows;
  }
}

function serializeMessage(row) {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: row.role,
    content: row.content,
    imageUrl: row.image_path ? toPublicPath(row.image_path) : null,
    contentJson: row.content_json ? (typeof row.content_json === 'string' ? safeJson(row.content_json) : row.content_json) : null,
    createdAt: row.created_at,
    sequenceNo: Number(row.sequence_no || 0),
    generationStatus: row.generation_status || 'completed',
    requestStatus: row.request_status || null,
    requestErrorCode: row.request_error_code || null,
  };
}

async function getSessionDetail(userId, sessionId, { includeCompanion = false } = {}) {
  const allowed = includeCompanion ? "agent_type = 'companion'" : "agent_type IN ('homework', 'report')";
  const [sessions] = await pool.query(`SELECT * FROM ai_sessions WHERE id = ? AND user_id = ? AND ${allowed} LIMIT 1`, [sessionId, userId]);
  if (!sessions[0]) { const error = new Error('会话不存在或无权访问'); error.status = 404; error.code = 'SESSION_NOT_FOUND'; throw error; }
  const messages = await queryMessages(sessionId);
  return { session: serializeSession(sessions[0]), messages: messages.map(serializeMessage) };
}

async function getCompanionSessionDetail(userId, sessionId) {
  return getSessionDetail(userId, sessionId, { includeCompanion: true });
}

async function updateTitle(userId, sessionId, title) {
  const normalized = String(title || '').trim().slice(0, 160);
  if (!normalized) { const error = new Error('标题不能为空'); error.status = 400; error.code = 'INVALID_TITLE'; throw error; }
  const [result] = await pool.query(
    `UPDATE ai_sessions SET title = ?, title_source = 'user' WHERE id = ? AND user_id = ? AND agent_type IN ('homework', 'report')`,
    [normalized, sessionId, userId]
  );
  if (!result.affectedRows) { const error = new Error('会话不存在或无权访问'); error.status = 404; error.code = 'SESSION_NOT_FOUND'; throw error; }
  return { id: String(sessionId), title: normalized, titleSource: 'user' };
}

async function resumeSession(userId, sessionId) {
  const connection = await pool.getConnection();
  let nextId = String(sessionId);
  let mode = 'existing';
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT * FROM ai_sessions WHERE id = ? AND user_id = ? AND agent_type IN ('homework', 'report') LIMIT 1 FOR UPDATE`,
      [sessionId, userId]
    );
    const source = rows[0];
    if (!source) { const error = new Error('会话不存在或无权访问'); error.status = 404; error.code = 'SESSION_NOT_FOUND'; throw error; }
    if (source.status === 'abandoned') { const error = new Error('已结束的会话不能继续，请开始新任务'); error.status = 409; error.code = 'SESSION_ABANDONED'; throw error; }
    if (source.status === 'completed') {
      if (source.agent_type !== 'homework') { const error = new Error('学习报告只能查看，不能继续追加消息'); error.status = 409; error.code = 'REPORT_READ_ONLY'; throw error; }
      const [result] = await connection.query(
        `INSERT INTO ai_sessions
          (user_id, agent_type, status, title, summary, summary_json, summarized_through_sequence,
           summary_version, summary_updated_at, subject, stage, parent_session_id, title_source)
         VALUES (?, 'homework', 'active', ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, ?, ?, ?, 'automatic')`,
        [userId, source.title, source.summary, source.summary_json, source.summary_version || 1, source.subject, source.stage, source.id]
      );
      nextId = String(result.insertId);
      mode = 'forked';
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
  const detail = await getSessionDetail(userId, nextId);
  return { ...detail, mode, sourceSessionId: mode === 'forked' ? String(sessionId) : null };
}

module.exports = {
  serializeSession,
  serializeMessage,
  listSessions,
  listCompanionSessions,
  getSessionDetail,
  getCompanionSessionDetail,
  updateTitle,
  resumeSession,
};
