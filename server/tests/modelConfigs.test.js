const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const configs = require('../config/modelConfigs');
const provider = require('../services/aiProvider');

test('model configurations persist encrypted credentials and switch actual requests', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhiban-model-test-'));
  process.env.AI_CONFIG_DIR = directory;
  delete process.env.ARK_API_KEY;
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body);
    requests.push({ url: req.url, key: req.headers.authorization, ...data });
    if (data.model === 'unauthorized') { res.writeHead(401); res.end('secret upstream diagnostic'); return; }
    if (data.model === 'slow') return;
    if (data.model === 'redirect') { res.writeHead(302, { Location: '/elsewhere' }); res.end(); return; }
    if (data.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: '你好' } }] }) + '\r\n\r\n');
      if (data.model === 'broken') { res.end(); return; }
      res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: '世界' }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 3 } }));
    } else res.end(JSON.stringify({ model: data.model, choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 1 } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); delete process.env.AI_CONFIG_DIR; fs.rmSync(directory, { recursive: true, force: true }); });
  const url = 'http://127.0.0.1:' + server.address().port + '/v1';
  const first = configs.save({ name: 'First', model: 'first', url, apiKey: 'test-secret-first' }).configs[0];
  assert.equal(configs.list().activeId, null);
  assert.equal(JSON.stringify(configs.list()).includes('test-secret'), false);
  assert.equal(fs.readFileSync(path.join(directory, 'models.json'), 'utf8').includes('test-secret'), false);
  configs.activate(first.id);
  assert.equal((await provider.callModelAPI([], 10, 0, { returnMeta: true })).inputTokens, 0);
  assert.equal(requests[0].url, '/v1/chat/completions');
  assert.equal(requests[0].key, 'Bearer test-secret-first');
  configs.save({ ...first, apiKey: '', model: 'updated' }, first.id);
  assert.equal((await provider.callModelAPI([], 10, 0, { returnMeta: true })).model, 'updated');
  assert.throws(() => configs.save({ ...first, url: url + '/other', apiKey: '' }, first.id), /重新填写/);
  const second = configs.save({ name: 'Second', model: 'second', url, apiKey: 'test-secret-second' }).configs[1];
  configs.activate(second.id);
  configs.assign({ homework: first.id });
  assert.equal((await provider.callModelAPI([], 10, 0, { agentType: 'homework', returnMeta: true })).model, 'updated');
  assert.throws(() => configs.remove(first.id), /先切换/);
  configs.assign({ homework: null });
  assert.equal((await provider.callModelAPI([], 10, 0, { returnMeta: true })).model, 'second');
  assert.equal(requests.at(-1).key, 'Bearer test-secret-second');
  await provider.callModelAPI([], 10, 0, { configId: first.id });
  assert.equal(configs.list().activeId, second.id);
  assert.throws(() => configs.remove(second.id), /先切换/);
  configs.remove(first.id);
  assert.throws(() => configs.get(first.id), /不存在/);
  const stream = await provider.streamModelAPI([]);
  assert.equal(stream.reply, '你好世界');
  assert.equal(stream.outputTokens, 3);
  const imageMessage = [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }] }];
  await assert.rejects(provider.callModelAPI(imageMessage), e => e.code === 'AI_VISION_UNSUPPORTED');
  configs.save({ ...second, supportsVision: true, sendTemperature: false, useCompletionTokens: true }, second.id);
  await provider.callModelAPI(imageMessage, 128);
  assert.equal(requests.at(-1).max_completion_tokens, 128);
  assert.equal(requests.at(-1).temperature, undefined);
  for (const [model, code] of [['broken', 'AI_STREAM_INTERRUPTED'], ['unauthorized', 'AI_UPSTREAM_401'], ['redirect', 'AI_NETWORK_ERROR']]) {
    configs.save({ ...second, model }, second.id);
    await assert.rejects(provider.streamModelAPI([]), e => e.code === code);
  }
  configs.save({ ...second, model: 'slow' }, second.id);
  await assert.rejects(provider.callModelAPI([], 10, 0, { timeoutMs: 30 }), e => e.code === 'AI_TIMEOUT');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(provider.callModelAPI([], 10, 0, { signal: controller.signal }), e => e.code === 'AI_CANCELLED');
  assert.throws(() => configs.save({ name: 'bad', model: 'm', url: 'file:///tmp/a', apiKey: 'abc' }), /HTTP/);
  const express = require('express');
  const supertest = require('supertest');
  const jwt = require('jsonwebtoken');
  const { pool } = require('../config/database');
  pool.query = async () => [[], []];
  process.env.JWT_SECRET = 'model-config-test-secret';
  const app = express(); app.use(express.json()); app.use('/admin', require('../routes/admin'));
  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET);
  const student = jwt.sign({ role: 'student' }, process.env.JWT_SECRET);
  for (const [method, endpoint] of [['get', '/model-configs'], ['post', '/model-configs'], ['put', '/model-configs/x'], ['delete', '/model-configs/x'], ['post', '/model-configs/x/test'], ['post', '/model-configs/x/activate'], ['patch', '/model-configs/assignments']]) {
    assert.equal((await supertest(app)[method]('/admin' + endpoint)).status, 401);
    assert.equal((await supertest(app)[method]('/admin' + endpoint).set('Authorization', 'Bearer ' + student)).status, 403);
  }
  const created = await supertest(app).post('/admin/model-configs').set('Authorization', 'Bearer ' + token).send({ name: 'API config', model: 'api-model', url, apiKey: 'secret-api' });
  assert.equal(created.status, 201);
  assert.equal(JSON.stringify(created.body).includes('secret-api'), false);
  const added = created.body.configs.at(-1);
  const tested = await supertest(app).post('/admin/model-configs/' + added.id + '/test').set('Authorization', 'Bearer ' + token).send({ stream: true });
  assert.equal(tested.status, 200);
  assert.equal(configs.list().activeId, second.id);
  const activated = await supertest(app).post('/admin/model-configs/' + added.id + '/activate').set('Authorization', 'Bearer ' + token);
  assert.equal(activated.body.activeId, added.id);
  assert.equal((await supertest(app).get('/admin/model-configs').set('Authorization', 'Bearer ' + token)).headers['cache-control'], 'no-store');
});
