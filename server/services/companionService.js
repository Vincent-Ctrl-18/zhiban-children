const crypto = require('crypto');
const { pool } = require('../config/database');
const { callDoubaoAPI } = require('./aiProvider');
const { recordEvent, recordModelCall } = require('./eventService');
const { consumeAiQuota } = require('../middleware/rateLimit');
const { buildAgentContext } = require('./contextBuilderService');
const { scheduleSummaryRefresh } = require('./summaryService');
const { upsertGenerationRequest } = require('./generationService');

const MAX_MESSAGE_LENGTH = 1000;

const RISK_RULES = [
  { category: 'self_harm', severity: 'critical', patterns: [/自杀| suicide|不想活|活不下去|结束生命|割腕|跳楼|自残|伤害自己/i] },
  { category: 'harm_others', severity: 'critical', patterns: [/杀人|伤害别人|弄死他|报复|带刀|砍人/i] },
  { category: 'sexual_abuse', severity: 'high', patterns: [/强奸|猥亵|性侵|摸我|裸照|发生关系/i] },
  { category: 'abuse', severity: 'high', patterns: [/打我|家暴|虐待|拳打|被爸爸打|被妈妈打/i] },
  { category: 'missing', severity: 'high', patterns: [/被拐|失踪|不见了|联系不上|被关起来/i] },
  { category: 'bullying', severity: 'medium', patterns: [/霸凌|欺负我|校园暴力|同学打我|被孤立/i] },
  { category: 'negative_emotion', severity: 'low', patterns: [/难过|伤心|孤独|压力|焦虑|害怕|想家|烦恼/i] },
];

function classifyRisk(text) {
  const content = String(text || '');
  for (const rule of RISK_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(content))) return { category: rule.category, severity: rule.severity, classifier: 'rules' };
  }
  return { category: 'negative_emotion', severity: 'low', classifier: 'rules' };
}

const RISK_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };
const RISK_CATEGORIES = new Set(['self_harm', 'harm_others', 'abuse', 'sexual_abuse', 'missing', 'bullying', 'negative_emotion']);

async function refineRiskWithModel(text, ruleRisk, { userId, requestId }) {
  // 规则已经命中高危时直接走安全流程；仅对中风险信号做一次结构化复核，避免普通情绪消息增加额外模型开销。
  if (ruleRisk.severity !== 'medium') return ruleRisk;
  const startedAt = Date.now();
  try {
    const result = await callDoubaoAPI([
      { role: 'system', content: '你是青少年安全分诊器。只返回 JSON：{"category":"...","severity":"low|medium|high|critical"}，不要复述原文。无法判断时返回 low。' },
      { role: 'user', content: text.slice(0, MAX_MESSAGE_LENGTH) },
    ], 120, 0, { timeoutMs: 3000, returnMeta: true });
    const raw = result.reply || result;
    const parsed = JSON.parse(String(raw).replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
    const category = RISK_CATEGORIES.has(parsed.category) ? parsed.category : ruleRisk.category;
    const severity = RISK_ORDER[parsed.severity] !== undefined ? parsed.severity : ruleRisk.severity;
    await recordModelCall({ requestId, userId, agentType: 'companion_risk_classifier', model: result.model || null, status: 'success', latencyMs: Date.now() - startedAt, inputTokens: result.inputTokens, outputTokens: result.outputTokens });
    return RISK_ORDER[severity] >= RISK_ORDER[ruleRisk.severity] ? { category, severity, classifier: 'rules+model' } : ruleRisk;
  } catch (error) {
    await recordModelCall({ requestId, userId, agentType: 'companion_risk_classifier', model: process.env.ARK_MODEL || null, status: 'failure', latencyMs: Date.now() - startedAt, errorCode: error.code || 'RISK_CLASSIFIER_ERROR' });
    return ruleRisk;
  }
}

function safeReply(risk) {
  if (risk.severity === 'critical') return '我很重视你刚才说的这些。现在请先和身边可信任的大人待在一起，不要独处；如果你正处在危险中，请立即拨打 110 或 120。也可以联系 12355 青少年服务或 12356 心理援助，我会帮你一起找到下一步。';
  if (risk.severity === 'high') return '听起来你遇到了需要大人介入的事情。请尽快告诉老师、家长或机构工作人员，并和可信任的大人待在一起。需要倾诉时可以联系 12355 或 12356。';
  return null;
}

function serializeSession(row) {
  if (!row) return null;
  return { id: String(row.id), status: row.status, title: row.title || '谈心小屋', startedAt: row.started_at, lastActiveAt: row.last_active_at, completedAt: row.completed_at };
}

function serializeMessage(row) {
  return { id: String(row.id), sessionId: String(row.session_id), role: row.role, content: row.content, createdAt: row.created_at, generationStatus: row.generation_status || 'completed', requestStatus: row.request_status || null, requestErrorCode: row.request_error_code || null };
}

async function loadSession(userId, sessionId = null, forUpdate = false, executor = pool) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const sql = sessionId
    ? `SELECT * FROM ai_sessions WHERE id = ? AND user_id = ? AND agent_type = 'companion' LIMIT 1${lock}`
    : `SELECT * FROM ai_sessions WHERE user_id = ? AND agent_type = 'companion' AND status = 'active' ORDER BY last_active_at DESC LIMIT 1${lock}`;
  const [rows] = await executor.query(sql, sessionId ? [sessionId, userId] : [userId]);
  return rows[0] || null;
}

async function getRecentCompanionSession(userId) {
  const session = await loadSession(userId);
  if (!session) return null;
  let messages;
  try {
    [messages] = await pool.query(`SELECT m.*, r.status AS request_status, r.error_code AS request_error_code
      FROM ai_messages m LEFT JOIN ai_generation_requests r ON r.user_message_id = m.id
      WHERE m.session_id = ? ORDER BY m.sequence_no ASC`, [session.id]);
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE' && error.code) throw error;
    [messages] = await pool.query('SELECT * FROM ai_messages WHERE session_id = ? ORDER BY sequence_no ASC', [session.id]);
  }
  return { session: serializeSession(session), messages: messages.map(serializeMessage) };
}

async function findExistingRequest(userId, requestId) {
  if (!requestId) return null;
  const [userRows] = await pool.query('SELECT * FROM ai_messages WHERE user_id = ? AND request_id = ? AND role = \'user\' LIMIT 1', [userId, requestId]);
  if (!userRows[0]) return null;
  const [assistantRows] = await pool.query('SELECT * FROM ai_messages WHERE reply_to_message_id = ? AND role = \'assistant\' ORDER BY id DESC LIMIT 1', [userRows[0].id]);
  if (!assistantRows[0]) return { pending: true, userMessage: userRows[0] };
  const session = await loadSession(userId, userRows[0].session_id);
  return { session: serializeSession(session), userMessage: serializeMessage(userRows[0]), assistantMessage: serializeMessage(assistantRows[0]), duplicate: true };
}

async function sendCompanionMessage({ userId, institutionId = null, sessionId = null, content, requestId = crypto.randomUUID() }) {
  requestId = /^[a-zA-Z0-9:_-]{8,100}$/.test(String(requestId || '')) ? String(requestId) : crypto.randomUUID();
  const text = String(content || '').trim();
  if (!text) { const error = new Error('请输入想说的话'); error.status = 400; error.code = 'EMPTY_MESSAGE'; throw error; }
  if (text.length > MAX_MESSAGE_LENGTH) { const error = new Error(`消息不能超过 ${MAX_MESSAGE_LENGTH} 个字符`); error.status = 400; error.code = 'MESSAGE_TOO_LONG'; throw error; }
  const existing = await findExistingRequest(userId, requestId);
  if (existing && !existing.pending) return existing;
  if (existing?.pending) { const error = new Error('该消息正在处理中，请稍后重试'); error.status = 409; error.code = 'REQUEST_IN_PROGRESS'; error.retryable = true; throw error; }
  const risk = await refineRiskWithModel(text, classifyRisk(text), { userId, requestId });
  consumeAiQuota(userId, 'companion');
  const connection = await pool.getConnection();
  let session;
  let userMessageId;
  try {
    await connection.beginTransaction();
    session = await loadSession(userId, sessionId, true, connection);
    if (!session && !sessionId) {
      const [sessionResult] = await connection.query(`INSERT INTO ai_sessions (user_id, agent_type, status, title) VALUES (?, 'companion', 'active', '谈心小屋')`, [userId]);
      session = { id: sessionResult.insertId, user_id: userId, agent_type: 'companion', status: 'active' };
    }
    if (!session) { const error = new Error('会话不存在或无权访问'); error.status = 404; error.code = 'SESSION_NOT_FOUND'; throw error; }
    if (session.status !== 'active') { const error = new Error('这次谈心已经结束，请开始新的对话'); error.status = 409; error.code = 'SESSION_CLOSED'; throw error; }
    const [seq] = await connection.query('SELECT COALESCE(MAX(sequence_no), 0) AS max_sequence FROM ai_messages WHERE session_id = ? FOR UPDATE', [session.id]);
    const [messageResult] = await connection.query(
      `INSERT INTO ai_messages (session_id, user_id, role, content, request_id, sequence_no) VALUES (?, ?, 'user', ?, ?, ?)`,
      [session.id, userId, text, requestId, Number(seq[0].max_sequence) + 1]
    );
    userMessageId = messageResult.insertId;
    await upsertGenerationRequest({ requestId, userId, sessionId: session.id, userMessageId, agentType: 'companion', status: 'pending', connection });
    if (risk.severity !== 'low') {
      await connection.query(
        `INSERT INTO companion_risk_events (user_id, institution_id, session_id, message_id, category, severity, classifier)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, institutionId, session.id, userMessageId, risk.category, risk.severity, risk.classifier]
      );
      await recordEvent({ eventName: 'companion_risk_detected', userId, userRole: 'student', institutionId, sessionId: session.id, objectId: userMessageId, requestId, metadata: { category: risk.category, severity: risk.severity }, connection });
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }

  let reply = safeReply(risk);
  const startedAt = Date.now();
  if (!reply) {
    try {
      const context = await buildAgentContext({ agentType: 'companion', userId, sessionId: session.id, currentText: text });
      const providerResult = await callDoubaoAPI(context.messages, context.prompt.maxTokens, context.prompt.temperature, { timeoutMs: 45000, returnMeta: true });
      reply = providerResult.reply || providerResult;
      await recordModelCall({ requestId, sessionId: session.id, userId, agentType: 'companion', model: providerResult.model || process.env.ARK_MODEL || null, status: 'success', latencyMs: Date.now() - startedAt, inputTokens: providerResult.inputTokens, outputTokens: providerResult.outputTokens });
    } catch (error) {
      await recordModelCall({ requestId, sessionId: session.id, userId, agentType: 'companion', model: process.env.ARK_MODEL || null, status: 'failure', latencyMs: Date.now() - startedAt, errorCode: error.code });
      const wrapped = new Error(error.message || '暂时无法回复，请稍后重试');
      wrapped.status = error.status || 502; wrapped.code = error.code || 'AI_PROVIDER_ERROR'; wrapped.retryable = error.retryable !== false; wrapped.details = { sessionId: String(session.id), userMessageId: String(userMessageId), requestId };
      try { await upsertGenerationRequest({ requestId, userId, sessionId: session.id, userMessageId, agentType: 'companion', status: 'failed', errorCode: wrapped.code, latencyMs: Date.now() - startedAt }); } catch (statusError) { console.warn('记录谈心生成状态失败:', statusError.message); }
      throw wrapped;
    }
  }
  const connection2 = await pool.getConnection();
  try {
    await connection2.beginTransaction();
    const [seq] = await connection2.query('SELECT COALESCE(MAX(sequence_no), 0) AS max_sequence FROM ai_messages WHERE session_id = ? FOR UPDATE', [session.id]);
    const [assistant] = await connection2.query(
      `INSERT INTO ai_messages (session_id, user_id, role, content, reply_to_message_id, request_id, sequence_no) VALUES (?, ?, 'assistant', ?, ?, ?, ?)`,
      [session.id, userId, reply, userMessageId, `${requestId.slice(0, 90)}:assistant`, Number(seq[0].max_sequence) + 1]
    );
    await upsertGenerationRequest({ requestId, userId, sessionId: session.id, userMessageId, assistantMessageId: assistant.insertId, agentType: 'companion', status: 'succeeded', latencyMs: Date.now() - startedAt, connection: connection2 });
    await connection2.query('UPDATE ai_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?', [session.id]);
    const [successCount] = await connection2.query(`SELECT COUNT(*) AS count FROM ai_messages WHERE session_id = ? AND role = 'assistant'`, [session.id]);
    if (Number(successCount[0].count) === 1) await recordEvent({ eventName: 'companion_session_started', userId, userRole: 'student', institutionId, sessionId: session.id, objectId: session.id, requestId: `companion-start:${session.id}`, connection: connection2 });
    await connection2.commit();
    try { await scheduleSummaryRefresh({ userId, sessionId: session.id }); } catch (summaryError) { console.warn('创建谈心摘要任务失败:', summaryError.message); }
    const [userRows] = await pool.query('SELECT * FROM ai_messages WHERE id = ?', [userMessageId]);
    const [assistantRows] = await pool.query('SELECT * FROM ai_messages WHERE id = ?', [assistant.insertId]);
    return { session: serializeSession(await loadSession(userId, session.id)), userMessage: serializeMessage(userRows[0]), assistantMessage: serializeMessage(assistantRows[0]), risk, latencyMs: Date.now() - startedAt };
  } catch (error) { await connection2.rollback(); throw error; } finally { connection2.release(); }
}

async function completeCompanionSession({ userId, sessionId, institutionId = null }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const session = await loadSession(userId, sessionId, true, connection);
    if (!session) { const error = new Error('会话不存在或无权访问'); error.status = 404; error.code = 'SESSION_NOT_FOUND'; throw error; }
    if (session.status === 'completed') { await connection.commit(); return { session: serializeSession(session), alreadyCompleted: true }; }
    await connection.query(`UPDATE ai_sessions SET status = 'completed', completed_at = CURRENT_TIMESTAMP, last_active_at = CURRENT_TIMESTAMP WHERE id = ?`, [session.id]);
    await recordEvent({ eventName: 'companion_session_completed', userId, userRole: 'student', institutionId, sessionId: session.id, objectId: session.id, requestId: `companion-complete:${session.id}`, connection });
    await connection.commit();
    try { await scheduleSummaryRefresh({ userId, sessionId: session.id, force: true }); } catch (summaryError) { console.warn('创建谈心完成摘要任务失败:', summaryError.message); }
    return { session: serializeSession(await loadSession(userId, session.id)) };
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

module.exports = { classifyRisk, refineRiskWithModel, getRecentCompanionSession, sendCompanionMessage, completeCompanionSession, MAX_MESSAGE_LENGTH };
