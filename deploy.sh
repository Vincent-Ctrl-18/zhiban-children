#!/bin/bash
# ================================================================
#  智伴乡童 - VPS 内部部署脚本 (已在项目目录下运行)
#  适用：Ubuntu 22.04 / Node.js + MySQL + Nginx + PM2
# ================================================================
set -e

# 自动获取当前脚本所在的项目根目录
APP_DIR=$(cd "$(dirname "$0")"; pwd)
SERVER_IP="193.134.211.233"

# ── 颜色输出 ──────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[✓] $1${NC}"; }
warn()    { echo -e "${YELLOW}[!] $1${NC}"; }
error()   { echo -e "${RED}[✗] $1${NC}"; exit 1; }
section() { echo -e "\n${GREEN}════════════════════════════════${NC}"; echo -e "${GREEN}  $1${NC}"; echo -e "${GREEN}════════════════════════════════${NC}"; }

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then 
  error "请使用 sudo 运行此脚本"
fi

# ================================================================
# 1. 系统更新与基础依赖
# ================================================================
section "1/7  系统更新"
apt-get update -y && apt-get install -y curl git nginx ufw openssl
info "系统依赖安装完成"

# ================================================================
# 2. 安装 Node.js 20 LTS
# ================================================================
section "2/7  安装 Node.js 20"
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 18 ]]; then
  info "正在安装 Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
info "Node $(node -v) / npm $(npm -v)"

# 安装 PM2
npm install -g pm2 2>/dev/null
info "PM2 $(pm2 -v)"

# ================================================================
# 3. 安装并配置 MySQL 8.0
# ================================================================
section "3/7  安装 MySQL"
if ! command -v mysql &>/dev/null; then
  apt-get install -y mysql-server
  systemctl enable mysql --now
fi

# 生成随机密码
MYSQL_ROOT_PASS=$(openssl rand -base64 16 | tr -dc 'A-Za-z0-9' | head -c 16)
DB_APP_USER="zbxt"
DB_APP_PASS=$(openssl rand -base64 16 | tr -dc 'A-Za-z0-9' | head -c 16)

# 配置数据库
mysql -u root <<SQL
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASS}';
CREATE DATABASE IF NOT EXISTS zhiban_children DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_APP_USER}'@'localhost' IDENTIFIED BY '${DB_APP_PASS}';
GRANT ALL PRIVILEGES ON zhiban_children.* TO '${DB_APP_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

cat > /root/.mysql_zbxt_creds <<EOF
MySQL root 密码: ${MYSQL_ROOT_PASS}
应用账号: ${DB_APP_USER}
应用密码: ${DB_APP_PASS}
EOF
chmod 600 /root/.mysql_zbxt_creds
info "MySQL 配置完成，凭据已存至 /root/.mysql_zbxt_creds"

# ================================================================
# 4. 路径验证 (替代原有的 Clone 步骤)
# ================================================================
section "4/7  验证项目路径"
info "当前项目路径: $APP_DIR"
if [ ! -d "$APP_DIR/server" ] || [ ! -d "$APP_DIR/client" ]; then
  error "错误：未能在当前目录找到 server 或 client 文件夹，请确保在项目根目录下运行。"
fi

# ================================================================
# 5. 初始化数据库表结构
# ================================================================
section "5/7  初始化数据库"
# 确保在项目根目录执行
cd $APP_DIR

# 检查 SQL 文件是否存在并导入
for sql_file in database/init.sql database/update_institution_multi_user.sql database/update_add_student.sql database/update_admin_features.sql; do
  if [ -f "$sql_file" ]; then
    mysql -u ${DB_APP_USER} -p${DB_APP_PASS} zhiban_children < "$sql_file"
    info "已导入: $sql_file"
  else
    warn "跳过: 未找到 $sql_file"
  fi
done

# ================================================================
# 6. 后端配置 & 启动
# ================================================================
section "6/7  部署后端"
cd $APP_DIR/server
npm install --production

JWT_SECRET=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32)

cat > .env <<EOF
DB_HOST=localhost
DB_PORT=3306
DB_USER=${DB_APP_USER}
DB_PASSWORD=${DB_APP_PASS}
DB_NAME=zhiban_children
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d
PORT=3001
UPLOAD_DIR=./uploads
ARK_API_KEY=your_doubao_api_key_here
SMTP_HOST=smtp.163.com
SMTP_PORT=465
SMTP_USER=peiyi26287@163.com
SMTP_PASS=PQkDAQKt4FSZNvsE
SMTP_FROM=智伴乡童 <peiyi26287@163.com>
FRONTEND_URL=http://${SERVER_IP}
EOF

mkdir -p uploads/courses uploads/activities

pm2 delete zbxt-server 2>/dev/null || true
pm2 start app.js --name zbxt-server --env production
pm2 save
info "后端已启动"

# ================================================================
# 7. 前端构建 & Nginx 配置
# ================================================================
section "7/7  构建前端 & 配置 Nginx"
cd $APP_DIR/client
npm install
npm run build
info "前端构建完成"

# 动态生成 Nginx 配置（注入当前 APP_DIR 路径）
cat > /etc/nginx/sites-available/zbxt <<NGINX
server {
    listen 80;
    server_name _;

    root ${APP_DIR}/client/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host \$host;
        client_max_body_size 500m;
    }

    client_max_body_size 500m;
}
NGINX

ln -sf /etc/nginx/sites-available/zbxt /etc/nginx/sites-enabled/zbxt
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
info "Nginx 配置完成"

# 防火墙
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable 2>/dev/null || true

section "部署成功！"
info "访问地址：http://${SERVER_IP}"