const fetchModule = import('node-fetch');
const configs = require('../config/modelConfigs');
class AiProviderError extends Error {
  constructor(message, { code = 'AI_PROVIDER_ERROR', status = 502, retryable = true } = {}) {
    super(message);
    Object.assign(this, { name: 'AiProviderError', code, status, retryable });
  }
}
async function request(messages, maxTokens, temperature, options, streaming) {
  let config;
  try { config = configs.get(options.configId, options.agentType); }
  catch (error) { throw new AiProviderError(error.status ? error.message : '模型配置读取失败，请联系管理员', { code: 'AI_NOT_CONFIGURED', status: error.status || 503, retryable: false }); }
  if (config.supportsVision === false && messages.some(m => Array.isArray(m.content) && m.content.some(p => p.type === 'image_url'))) {
    throw new AiProviderError('当前模型未启用图片能力，请输入题目文字或联系管理员选择支持图片的模型', { code: 'AI_VISION_UNSUPPORTED', status: 400, retryable: false });
  }
  const { default: fetch } = await fetchModule;
  const controller = new AbortController();
  const abort = () => controller.abort();
  const external = options.signal;
  if (external?.aborted) throw new AiProviderError('已停止生成', { code: 'AI_CANCELLED', status: 499, retryable: false });
  external?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, options.timeoutMs ?? 45000);
  let response;
  try {
    response = await fetch(config.url, {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.apiKey },
      body: JSON.stringify({ model: config.model, messages, [config.useCompletionTokens ? 'max_completion_tokens' : 'max_tokens']: maxTokens, ...(config.sendTemperature === false ? {} : { temperature }), ...(streaming ? { stream: true } : {}) }),
      signal: controller.signal,
    });
    // A destroyed node-fetch body can emit a late abort error after iterator cleanup.
    // The read/iterator below still propagates request failures to the caller.
    response.body?.on('error', () => {});
    if (!response.ok) {
      const descriptions = { 401: '模型 API Key 无效，请联系管理员', 403: '模型访问权限不足，请联系管理员', 404: '模型名或调用 URL 不正确，请联系管理员', 429: '模型请求过于频繁或额度不足，请稍后重试' };
      throw new AiProviderError(descriptions[response.status] || '模型服务请求失败，请稍后重试', {
        code: 'AI_UPSTREAM_' + response.status, status: response.status === 429 ? 429 : 502,
        retryable: response.status >= 500 || response.status === 429,
      });
    }
    let reply = '', model = config.model, finishReason = null, usage;
    if (!streaming) {
      const data = await response.json();
      reply = data.choices?.[0]?.message?.content;
      model = data.model || model;
      finishReason = data.choices?.[0]?.finish_reason;
      usage = data.usage;
    } else {
      const decoder = new TextDecoder();
      let buffer = '', done = false;
      async function line(value) {
        if (!value.startsWith('data:')) return;
        const payload = value.slice(5).trim();
        if (!payload) return;
        if (payload === '[DONE]') { done = true; return; }
        let data;
        try { data = JSON.parse(payload); }
        catch { throw new AiProviderError('模型返回了无效的流式数据', { code: 'AI_INVALID_RESPONSE' }); }
        if (data.error) throw new AiProviderError('模型生成过程中发生错误，请重试', { code: 'AI_STREAM_ERROR' });
        model = data.model || model;
        usage = data.usage || usage;
        finishReason = data.choices?.[0]?.finish_reason || finishReason;
        const delta = data.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') { reply += delta; await options.onDelta?.(delta); }
      }
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop();
        for (const value of lines) { await line(value); if (done) break; }
        if (done) break;
      }
      if (!done) await line(buffer + decoder.decode());
      if (!done && !finishReason) throw new AiProviderError('模型连接中断，请重新生成', { code: 'AI_STREAM_INTERRUPTED' });
    }
    if (typeof reply !== 'string' || !reply.trim()) throw new AiProviderError('AI 返回内容为空，请稍后重试', { code: 'AI_EMPTY_RESPONSE' });
    const result = { reply, model, provider: config.name, configId: config.id, inputTokens: usage?.prompt_tokens ?? null, outputTokens: usage?.completion_tokens ?? null, finishReason: finishReason || 'stop' };
    return streaming || options.returnMeta ? result : reply;
  } catch (error) {
    if (error instanceof AiProviderError) { error.model = config.model; throw error; }
    if (controller.signal.aborted) throw new AiProviderError(external?.aborted ? '已停止生成' : 'AI 响应超时，请稍后重试', { code: external?.aborted ? 'AI_CANCELLED' : 'AI_TIMEOUT', status: external?.aborted ? 499 : 504, retryable: !external?.aborted });
    throw new AiProviderError(error instanceof SyntaxError ? '模型返回格式不正确，请检查接口配置' : 'AI 网络连接失败，请稍后重试', { code: error instanceof SyntaxError ? 'AI_INVALID_RESPONSE' : 'AI_NETWORK_ERROR' });
  } finally {
    clearTimeout(timeout);
    external?.removeEventListener('abort', abort);
    response?.body?.destroy();
  }
}
const callModelAPI = (messages, maxTokens = 2000, temperature = 0.7, options = {}) => request(messages, maxTokens, temperature, options, false);
const streamModelAPI = (messages, maxTokens = 2000, temperature = 0.7, options = {}) => request(messages, maxTokens, temperature, options, true);
// Compatibility aliases for existing services and test mocks.
module.exports = { AiProviderError, callModelAPI, streamModelAPI, callDoubaoAPI: callModelAPI, streamDoubaoAPI: streamModelAPI };
Object.defineProperty(module.exports, 'DOUBAO_MODEL', { get() { try { return configs.get().model; } catch { return null; } } });
