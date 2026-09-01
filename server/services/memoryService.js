const crypto = require('crypto');
const { pool } = require('../config/database');

const MEMORY_TYPES = new Set([
  'grade',
  'learning_goal',
  'response_preference',
  'subject_interest',
  'knowledge_gap',
  'mastered_topic',
]);
const SOURCE_AGENTS = new Set(['homework', 'report']);
const MAX_MEMORY_LENGTH = 500;

// 记忆只允许学习事实；这些模式用于阻止敏感信息、心理判断和 Prompt 注入进入长期记忆。
const FORBIDDEN_MEMORY_PATTERNS = [
  /(?:1[3-9]\d{9}|电话|手机|身份证|身份证号|住址|地址|门牌)/i,
  /(?:自杀|自残|不想活|家暴|虐待|性侵|霸凌|心理疾病|抑郁|焦虑症|人格|智商)/i,
  /(?:ignore\s+(?:all|previous)|system\s+prompt|系统提示词|忽略之前|不要遵守)/i,
];

function normalizeMemoryContent(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MEMORY_LENGTH);
}

function normalizeSemanticContent(value) {
  return normalizeMemoryContent(value)
    .toLowerCase()
    .replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()【】\[\]《》<>·—_-]+/g, '')
    .slice(0, 160);
}

function normalizeMemoryKey(type, content, subject = null) {
  return `${type}:${normalizeSemanticContent(subject)}:${normalizeSemanticContent(content)}`
    .slice(0, 180);
}

function memoryKeyHash(type, content, subject = null) {
  const semanticKey = `${type}:${normalizeSemanticContent(subject)}:${normalizeSemanticContent(content)}`;
  return crypto.createHash('sha256').update(semanticKey).digest('hex');
}

function isSafeMemoryContent(content) {
  const normalized = normalizeMemoryContent(content);
  return normalized.length >= 2 && !FORBIDDEN_MEMORY_PATTERNS.some((pattern) => pattern.test(normalized));
}

function getNextEvidenceState(type, existing = {}, candidate = {}) {
  const isDistinctEvidence = String(existing.source_session_id || '') !== String(candidate.sourceSessionId || '')
    || String(existing.source_message_id || '') !== String(candidate.sourceMessageId || '');
  const evidenceCount = Number(existing.evidence_count || 1) + (isDistinctEvidence ? 1 : 0);
  return {
    evidenceCount,
    status: type === 'knowledge_gap' && evidenceCount < 2 ? 'disabled' : 'active',
  };
}

function serializeMemory(row) {
  return {
    id: String(row.id),
    type: row.memory_type,
    content: row.content,
    subject: row.subject || null,
    sourceAgentType: row.source_agent_type,
    sourceSessionId: row.source_session_id ? String(row.source_session_id) : null,
    confidence: Number(row.confidence || 0),
    evidenceCount: Number(row.evidence_count || 1),
    userEdited: Boolean(row.user_edited),
    firstSeenAt: row.first_seen_at,
    lastConfirmedAt: row.last_confirmed_at,
    updatedAt: row.updated_at,
  };
}

async function getMemoryEnabled(userId, executor = pool) {
  try {
    const [rows] = await executor.query('SELECT enabled FROM ai_memory_settings WHERE user_id = ? LIMIT 1', [userId]);
    return rows[0] ? Boolean(rows[0].enabled) : true;
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE' || !error.code) return true;
    throw error;
  }
}

async function setMemoryEnabled(userId, enabled) {
  await pool.query(
    `INSERT INTO ai_memory_settings (user_id, enabled) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)`,
    [userId, enabled ? 1 : 0]
  );
  return { enabled: Boolean(enabled) };
}

async function listMemories(userId, { type, subject, includeDisabled = false } = {}) {
  const filters = ['user_id = ?'];
  const params = [userId];
  if (MEMORY_TYPES.has(type)) { filters.push('memory_type = ?'); params.push(type); }
  if (typeof subject === 'string' && subject.trim()) { filters.push('subject = ?'); params.push(subject.trim().slice(0, 40)); }
  if (!includeDisabled) filters.push("status = 'active'");
  const [rows] = await pool.query(
    `SELECT * FROM ai_user_memories WHERE ${filters.join(' AND ')} ORDER BY last_confirmed_at DESC, id DESC LIMIT 100`,
    params
  );
  return { enabled: await getMemoryEnabled(userId), items: rows.map(serializeMemory) };
}

async function getMemory(userId, memoryId, executor = pool) {
  const [rows] = await executor.query('SELECT * FROM ai_user_memories WHERE id = ? AND user_id = ? LIMIT 1', [memoryId, userId]);
  return rows[0] || null;
}

async function updateMemory(userId, memoryId, { content, subject } = {}) {
  const row = await getMemory(userId, memoryId);
  if (!row) { const error = new Error('记忆不存在'); error.status = 404; error.code = 'MEMORY_NOT_FOUND'; throw error; }
  const nextContent = normalizeMemoryContent(content == null ? row.content : content);
  const nextSubject = subject == null ? row.subject : String(subject).trim().slice(0, 40) || null;
  if (!isSafeMemoryContent(nextContent)) { const error = new Error('记忆内容不符合学习事实范围'); error.status = 400; error.code = 'INVALID_MEMORY_CONTENT'; throw error; }
  const nextKey = normalizeMemoryKey(row.memory_type, nextContent, nextSubject);
  const existing = await pool.query(
    'SELECT id FROM ai_user_memories WHERE user_id = ? AND memory_type = ? AND normalized_key = ? AND id <> ? LIMIT 1',
    [userId, row.memory_type, nextKey, memoryId]
  );
  if (existing[0][0]) { const error = new Error('相同类型的记忆已经存在'); error.status = 409; error.code = 'MEMORY_DUPLICATE'; throw error; }
  await pool.query(
    `UPDATE ai_user_memories SET content = ?, subject = ?, normalized_key = ?, confidence = 1.000,
       user_edited = 1, last_confirmed_at = CURRENT_TIMESTAMP, status = 'active'
     WHERE id = ? AND user_id = ?`,
    [nextContent, nextSubject, nextKey, memoryId, userId]
  );
  return serializeMemory(await getMemory(userId, memoryId));
}

async function forgetMemory(userId, memoryId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const row = await getMemory(userId, memoryId, connection);
    if (!row) { const error = new Error('记忆不存在'); error.status = 404; error.code = 'MEMORY_NOT_FOUND'; throw error; }
    await connection.query(
      `INSERT INTO ai_memory_suppressions (user_id, memory_key_hash) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE memory_key_hash = VALUES(memory_key_hash)`,
      [userId, memoryKeyHash(row.memory_type, row.content, row.subject)]
    );
    // 只删除 AI 派生的记忆正文，原始会话消息保持不变。
    await connection.query('DELETE FROM ai_user_memories WHERE id = ? AND user_id = ?', [memoryId, userId]);
    await connection.commit();
    return { id: String(memoryId), forgotten: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

async function retrieveMemories(userId, { subject = null, text = '', limit = 8 } = {}) {
  if (process.env.AI_MEMORY_READ_ENABLED === 'false') return [];
  if (!(await getMemoryEnabled(userId))) return [];
  let rows;
  try {
    [rows] = await pool.query(
      `SELECT * FROM ai_user_memories
       WHERE user_id = ? AND status = 'active'
       ORDER BY last_confirmed_at DESC, confidence DESC LIMIT 100`,
      [userId]
    );
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE' || !error.code) return [];
    throw error;
  }
  const query = `${String(subject || '')} ${String(text || '')}`.toLowerCase();
  const ranked = rows.map((row) => {
    const exactSubject = subject && row.subject && row.subject.toLowerCase() === String(subject).toLowerCase();
    const textHit = query && `${row.content} ${row.subject || ''}`.toLowerCase().split(/\s+/).some((part) => part.length >= 2 && query.includes(part));
    const global = row.memory_type === 'learning_goal' || row.memory_type === 'response_preference';
    const ageDays = Math.max(0, (Date.now() - new Date(row.last_confirmed_at).getTime()) / 86400000);
    const freshness = row.memory_type === 'knowledge_gap' || row.memory_type === 'mastered_topic' ? Math.max(0, 1 - ageDays / 90) : Math.max(0, 1 - ageDays / 365);
    return { row, score: (exactSubject ? 6 : 0) + (textHit ? 3 : 0) + (global ? 2 : 0) + Number(row.confidence || 0) + freshness };
  }).sort((a, b) => b.score - a.score);
  return ranked.slice(0, Math.min(Math.max(Number(limit) || 8, 1), 8)).map(({ row }) => serializeMemory(row));
}

function normalizeCandidate(candidate) {
  const type = String(candidate?.type || '').trim();
  const sourceAgentType = String(candidate?.sourceAgentType || '').trim();
  const content = normalizeMemoryContent(candidate?.content);
  if (!MEMORY_TYPES.has(type) || !SOURCE_AGENTS.has(sourceAgentType) || !isSafeMemoryContent(content)) return null;
  const confidence = Math.min(Math.max(Number(candidate?.confidence) || 0, 0), 1);
  if (confidence < 0.8) return null;
  return {
    type,
    sourceAgentType,
    content,
    subject: String(candidate?.subject || '').trim().slice(0, 40) || null,
    confidence,
    sourceSessionId: candidate?.sourceSessionId || null,
    sourceMessageId: candidate?.sourceMessageId || null,
  };
}

async function persistMemoryCandidates({ userId, candidates = [] } = {}) {
  if (process.env.AI_MEMORY_WRITE_ENABLED === 'false' || !(await getMemoryEnabled(userId))) return { inserted: 0, updated: 0 };
  const normalizedCandidates = candidates.map(normalizeCandidate).filter(Boolean).slice(0, 12);
  if (!normalizedCandidates.length) return { inserted: 0, updated: 0 };
  const connection = await pool.getConnection();
  let inserted = 0; let updated = 0;
  try {
    await connection.beginTransaction();
    for (const candidate of normalizedCandidates) {
      const key = normalizeMemoryKey(candidate.type, candidate.content, candidate.subject);
      const hash = memoryKeyHash(candidate.type, candidate.content, candidate.subject);
      const [suppressed] = await connection.query('SELECT id FROM ai_memory_suppressions WHERE user_id = ? AND memory_key_hash = ? LIMIT 1', [userId, hash]);
      if (suppressed[0]) continue;
      const [existingRows] = await connection.query(
        'SELECT * FROM ai_user_memories WHERE user_id = ? AND memory_type = ? AND normalized_key = ? LIMIT 1',
        [userId, candidate.type, key]
      );
      if (existingRows[0]) {
        const existing = existingRows[0];
        if (existing.user_edited) continue;
        const evidenceState = getNextEvidenceState(candidate.type, existing, candidate);
        await connection.query(
          `UPDATE ai_user_memories SET confidence = GREATEST(confidence, ?), last_confirmed_at = CURRENT_TIMESTAMP,
             source_session_id = COALESCE(?, source_session_id), source_message_id = COALESCE(?, source_message_id),
             evidence_count = ?, status = ?
           WHERE id = ?`,
          [candidate.confidence, candidate.sourceSessionId, candidate.sourceMessageId, evidenceState.evidenceCount, evidenceState.status, existing.id]
        );
        updated += 1;
      } else {
        if (candidate.type === 'grade') {
          const [protectedRows] = await connection.query(
            `SELECT id FROM ai_user_memories
             WHERE user_id = ? AND memory_type = 'grade' AND status = 'active' AND user_edited = 1 LIMIT 1`,
            [userId]
          );
          if (protectedRows[0]) continue;
          await connection.query(
            `UPDATE ai_user_memories SET status = 'disabled'
             WHERE user_id = ? AND memory_type = 'grade' AND user_edited = 0`,
            [userId]
          );
        }
        const initialStatus = candidate.type === 'knowledge_gap' ? 'disabled' : 'active';
        await connection.query(
          `INSERT INTO ai_user_memories
            (user_id, memory_type, content, normalized_key, subject, source_agent_type, source_session_id, source_message_id, confidence, evidence_count, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [userId, candidate.type, candidate.content, key, candidate.subject, candidate.sourceAgentType, candidate.sourceSessionId, candidate.sourceMessageId, candidate.confidence, initialStatus]
        );
        inserted += 1;
      }
    }
    await connection.commit();
    return { inserted, updated };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_NO_SUCH_TABLE') return { inserted: 0, updated: 0 };
    throw error;
  } finally { connection.release(); }
}

module.exports = {
  MEMORY_TYPES,
  normalizeMemoryContent,
  normalizeMemoryKey,
  normalizeSemanticContent,
  memoryKeyHash,
  isSafeMemoryContent,
  getNextEvidenceState,
  getMemoryEnabled,
  setMemoryEnabled,
  listMemories,
  updateMemory,
  forgetMemory,
  retrieveMemories,
  persistMemoryCandidates,
};
