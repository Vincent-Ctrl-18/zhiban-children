const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyRisk } = require('../services/companionService');
const { parseReport } = require('../services/learningReportService');
const { EVENT_DEFINITIONS, normalizeEventName } = require('../services/eventService');
const { rangeStart } = require('../services/metricsService');
const jwt = require('jsonwebtoken');
const supertest = require('supertest');
const app = require('../app');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase2-test-secret';

test('companion risk classifier routes urgent content to safety flow', () => {
  assert.equal(classifyRisk('我不想活了，想跳楼').severity, 'critical');
  assert.equal(classifyRisk('同学一直欺负我').category, 'bullying');
  assert.equal(classifyRisk('今天有点难过').severity, 'low');
});

test('report parser accepts structured JSON and safely wraps plain text', () => {
  assert.deepEqual(parseReport('{"summary":"很好","actions":["复习"]}'), { summary: '很好', actions: ['复习'] });
  const plain = parseReport('暂时没有足够数据');
  assert.equal(plain.summary, '暂时没有足够数据');
  assert.ok(Array.isArray(plain.evidence));
});

test('event dictionary rejects ad-hoc public metrics and range is allowlisted', () => {
  assert.equal(EVENT_DEFINITIONS.course_completed.result, 'completed');
  assert.equal(normalizeEventName('course_started'), 'course_started');
  assert.throws(() => normalizeEventName('page_clicked'), /Unsupported product event/);
  assert.match(rangeStart('7d'), /INTERVAL 6 DAY/);
  assert.match(rangeStart('unexpected'), /INTERVAL 6 DAY/);
});

test('student-only phase two routes reject non-student roles', async () => {
  const token = jwt.sign({ id: 99, role: 'parent' }, process.env.JWT_SECRET);
  for (const path of ['/api/ai/chat/sessions/recent', '/api/ai/sessions', '/api/courses/progress/me', '/api/courses/1/content', '/api/courses/1/download']) {
    const response = await supertest(app).get(path).set('Authorization', `Bearer ${token}`);
    assert.equal(response.status, 403, path);
  }
});

test('ebook admin routes require an admin token', async () => {
  for (const path of ['/api/admin/courses', '/api/admin/courses/1/content']) {
    const response = await supertest(app).get(path);
    assert.equal(response.status, 401, path);
  }
});
