import axios from 'axios';
import { API_BASE_URL, withBasePath } from '../utils/paths';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 请求拦截器 - 添加认证token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理错误
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response) {
      const { status, data } = error.response;
      const url = error.config?.url || '';
      // 仅对非登录接口的 401 做跳转（登录接口 401 属于凭据错误，应由业务层处理）
      const isLoginRequest = url.includes('/auth/login') || url.includes('/admin/login');
      if (status === 401 && !isLoginRequest) {
        const isAdminRequest = url.includes('/admin/');
        // token过期，清除对应登录状态并回到正确入口
        if (isAdminRequest) {
          localStorage.removeItem('adminToken');
          window.location.href = withBasePath('/admin');
        } else {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = withBasePath('/');
        }
      }
      const apiError = new Error(data.message || '请求失败');
      apiError.status = status;
      apiError.code = data.code;
      apiError.retryable = data.retryable;
      apiError.data = data;
      return Promise.reject(apiError);
    }
    return Promise.reject(new Error('网络错误，请稍后重试'));
  }
);

// 认证相关API
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  loginEmail: (data) => api.post('/auth/login-email', data),
  verifyEmail: (token) => api.get(`/auth/verify-email?token=${token}`),
  getMe: () => api.get('/auth/me'),
  getInviteCode: () => api.get('/auth/institution/invite-code'),
  getMembers: () => api.get('/auth/institution/members'),
};

// 儿童管理API
export const childrenApi = {
  getList: (params) => api.get('/children', { params }),
  getById: (id) => api.get(`/children/${id}`),
  create: (data) => api.post('/children', data),
  update: (id, data) => api.put(`/children/${id}`, data),
  delete: (id) => api.delete(`/children/${id}`),
  getMyChildren: () => api.get('/children/parent/my-children'),
};

// 签到管理API
export const checkinApi = {
  getList: (params) => api.get('/checkin', { params }),
  getToday: () => api.get('/checkin/today'),
  checkin: (data) => api.post('/checkin/checkin', data),
  batchCheckin: (data) => api.post('/checkin/batch-checkin', data),
  checkout: (data) => api.post('/checkin/checkout', data),
  markAbsent: (data) => api.post('/checkin/absent', data),
};

// 安全检查API
export const safetyApi = {
  getList: (params) => api.get('/safety', { params }),
  getToday: () => api.get('/safety/today'),
  submit: (data) => api.post('/safety', data),
  getStats: () => api.get('/safety/stats'),
};

// 活动记录API
export const activitiesApi = {
  getList: (params) => api.get('/activities', { params }),
  getById: (id) => api.get(`/activities/${id}`),
  create: (data) => api.post('/activities', data),
  update: (id, data) => api.put(`/activities/${id}`, data),
  delete: (id) => api.delete(`/activities/${id}`),
};

// 资源管理API
export const resourcesApi = {
  getList: (params) => api.get('/resources', { params }),
  getAll: (params) => api.get('/resources/all', { params }),
  getById: (id) => api.get(`/resources/${id}`),
  create: (data) => api.post('/resources', data),
  update: (id, data) => api.put(`/resources/${id}`, data),
  approve: (id, status) => api.post(`/resources/${id}/approve`, { status }),
  delete: (id) => api.delete(`/resources/${id}`),
};

// 统计数据API
export const statisticsApi = {
  getImpact: () => api.get('/statistics/impact'),
  getInstitutionImpact: () => api.get('/statistics/impact/institutions'),
  getDashboard: () => api.get('/statistics/dashboard'),
  getActivityTrend: () => api.get('/statistics/activity-trend'),
  getActivityTypes: () => api.get('/statistics/activity-types'),
  getResourceTypes: () => api.get('/statistics/resource-types'),
  getInstitutionRanking: () => api.get('/statistics/institution-ranking'),
};

// 通知管理API
export const notificationsApi = {
  getList: (params) => api.get('/notifications', { params }),
  create: (data) => api.post('/notifications', data),
  delete: (id) => api.delete(`/notifications/${id}`),
};

// 家长用户API（供机构选择绑定）
export const parentsApi = {
  getList: (params) => api.get('/parents', { params }),
};

// 管理员后台API
export const adminApi = {
  login: (data) => api.post('/admin/login', data),
  getStatistics: () => {
    const token = localStorage.getItem('adminToken');
    return api.get('/admin/statistics', { headers: { Authorization: `Bearer ${token}` } });
  },
  getHomeworkStatistics: (range = '7d') => {
    const token = localStorage.getItem('adminToken');
    return api.get('/admin/statistics/homework', {
      params: { range },
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  getProjectStatistics: (params = {}) => {
    const token = localStorage.getItem('adminToken');
    return api.get('/admin/statistics/project', { params, headers: { Authorization: `Bearer ${token}` } });
  },
  downloadProjectStatisticsCsv: async (params = {}) => {
    const token = localStorage.getItem('adminToken');
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')).toString();
    const response = await fetch(`${API_BASE_URL}/admin/statistics/project.csv${query ? `?${query}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('CSV 导出暂不可用');
    return response.blob();
  },
  getCompanionRiskStatistics: () => {
    const token = localStorage.getItem('adminToken');
    return api.get('/admin/statistics/companion-risk', { headers: { Authorization: `Bearer ${token}` } });
  },
  getUsers: (params) => {
    const token = localStorage.getItem('adminToken');
    return api.get('/admin/users', { params, headers: { Authorization: `Bearer ${token}` } });
  },
  getResources: (params) => {
    const token = localStorage.getItem('adminToken');
    return api.get('/admin/resources', { params, headers: { Authorization: `Bearer ${token}` } });
  },
  getCourses: (params) => {
    const token = localStorage.getItem('adminToken');
    return api.get('/admin/courses', { params, headers: { Authorization: `Bearer ${token}` } });
  },
  courseContentUrl: (id) => `${API_BASE_URL}/admin/courses/${id}/content`,
  reviewCourse: (id, status, rejectReason) => {
    const token = localStorage.getItem('adminToken');
    return api.post(`/admin/courses/${id}/review`, { status, rejectReason }, { headers: { Authorization: `Bearer ${token}` } });
  },
  updateCourseDownloadPolicy: (id, allowDownload) => {
    const token = localStorage.getItem('adminToken');
    return api.patch(`/admin/courses/${id}/download-policy`, { allowDownload }, { headers: { Authorization: `Bearer ${token}` } });
  },
  approveResource: (id, status, rejectReason) => {
    const token = localStorage.getItem('adminToken');
    return api.post(`/admin/resources/${id}/approve`, { status, rejectReason }, { headers: { Authorization: `Bearer ${token}` } });
  },
  getApiKey: () => {
    const token = localStorage.getItem('adminToken');
    return api.get('/admin/api-key', { headers: { Authorization: `Bearer ${token}` } });
  },
  updateApiKey: (apiKey) => {
    const token = localStorage.getItem('adminToken');
    return api.post('/admin/api-key', { apiKey }, { headers: { Authorization: `Bearer ${token}` } });
  },
  testApiKey: () => {
    const token = localStorage.getItem('adminToken');
    return api.post('/admin/api-key/test', {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 });
  },
  getPrompts: () => {
    const token = localStorage.getItem('adminToken');
    return api.get('/admin/prompts', { headers: { Authorization: `Bearer ${token}` } });
  },
  updatePrompt: (type, data) => {
    const token = localStorage.getItem('adminToken');
    return api.put(`/admin/prompts/${type}`, data, { headers: { Authorization: `Bearer ${token}` } });
  },
  resetPrompt: (type) => {
    const token = localStorage.getItem('adminToken');
    return api.post('/admin/prompts/reset', { type }, { headers: { Authorization: `Bearer ${token}` } });
  },
  resetAllPrompts: () => {
    const token = localStorage.getItem('adminToken');
    return api.post('/admin/prompts/reset', {}, { headers: { Authorization: `Bearer ${token}` } });
  },
  getPromptVersions: (agentType) => {
    const token = localStorage.getItem('adminToken');
    return api.get('/admin/prompts/versions', { params: agentType ? { agentType } : {}, headers: { Authorization: `Bearer ${token}` } });
  },
  createPromptVersion: (data) => {
    const token = localStorage.getItem('adminToken');
    return api.post('/admin/prompts/versions', data, { headers: { Authorization: `Bearer ${token}` } });
  },
  testPromptVersion: (id) => {
    const token = localStorage.getItem('adminToken');
    return api.post(`/admin/prompts/versions/${id}/test`, {}, { headers: { Authorization: `Bearer ${token}` } });
  },
  publishPromptVersion: (id, rolloutPercent = 100) => {
    const token = localStorage.getItem('adminToken');
    return api.post(`/admin/prompts/versions/${id}/publish`, { rolloutPercent }, { headers: { Authorization: `Bearer ${token}` } });
  },
  rollbackPromptVersion: (id) => {
    const token = localStorage.getItem('adminToken');
    return api.post(`/admin/prompts/versions/${id}/rollback`, {}, { headers: { Authorization: `Bearer ${token}` } });
  },
};

export const companionRiskApi = {
  getQueue: (params) => api.get('/companion-risk', { params }),
  updateStatus: (id, status) => api.post(`/companion-risk/${id}/status`, { status }),
};

// AI 智能服务API
export const aiApi = {
  // 作业帮手
  homeworkHelp: (data) => api.post('/ai/homework', data, { timeout: 60000 }),
  homeworkRecentSession: () => api.get('/ai/homework/sessions/recent'),
  homeworkCreateSession: ({ question, image, recognitionId, requestId, onUploadProgress }) => {
    const formData = new FormData();
    formData.append('question', question || '');
    formData.append('requestId', requestId);
    if (recognitionId) formData.append('recognitionId', recognitionId);
    else if (image) formData.append('image', image);
    return api.post('/ai/homework/sessions', formData, {
      timeout: 60000,
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    });
  },
  homeworkSendMessage: ({ sessionId, question, image, recognitionId, requestId, onUploadProgress }) => {
    const formData = new FormData();
    formData.append('question', question || '');
    formData.append('requestId', requestId);
    if (recognitionId) formData.append('recognitionId', recognitionId);
    else if (image) formData.append('image', image);
    return api.post(`/ai/homework/sessions/${sessionId}/messages`, formData, {
      timeout: 60000,
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    });
  },
  homeworkRetry: ({ sessionId, messageId, requestId }) => api.post(
    `/ai/homework/sessions/${sessionId}/messages/${messageId}/retry`,
    { requestId },
    { timeout: 60000 },
  ),
  homeworkComplete: (sessionId) => api.post(`/ai/homework/sessions/${sessionId}/complete`),
  homeworkAbandon: (sessionId) => api.post(`/ai/homework/sessions/${sessionId}/abandon`),
  homeworkRecognize: ({ image, onUploadProgress }) => {
    const formData = new FormData();
    formData.append('image', image);
    return api.post('/ai/homework/recognitions', formData, { timeout: 60000, headers: { 'Content-Type': 'multipart/form-data' }, onUploadProgress });
  },
  homeworkConfirmRecognition: (id, text) => api.patch(`/ai/homework/recognitions/${id}`, { text }),
  homeworkStreamMessage: async ({ sessionId, question, image, recognitionId, requestId, onEvent, signal }) => {
    const formData = new FormData();
    formData.append('question', question || '');
    formData.append('requestId', requestId);
    if (recognitionId) formData.append('recognitionId', recognitionId);
    else if (image) formData.append('image', image);
    const token = localStorage.getItem('token');
    const streamPath = sessionId ? `/ai/homework/sessions/${sessionId}/messages/stream` : '/ai/homework/sessions/stream';
    const response = await fetch(`${API_BASE_URL}${streamPath}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData, signal,
    });
    if (!response.ok) {
      let data = {};
      try { data = await response.json(); } catch {}
      const error = new Error(data.message || '流式请求失败'); error.status = response.status; error.code = data.code; error.retryable = data.retryable; error.data = data; throw error;
    }
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\n\n/); buffer = blocks.pop() || '';
      for (const block of blocks) {
        const event = block.match(/^event:\s*(.+)$/m)?.[1] || 'message';
        const data = block.match(/^data:\s*(.+)$/m)?.[1];
        if (!data) continue;
        try { onEvent?.(event, JSON.parse(data)); } catch { onEvent?.(event, { raw: data }); }
      }
    }
  },
  homeworkFeedback: ({ sessionId, messageId, rating, reason }) => api.post(`/ai/homework/sessions/${sessionId}/messages/${messageId}/feedback`, { rating, reason }),
  // 学习报告
  learningReport: (data) => api.post('/ai/learning-report', data, { timeout: 60000 }),
  learningReportGenerate: (data) => api.post('/ai/learning-report/generate', data, { timeout: 60000 }),
  learningReportHistory: (limit) => api.get('/ai/learning-report/history', { params: { limit } }),
  // 倾诉小屋
  chat: (data) => api.post('/ai/chat', data, { timeout: 30000 }),
  chatRecentSession: () => api.get('/ai/chat/sessions/recent'),
  chatCreateSession: (data) => api.post('/ai/chat/sessions', data, { timeout: 60000 }),
  chatSendMessage: (sessionId, data) => api.post(`/ai/chat/sessions/${sessionId}/messages`, data, { timeout: 60000 }),
  chatComplete: (sessionId) => api.post(`/ai/chat/sessions/${sessionId}/complete`),
  chatSessions: (params) => api.get('/ai/chat/sessions', { params }),
  chatSession: (id) => api.get(`/ai/chat/sessions/${id}`),
  listSessions: (params) => api.get('/ai/sessions', { params }),
  getSession: (id) => api.get(`/ai/sessions/${id}`),
  resumeSession: (id) => api.post(`/ai/sessions/${id}/resume`),
  renameSession: (id, title) => api.patch(`/ai/sessions/${id}/title`, { title }),
  listMemories: (params) => api.get('/ai/memories', { params }),
  updateMemory: (id, data) => api.patch(`/ai/memories/${id}`, data),
  forgetMemory: (id) => api.delete(`/ai/memories/${id}`),
  setMemoryEnabled: (enabled) => api.patch('/ai/memory-settings', { enabled }),
};

// 课程资源API
export const coursesApi = {
  getList: (params) => api.get('/courses', { params }),
  getById: (id) => api.get(`/courses/${id}`),
  start: (id) => api.post(`/courses/${id}/start`),
  complete: (id) => api.post(`/courses/${id}/complete`),
  updateProgress: (id, data) => api.patch(`/courses/${id}/progress`, data),
  download: async (id) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/courses/${id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      let data = {};
      try { data = await response.json(); } catch {}
      throw new Error(data.message || '下载失败');
    }
    return response;
  },
  contentUrl: (id) => `${API_BASE_URL}/courses/${id}/content`,
  ebookUpload: (formData) => api.post('/courses/ebooks', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  }),
  getProgress: () => api.get('/courses/progress/me'),
  upload: (formData) => api.post('/courses/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  }),
  delete: (id) => api.delete(`/courses/${id}`),
};

export default api;
