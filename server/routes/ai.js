const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getPrompt } = require('../config/promptManager');

const router = express.Router();

// Doubao API 配置
const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const DOUBAO_MODEL = 'doubao-seed-1-8-251228';

// 动态 import node-fetch（兼容 CommonJS）
let fetch;
(async () => {
  fetch = (await import('node-fetch')).default;
})();

// 通用调用 Doubao API
async function callDoubaoAPI(messages, maxTokens = 2000, temperature = 0.7) {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey || apiKey === 'your_doubao_api_key_here') {
    throw new Error('未配置有效的 ARK_API_KEY 环境变量');
  }

  // 等待 fetch 加载
  if (!fetch) {
    fetch = (await import('node-fetch')).default;
  }

  const response = await fetch(DOUBAO_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DOUBAO_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Doubao API 错误:', response.status, errorText);
    throw new Error(`AI 服务请求失败 (${response.status})`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '暂时无法回答，请稍后再试。';
}

// ===== 智能作业辅导 =====
router.post('/homework', authenticateToken, async (req, res) => {
  try {
    const { question, image } = req.body;

    if (!question && !image) {
      return res.status(400).json({ message: '请提供问题或题目图片' });
    }

    const promptConfig = getPrompt('homework');

    const messages = [
      { role: 'system', content: promptConfig.systemPrompt },
    ];

    // 如果有图片，使用多模态格式
    if (image) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${image}`,
            },
          },
          {
            type: 'text',
            text: question || '请帮我看看这道题怎么做，给出详细的解题思路',
          },
        ],
      });
    } else {
      messages.push({ role: 'user', content: question });
    }

    const reply = await callDoubaoAPI(messages, promptConfig.maxTokens, promptConfig.temperature);
    res.json({ reply });
  } catch (error) {
    console.error('作业辅导接口错误:', error);
    res.status(500).json({ message: error.message || '服务器内部错误' });
  }
});

// ===== 个性化学习报告 =====
router.post('/learning-report', authenticateToken, async (req, res) => {
  try {
    const { grade, subjects, strengths, weaknesses, studyHours, goals } = req.body;

    if (!grade || !subjects) {
      return res.status(400).json({ message: '请提供年级和学习科目信息' });
    }

    const promptConfig = getPrompt('learningReport');

    const userContent = `请根据以下信息生成学习报告：
- 年级：${grade}
- 学习科目：${Array.isArray(subjects) ? subjects.join('、') : subjects}
- 擅长的方面：${strengths || '未填写'}
- 需要提升的方面：${weaknesses || '未填写'}
- 每天学习时间：${studyHours || '未填写'}小时
- 学习目标：${goals || '未填写'}`;

    const messages = [
      { role: 'system', content: promptConfig.systemPrompt },
      { role: 'user', content: userContent },
    ];

    const reply = await callDoubaoAPI(messages, promptConfig.maxTokens, promptConfig.temperature);
    res.json({ reply });
  } catch (error) {
    console.error('学习报告接口错误:', error);
    res.status(500).json({ message: error.message || '服务器内部错误' });
  }
});

// ===== 谈心伙伴 =====
router.post('/chat', authenticateToken, async (req, res) => {
  try {
    const { messages: userMessages, mode } = req.body;

    if (!userMessages || !Array.isArray(userMessages) || userMessages.length === 0) {
      return res.status(400).json({ message: '请提供聊天内容' });
    }

    const promptConfig = getPrompt('chat');

    const messages = [
      { role: 'system', content: promptConfig.systemPrompt },
      ...userMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const reply = await callDoubaoAPI(messages, promptConfig.maxTokens, promptConfig.temperature);
    res.json({ reply });
  } catch (error) {
    console.error('谈心伙伴接口错误:', error);
    res.status(500).json({ message: error.message || '服务器内部错误' });
  }
});

module.exports = router;
