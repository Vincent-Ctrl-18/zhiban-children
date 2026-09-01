const { pool } = require('../config/database');

async function upsertGenerationRequest({ requestId, userId, sessionId, userMessageId, assistantMessageId = null, agentType, status, errorCode = null, latencyMs = null, connection = pool } = {}) {
  if (!requestId || !agentType || !status || (!userMessageId && agentType !== 'report')) return false;
  try {
    await connection.query(
      `INSERT INTO ai_generation_requests
        (request_id, user_id, session_id, user_message_id, assistant_message_id, agent_type, status, error_code, latency_ms, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? IN ('succeeded', 'failed', 'stopped'), CURRENT_TIMESTAMP, NULL))
       ON DUPLICATE KEY UPDATE assistant_message_id = COALESCE(VALUES(assistant_message_id), assistant_message_id),
         status = VALUES(status), error_code = VALUES(error_code), latency_ms = VALUES(latency_ms),
         completed_at = IF(VALUES(status) IN ('succeeded', 'failed', 'stopped'), CURRENT_TIMESTAMP, completed_at)`,
      [requestId, userId, sessionId, userMessageId, assistantMessageId, agentType, status, errorCode, latencyMs, status]
    );
    return true;
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') return false;
    throw error;
  }
}

module.exports = { upsertGenerationRequest };
