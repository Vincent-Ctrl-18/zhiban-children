-- 智伴乡童 AI 第二阶段：全站事件、课程进度与智能体扩展
-- 幂等执行；不删除第一阶段数据，也不修改 ai_chat_history。
USE zhiban_children;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_test_account TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE product_events
  ADD COLUMN IF NOT EXISTS institution_id INT NULL,
  ADD COLUMN IF NOT EXISTS client_version VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS event_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS environment ENUM('production', 'test') NOT NULL DEFAULT 'production';

ALTER TABLE ai_sessions
  ADD COLUMN IF NOT EXISTS title VARCHAR(160) NULL,
  ADD COLUMN IF NOT EXISTS summary VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS stage VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS subject VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS metadata JSON NULL;

ALTER TABLE ai_messages
  ADD COLUMN IF NOT EXISTS content_json JSON NULL,
  ADD COLUMN IF NOT EXISTS generation_status ENUM('completed', 'stopped', 'failed') NULL DEFAULT 'completed';

CREATE TABLE IF NOT EXISTS feature_usage_daily (
    stat_date DATE NOT NULL,
    feature_code VARCHAR(40) NOT NULL,
    user_role VARCHAR(30) NOT NULL,
    institution_id INT NOT NULL DEFAULT 0,
    usage_count INT UNSIGNED NOT NULL DEFAULT 0,
    success_count INT UNSIGNED NOT NULL DEFAULT 0,
    completion_count INT UNSIGNED NOT NULL DEFAULT 0,
    unique_users INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (stat_date, feature_code, user_role, institution_id),
    INDEX idx_feature_daily_date (stat_date),
    INDEX idx_feature_daily_feature (feature_code, stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_activity_daily (
    stat_date DATE NOT NULL,
    user_id INT NOT NULL,
    login_count INT UNSIGNED NOT NULL DEFAULT 0,
    active_feature_count INT UNSIGNED NOT NULL DEFAULT 0,
    valid_task_count INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (stat_date, user_id),
    CONSTRAINT fk_user_activity_daily_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_metrics_daily (
    stat_date DATE PRIMARY KEY,
    registered_users INT UNSIGNED NOT NULL DEFAULT 0,
    served_children INT UNSIGNED NOT NULL DEFAULT 0,
    active_users INT UNSIGNED NOT NULL DEFAULT 0,
    feature_usage_count INT UNSIGNED NOT NULL DEFAULT 0,
    valid_completion_count INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_progress (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    course_id INT NOT NULL,
    user_id INT NOT NULL,
    status ENUM('started', 'completed') NOT NULL DEFAULT 'started',
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    last_active_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_course_progress_user_course (course_id, user_id),
    INDEX idx_course_progress_user (user_id, last_active_at),
    CONSTRAINT fk_course_progress_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_model_calls (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    request_id VARCHAR(100) NULL,
    session_id BIGINT UNSIGNED NULL,
    user_id INT NULL,
    agent_type VARCHAR(40) NOT NULL,
    provider VARCHAR(40) NOT NULL,
    model VARCHAR(120) NULL,
    status ENUM('success', 'failure', 'stopped') NOT NULL,
    latency_ms INT UNSIGNED NULL,
    input_tokens INT UNSIGNED NULL,
    output_tokens INT UNSIGNED NULL,
    error_code VARCHAR(80) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ai_model_calls_time (created_at),
    INDEX idx_ai_model_calls_request (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_homework_inputs (
    id CHAR(36) PRIMARY KEY,
    user_id INT NOT NULL,
    image_path VARCHAR(500) NULL,
    recognized_text TEXT NULL,
    confirmed_text TEXT NULL,
    status ENUM('recognized', 'confirmed', 'failed', 'expired') NOT NULL DEFAULT 'recognized',
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_homework_inputs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_ai_homework_inputs_user_status (user_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_feedback (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    session_id BIGINT UNSIGNED NOT NULL,
    message_id BIGINT UNSIGNED NOT NULL,
    rating ENUM('helpful', 'not_helpful') NOT NULL,
    reason VARCHAR(200) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ai_feedback_user_message (user_id, message_id),
    CONSTRAINT fk_ai_feedback_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_feedback_session FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_feedback_message FOREIGN KEY (message_id) REFERENCES ai_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS companion_risk_events (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    institution_id INT NULL,
    session_id BIGINT UNSIGNED NULL,
    message_id BIGINT UNSIGNED NULL,
    category ENUM('self_harm', 'harm_others', 'abuse', 'sexual_abuse', 'missing', 'bullying', 'negative_emotion') NOT NULL,
    severity ENUM('low', 'medium', 'high', 'critical') NOT NULL,
    status ENUM('new', 'acknowledged', 'resolved') NOT NULL DEFAULT 'new',
    classifier VARCHAR(30) NOT NULL DEFAULT 'rules',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_companion_risk_queue (institution_id, status, severity, created_at),
    CONSTRAINT fk_companion_risk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_reports (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    evidence_snapshot JSON NOT NULL,
    report_json JSON NOT NULL,
    prompt_version VARCHAR(40) NULL,
    model VARCHAR(120) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ai_reports_user_period (user_id, period_end),
    CONSTRAINT fk_ai_reports_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_prompt_versions (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    agent_type VARCHAR(40) NOT NULL,
    version VARCHAR(40) NOT NULL,
    status ENUM('draft', 'tested', 'published', 'archived') NOT NULL DEFAULT 'draft',
    config JSON NOT NULL,
    change_note VARCHAR(500) NULL,
    created_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ai_prompt_version (agent_type, version),
    INDEX idx_ai_prompt_status (agent_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_prompt_deployments (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    agent_type VARCHAR(40) NOT NULL,
    prompt_version VARCHAR(40) NOT NULL,
    rollout_percent TINYINT UNSIGNED NOT NULL DEFAULT 100,
    deployed_by INT NULL,
    deployed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rolled_back_at TIMESTAMP NULL,
    INDEX idx_ai_prompt_deployments_agent (agent_type, deployed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_eval_runs (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    agent_type VARCHAR(40) NOT NULL,
    prompt_version VARCHAR(40) NOT NULL,
    status ENUM('running', 'passed', 'failed') NOT NULL DEFAULT 'running',
    total_cases INT UNSIGNED NOT NULL DEFAULT 0,
    passed_cases INT UNSIGNED NOT NULL DEFAULT 0,
    created_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_eval_results (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    run_id BIGINT UNSIGNED NOT NULL,
    case_key VARCHAR(100) NOT NULL,
    passed TINYINT(1) NOT NULL DEFAULT 0,
    notes VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ai_eval_results_run (run_id),
    CONSTRAINT fk_ai_eval_results_run FOREIGN KEY (run_id) REFERENCES ai_eval_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
