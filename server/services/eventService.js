const crypto = require('crypto');
const { pool } = require('../config/database');

const EVENT_DEFINITIONS = Object.freeze({
  auth_registered: { feature: 'account', result: 'success' },
  auth_login_succeeded: { feature: 'account', result: 'success' },
  course_started: { feature: 'course', result: 'success' },
  course_completed: { feature: 'course', result: 'completed' },
  homework_request_started: { feature: 'homework', result: 'started' },
  homework_request_succeeded: { feature: 'homework', result: 'success' },
  homework_request_failed: { feature: 'homework', result: 'failure' },
  homework_session_completed: { feature: 'homework', result: 'completed' },
  homework_session_started: { feature: 'homework', result: 'started' },
  homework_session_abandoned: { feature: 'homework', result: 'abandoned' },
  companion_session_started: { feature: 'companion', result: 'success' },
  companion_session_completed: { feature: 'companion', result: 'completed' },
  learning_report_generated: { feature: 'learning_report', result: 'success' },
  child_created: { feature: 'children', result: 'success' },
  checkin_completed: { feature: 'checkin', result: 'success' },
  checkout_completed: { feature: 'checkin', result: 'success' },
  safety_check_completed: { feature: 'safety', result: 'success' },
  activity_created: { feature: 'activity', result: 'success' },
  notification_published: { feature: 'notification', result: 'success' },
  course_uploaded: { feature: 'course', result: 'success' },
  ebook_uploaded: { feature: 'ebook', result: 'success' },
  ebook_downloaded: { feature: 'ebook', result: 'success' },
  ebook_published: { feature: 'ebook', result: 'success' },
  ebook_reviewed: { feature: 'ebook', result: 'success' },
  resource_registered: { feature: 'resource', result: 'success' },
  resource_approved: { feature: 'resource', result: 'success' },
  homework_generation_stopped: { feature: 'homework', result: 'abandoned' },
  companion_risk_detected: { feature: 'companion', result: 'failure' },
});

function normalizeEventName(eventName) {
  const name = String(eventName || '').trim();
  if (!EVENT_DEFINITIONS[name]) {
    const error = new Error(`Unsupported product event: ${name}`);
    error.code = 'INVALID_EVENT_NAME';
    error.status = 400;
    throw error;
  }
  return name;
}

async function recordEvent({
  eventName,
  featureCode,
  userId = null,
  userRole = null,
  institutionId = null,
  sessionId = null,
  objectId = null,
  requestId = null,
  result,
  errorCode = null,
  latencyMs = null,
  metadata = null,
  clientVersion = null,
  environment = process.env.NODE_ENV === 'production' ? 'production' : 'test',
  connection = pool,
} = {}) {
  const name = normalizeEventName(eventName);
  const definition = EVENT_DEFINITIONS[name];
  const finalFeature = featureCode || definition.feature;
  const finalResult = result || definition.result;
  const values = [
    crypto.randomUUID(), name, finalFeature, userId, userRole, institutionId,
    sessionId, objectId == null ? null : String(objectId), requestId,
    finalResult, errorCode, latencyMs, metadata ? JSON.stringify(metadata) : null,
    clientVersion || process.env.APP_VERSION || null, environment,
  ];
  const [resultInfo] = await connection.query(
    `INSERT INTO product_events
      (event_id, event_name, feature_code, user_id, user_role, institution_id,
       session_id, object_id, request_id, result, error_code, latency_ms, metadata,
       client_version, environment, event_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE event_id = event_id`,
    values
  );
  return { eventId: values[0], inserted: resultInfo.affectedRows !== 0 };
}

function eventDefinitions() {
  return EVENT_DEFINITIONS;
}

async function recordModelCall({ requestId = null, sessionId = null, userId = null, agentType, provider = 'doubao', model = null, status, latencyMs = null, inputTokens = null, outputTokens = null, errorCode = null, connection = pool } = {}) {
  if (process.env.NODE_ENV !== 'production') return false;
  try {
    await connection.query(
      `INSERT INTO ai_model_calls (request_id, session_id, user_id, agent_type, provider, model, status, latency_ms, input_tokens, output_tokens, error_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [requestId, sessionId, userId, agentType, provider, model, status, latencyMs, inputTokens, outputTokens, errorCode]
    );
    return true;
  } catch (error) {
    console.warn('记录 AI 模型调用失败:', error.message);
    return false;
  }
}

module.exports = { EVENT_DEFINITIONS, eventDefinitions, normalizeEventName, recordEvent, recordModelCall };
