const { pool } = require('../config/database');
const { getEffectivePrompt } = require('../config/promptManager');
const aiProvider = require('./aiProvider');
const { persistMemoryCandidates } = require('./memoryService');

const SUMMARY_TRIGGER_MESSAGES = Math.max(Number(process.env.AI_SUMMARY_TRIGGER_MESSAGES) || 6, 3);
const SUMMARY_TRIGGER_TOKENS = Math.max(Number(process.env.AI_SUMMARY_TRIGGER_TOKENS) || 3500, 1000);
const SUMMARY_MAX_SOURCE_CHARS = 18_000;
const SUMMARY_VERSION = 1;
const SUMMARY_MAX_ATTEMPTS = Math.max(Number(process.env.AI_SUMMARY_MAX_ATTEMPTS) || 5, 1);
const SUMMARY_STALE_LOCK_MS = Math.max(Number(process.env.AI_SUMMARY_STALE_LOCK_MS) || 300_000, 60_000);

function getSummaryFailureState(previousAttempts, now = Date.now()) {
  const attempts = Number(previousAttempts || 0) + 1;
  return {
    attempts,
    status: attempts >= SUMMARY_MAX_ATTEMPTS ? 'dead' : 'failed',
    availableAt: new Date(now + Math.min(60_000 * Math.max(attempts, 1), 15 * 60_000)),
  };
}

function stripJsonFence(value) {
  return String(value || '').replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
}

function parseSummary(raw, agentType) {
  try {
    const parsed = JSON.parse(stripJsonFence(raw));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid summary');
    return {
      task: String(parsed.task || parsed.currentTask || '').slice(0, 1200),
      confirmedConditions: Array.isArray(parsed.confirmedConditions) ? parsed.confirmedConditions.slice(0, 12).map((item) => String(item).slice(0, 300)) : [],
      studentAttempts: Array.isArray(parsed.studentAttempts) ? parsed.studentAttempts.slice(0, 12).map((item) => String(item).slice(0, 300)) : [],
      conclusions: Array.isArray(parsed.conclusions) ? parsed.conclusions.slice(0, 12).map((item) => String(item).slice(0, 300)) : [],
      stage: String(parsed.stage || '').slice(0, 40),
      unresolved: Array.isArray(parsed.unresolved) ? parsed.unresolved.slice(0, 12).map((item) => String(item).slice(0, 300)) : [],
      subject: String(parsed.subject || '').slice(0, 40) || null,
      knowledgePoints: Array.isArray(parsed.knowledgePoints) ? parsed.knowledgePoints.slice(0, 16).map((item) => String(item).slice(0, 80)) : [],
      memoryCandidates: agentType === 'companion' ? [] : (Array.isArray(parsed.memoryCandidates) ? parsed.memoryCandidates.slice(0, 12).map((candidate) => ({
        type: candidate?.type,
        content: candidate?.content,
        subject: candidate?.subject,
        confidence: candidate?.confidence,
      })) : []),
    };
  } catch {
    return null;
  }
}

function fallbackSummary(existing, rows, agentType) {
  const userRows = rows.filter((row) => row.role === 'user');
  const latest = userRows[userRows.length - 1]?.content || '';
  return {
    task: existing?.task || latest.slice(0, 1200),
    confirmedConditions: existing?.confirmedConditions || [],
    studentAttempts: existing?.studentAttempts || [],
    conclusions: existing?.conclusions || [],
    stage: existing?.stage || '',
    unresolved: existing?.unresolved || [],
    subject: existing?.subject || null,
    knowledgePoints: existing?.knowledgePoints || [],
    memoryCandidates: agentType === 'companion' ? [] : [],
  };
}

function summaryToShortText(summary) {
  const parts = [summary.task, summary.conclusions?.[summary.conclusions.length - 1], summary.unresolved?.[0]].filter(Boolean);
  return parts.join('；').slice(0, 500) || 'AI 学习会话';
}

function estimateUnsummarizedTokens(messages = []) {
  return messages.reduce((total, row) => total + Math.ceil(Array.from(String(row.content || '')).length / 1.5) + 4, 0);
}

function needsSummary(state, force = false) {
  if (!state) return false;
  if (force) return state.messages.length > 0;
  return state.messages.length >= SUMMARY_TRIGGER_MESSAGES || estimateUnsummarizedTokens(state.messages) >= SUMMARY_TRIGGER_TOKENS;
}

async function getSummaryState(userId, sessionId, executor = pool) {
  const [sessionRows] = await executor.query(
    `SELECT id, user_id, agent_type, status, title, title_source, summary, summary_json,
            summarized_through_sequence, summary_version
     FROM ai_sessions WHERE id = ? AND user_id = ? LIMIT 1`,
    [sessionId, userId]
  );
  if (!sessionRows[0]) return null;
  const session = sessionRows[0];
  let summary = null;
  try { summary = session.summary_json ? (typeof session.summary_json === 'string' ? JSON.parse(session.summary_json) : session.summary_json) : null; } catch { summary = null; }
  const [messageRows] = await executor.query(
    `SELECT id, role, content, sequence_no, generation_status
     FROM ai_messages WHERE session_id = ? AND sequence_no > ?
     ORDER BY sequence_no ASC LIMIT 100`,
    [sessionId, Number(session.summarized_through_sequence || 0)]
  );
  return { session, summary, messages: messageRows.filter((row) => !(row.role === 'assistant' && ['failed', 'stopped'].includes(row.generation_status))) };
}

async function shouldRefreshSummary(userId, sessionId, { force = false } = {}) {
  if (process.env.AI_SESSION_SUMMARY_ENABLED === 'false') return false;
  const state = await getSummaryState(userId, sessionId);
  return needsSummary(state, force);
}

async function enqueueSummaryJob({ userId, sessionId, targetSequence }) {
  try {
    await pool.query(
      `INSERT INTO ai_memory_jobs (user_id, session_id, job_type, target_sequence, status)
       VALUES (?, ?, 'summary', ?, 'pending')
       ON DUPLICATE KEY UPDATE available_at = LEAST(available_at, CURRENT_TIMESTAMP), status = IF(status = 'failed', 'pending', status)`,
      [userId, sessionId, targetSequence]
    );
    return true;
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') return false;
    throw error;
  }
}

async function refreshSessionSummary({ userId, sessionId, force = false } = {}) {
  if (process.env.AI_SESSION_SUMMARY_ENABLED === 'false') return null;
  const state = await getSummaryState(userId, sessionId);
  if (!needsSummary(state, force)) return state?.summary || null;
  const agentType = state.session.agent_type;
  const prompt = await getEffectivePrompt(agentType === 'report' ? 'learningReport' : agentType === 'companion' ? 'chat' : 'homework', { userId });
  const source = state.messages.map((row) => `${row.role}: ${row.content}`).join('\n').slice(-SUMMARY_MAX_SOURCE_CHARS);
  const previous = state.summary ? JSON.stringify(state.summary).slice(0, 7000) : '暂无历史摘要';
  const instruction = agentType === 'companion'
    ? '只总结本次谈心会话的事实和未完成话题，不做心理诊断，不生成跨会话记忆。'
    : '只总结学习事实，不评价人格或能力；memoryCandidates 只能是学习目标、年级、回答偏好、科目兴趣、知识薄弱点或已掌握知识点。';
  const messages = [
    { role: 'system', content: `${prompt.systemPrompt}\n${instruction}\n严格返回 JSON：{"task":"","confirmedConditions":[],"studentAttempts":[],"conclusions":[],"stage":"","unresolved":[],"subject":"","knowledgePoints":[],"memoryCandidates":[{"type":"","content":"","subject":"","confidence":0.0}]}` },
    { role: 'user', content: `旧摘要：${previous}\n\n新增消息：\n${source}` },
  ];
  let providerResult;
  try {
    providerResult = await aiProvider.callDoubaoAPI(messages, 900, 0.2, { timeoutMs: 15000, returnMeta: true });
  } catch (error) {
    // 摘要不是主请求的硬依赖；保留上一版摘要并由任务重试。
    error.retryable = error.retryable !== false;
    throw error;
  }
  const parsed = parseSummary(providerResult.reply || providerResult, agentType) || fallbackSummary(state.summary, state.messages, agentType);
  const maxSequence = state.messages.reduce((value, row) => Math.max(value, Number(row.sequence_no || 0)), Number(state.session.summarized_through_sequence || 0));
  const short = summaryToShortText(parsed);
  const automaticTitle = state.session.title_source !== 'user' && (!state.session.title || state.session.title_source === 'automatic')
    ? (parsed.task || short).slice(0, 80)
    : null;
  await pool.query(
    `UPDATE ai_sessions SET summary = ?, summary_json = ?, summarized_through_sequence = ?,
       summary_version = ?, summary_updated_at = CURRENT_TIMESTAMP,
       subject = COALESCE(?, subject), stage = COALESCE(?, stage),
       title = COALESCE(?, title)
     WHERE id = ? AND user_id = ?`,
    [short, JSON.stringify(parsed), maxSequence, SUMMARY_VERSION, parsed.subject, parsed.stage, automaticTitle, sessionId, userId]
  );
  if (agentType !== 'companion' && parsed.memoryCandidates.length) {
    const latestUserMessage = [...state.messages].reverse().find((row) => row.role === 'user');
    await persistMemoryCandidates({
      userId,
      candidates: parsed.memoryCandidates.map((candidate) => ({
        ...candidate,
        sourceAgentType: agentType,
        sourceSessionId: sessionId,
        sourceMessageId: latestUserMessage?.id || null,
      })),
    });
  }
  return parsed;
}

async function scheduleSummaryRefresh({ userId, sessionId, force = false } = {}) {
  if (process.env.AI_SESSION_SUMMARY_ENABLED === 'false') return false;
  try {
    const state = await getSummaryState(userId, sessionId);
    if (!state) return false;
    const shouldQueue = needsSummary(state, force);
    if (!shouldQueue) return false;
    return enqueueSummaryJob({ userId, sessionId, targetSequence: state.messages[state.messages.length - 1]?.sequence_no || 0 });
  } catch (error) {
    if (error.code && error.code !== 'ER_NO_SUCH_TABLE') console.warn('创建 AI 摘要任务失败:', error.message);
    return false;
  }
}

async function claimSummaryJob() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const staleBefore = new Date(Date.now() - SUMMARY_STALE_LOCK_MS);
    await connection.query(
      `UPDATE ai_memory_jobs SET status = 'dead', locked_at = NULL
       WHERE job_type = 'summary' AND status IN ('pending', 'failed') AND attempts >= ?`,
      [SUMMARY_MAX_ATTEMPTS]
    );
    await connection.query(
      `UPDATE ai_memory_jobs
       SET status = IF(attempts >= ?, 'dead', 'failed'),
           last_error = 'worker lock expired', available_at = CURRENT_TIMESTAMP, locked_at = NULL
       WHERE job_type = 'summary' AND status = 'processing' AND locked_at < ?`,
      [SUMMARY_MAX_ATTEMPTS, staleBefore]
    );
    const [rows] = await connection.query(
      `SELECT * FROM ai_memory_jobs
       WHERE job_type = 'summary' AND status IN ('pending', 'failed') AND attempts < ? AND available_at <= CURRENT_TIMESTAMP
       ORDER BY id ASC LIMIT 1 FOR UPDATE`,
      [SUMMARY_MAX_ATTEMPTS]
    );
    if (!rows[0]) { await connection.commit(); return null; }
    await connection.query(
      `UPDATE ai_memory_jobs SET status = 'processing', attempts = attempts + 1, locked_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [rows[0].id]
    );
    await connection.commit();
    return rows[0];
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') return null;
    throw error;
  } finally {
    connection?.release();
  }
}

async function processOneSummaryJob() {
  const job = await claimSummaryJob();
  if (!job) return false;
  try {
    await refreshSessionSummary({ userId: job.user_id, sessionId: job.session_id });
    await pool.query('UPDATE ai_memory_jobs SET status = \'succeeded\', last_error = NULL, locked_at = NULL WHERE id = ?', [job.id]);
  } catch (error) {
    const failure = getSummaryFailureState(job.attempts);
    await pool.query(
      `UPDATE ai_memory_jobs SET status = ?, last_error = ?, available_at = ?, locked_at = NULL WHERE id = ?`,
      [failure.status, String(error.message || 'summary failed').slice(0, 500), failure.availableAt, job.id]
    );
  }
  return true;
}

function startSummaryWorker() {
  if (process.env.AI_SUMMARY_WORKER === 'false') return null;
  const intervalMs = Math.max(Number(process.env.AI_SUMMARY_WORKER_INTERVAL_MS) || 30_000, 10_000);
  const timer = setInterval(() => { processOneSummaryJob().catch((error) => console.warn('AI 摘要任务处理失败:', error.message)); }, intervalMs);
  timer.unref?.();
  return timer;
}

module.exports = {
  SUMMARY_TRIGGER_MESSAGES,
  SUMMARY_TRIGGER_TOKENS,
  estimateUnsummarizedTokens,
  needsSummary,
  SUMMARY_MAX_ATTEMPTS,
  SUMMARY_STALE_LOCK_MS,
  getSummaryFailureState,
  parseSummary,
  fallbackSummary,
  shouldRefreshSummary,
  enqueueSummaryJob,
  refreshSessionSummary,
  scheduleSummaryRefresh,
  processOneSummaryJob,
  startSummaryWorker,
};
