-- 智伴乡童：作业辅导第一阶段会话与成果事件
-- 幂等执行；不修改现有 ai_chat_history 表。

USE zhiban_children;

CREATE TABLE IF NOT EXISTS ai_sessions (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    agent_type ENUM('homework', 'report', 'companion') NOT NULL DEFAULT 'homework',
    status ENUM('active', 'completed', 'abandoned') NOT NULL DEFAULT 'active',
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_ai_sessions_user_status (user_id, agent_type, status, last_active_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_messages (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    session_id BIGINT UNSIGNED NOT NULL,
    user_id INT NOT NULL,
    role ENUM('user', 'assistant') NOT NULL,
    content MEDIUMTEXT NOT NULL,
    image_path VARCHAR(500) NULL,
    reply_to_message_id BIGINT UNSIGNED NULL,
    request_id VARCHAR(100) NULL,
    sequence_no INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_messages_session FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_messages_reply FOREIGN KEY (reply_to_message_id) REFERENCES ai_messages(id) ON DELETE SET NULL,
    UNIQUE KEY uq_ai_messages_request_id (request_id),
    UNIQUE KEY uq_ai_messages_sequence (session_id, sequence_no),
    INDEX idx_ai_messages_session_time (session_id, created_at),
    INDEX idx_ai_messages_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_events (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    event_id CHAR(36) NOT NULL,
    event_name VARCHAR(80) NOT NULL,
    feature_code VARCHAR(40) NOT NULL,
    user_id INT NULL,
    user_role VARCHAR(30) NULL,
    session_id BIGINT UNSIGNED NULL,
    object_id VARCHAR(80) NULL,
    request_id VARCHAR(100) NULL,
    result ENUM('started', 'success', 'failure', 'completed', 'abandoned') NOT NULL,
    error_code VARCHAR(80) NULL,
    latency_ms INT UNSIGNED NULL,
    metadata JSON NULL,
    occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_product_events_event_id UNIQUE (event_id),
    CONSTRAINT uq_product_events_request UNIQUE (event_name, request_id),
    CONSTRAINT fk_product_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_product_events_session FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE SET NULL,
    INDEX idx_product_events_feature_time (feature_code, occurred_at),
    INDEX idx_product_events_user_time (user_id, occurred_at),
    INDEX idx_product_events_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
