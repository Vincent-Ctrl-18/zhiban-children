-- AI 会话记忆与历史体验专项增量迁移
-- 幂等执行；不删除现有 ai_sessions、ai_messages、ai_chat_history 数据。
USE zhiban_children;

ALTER TABLE ai_sessions
  ADD COLUMN IF NOT EXISTS parent_session_id BIGINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS summary_json JSON NULL,
  ADD COLUMN IF NOT EXISTS summarized_through_sequence INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS summary_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS title_source ENUM('automatic', 'user') NOT NULL DEFAULT 'automatic';

CREATE TABLE IF NOT EXISTS ai_generation_requests (
    request_id VARCHAR(100) PRIMARY KEY,
    user_id INT NOT NULL,
    session_id BIGINT UNSIGNED NOT NULL,
    user_message_id BIGINT UNSIGNED NULL,
    assistant_message_id BIGINT UNSIGNED NULL,
    agent_type ENUM('homework', 'report', 'companion') NOT NULL,
    status ENUM('pending', 'succeeded', 'failed', 'stopped') NOT NULL DEFAULT 'pending',
    error_code VARCHAR(80) NULL,
    latency_ms INT UNSIGNED NULL,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_generation_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_generation_session FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_generation_user_message FOREIGN KEY (user_message_id) REFERENCES ai_messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_generation_assistant_message FOREIGN KEY (assistant_message_id) REFERENCES ai_messages(id) ON DELETE SET NULL,
    INDEX idx_ai_generation_session (session_id, started_at),
    INDEX idx_ai_generation_user (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_user_memories (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    memory_type ENUM('grade', 'learning_goal', 'response_preference', 'subject_interest', 'knowledge_gap', 'mastered_topic') NOT NULL,
    content VARCHAR(500) NOT NULL,
    normalized_key VARCHAR(180) NOT NULL,
    subject VARCHAR(40) NULL,
    source_agent_type ENUM('homework', 'report') NOT NULL,
    source_session_id BIGINT UNSIGNED NULL,
    source_message_id BIGINT UNSIGNED NULL,
    confidence DECIMAL(4,3) NOT NULL DEFAULT 0.800,
    evidence_count SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    user_edited TINYINT(1) NOT NULL DEFAULT 0,
    first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_confirmed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ai_user_memory (user_id, memory_type, normalized_key),
    INDEX idx_ai_user_memory_lookup (user_id, status, memory_type, subject, last_confirmed_at),
    CONSTRAINT fk_ai_user_memory_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_user_memory_session FOREIGN KEY (source_session_id) REFERENCES ai_sessions(id) ON DELETE SET NULL,
    CONSTRAINT fk_ai_user_memory_message FOREIGN KEY (source_message_id) REFERENCES ai_messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE ai_user_memories
  ADD COLUMN IF NOT EXISTS evidence_count SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER confidence;

CREATE TABLE IF NOT EXISTS ai_memory_settings (
    user_id INT PRIMARY KEY,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_memory_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_memory_suppressions (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    memory_key_hash CHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ai_memory_suppression (user_id, memory_key_hash),
    CONSTRAINT fk_ai_memory_suppression_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_memory_jobs (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    session_id BIGINT UNSIGNED NOT NULL,
    job_type ENUM('summary', 'memory_extract') NOT NULL,
    target_sequence INT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('pending', 'processing', 'succeeded', 'failed', 'dead') NOT NULL DEFAULT 'pending',
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    available_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    locked_at TIMESTAMP NULL,
    last_error VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ai_memory_job (session_id, job_type, target_sequence),
    INDEX idx_ai_memory_jobs_queue (status, available_at, id),
    CONSTRAINT fk_ai_memory_job_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_memory_job_session FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE ai_memory_jobs
  MODIFY COLUMN status ENUM('pending', 'processing', 'succeeded', 'failed', 'dead') NOT NULL DEFAULT 'pending';
