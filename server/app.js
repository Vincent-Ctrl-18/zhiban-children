const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { testConnection } = require('./config/database');

// 导入路由
const authRoutes = require('./routes/auth');
const childrenRoutes = require('./routes/children');
const checkinRoutes = require('./routes/checkin');
const safetyRoutes = require('./routes/safety');
const activitiesRoutes = require('./routes/activities');
const resourcesRoutes = require('./routes/resources');
const statisticsRoutes = require('./routes/statistics');
const notificationsRoutes = require('./routes/notifications');
const parentsRoutes = require('./routes/parents');
const uploadRoutes = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务（用于上传的文件）
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/children', childrenRoutes);
app.use('/api/checkin', checkinRoutes);
app.use('/api/safety', safetyRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/resources', resourcesRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/parents', parentsRoutes);
app.use('/api/upload', uploadRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '智伴乡童服务运行正常', timestamp: new Date().toISOString() });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ message: '服务器内部错误', error: err.message });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ message: '接口不存在' });
});

// 启动服务器
app.listen(PORT, async () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   🌟 智伴乡童 - 留守儿童关怀平台后端服务                    ║
  ║                                                           ║
  ║   服务地址: http://localhost:${PORT}                        ║
  ║   健康检查: http://localhost:${PORT}/api/health             ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
  `);
  
  // 测试数据库连接
  await testConnection();
});

module.exports = app;
