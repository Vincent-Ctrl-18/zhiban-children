# 智伴乡童 - 开发备忘录

## 项目概述

**项目名称**: 智伴乡童 - 留守儿童关怀平台  
**项目类型**: 全栈Web应用  
**开发日期**: 2026年2月

## 技术栈

### 前端
- **框架**: React 18 + Vite 5
- **UI库**: Ant Design 5
- **路由**: React Router DOM
- **日期处理**: Day.js
- **开发端口**: 5173

### 后端
- **运行时**: Node.js
- **框架**: Express
- **数据库**: MySQL 8.0
- **数据库名**: `zhiban_children`
- **服务端口**: 3001

> ⚠️ 数据库密码等敏感信息请在 `server/.env` 文件中配置，参考 `server/.env.example`

### 项目结构
```
children/
├── client/                 # 前端代码
│   ├── src/
│   │   ├── pages/         # 页面组件
│   │   │   ├── parent/    # 家长端页面
│   │   │   ├── institution/ # 机构端页面
│   │   │   ├── resource/  # 资源方页面
│   │   │   └── government/ # 政府端页面
│   │   ├── services/      # API服务
│   │   └── App.jsx        # 主应用
│   └── vite.config.js     # Vite配置
├── server/                 # 后端代码
│   ├── routes/            # API路由
│   ├── config/            # 配置文件
│   ├── middleware/        # 中间件
│   ├── uploads/           # 上传文件存储
│   ├── app.js             # 主入口
│   └── .env               # 环境变量
└── README.md
```

## 用户角色

1. **家长 (parent)** - 查看孩子信息、活动记录、接收通知
2. **托管机构 (institution)** - 管理儿童、记录活动、发布通知
3. **资源提供方 (resource)** - 提供教育资源
4. **政府监管 (government)** - 数据统计、监管审批
5. **学生 (student)** - AI 智能作业辅导、个性化学习报告、谈心陪伴
6. **开发者 (admin)** - 数据总览、资源审核、API 密钥管理、AI Prompt 管理

## 已实现功能

### 家长端
- [x] 查看绑定孩子信息（显示托管机构名称）
- [x] 查看活动记录（仅限绑定孩子所在机构）
- [x] 查看活动详情和照片
- [x] 接收机构通知（仅限绑定孩子所在机构的公开通知）
- [x] 查看通知详情
- [x] 数据隔离：不同机构的家长数据完全隔离

### 机构端
- [x] 儿童信息管理（CRUD）
- [x] 家长-孩子绑定功能
- [x] 活动记录管理
- [x] 活动照片上传（支持多图）
- [x] 通知公告发布
- [x] 员工邀请码机制（多用户加入同一机构）

## 已修复的Bug

### 1. JSON.parse 解析错误 (家长Dashboard白屏)
**问题**: `activity.photos` 可能是空字符串、null、数组或无效JSON  
**解决**: 添加 `safeParsePhotos()` 安全解析函数
```javascript
const safeParsePhotos = (photos) => {
  if (!photos) return [];
  if (Array.isArray(photos)) return photos;
  if (typeof photos === 'string') {
    try {
      const parsed = JSON.parse(photos);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};
```

### 2. 活动照片上传后丢失
**问题**: Ant Design Upload 组件的 `onChange` 在 `onSuccess` 之后被调用，覆盖了 URL  
**解决**: 在 `handleUploadChange` 中检查 `file.response?.url` 并复制到 `file.url`
```javascript
const handleUploadChange = ({ file, fileList: newFileList }) => {
  const updatedFileList = newFileList.map(f => {
    if (f.uid === file.uid && file.status === 'done' && file.response?.url) {
      return { ...f, status: 'done', url: file.response.url };
    }
    if (f.url) return f;
    return f;
  });
  setFileList(updatedFileList);
};
```

### 3. 编辑活动时照片不显示
**问题**: MySQL2 驱动自动将 JSON 字段解析为数组，再次 `JSON.parse()` 会失败  
**解决**: 后端检查 photos 是否已经是数组
```javascript
if (activity.photos) {
  if (Array.isArray(activity.photos)) {
    // 已经是数组，不需要处理
  } else if (typeof activity.photos === 'string') {
    activity.photos = JSON.parse(activity.photos);
  }
}
```

### 4. 图片无法显示
**问题**: 前端通过 Vite 服务器(5173)访问，图片在后端(3001)  
**解决**: 在 `vite.config.js` 添加 `/uploads` 代理
```javascript
proxy: {
  '/api': { target: 'http://localhost:3001', changeOrigin: true },
  '/uploads': { target: 'http://localhost:3001', changeOrigin: true }
}
```

### 5. 日期时区偏移问题
**问题**: MySQL DATE 字段返回 UTC 时间，`slice(0,10)` 会得到前一天日期  
**解决**: 使用 JavaScript Date 对象的本地时区方法
```javascript
// 显示日期
render: (date) => {
  if (!date) return '-';
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 编辑时加载日期
const date = new Date(activity.activity_date);
activityDate = dayjs(date);
```

## 启动命令

### 启动后端
```bash
cd server
npm install
npm start
# 或开发模式
npm run dev
```

### 启动前端
```bash
cd client
npm install
npm run dev
```

### 数据库操作
```bash
# 连接MySQL
mysql -u root -p zhiban_children

# 查看活动数据
SELECT id, title, photos FROM activities;
```

## 关键文件

| 文件 | 说明 |
|------|------|
| `client/src/pages/parent/Dashboard.jsx` | 家长端首页 |
| `client/src/pages/institution/ActivityRecord.jsx` | 机构活动记录管理 |
| `server/routes/activities.js` | 活动API |
| `server/routes/notifications.js` | 通知API |
| `server/routes/children.js` | 儿童管理API |
| `server/routes/upload.js` | 文件上传API |
| `client/vite.config.js` | Vite配置（含代理） |
| `server/.env` | 环境变量配置 |

## 注意事项

1. **时区处理**: 所有日期显示都需要考虑 UTC 到本地时区的转换
2. **JSON字段**: MySQL 的 JSON 字段在 mysql2 驱动中会自动解析，不要重复 `JSON.parse`
3. **文件上传**: 上传的文件存储在 `server/uploads/` 目录，按日期分文件夹
4. **数据隔离**: 家长只能看到绑定孩子所在机构的数据
5. **Vite代理**: 修改 `vite.config.js` 后需要重启前端服务器

## 后续待优化

- [ ] 图片压缩处理
- [ ] 分页加载
- [ ] 消息推送通知
- [ ] 移动端适配优化
- [ ] 豆包 AI API Key 配置（当前为占位符）
- [ ] ai_chat_history 表的实际使用（已建表，暂未对接）
- [ ] 清理孤立文件 `government/ResourceAudit.jsx`（审核已迁至管理后台）

---

## 2026年2月7日更新 - 学生端 + 开发者后台 + Bug修复

### 一、新增用户角色：学生端

新增 **学生 (student)** 角色，面向留守儿童，提供 AI 智能辅导服务（基于豆包大模型 API）。

#### 新增前端页面

| 文件 | 说明 |
|------|------|
| `client/src/pages/student/Dashboard.jsx` | 学习中心首页，功能卡片导航 + 学习小贴士 |
| `client/src/pages/student/HomeworkHelp.jsx` | AI 作业辅导，支持对话式交互 + 图片上传识题 |
| `client/src/pages/student/LearningReport.jsx` | AI 学习报告生成，按科目/时间段分析 |
| `client/src/pages/student/ChatCompanion.jsx` | AI 谈心伙伴"小暖"，提供情感陪伴 |

#### 新增后端路由

| 文件 | 说明 |
|------|------|
| `server/routes/ai.js` | 豆包 AI API 代理（192行），含 3 个端点 |

**AI 接口详情：**
- `POST /api/ai/homework` — 作业辅导（支持多模态，图片+文字）
- `POST /api/ai/learning-report` — 学习报告生成
- `POST /api/ai/chat` — 多轮对话谈心伙伴

**AI 配置：**
- API 地址：`https://ark.cn-beijing.volces.com/api/v3/chat/completions`
- 模型：`doubao-seed-1-8-251228`
- API Key 通过 `.env` 中的 `ARK_API_KEY` 配置
- 使用 `node-fetch@3`（ESM 动态导入兼容 CommonJS）

#### 数据库变更

| 文件 | 说明 |
|------|------|
| `database/update_add_student.sql` | 迁移脚本（已执行） |

变更内容：
```sql
-- users 表 role ENUM 新增 'student'
ALTER TABLE users MODIFY COLUMN role ENUM('parent','institution','resource','government','student');

-- 新增 AI 对话历史表
CREATE TABLE ai_chat_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  session_type ENUM('homework','report','chat'),
  messages JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### 前端修改

| 文件 | 修改内容 |
|------|----------|
| `client/src/App.jsx` | 新增 student 菜单配置、学生端路由（4个页面） |
| `client/src/pages/RoleSelection.jsx` | 新增学生角色选择卡片 + ReadOutlined 图标 + 导航链接 |
| `client/src/pages/Register.jsx` | 学生注册支持：角色名映射、学校/年级字段 |
| `client/src/pages/Login.jsx` | 学生登录配置 + ReadOutlined 图标 |
| `client/src/services/api.js` | 新增 `aiApi` 对象（homeworkHelp / learningReport / chat） |

---

### 二、新增开发者后台（/admin）

独立于用户系统的开发者管理面板，不在首页角色选择中显示，通过直接访问 `/admin` 进入。

**访问方式**: `http://localhost:5173/admin`  
**登录凭据**: 用户名 `admin` / 密码 `asdfghjkl;'`（硬编码，不使用数据库）

#### 新增文件

| 文件 | 说明 |
|------|------|
| `client/src/pages/admin/AdminLogin.jsx` | 管理员登录页，暗色主题 |
| `client/src/pages/admin/AdminPanel.jsx` | 管理面板主体（~400行），含 3 个功能 Tab |
| `server/routes/admin.js` | 管理后端 API（219行） |

#### 管理面板功能

**Tab 1 — 数据看板**
- 用户分布统计（各角色数量）
- 业务数据概览（儿童数、活动数、签到数、安全检查数）
- 资源审核状态分布

**Tab 2 — 资源审核**
- 查看待审核/已通过/已拒绝资源列表
- 按状态筛选
- 审核通过/拒绝操作

**Tab 3 — API Key 管理**
- 查看当前豆包 API Key（脱敏显示）
- 在线更新 API Key（直接修改 `.env` 文件）

#### 后端 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/admin/login` | 管理员登录，返回 JWT（12小时有效） |
| GET | `/api/admin/statistics` | 全平台数据统计 |
| GET | `/api/admin/api-key` | 获取当前 API Key（脱敏） |
| POST | `/api/admin/api-key` | 更新 API Key |
| GET | `/api/admin/resources` | 获取资源列表（支持状态筛选） |
| POST | `/api/admin/resources/:id/approve` | 审核资源 |

#### 认证机制
- 独立的 `authenticateAdmin` 中间件，检查 JWT 中 `role === 'admin'`
- 前端使用独立的 `adminUser` / `adminToken` localStorage 键
- `api.js` 中新增 `adminApi` 对象，手动附加 admin token

#### 前端路由变更
- `/admin` 路径在 `App.jsx` 中优先匹配（在用户登录检查之前）
- Admin 路由完全独立，不经过用户认证流程
- 政府端菜单中移除了"资源审核"入口（审核功能迁至管理后台）

#### 样式新增
`client/src/index.css` 新增：
- `.admin-login-page` — 暗色渐变背景
- `.admin-login-card` — 半透明登录卡片
- `.admin-login-icon` — 管理员图标样式

---

### 三、Bug 修复

#### Bug 1：开发者后台登录显示"接口不存在"
**现象**: 访问 `/admin` 登录后提示 API 404  
**根因**: `dotenv.config()` 默认从 `process.cwd()` 查找 `.env`，用绝对路径启动 Node 时工作目录不在 `server/`，导致 `.env` 加载失败 → 数据库连接失败 → 服务器实际未正常运行  
**修复**: 修改以下文件中的 `dotenv.config()` 为绝对路径加载：
- `server/app.js` — `dotenv.config({ path: path.join(__dirname, '.env') })`
- `server/config/database.js` — `dotenv.config({ path: path.join(__dirname, '..', '.env') })`
- `server/middleware/auth.js` — `dotenv.config({ path: path.join(__dirname, '..', '.env') })`

#### Bug 2：学生端无法正常注册
**现象**: 注册学生角色时数据库报错  
**根因**: MySQL `users` 表的 `role` 字段 ENUM 类型仅有 `('parent','institution','resource','government')`，缺少 `'student'`。`database/update_add_student.sql` 迁移脚本已创建但未执行。  
**修复**: 执行了 `ALTER TABLE users MODIFY COLUMN role ENUM(...)` 添加 `student` 角色

---

### 四、当前项目结构（更新后）

```
children/
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── parent/         # 家长端
│   │   │   ├── institution/    # 机构端（6个页面）
│   │   │   ├── resource/       # 资源方（Dashboard + ResourceRegister）
│   │   │   ├── government/     # 政府端（Dashboard）
│   │   │   ├── student/        # 🆕 学生端（4个页面）
│   │   │   │   ├── Dashboard.jsx
│   │   │   │   ├── HomeworkHelp.jsx
│   │   │   │   ├── LearningReport.jsx
│   │   │   │   └── ChatCompanion.jsx
│   │   │   └── admin/          # 🆕 开发者后台（2个页面）
│   │   │       ├── AdminLogin.jsx
│   │   │       └── AdminPanel.jsx
│   │   ├── services/api.js     # API 服务（含 adminApi + aiApi）
│   │   └── App.jsx             # 主应用路由
│   └── vite.config.js
├── server/
│   ├── routes/
│   │   ├── auth.js
│   │   ├── children.js
│   │   ├── checkin.js
│   │   ├── safety.js
│   │   ├── activities.js
│   │   ├── resources.js
│   │   ├── statistics.js
│   │   ├── notifications.js
│   │   ├── parents.js
│   │   ├── upload.js
│   │   ├── ai.js               # 🆕 豆包 AI 代理
│   │   └── admin.js            # 🆕 开发者后台 API
│   ├── config/database.js
│   ├── middleware/auth.js
│   ├── app.js
│   └── .env                    # 含 ARK_API_KEY 配置
└── database/
    ├── init.sql
    ├── update_institution_multi_user.sql
    └── update_add_student.sql   # 🆕 学生角色迁移脚本
```

### 五、用户角色（更新后）

| 角色 | 标识 | 说明 |
|------|------|------|
| 家长 | `parent` | 查看孩子信息、活动、通知 |
| 托管机构 | `institution` | 管理儿童、记录活动、发布通知 |
| 资源方 | `resource` | 提供教育资源 |
| 政府 | `government` | 数据统计监管 |
| 学生 | `student` | 🆕 AI 作业辅导、学习报告、谈心伙伴 |
| 管理员 | `admin` | 🆕 开发者后台（不存在于数据库，JWT 生成） |

### 六、关键文件速查（更新后）

| 文件 | 说明 |
|------|------|
| `client/src/pages/admin/AdminPanel.jsx` | 开发者后台面板 |
| `client/src/pages/student/HomeworkHelp.jsx` | AI 作业辅导页面 |
| `client/src/pages/student/ChatCompanion.jsx` | AI 谈心伙伴页面 |
| `server/routes/admin.js` | 管理后台 API（登录/统计/审核/Key管理） |
| `server/routes/ai.js` | 豆包 AI 代理（作业/报告/聊天） |
| `client/src/services/api.js` | 全部 API 封装（含 adminApi、aiApi） |

### 七、注意事项补充

1. **dotenv 路径**: 所有 `dotenv.config()` 必须使用 `__dirname` 拼接绝对路径，否则从非 `server/` 目录启动时会找不到 `.env`
2. **Admin 认证**: 管理员使用独立的认证流程和 localStorage 键，与普通用户完全隔离
3. **数据库迁移**: 新增角色或表时，记得在实际数据库中执行 SQL 迁移脚本
4. **node-fetch**: AI 路由使用 `node-fetch@3`（ESM），通过动态 `import()` 在 CommonJS 中加载
5. **服务器启动**: 推荐使用 `cd server && node app.js` 或 `Start-Process node "server/app.js" -WorkingDirectory server/`，避免工作目录问题

---

## 2026年2月7日更新（二）- 开发者后台功能增强

### 一、资源审核功能完善

**问题**：数据库 `resources` 表 `status` ENUM 缺少 `'rejected'`，拒绝操作静默失败；前端拒绝理由未传到后端。

**修复内容**：
- `server/routes/admin.js` 添加**自动迁移逻辑**：服务器启动时自动为 resources 表补充 `rejected` 枚举值，新增 `reject_reason`、`reviewed_at`、`reviewed_by` 字段
- 审核端点 `POST /resources/:id/approve` 现在接收 `rejectReason` 参数，同时记录审核时间和审核人
- 前端拒绝弹窗的理由现在正确传递到后端
- 资源详情弹窗新增审核时间、拒绝原因的展示

#### 数据库变更

| 文件 | 说明 |
|------|------|
| `database/update_admin_features.sql` | 🆕 迁移脚本（由 admin.js 自动执行） |

```sql
-- resources 表变更
ALTER TABLE resources MODIFY COLUMN status ENUM('pending','approved','rejected','matched','completed');
ALTER TABLE resources ADD COLUMN reject_reason VARCHAR(500);
ALTER TABLE resources ADD COLUMN reviewed_at TIMESTAMP NULL;
ALTER TABLE resources ADD COLUMN reviewed_by VARCHAR(50);
```

### 二、API Key 管理增强

**新增**：连接测试功能
- 后端新增 `POST /api/admin/api-key/test` — 用极小请求调用豆包 API 验证 Key 有效性
- 前端 `ApiKeyTab` 新增 **🔬 连接测试** 按钮，实时显示测试结果（成功/失败 + 状态码）

### 三、AI Prompt 管理模块（全新）

将 3 个 AI 功能的 System Prompt 从硬编码改为可在管理后台在线编辑、即时生效。

#### 新增文件

| 文件 | 说明 |
|------|------|
| `server/config/promptManager.js` | Prompt 读写引擎，支持获取/更新/重置，配置持久化到 `ai-prompts.json` |
| `server/config/ai-prompts.json` | Prompt 配置存储文件（首次启动自动生成） |

#### 后端新增 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/prompts` | 获取全部 Prompt 配置 |
| PUT | `/api/admin/prompts/:type` | 更新单个 Prompt（type: homework / learningReport / chat） |
| POST | `/api/admin/prompts/reset` | 重置 Prompt（传 type 重置单个，不传重置全部） |

每个 Prompt 配置包含：`name`（功能名称）、`role`（AI 角色名）、`description`（描述）、`systemPrompt`（提示词）、`maxTokens`（上限）、`temperature`（温度）

#### AI 路由改造

`server/routes/ai.js` 的 3 个端点（homework / learning-report / chat）的 system prompt 从硬编码改为从 `promptManager` 动态读取，`callDoubaoAPI` 新增 `temperature` 参数支持。

#### 前端管理界面

管理面板新增第 4 个 Tab **🤖 AI Prompt**：
- 以卡片形式展示 3 个 AI 功能的配置概览（名称、角色、描述、Prompt 预览、参数标签）
- 点击「编辑」弹出完整编辑弹窗：
  - 修改功能名称 / AI 角色名 / 功能描述
  - System Prompt 编辑器（等宽字体 + 实时字数统计）
  - Slider + InputNumber 调节 maxTokens（100~8000）和 temperature（0~2）
- 支持单个重置 / 全部重置为系统默认值
- **所有修改即时生效，无需重启服务器**

### 四、侧边栏暗色主题修复

**问题**：Ant Design 5 的 `theme="dark"` 属性不再可靠传递暗色样式，导致侧边栏菜单项文字为白色但背景也是白色，菜单不可见。

**修复**：使用 `ConfigProvider` 的 `darkAlgorithm` 包裹 Sider，让所有子组件获得正确的暗色主题 token：
```jsx
<ConfigProvider theme={{ algorithm: antTheme.darkAlgorithm, token: { colorPrimary: '#6c5ce7', colorBgContainer: '#1a1a2e', colorBgElevated: '#252547' } }}>
  <Sider>...</Sider>
</ConfigProvider>
```

### 五、修改文件汇总

| 文件 | 修改内容 |
|------|----------|
| `server/config/promptManager.js` | 🆕 Prompt 管理引擎 |
| `database/update_admin_features.sql` | 🆕 资源表审核字段迁移脚本 |
| `server/routes/admin.js` | 自动迁移 + 审核带原因 + API Key 测试 + Prompt CRUD 端点 |
| `server/routes/ai.js` | 3 个 AI 接口改用 promptManager 动态读取 Prompt |
| `client/src/services/api.js` | 新增 testApiKey / Prompt 管理系列 API |
| `client/src/pages/admin/AdminPanel.jsx` | 新增 PromptTab + API Key 测试 + 审核详情增强 + 暗色主题修复 |

---

## 2026年2月4日更新 - GitHub托管与公网访问

### 新增文件

| 文件 | 说明 |
|------|------|
| `.gitignore` | Git忽略配置，排除 node_modules、.env、uploads 等 |
| `server/.env.example` | 环境变量模板，供协作者参考配置 |

### 修改内容

#### 1. vite.config.js - 支持局域网和公网访问
```javascript
server: {
  port: 5173,
  host: '0.0.0.0',  // 允许局域网访问
  allowedHosts: ['localhost', '.trycloudflare.com'],  // 允许 Cloudflare Tunnel 域名
  proxy: { ... }
}
```

#### 2. start.bat - 新增 Cloudflare Tunnel 选项
- 启动后询问是否启用公网访问
- 输入 Y 自动启动 Cloudflare Tunnel
- 公网地址显示在新窗口中

#### 3. DEVELOPMENT_NOTES.md - 清理敏感信息
- 移除数据库密码和本地绝对路径
- 改用通用的启动命令

### GitHub 仓库

- **地址**: https://github.com/Vincent-Ctrl-18/zhiban-children
- **分支**: main

### Cloudflare Tunnel 使用方法

1. 安装（已完成）: `winget install Cloudflare.cloudflared`
2. 启动隧道: 
   ```bash
   cloudflared tunnel --url http://localhost:5173
   ```
3. 获取公网地址: 控制台输出 `https://xxx.trycloudflare.com`

> ⚠️ Quick Tunnel 每次启动生成新的随机域名，适合临时演示

---

## UI 优化记录（2026-02-07）

### 学生端 & 开发者后台 UI 统一优化

新增的学生端（4 个页面）和开发者后台（2 个页面）按照已有设计系统进行了统一美化：

#### 开发者后台 (admin)
- **AdminLogin.jsx**: 登录页增加暗色辉光背景、渐变登录按钮、安全提示底栏
- **AdminPanel.jsx**: 
  - 侧栏去掉暗色主题，改为白色背景 + 黑色文字（light theme）
  - 所有 emoji（📊📋🔑🤖👥📈🎁📖🔬）替换为 Ant Design 图标
  - Card 标题字体统一加大至 17px/600 weight
  - 移除不必要的 `ConfigProvider` darkAlgorithm 包裹

#### 学生端 (student)
- **Dashboard.jsx**: 使用 `.page-title-bar` 统一页面标题；去除每日语录中的 emoji；颜色硬编码改为 CSS 变量
- **ChatCompanion.jsx**: 页面标题改用 `.page-title-bar`；欢迎消息/错误提示中的 emoji 替换为图标组件
- **HomeworkHelp.jsx**: 页面标题统一；空状态 emoji 移除
- **LearningReport.jsx**: 页面标题统一；颜色统一为 CSS 变量

#### 全局样式 (index.css)
- 登录页精装版样式（辉光背景 + 渐变按钮 + 安全底栏）
- 学生/聊天/作业/报告页面容器限宽 `max-width: 1100px`
- 聊天气泡颜色统一为 CSS 变量
- 功能卡片动画加入 `ease-out-expo` 缓动
- 首页服务入口卡片改为 flex 布局（上 3 下 2 居中对齐）
- 新增移动端响应式断点

