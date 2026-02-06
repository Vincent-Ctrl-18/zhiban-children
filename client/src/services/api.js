import axios from 'axios';

const API_BASE_URL = '/api';

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
      if (status === 401) {
        // token过期，清除登录状态
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/';
      }
      return Promise.reject(new Error(data.message || '请求失败'));
    }
    return Promise.reject(new Error('网络错误，请稍后重试'));
  }
);

// 认证相关API
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
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
  getResources: (params) => {
    const token = localStorage.getItem('adminToken');
    return api.get('/admin/resources', { params, headers: { Authorization: `Bearer ${token}` } });
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
};

// AI 智能服务API
export const aiApi = {
  // 智能作业辅导
  homeworkHelp: (data) => api.post('/ai/homework', data, { timeout: 60000 }),
  // 个性化学习报告
  learningReport: (data) => api.post('/ai/learning-report', data, { timeout: 60000 }),
  // 谈心伙伴
  chat: (data) => api.post('/ai/chat', data, { timeout: 30000 }),
};

export default api;
