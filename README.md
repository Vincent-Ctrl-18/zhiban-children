# 智伴乡童 - 留守儿童关怀平台

> "智伴乡童，暖护童心" —— 以西南为重点辐射全国留守儿童身心健康成长赋能计划

聚焦云贵川与中国其他地区留守儿童情感陪伴缺失、成长支持不足等核心痛点，构建多方协同的长效关怀网络。

## 🌟 功能特性

### 四类用户角色
- **家长**：查看孩子活动记录、照片和机构通知
- **托管机构**：儿童管理、签到记录、安全检查、活动记录
- **资源方**：资源登记（课程/物资/志愿者）
- **政府/捐赠方**：数据看板，查看项目影响力

### 核心模块
1. **托管机构标准化运营**（核心模块）
   - 儿童信息登记表
   - 每日签到记录（签到/签退/缺勤）
   - 安全检查打卡表（10项检查项）
   - 每日活动记录

2. **家长查看**
   - 孩子活动照片
   - 活动记录
   - 机构通知

3. **资源对接**
   - 资源登记墙
   - 资源浏览与筛选

4. **数据看板**
   - 服务儿童数、活动数、志愿者参与次数
   - 活动趋势图表
   - 资源类型分布

## 🛠️ 技术栈

- **前端**：React 18 + Vite + Ant Design 5 + ECharts
- **后端**：Node.js + Express
- **数据库**：MySQL 8.0
- **认证**：JWT

## 📦 项目结构

```
children/
├── client/                 # React 前端
│   ├── src/
│   │   ├── pages/          # 页面组件
│   │   │   ├── institution/  # 托管机构模块
│   │   │   ├── parent/       # 家长模块
│   │   │   ├── resource/     # 资源方模块
│   │   │   └── government/   # 政府模块
│   │   ├── services/       # API 服务
│   │   ├── App.jsx         # 主应用
│   │   └── index.css       # 全局样式
│   └── package.json
├── server/                 # Node.js 后端
│   ├── routes/             # API 路由
│   ├── config/             # 配置文件
│   ├── middleware/         # 中间件
│   └── app.js              # 入口文件
└── database/
    └── init.sql            # 数据库初始化
```

## 🚀 快速开始

### 1. 准备数据库

确保已安装 MySQL 8.0+，然后执行初始化脚本：

```bash
mysql -u root -p < database/init.sql
```

### 2. 配置后端

```bash
cd server

# 安装依赖
npm install

# 修改数据库配置
# 编辑 .env 文件，设置正确的数据库密码
```

.env 配置示例：
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password  # 修改为你的MySQL密码
DB_NAME=zhiban_children
JWT_SECRET=your_secret_key
PORT=3001
```

### 3. 启动后端服务

```bash
cd server
npm run dev
```

服务将在 http://localhost:3001 启动

### 4. 配置前端

```bash
cd client

# 安装依赖
npm install
```

### 5. 启动前端

```bash
cd client
npm run dev
```

前端将在 http://localhost:5173 启动

## 📱 使用说明

1. 打开浏览器访问 http://localhost:5173
2. 选择您的身份（家长/托管机构/资源方/政府）
3. 注册新账号或使用测试账号登录

### 测试账号（需先执行数据库初始化）

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 托管机构 | admin_inst | 需重新设置 |
| 家长 | parent_wang | 需重新设置 |
| 资源方 | volunteer_li | 需重新设置 |
| 政府 | gov_chen | 需重新设置 |

> 注：测试数据中的密码为加密格式，建议通过注册功能创建新账号

## 🎨 界面预览

- **首页**：温暖的橙黄色调，四个身份卡片选择
- **托管机构后台**：完整的儿童管理、签到、安全检查功能
- **数据看板**：ECharts 图表展示项目影响力

## 📋 后续规划

- [ ] 微信小程序对接
- [ ] 文件/照片上传功能
- [ ] Excel 导出功能
- [ ] 需求地图与项目认领
- [ ] 在线直播课程
- [ ] 消息推送通知

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

💖 **智伴乡童，暖护童心** —— 守护乡村留守儿童身心健康与美好未来
