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
