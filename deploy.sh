#!/bin/bash
# ================================================================
#  智伴乡童 - VPS 一键部署脚本
#  适用：Ubuntu 22.04 / Node.js + MySQL + Nginx + PM2
#  用法：bash deploy.sh
# ================================================================
set -e

REPO="https://github.com/Vincent-Ctrl-18/zhiban-children.git"
APP_DIR="/opt/zbxt"
SERVER_IP="193.134.211.233"

# ── 颜色输出 ──────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[✓] $1${NC}"; }
warn()    { echo -e "${YELLOW}[!] $1${NC}"; }
section() { echo -e "\n${GREEN}════════════════════════════════${NC}"; echo -e "${GREEN}  $1${NC}"; echo -e "${GREEN}════════════════════════════════${NC}"; }

# ================================================================
# 1. 系统更新与基础依赖
# ================================================================
section "1/7  系统更新"
apt-get update -y && apt-get install -y curl git nginx ufw
info "系统依赖安装完成"

# ================================================================
# 2. 安装 Node.js 20 LTS
# ================================================================
section "2/7  安装 Node.js 20"
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 18 ]]; then
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

# 生成随机 MySQL root 密码
MYSQL_ROOT_PASS=$(openssl rand -base64 16 | tr -dc 'A-Za-z0-9' | head -c 16)

# 设置 root 密码 + 创建数据库 + 创建应用专用账号
DB_APP_USER="zbxt"
DB_APP_PASS=$(openssl rand -base64 16 | tr -dc 'A-Za-z0-9' | head -c 16)

mysql -u root <<SQL
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASS}';
CREATE DATABASE IF NOT EXISTS zhiban_children DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_APP_USER}'@'localhost' IDENTIFIED BY '${DB_APP_PASS}';
GRANT ALL PRIVILEGES ON zhiban_children.* TO '${DB_APP_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

info "MySQL 配置完成  root密码: ${MYSQL_ROOT_PASS}"

# 保存 MySQL 凭据到 root 家目录
cat > /root/.mysql_zbxt_creds <<EOF
MySQL root 密码: ${MYSQL_ROOT_PASS}
应用账号: ${DB_APP_USER}
应用密码: ${DB_APP_PASS}
EOF
chmod 600 /root/.mysql_zbxt_creds
warn "MySQL 凭据已保存到 /root/.mysql_zbxt_creds，请妥善保管"

# ================================================================
# 4. 拉取代码
# ================================================================
section "4/7  拉取代码"
if [ -d "$APP_DIR/.git" ]; then
  cd $APP_DIR && git pull origin main
  info "代码已更新"
else
  rm -rf $APP_DIR
  git clone $REPO $APP_DIR
  info "代码克隆完成"
fi

# ================================================================
# 5. 初始化数据库
# ================================================================
section "5/7  初始化数据库"
cd $APP_DIR

mysql -u ${DB_APP_USER} -p${DB_APP_PASS} zhiban_children < database/init.sql
mysql -u ${DB_APP_USER} -p${DB_APP_PASS} zhiban_children < database/update_institution_multi_user.sql
mysql -u ${DB_APP_USER} -p${DB_APP_PASS} zhiban_children < database/update_add_student.sql
mysql -u ${DB_APP_USER} -p${DB_APP_PASS} zhiban_children < database/update_admin_features.sql
info "数据库初始化完成"

# ================================================================
# 6. 后端配置 & 启动
# ================================================================
section "6/7  部署后端"
cd $APP_DIR/server
npm install --production

# 生成 JWT_SECRET
JWT_SECRET=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32)

cat > .env <<EOF
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=${DB_APP_USER}
DB_PASSWORD=${DB_APP_PASS}
DB_NAME=zhiban_children

# JWT配置
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d

# 服务器配置
PORT=3001

# 文件上传
UPLOAD_DIR=./uploads

# 豆包AI（选填）
ARK_API_KEY=your_doubao_api_key_here

# 邮件SMTP
SMTP_HOST=smtp.163.com
SMTP_PORT=465
SMTP_USER=peiyi26287@163.com
SMTP_PASS=PQkDAQKt4FSZNvsE
SMTP_FROM=智伴乡童 <peiyi26287@163.com>

# 前端地址
FRONTEND_URL=http://${SERVER_IP}
EOF

# 创建上传目录
mkdir -p uploads/courses uploads/activities

# PM2 启动后端
pm2 delete zbxt-server 2>/dev/null || true
pm2 start app.js --name zbxt-server --env production
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash || true
info "后端已启动 (PM2)"

# ================================================================
# 7. 前端构建 & Nginx 配置
# ================================================================
section "7/7  构建前端 & 配置 Nginx"
cd $APP_DIR/client
npm install

# 生产构建（API 通过 Nginx 反代，无需改 vite 配置）
npm run build
info "前端构建完成 → client/dist/"

# Nginx 配置
cat > /etc/nginx/sites-available/zbxt <<'NGINX'
server {
    listen 80;
    server_name _;

    # 前端静态文件
    root /opt/zbxt/client/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 反代后端 API
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }

    # 反代上传文件（视频/PDF 等静态资源）
    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        client_max_body_size 500m;
        proxy_read_timeout 120s;
    }

    # 大文件上传限制
    client_max_body_size 500m;
}
NGINX

# 启用站点
ln -sf /etc/nginx/sites-available/zbxt /etc/nginx/sites-enabled/zbxt
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl enable nginx && systemctl restart nginx
info "Nginx 启动完成"

# ================================================================
# 防火墙放行
# ================================================================
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable 2>/dev/null || true

# ================================================================
# 完成 & 验证
# ================================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        部署完成！                        ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  访问地址：http://${SERVER_IP}    ║${NC}"
echo -e "${GREEN}║  健康检查：http://${SERVER_IP}/api/health║${NC}"
echo -e "${GREEN}║  MySQL 凭据：/root/.mysql_zbxt_creds     ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  常用运维命令：                          ║${NC}"
echo -e "${GREEN}║  pm2 logs zbxt-server  # 查看后端日志   ║${NC}"
echo -e "${GREEN}║  pm2 restart zbxt-server # 重启后端     ║${NC}"
echo -e "${GREEN}║  nginx -t && systemctl reload nginx      ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"

# 健康检查
sleep 2
if curl -sf http://127.0.0.1:3001/api/health &>/dev/null; then
  info "后端健康检查通过"
else
  warn "后端健康检查失败，请运行 pm2 logs zbxt-server 查看原因"
fi
