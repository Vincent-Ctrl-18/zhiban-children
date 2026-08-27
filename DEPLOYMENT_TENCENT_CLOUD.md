# 腾讯云部署：`vincentt.xyz/zbxt`

## 已确认的生产拓扑

- Nginx 配置：`/etc/nginx/sites-available/blog`
- 博客根路径：`127.0.0.1:3003`
- 旧智伴乡童：PM2 用户 `ubuntu`，进程 `zhiban-server`，端口 `3001`
- 旧目录：`/home/deploy/zhiban-children`（无 Git 提交，只作为回滚版本）
- 新智伴乡童：建议进程 `zhiban-server-v2`，端口 `3011`
- 数据库：MySQL `zhiban_children`，用户 `zhiban`

不要在旧目录执行 `git pull` 或覆盖部署。新版应克隆到新目录，健康检查通过后再切换 Nginx。

## 1. 备份

```bash
DEPLOY_STAMP="$(date +%Y%m%d-%H%M%S)"
sudo install -d -m 700 /var/backups/zhiban
sudo tar -C /home/deploy \
  -czf "/var/backups/zhiban/zhiban-runtime-$DEPLOY_STAMP.tar.gz" \
  zhiban-children
```

数据库备份会提示输入生产 `DB_PASSWORD`：

```bash
sudo mysqldump \
  -h localhost -P 3306 -u zhiban -p \
  --single-transaction --routines --triggers \
  zhiban_children | \
sudo gzip > "/var/backups/zhiban/zhiban-database-$DEPLOY_STAMP.sql.gz"
```

不要盲目重跑 `database/*.sql`；现有迁移脚本并非全部幂等。

## 2. 克隆与构建

将 `TARGET_COMMIT` 替换为待部署提交：

```bash
sudo -iu ubuntu
git clone https://github.com/Vincent-Ctrl-18/zhiban-children.git \
  /home/deploy/zhiban-children-v2
cd /home/deploy/zhiban-children-v2
git checkout TARGET_COMMIT
git rev-parse HEAD

cd server
npm ci --omit=dev

cd ../client
npm ci
npm run build
test -s dist/index.html
exit
```

## 3. 配置与持久化上传目录

```bash
sudo install -d -o ubuntu -g ubuntu -m 750 \
  /home/deploy/zhiban-data/uploads
sudo rsync -a \
  /home/deploy/zhiban-children/server/uploads/ \
  /home/deploy/zhiban-data/uploads/
sudo cp -a \
  /home/deploy/zhiban-children/server/.env \
  /home/deploy/zhiban-children-v2/server/.env
sudo chown ubuntu:ubuntu \
  /home/deploy/zhiban-children-v2/server/.env
sudo chmod 600 \
  /home/deploy/zhiban-children-v2/server/.env
sudo -u ubuntu nano \
  /home/deploy/zhiban-children-v2/server/.env
```

保留原数据库密码、JWT、SMTP 和 ARK Key，并确认：

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3011
PUBLIC_BASE_PATH=/zbxt
FRONTEND_URL=https://vincentt.xyz/zbxt
CORS_ORIGIN=https://vincentt.xyz
UPLOAD_DIR=/home/deploy/zhiban-data/uploads
ADMIN_USERNAME=新的管理员账号
ADMIN_PASSWORD=随机强密码
```

## 4. 启动旁路服务

```bash
sudo ss -ltnp | grep ':3011' || true
sudo -iu ubuntu pm2 start \
  /home/deploy/zhiban-children-v2/server/app.js \
  --name zhiban-server-v2 \
  --cwd /home/deploy/zhiban-children-v2/server
sudo -iu ubuntu pm2 save
curl -fsS http://127.0.0.1:3011/api/health
printf '\n'
```

失败时不要修改 Nginx：

```bash
sudo -iu ubuntu pm2 logs zhiban-server-v2 --nostream --lines 80
```

## 5. 发布静态文件

```bash
STATIC_RELEASE="/var/www/zbxt-releases/$DEPLOY_STAMP"
sudo install -d -o root -g www-data -m 755 "$STATIC_RELEASE"
sudo cp -a \
  /home/deploy/zhiban-children-v2/client/dist/. \
  "$STATIC_RELEASE/"
sudo chown -R root:www-data "$STATIC_RELEASE"
sudo find "$STATIC_RELEASE" -type d -exec chmod 755 {} \;
sudo find "$STATIC_RELEASE" -type f -exec chmod 644 {} \;
sudo ln -sfn "$STATIC_RELEASE" /var/www/zbxt
```

## 6. Nginx

```bash
NGINX_BACKUP="/etc/nginx/sites-available/blog.bak.zbxt-$DEPLOY_STAMP"
sudo cp -a /etc/nginx/sites-available/blog "$NGINX_BACKUP"
sudo nano /etc/nginx/sites-available/blog
```

在原有 `location /` 前加入：

```nginx
location = /zbxt {
    return 301 /zbxt/;
}

location ^~ /zbxt/api/ {
    client_max_body_size 510m;
    client_body_timeout 600s;
    proxy_pass http://127.0.0.1:3011/api/;
    proxy_http_version 1.1;
    proxy_request_buffering off;
    proxy_connect_timeout 30s;
    proxy_send_timeout 600s;
    proxy_read_timeout 600s;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location ^~ /zbxt/uploads/ {
    proxy_pass http://127.0.0.1:3011/uploads/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location ^~ /zbxt/ {
    root /var/www;
    try_files $uri $uri/ /zbxt/index.html;
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 7. 验收与旧服务下线

```bash
curl -sS -o /dev/null -w 'ZBXT root: HTTP %{http_code}\n' \
  https://vincentt.xyz/zbxt/
curl -fsS https://vincentt.xyz/zbxt/api/health
printf '\n'
curl -sS -o /dev/null -w 'Deep route: HTTP %{http_code}\n' \
  https://vincentt.xyz/zbxt/login/parent
curl -sS -o /dev/null -w 'Blog root: HTTP %{http_code}\n' \
  https://vincentt.xyz/
```

完成注册、登录、图片上传和课程预览检查后：

```bash
sudo -iu ubuntu pm2 stop zhiban-server
sudo -iu ubuntu pm2 save
```

## 8. 回滚

```bash
sudo cp -a "$NGINX_BACKUP" /etc/nginx/sites-available/blog
sudo nginx -t
sudo systemctl reload nginx
sudo -iu ubuntu pm2 stop zhiban-server-v2
sudo -iu ubuntu pm2 restart zhiban-server
sudo -iu ubuntu pm2 save
curl -fsS http://127.0.0.1:3001/api/health
printf '\n'
```
