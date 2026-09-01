const fetchModule = import('node-fetch');

const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const DOUBAO_MODEL = process.env.ARK_MODEL || 'doubao-seed-1-8-251228';

class AiProviderError extends Error {
  constructor(message, { code = 'AI_PROVIDER_ERROR', status = 502, retryable = true } = {}) {
    super(message);
    this.name = 'AiProviderError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

async function callDoubaoAPI(messages, maxTokens = 2000, temperature = 0.7, { timeoutMs = 45000, returnMeta = false, signal: externalSignal } = {}) {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey || apiKey === 'your_doubao_api_key_here') {
    throw new AiProviderError('AI 服务尚未配置，请联系管理员', {
      code: 'AI_NOT_CONFIGURED',
      status: 503,
      retryable: false,
    });
  }

  const { default: fetch } = await fetchModule;
  const controller = new AbortController();
  if (externalSignal) externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(DOUBAO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DOUBAO_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Doubao API 错误:', response.status, errorText.slice(0, 1000));
      throw new AiProviderError('AI 服务暂时不可用，请稍后重试', {
        code: `AI_UPSTREAM_${response.status}`,
        status: response.status >= 500 ? 502 : 400,
        retryable: response.status >= 500 || response.status === 429,
      });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    if (!reply) {
      throw new AiProviderError('AI 返回内容为空，请稍后重试', {
        code: 'AI_EMPTY_RESPONSE',
        status: 502,
        retryable: true,
      });
    }
    if (returnMeta) {
      return {
        reply,
        model: data.model || DOUBAO_MODEL,
        inputTokens: data.usage?.prompt_tokens || null,
        outputTokens: data.usage?.completion_tokens || null,
        finishReason: data.choices?.[0]?.finish_reason || 'stop',
      };
    }
    return reply;
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (error.name === 'AbortError') {
      throw new AiProviderError('AI 响应超时，请稍后重试', {
        code: 'AI_TIMEOUT',
        status: 504,
        retryable: true,
      });
    }
    throw new AiProviderError('AI 网络连接失败，请稍后重试', {
      code: 'AI_NETWORK_ERROR',
      status: 502,
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// 兼容浏览器 Fetch 的 SSE 流式接口；默认仍使用上面的非流式方法。
async function streamDoubaoAPI(messages, maxTokens = 2000, temperature = 0.7, {
  timeoutMs = 45000, signal: externalSignal, onDelta = () => {},
} = {}) {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey || apiKey === 'your_doubao_api_key_here') {
    throw new AiProviderError('AI 服务尚未配置，请联系管理员', { code: 'AI_NOT_CONFIGURED', status: 503, retryable: false });
  }
  const { default: fetch } = await fetchModule;
  const controller = new AbortController();
  if (externalSignal) externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(DOUBAO_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: DOUBAO_MODEL, messages, max_tokens: maxTokens, temperature, stream: true }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new AiProviderError('AI 服务暂时不可用，请稍后重试', {
        code: `AI_UPSTREAM_${response.status}`, status: response.status >= 500 ? 502 : 400,
        retryable: response.status >= 500 || response.status === 429,
      });
    }
    let buffer = '';
    let reply = '';
    let model = DOUBAO_MODEL;
    let finishReason = 'stop';
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let data;
        try { data = JSON.parse(payload); } catch { continue; }
        if (data.model) model = data.model;
        if (data.choices?.[0]?.finish_reason) finishReason = data.choices[0].finish_reason;
        const delta = data.choices?.[0]?.delta?.content || '';
        if (delta) { reply += delta; await onDelta(delta); }
      }
    }
    if (!reply) throw new AiProviderError('AI 返回内容为空，请稍后重试', { code: 'AI_EMPTY_RESPONSE', status: 502, retryable: true });
    return { reply, model, finishReason };
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (error.name === 'AbortError') {
      throw new AiProviderError(externalSignal?.aborted ? '已停止生成' : 'AI 响应超时，请稍后重试', {
        code: externalSignal?.aborted ? 'AI_CANCELLED' : 'AI_TIMEOUT',
        status: externalSignal?.aborted ? 499 : 504,
        retryable: !externalSignal?.aborted,
      });
    }
    throw new AiProviderError('AI 网络连接失败，请稍后重试', { code: 'AI_NETWORK_ERROR', status: 502, retryable: true });
  } finally { clearTimeout(timeout); }
}

module.exports = { AiProviderError, callDoubaoAPI, streamDoubaoAPI, DOUBAO_MODEL };
