# 智伴乡童 - macOS 部署指南

本文档专门针对 macOS 用户，提供详细的部署步骤。

## 📋 环境准备

在开始之前，请确保您的 macOS 已安装以下软件。如果没有，可以使用 [Homebrew](https://brew.sh/) 快速安装：

1.  **Node.js** (推荐 v18 或更高版本)
    ```bash
    brew install node
    ```

2.  **MySQL** (推荐 8.0 或更高版本)
    ```bash
    brew install mysql
    brew services start mysql
    ```

3.  **Git**
    ```bash
    brew install git
    ```

## 🚀 部署步骤

### 1. 克隆项目

打开终端，执行以下命令将项目克隆到本地：

```bash
git clone https://github.com/Vincent-Ctrl-18/zhiban-children.git
cd zhiban-children
```

### 2. 数据库初始化

确保 MySQL 服务已启动。

1.  登录 MySQL（默认 root 用户通常无密码，如果设置了密码请使用 `-p` 参数）：
    ```bash
    mysql -u root < database/init.sql
    ```
    *注意：如果遇到 `Access denied` 错误，请尝试 `mysql -u root -p < database/init.sql` 并输入密码。*

### 3. 后端服务配置与启动

1.  进入服务端目录并安装依赖：
    ```bash
    cd server
    npm install
    ```

2.  配置环境变量：
    复制示例配置文件：
    ```bash
    cp .env.example .env
    ```

    使用文本编辑器打开 `.env` 文件，确认数据库配置。如果您使用的是默认 Homebrew 安装的 MySQL 且未设置密码，配置如下：
    ```env
    DB_HOST=localhost
    DB_PORT=3306
    DB_USER=root
    DB_PASSWORD=          # 留空
    DB_NAME=zhiban_children
    JWT_SECRET=zhiban_children_secret_key_2024 # 建议修改为随机字符串
    PORT=3001
    UPLOAD_DIR=./uploads
    ```

3.  启动后端服务：
    ```bash
    npm run dev
    ```
    如果看到 "✅ 数据库连接成功" 字样，说明后端启动成功。服务运行在 `http://localhost:3001`。

### 4. 前端服务配置与启动

1.  打开一个新的终端窗口（保持后端服务运行），进入客户端目录并安装依赖：
    ```bash
    cd client
    npm install
    ```

2.  启动前端服务：
    ```bash
    npm run dev
    ```

3.  服务启动后，终端会显示访问地址，通常为：
    👉 [http://localhost:5173](http://localhost:5173)

## 📱 使用说明

打开浏览器访问 [http://localhost:5173](http://localhost:5173)。

您可以选择以下身份进行测试（默认测试账号）：

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 托管机构 | admin_inst | (需重置或注册新号) |
| 家长 | parent_wang | (需重置或注册新号) |
| 资源方 | volunteer_li | (需重置或注册新号) |
| 政府 | gov_chen | (需重置或注册新号) |

*建议直接使用注册功能创建新账号进行体验。*

## ❓ 常见问题

**Q: MySQL 连接报错 `Client does not support authentication protocol`?**
A: 这通常是因为 MySQL 8.0 使用了新的密码加密方式。请尝试进入 MySQL 控制台执行：
```sql
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'your_password';
FLUSH PRIVILEGES;
```
并在 `.env` 中更新密码。

**Q: 端口被占用？**
A: 请检查是否有其他服务占用了 3001 (后端) 或 5173 (前端) 端口，或者在 `.env` (后端) 和 `package.json` (前端) 中修改端口配置。
