const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { testConnection } = require('./config/database');
const { UPLOAD_DIR } = require('./config/paths');

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
const aiRoutes = require('./routes/ai');
const adminRoutes = require('./routes/admin');
const coursesRoutes = require('./routes/courses');
const companionRiskRoutes = require('./routes/companionRisk');
const { startSummaryWorker } = require('./services/summaryService');

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '127.0.0.1';
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
  : true;

// 中间件
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务（用于上传的文件）
app.use('/uploads', express.static(UPLOAD_DIR));

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
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/companion-risk', companionRiskRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '智伴乡童服务运行正常', timestamp: new Date().toISOString() });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: '上传文件超过大小限制' });
  }
  if (err?.message && /电子书仅支持|封面仅支持|不支持的文件格式/.test(err.message)) {
    return res.status(400).json({ message: err.message });
  }
  res.status(500).json({ message: '服务器内部错误', error: err.message });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ message: '接口不存在' });
});

// 启动服务器（测试或被其他模块引用时不自动监听端口）
const startServer = () => app.listen(PORT, HOST, async () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   🌟 智伴乡童 - 留守儿童关怀平台后端服务                    ║
  ║                                                           ║
  ║   服务地址: http://${HOST}:${PORT}                         ║
  ║   健康检查: http://${HOST}:${PORT}/api/health              ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
  `);
  
  // 测试数据库连接
  await testConnection();
  startSummaryWorker();
});

module.exports = app;
module.exports.startServer = startServer;

if (require.main === module) {
  startServer();
}
