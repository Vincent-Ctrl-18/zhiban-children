const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const directory = () => process.env.AI_CONFIG_DIR || path.join(__dirname, '../private_config');
const filename = () => path.join(directory(), 'models.json');
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function encryptionKey() {
  fs.mkdirSync(directory(), { recursive: true, mode: 0o700 });
  const target = path.join(directory(), 'models.key');
  try { fs.writeFileSync(target, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  return fs.readFileSync(target);
}
function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(x => x.toString('base64')).join('.');
}
function decrypt(value) {
  const [iv, tag, data] = value.split('.').map(x => Buffer.from(x, 'base64'));
  const cipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}
function read() {
  if (fs.existsSync(filename())) {
    const state = JSON.parse(fs.readFileSync(filename(), 'utf8'));
    return { ...state, configs: state.configs.map(c => ({ ...c, apiKey: decrypt(c.apiKey) })) };
  }
  const apiKey = process.env.ARK_API_KEY;
  return apiKey && apiKey !== 'your_doubao_api_key_here' ? {
    activeId: 'legacy', configs: [{ id: 'legacy', name: '原有豆包配置', apiKey, supportsVision: true,
      model: process.env.ARK_MODEL || 'doubao-seed-1-8-251228',
      url: process.env.ARK_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions' }],
  } : { activeId: null, configs: [] };
}
function write(state) {
  fs.mkdirSync(directory(), { recursive: true, mode: 0o700 });
  const encoded = { ...state, configs: state.configs.map(c => ({ ...c, apiKey: encrypt(c.apiKey) })) };
  const temporary = filename() + '.' + crypto.randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify(encoded, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, filename());
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function list() {
  const state = read();
  return { ...state, configs: state.configs.map(({ apiKey, ...c }) => ({ ...c, hasKey: !!apiKey, masked: '••••••••' })) };
}
function get(id, agentType) {
  const state = read();
  const config = state.configs.find(c => c.id === (id || state.assignments?.[agentType] || state.activeId));
  if (!config) fail(id ? '模型配置不存在' : 'AI 服务尚未配置，请联系管理员', id ? 404 : 503);
  return config;
}
function save(input, id) {
  const state = read();
  const existing = id ? state.configs.find(c => c.id === id) : null;
  if (id && !existing) fail('模型配置不存在', 404);
  const config = { id: id || crypto.randomUUID() };
  for (const field of ['name', 'model', 'url']) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > (field === 'url' ? 2048 : 160)) fail('请填写有效的名称、模型名和调用 URL');
    config[field] = input[field].trim();
  }
  let url;
  try { url = new URL(config.url); } catch { fail('调用 URL 格式不正确'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) fail('调用 URL 必须为不含账号、查询参数和片段的 HTTP(S) 地址');
  if (!url.pathname.replace(/\/$/, '').endsWith('/chat/completions')) url.pathname = url.pathname.replace(/\/$/, '') + '/chat/completions';
  config.url = url.toString();
  for (const field of ['supportsVision', 'sendTemperature', 'useCompletionTokens']) {
    if (input[field] !== undefined && typeof input[field] !== 'boolean') fail('模型能力选项必须为布尔值');
  }
  config.supportsVision = input.supportsVision ?? existing?.supportsVision ?? false;
  config.sendTemperature = input.sendTemperature ?? existing?.sendTemperature ?? true;
  config.useCompletionTokens = input.useCompletionTokens ?? existing?.useCompletionTokens ?? false;
  if (input.apiKey != null && typeof input.apiKey !== 'string') fail('API Key 格式不正确');
  config.apiKey = input.apiKey?.trim() || existing?.apiKey;
  if (!config.apiKey || /[\r\n]/.test(config.apiKey) || config.apiKey.length > 4096) fail('请填写有效的 API Key');
  if (existing && existing.url !== config.url && !input.apiKey?.trim()) fail('修改调用 URL 时请重新填写对应 API Key');
  if (existing) state.configs = state.configs.map(c => c.id === id ? config : c);
  else { if (state.configs.length >= 30) fail('最多保存 30 组配置'); state.configs.push(config); }
  write(state);
  return list();
}
function activate(id) { const state = read(); if (!state.configs.some(c => c.id === id)) fail('模型配置不存在', 404); state.activeId = id; write(state); return list(); }
function remove(id) { const state = read(); if (!state.configs.some(c => c.id === id)) fail('模型配置不存在', 404); if (state.activeId === id || Object.values(state.assignments || {}).includes(id)) fail('请先切换默认模型或任务分配，再删除配置'); state.configs = state.configs.filter(c => c.id !== id); write(state); return list(); }
function assign(assignments) {
  if (!assignments || typeof assignments !== 'object' || Array.isArray(assignments)) fail('任务分配格式不正确');
  const state = read();
  const allowed = ['homework', 'report', 'companion', 'summary'];
  for (const [agent, id] of Object.entries(assignments)) {
    if (!allowed.includes(agent) || (id !== null && !state.configs.some(c => c.id === id))) fail('任务或模型配置不存在');
  }
  state.assignments = { ...state.assignments, ...assignments };
  write(state);
  return list();
}
module.exports = { list, get, save, activate, remove, assign };
