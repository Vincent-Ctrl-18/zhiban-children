# 智伴乡童 - 留守儿童关怀平台

> "智伴乡童，暖护童心" —— 以西南为重点辐射全国留守儿童身心健康成长赋能计划

聚焦云贵川与中国其他地区留守儿童情感陪伴缺失、成长支持不足等核心痛点，构建多方协同的长效关怀网络。

## 🌟 功能特性

### 六类用户角色
- **家长**：查看孩子活动记录、照片和机构通知
- **托管机构**：儿童管理、签到记录、安全检查、活动记录、通知发布
- **资源方**：资源登记（课程/物资/志愿者/资金）、状态跟踪
- **政府/捐赠方**：数据看板，查看项目影响力
- **学生**：AI 智能作业辅导、个性化学习报告、谈心伙伴
- **开发者（管理员）**：数据总览、资源审核、API 密钥管理、AI Prompt 管理

### 核心模块
1. **托管机构标准化运营**
   - 儿童信息登记与管理
   - 每日签到记录（签到/签退/缺勤）
   - 安全检查打卡表（10 项检查项）
   - 活动记录（支持多图上传）
   - 通知公告发布
   - 员工邀请码（多用户加入同一机构）

2. **家长端**
   - 孩子活动照片与记录
   - 机构通知接收
   - 数据隔离（仅限绑定孩子所在机构）

3. **资源对接**
   - 资源登记墙（课程/物资/志愿/资金/其他）
   - 资源浏览与筛选
   - 审核状态跟踪

4. **数据看板**
   - 服务儿童数、活动数、志愿者参与次数
   - 活动趋势图表、资源类型分布

5. **学生端 AI 智能服务**（基于豆包大模型）
   - 智能作业辅导（支持拍照识题）
   - 个性化学习报告生成
   - AI 谈心伙伴"小暖"

6. **开发者后台**（`/admin`）
   - 全平台数据统计
   - 资源提交审核（通过/拒绝 + 原因记录）
   - 豆包 API Key 管理与连接测试
   - AI Prompt 在线编辑与即时生效

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + Vite 5 |
| UI 组件库 | Ant Design 5 + @ant-design/icons |
| 图表 | ECharts 5 + echarts-for-react |
| 路由 | React Router DOM 6 |
| HTTP 请求 | Axios |
| 后端框架 | Node.js + Express 4 |
| 数据库 | MySQL 8.0 + mysql2 |
| 认证 | JWT (jsonwebtoken) |
| 文件上传 | Multer |
| AI 服务 | 豆包大模型 API（doubao-seed-1-8-251228） |

## 📦 项目结构

```
children/
├── client/                       # React 前端
│   ├── src/
│   │   ├── pages/
│   │   │   ├── institution/      # 托管机构（6 个页面）
│   │   │   ├── parent/           # 家长端
│   │   │   ├── resource/         # 资源方
│   │   │   ├── government/       # 政府端
│   │   │   ├── student/          # 学生端（4 个页面）
│   │   │   └── admin/            # 开发者后台
│   │   ├── services/api.js       # API 封装
│   │   ├── App.jsx               # 主应用 + 路由
│   │   └── index.css             # 全局样式
│   ├── vite.config.js            # Vite 配置（含代理）
│   └── package.json
├── server/                       # Node.js 后端
│   ├── routes/                   # 12 个 API 路由模块
│   ├── config/
│   │   ├── database.js           # MySQL 连接池
│   │   └── promptManager.js      # AI Prompt 配置引擎
│   ├── middleware/auth.js        # JWT 认证中间件
│   ├── uploads/                  # 上传文件存储
│   ├── app.js                    # 后端入口
│   ├── .env                      # 环境变量（不入库）
│   └── package.json
├── database/
│   ├── init.sql                  # 数据库初始化脚本
│   ├── update_institution_multi_user.sql
│   ├── update_add_student.sql
│   └── update_admin_features.sql
├── start.bat                     # Windows 一键启动脚本
└── README.md
```

---

## 🚀 部署指南

### 环境要求

| 工具 | 最低版本 | 用途 |
|------|----------|------|
| **Node.js** | 16+ | 运行前后端 |
| **npm** | 8+ | 包管理器（随 Node.js 安装） |
| **MySQL** | 8.0+ | 数据库 |
| **Git**（可选） | 任意 | 拉取代码 |

### 第一步：获取代码

```bash
# 方式一：Git 克隆
git clone https://github.com/Vincent-Ctrl-18/zhiban-children.git
cd zhiban-children

# 方式二：直接下载 ZIP 并解压
```

### 第二步：初始化数据库

1. 确保 MySQL 服务正在运行
2. 执行初始化脚本创建数据库和表：

```bash
mysql -u root -p < database/init.sql
```

3. 依次执行数据迁移脚本：

```bash
mysql -u root -p zhiban_children < database/update_institution_multi_user.sql
mysql -u root -p zhiban_children < database/update_add_student.sql
mysql -u root -p zhiban_children < database/update_admin_features.sql
```

> 💡 `update_admin_features.sql` 中的字段变更也会在后端启动时自动执行，但建议先手动执行确保一致性。

如果使用 MySQL Workbench 或 Navicat 等图形工具，也可以直接打开 SQL 文件后执行。

### 第三步：配置后端环境变量

```bash
cd server
```

复制示例配置文件并编辑：

```bash
# Linux / macOS
cp .env.example .env

# Windows (CMD)
copy .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env
```

编辑 `server/.env`，填入你的实际配置：

```env
# 数据库配置 —— 必须修改
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的MySQL密码        # ← 必须修改
DB_NAME=zhiban_children

# JWT 配置
JWT_SECRET=your_random_secret_key_here   # 建议修改为随机字符串
JWT_EXPIRES_IN=7d

# 服务器配置
PORT=3001

# 文件上传配置
UPLOAD_DIR=./uploads

# 豆包 AI API 配置（学生端智能服务，选填）
ARK_API_KEY=your_doubao_api_key_here     # 不填则学生端 AI 功能不可用
```

> ⚠️ `.env` 文件包含敏感信息，已在 `.gitignore` 中排除，不会提交到仓库。

### 第四步：安装依赖

后端和前端分别安装依赖：

```bash
# 安装后端依赖
cd server
npm install

# 安装前端依赖
cd ../client
npm install
```

### 第五步：启动服务

#### 方式一：分别启动（推荐开发时使用）

**终端 1** — 启动后端：
```bash
cd server
npm run dev          # 开发模式（nodemon 热重载）
# 或
npm start            # 生产模式
```

看到以下输出表示后端启动成功：
```
🌟 智伴乡童 - 留守儿童关怀平台后端服务
   服务地址: http://localhost:3001
   健康检查: http://localhost:3001/api/health
✅ 数据库连接成功
```

**终端 2** — 启动前端：
```bash
cd client
npm run dev
```

看到 `Local: http://localhost:5173/` 输出后，在浏览器打开该地址。

#### 方式二：一键启动（Windows）

双击项目根目录的 `start.bat`，脚本会自动：
1. 启动后端服务（新窗口）
2. 启动前端服务（新窗口）
3. 可选启动 Cloudflare Tunnel 公网访问

> 注意：`start.bat` 中的路径为开发者本地路径，如需使用请先修改 `NODE_PATH` 和 `PROJECT_PATH` 变量。

### 第六步：验证部署

1. **健康检查**：访问 http://localhost:3001/api/health ，应返回：
   ```json
   {"status":"ok","message":"智伴乡童服务运行正常","timestamp":"..."}
   ```

2. **打开前端**：访问 http://localhost:5173 ，看到角色选择页面

3. **注册测试**：选择任一角色注册账号并登录

4. **开发者后台**：访问 http://localhost:5173/admin ，使用管理员账号登录

---

## 🔧 可选配置

### 豆包 AI API（学生端智能服务）

学生端的 AI 功能（作业辅导、学习报告、谈心伙伴）依赖火山引擎豆包大模型 API：

1. 访问 [火山引擎控制台](https://console.volcengine.com/ark)
2. 开通模型服务 → 创建 API Key
3. 将 Key 填入 `server/.env` 的 `ARK_API_KEY` 字段
4. 或在开发者后台 `/admin` → API 密钥管理中在线配置

> 不配置 API Key 不影响其他功能使用，仅学生端 AI 功能不可用。

### Cloudflare Tunnel（公网访问）

临时将本地服务暴露到公网（适合演示）：

```bash
# 安装
winget install Cloudflare.cloudflared        # Windows
brew install cloudflare/cloudflare/cloudflared  # macOS

# 启动隧道
cloudflared tunnel --url http://localhost:5173

# 控制台会输出类似地址：
# https://random-name.trycloudflare.com
```

> 每次启动生成随机域名，仅适合临时演示。

### 前端生产构建

```bash
cd client
npm run build        # 输出到 client/dist/
npm run preview      # 本地预览生产构建
```

生产部署时可将 `dist/` 目录部署到 Nginx、Vercel 等静态托管服务，后端 API 通过反向代理转发。

---

## 📱 使用说明

1. 打开 http://localhost:5173
2. 选择身份（家长/托管机构/资源方/政府/学生）
3. 注册新账号并登录
4. 开发者后台：直接访问 `/admin`（不在角色选择页展示）

> 建议通过注册功能创建新账号测试各角色功能。

---

## ❓ 常见问题

### 后端启动报 `Access denied for user 'root'@'localhost'`
→ `server/.env` 文件中的 `DB_PASSWORD` 未正确设置，检查你的 MySQL root 密码。

### 后端启动报 `Unknown database 'zhiban_children'`
→ 还未执行数据库初始化脚本，先运行 `mysql -u root -p < database/init.sql`。

### 前端页面空白或404
→ 确保后端服务已启动且端口 3001 正常，Vite 代理依赖后端运行。

### 学生注册失败
→ 数据库 `users` 表可能缺少 `student` 角色，执行 `database/update_add_student.sql` 迁移。

### 开发者后台登录显示"接口不存在"
→ 后端可能未成功启动或路由未注册，检查终端是否有报错，确认 `server/routes/admin.js` 存在。

### AI 功能报 `未配置 ARK_API_KEY`
→ 在 `server/.env` 中配置 `ARK_API_KEY`，或在开发者后台 → API 密钥管理中在线设置。

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

💖 **智伴乡童，暖护童心** —— 守护乡村留守儿童身心健康与美好未来
