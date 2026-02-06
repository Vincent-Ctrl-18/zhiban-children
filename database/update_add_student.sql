-- 智伴乡童 - 添加学生角色 & AI聊天历史
-- 在已有数据库上执行此脚本以添加学生端支持

USE zhiban_children;

-- 1. 修改 users 表的 role ENUM，增加 student 角色
ALTER TABLE users MODIFY COLUMN role ENUM('parent', 'institution', 'resource', 'government', 'student') NOT NULL;

-- 2. 创建 AI 聊天记录表（可选，用于后续分析）
CREATE TABLE IF NOT EXISTS ai_chat_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL COMMENT '学生用户ID',
    chat_type ENUM('homework', 'report', 'companion') NOT NULL COMMENT '聊天类型：作业辅导/学习报告/谈心陪伴',
    user_message TEXT COMMENT '用户消息',
    ai_reply TEXT COMMENT 'AI回复',
    has_image BOOLEAN DEFAULT FALSE COMMENT '是否包含图片',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. 创建索引
CREATE INDEX idx_chat_history_user ON ai_chat_history(user_id);
CREATE INDEX idx_chat_history_type ON ai_chat_history(chat_type);
CREATE INDEX idx_chat_history_date ON ai_chat_history(created_at);

-- 4. 插入学生测试用户（密码均为 123456）
INSERT INTO users (username, password, role, real_name, phone, organization) VALUES
('student_xiaoming', '$2b$10$rQZ5lN.vYZ1HhJmT0P1kLOJhqKqLqLqLqLqLqLqLqLqLqLqLqLqLq', 'student', '小明同学', '13800138010', '盘龙小学');
