-- 更新脚本：支持机构多用户登录
-- 运行命令: mysql -u root -p zhiban_children < update_institution_multi_user.sql

USE zhiban_children;

-- 1. 给 institutions 表添加邀请码字段
ALTER TABLE institutions 
ADD COLUMN invite_code VARCHAR(8) UNIQUE COMMENT '机构邀请码，用于员工加入';

-- 2. 给 users 表添加 institution_id 字段（机构员工关联）
ALTER TABLE users 
ADD COLUMN institution_id INT COMMENT '关联的机构ID（仅机构角色）',
ADD FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL;

-- 3. 为现有机构生成邀请码
UPDATE institutions 
SET invite_code = UPPER(SUBSTRING(MD5(RAND()), 1, 8)) 
WHERE invite_code IS NULL;

-- 4. 将现有机构用户关联到对应机构
UPDATE users u 
INNER JOIN institutions i ON i.user_id = u.id 
SET u.institution_id = i.id 
WHERE u.role = 'institution';

-- 5. 创建索引
CREATE INDEX idx_users_institution ON users(institution_id);
CREATE INDEX idx_institutions_invite_code ON institutions(invite_code);

SELECT '更新完成！现有机构的邀请码:' AS message;
SELECT id, name, invite_code FROM institutions;
