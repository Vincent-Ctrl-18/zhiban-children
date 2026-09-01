const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const supertest = require('supertest');

process.env.JWT_SECRET = 'homework-test-secret';

const app = require('../app');
const { pool } = require('../config/database');
const aiProvider = require('../services/aiProvider');
const {
  HomeworkServiceError,
  makeRequestId,
  normalizeQuestion,
  parseSessionId,
  createSessionAndProcess,
  addMessageAndProcess,
  retryMessage,
  completeSession,
  streamSessionAndProcess,
} = require('../services/homeworkService');

const tokenFor = (role, id = 1) => jwt.sign({ id, role, username: `${role}-test` }, process.env.JWT_SECRET);

test('app can be imported without listening on a port', () => {
  assert.equal(typeof app, 'function');
  assert.equal(typeof app.startServer, 'function');
});

test('non-student cannot access homework sessions', async () => {
  const response = await supertest(app)
    .get('/api/ai/homework/sessions/recent')
    .set('Authorization', `Bearer ${tokenFor('parent')}`);
  assert.equal(response.status, 403);
});

test('student must provide a question or image', async () => {
  const response = await supertest(app)
    .post('/api/ai/homework/sessions')
    .set('Authorization', `Bearer ${tokenFor('student')}`)
    .field('requestId', 'empty-request-1');
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'EMPTY_QUESTION');
});

test('invalid image type is rejected before AI processing', async () => {
  const response = await supertest(app)
    .post('/api/ai/homework/sessions')
    .set('Authorization', `Bearer ${tokenFor('student')}`)
    .field('requestId', 'invalid-image-1')
    .attach('image', Buffer.from('not an image'), 'notes.txt');
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'INVALID_IMAGE_TYPE');
});

test('request and input validation keeps the API deterministic', () => {
  assert.equal(makeRequestId('request-123'), 'request-123');
  assert.throws(() => makeRequestId('short'), (error) => error.code === 'INVALID_REQUEST_ID');
  assert.equal(normalizeQuestion('  题目  '), '题目');
  assert.equal(normalizeQuestion('', { mimetype: 'image/jpeg' }), '请帮我分析这道题，给出解题思路。');
  assert.throws(() => normalizeQuestion(''), (error) => error instanceof HomeworkServiceError && error.code === 'EMPTY_QUESTION');
  assert.throws(() => parseSessionId('abc'), (error) => error.code === 'SESSION_NOT_FOUND');
  assert.equal(parseSessionId('12'), '12');
});

test('first-turn streaming validates input before creating a session', async () => {
  await assert.rejects(
    streamSessionAndProcess({ userId: 1, question: '', requestId: 'stream-empty-1' }),
    (error) => error instanceof HomeworkServiceError && error.code === 'EMPTY_QUESTION'
  );
});

test('admin homework statistics requires admin authentication', async () => {
  const response = await supertest(app).get('/api/admin/statistics/homework?range=7d');
  assert.equal(response.status, 401);
});

function createFakePool() {
  const state = {
    sessions: [],
    messages: [],
    events: [],
    nextSessionId: 1,
    nextMessageId: 1,
  };
  const now = () => new Date().toISOString();
  const findSession = (id, userId) => state.sessions.find((item) => String(item.id) === String(id) && item.user_id === Number(userId));
  const query = async (sql, params = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('SELECT * FROM product_events')) {
      const [userId, requestId] = params;
      const eventName = normalized.match(/event_name = '([^']+)'/)?.[1];
      return [state.events.filter((item) => item.user_id === Number(userId) && item.request_id === requestId && (!eventName || item.event_name === eventName)).slice(0, 1)];
    }
    if (normalized.startsWith('SELECT * FROM ai_sessions WHERE id =')) {
      return [[findSession(params[0], params[1])].filter(Boolean)];
    }
    if (normalized.startsWith('SELECT * FROM ai_sessions WHERE user_id =')) {
      const rows = state.sessions
        .filter((item) => item.user_id === Number(params[0]) && item.agent_type === 'homework' && item.status === 'active')
        .sort((a, b) => new Date(b.last_active_at) - new Date(a.last_active_at) || b.id - a.id)
        .slice(0, 1);
      return [rows];
    }
    if (normalized.startsWith('SELECT * FROM ai_messages WHERE id = ? AND user_id =')) {
      const rows = state.messages.filter((item) => String(item.id) === String(params[0]) && item.user_id === Number(params[1]) && item.role === 'user').slice(0, 1);
      return [rows];
    }
    if (normalized.startsWith('SELECT * FROM ai_messages WHERE id = ?')) {
      return [state.messages.filter((item) => String(item.id) === String(params[0])).slice(0, 1)];
    }
    if (normalized.startsWith('SELECT m.* FROM ai_messages m')) {
      const rows = state.messages.filter((item) => String(item.id) === String(params[1]) && item.session_id === Number(params[2]) && item.user_id === Number(params[0]));
      return [rows];
    }
    if (normalized.startsWith('SELECT * FROM ai_messages WHERE session_id =')) {
      return [state.messages.filter((item) => String(item.session_id) === String(params[0])).sort((a, b) => a.sequence_no - b.sequence_no)];
    }
    if (normalized.startsWith('SELECT role, content, image_path FROM ai_messages')) {
      return [state.messages.filter((item) => String(item.session_id) === String(params[0])).sort((a, b) => b.sequence_no - a.sequence_no).slice(0, 12)];
    }
    if (normalized.startsWith('SELECT COUNT(*) AS count FROM ai_messages')) {
      const role = normalized.includes("role = 'assistant'") ? 'assistant' : 'user';
      return [[{ count: state.messages.filter((item) => String(item.session_id) === String(params[0]) && item.role === role).length }]];
    }
    if (normalized.startsWith('SELECT COALESCE(MAX(sequence_no)')) {
      const max = state.messages.filter((item) => String(item.session_id) === String(params[0])).reduce((value, item) => Math.max(value, item.sequence_no), 0);
      return [[{ max_sequence: max }]];
    }
    if (normalized.startsWith('SELECT * FROM ai_messages WHERE reply_to_message_id')) {
      return [state.messages.filter((item) => String(item.reply_to_message_id) === String(params[0]) && item.role === 'assistant').sort((a, b) => b.id - a.id).slice(0, 1)];
    }
    if (normalized.startsWith('INSERT INTO ai_sessions')) {
      const item = { id: state.nextSessionId++, user_id: Number(params[0]), agent_type: 'homework', status: 'active', started_at: now(), last_active_at: now(), completed_at: null };
      state.sessions.push(item);
      return [{ insertId: item.id }];
    }
    if (normalized.startsWith('INSERT INTO ai_messages')) {
      const isAssistant = normalized.includes("role, content, reply_to_message_id");
      const item = isAssistant
        ? { id: state.nextMessageId++, session_id: Number(params[0]), user_id: Number(params[1]), role: 'assistant', content: params[2], image_path: null, reply_to_message_id: Number(params[3]), request_id: null, sequence_no: Number(params[4]), created_at: now() }
        : { id: state.nextMessageId++, session_id: Number(params[0]), user_id: Number(params[1]), role: 'user', content: params[2], image_path: params[3], reply_to_message_id: null, request_id: params[4], sequence_no: Number(params[5]), created_at: now() };
      state.messages.push(item);
      return [{ insertId: item.id }];
    }
    if (normalized.startsWith('INSERT INTO product_events')) {
      const [eventId, eventName, userId, userRole, sessionId, objectId, requestId, result, errorCode, latencyMs, metadata] = params;
      state.events.push({ id: state.events.length + 1, event_id: eventId, event_name: eventName, feature_code: 'homework', user_id: Number(userId), user_role: userRole, session_id: sessionId == null ? null : Number(sessionId), object_id: objectId == null ? null : String(objectId), request_id: requestId, result, error_code: errorCode, latency_ms: latencyMs, metadata, occurred_at: now() });
      return [{ insertId: state.events.length }];
    }
    if (normalized.startsWith('UPDATE ai_sessions SET status = \'completed\'')) {
      const item = findSession(params[1], params[0]);
      if (item) { item.status = 'completed'; item.completed_at = now(); item.last_active_at = now(); }
      return [{ affectedRows: item ? 1 : 0 }];
    }
    if (normalized.startsWith('UPDATE ai_sessions SET status = \'abandoned\'')) {
      const item = findSession(params[1], params[0]);
      if (item) { item.status = 'abandoned'; item.last_active_at = now(); }
      return [{ affectedRows: item ? 1 : 0 }];
    }
    if (normalized.startsWith('UPDATE ai_sessions SET last_active_at')) {
      const item = state.sessions.find((candidate) => String(candidate.id) === String(params[0]) && candidate.user_id === Number(params[1]));
      if (item) item.last_active_at = now();
      return [{ affectedRows: item ? 1 : 0 }];
    }
    throw new Error(`Unhandled fake SQL: ${normalized}`);
  };
  const connection = {
    query,
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };
  return { state, query, getConnection: async () => connection };
}

test('homework service persists context, idempotency, retry, and completion', async () => {
  const fake = createFakePool();
  const originalQuery = pool.query;
  const originalGetConnection = pool.getConnection;
  const originalProvider = aiProvider.callDoubaoAPI;
  const calls = [];
  pool.query = fake.query;
  pool.getConnection = fake.getConnection;
  aiProvider.callDoubaoAPI = async (messages) => {
    calls.push(messages);
    return `测试回复 ${calls.length}`;
  };

  try {
    const first = await createSessionAndProcess({ userId: 1, question: '第一道题', requestId: 'request-100' });
    assert.equal(first.session.status, 'active');
    assert.equal(first.assistantMessage.content, '测试回复 1');

    const second = await addMessageAndProcess({ userId: 1, sessionId: first.session.id, question: '我还是不懂', requestId: 'request-101' });
    assert.equal(second.assistantMessage.content, '测试回复 2');
    assert.equal(calls[1].length, 4);

    const duplicate = await addMessageAndProcess({ userId: 1, sessionId: first.session.id, question: '我还是不懂', requestId: 'request-101' });
    assert.equal(duplicate.request.duplicate, true);
    assert.equal(calls.length, 2);

    aiProvider.callDoubaoAPI = async () => {
      const error = new Error('模拟上游失败');
      error.code = 'AI_TEST_FAILURE';
      error.status = 502;
      throw error;
    };
    await assert.rejects(
      addMessageAndProcess({ userId: 1, sessionId: first.session.id, question: '第三道题', requestId: 'request-102' }),
      (error) => error.code === 'AI_TEST_FAILURE' && Boolean(error.details.userMessageId),
    );
    aiProvider.callDoubaoAPI = async () => '重试成功';
    const retried = await retryMessage({ userId: 1, sessionId: first.session.id, messageId: 5, requestId: 'request-103' });
    assert.equal(retried.assistantMessage.content, '重试成功');

    const completed = await completeSession(1, first.session.id);
    assert.equal(completed.session.status, 'completed');
    const completedAgain = await completeSession(1, first.session.id);
    assert.equal(completedAgain.alreadyCompleted, true);
    assert.equal(fake.state.events.filter((event) => event.event_name === 'homework_session_completed').length, 1);
    assert.equal(fake.state.events.filter((event) => event.event_name === 'homework_request_started').length, 4);
    assert.equal(fake.state.events.filter((event) => event.event_name === 'homework_request_succeeded').length, 3);
    assert.equal(fake.state.events.filter((event) => event.event_name === 'homework_request_failed').length, 1);
  } finally {
    pool.query = originalQuery;
    pool.getConnection = originalGetConnection;
    aiProvider.callDoubaoAPI = originalProvider;
  }
});
