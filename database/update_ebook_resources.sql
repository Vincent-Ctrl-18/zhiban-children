-- 学生电子书资源升级
-- 幂等执行：保留现有课程文件与进度，新电子书默认待审核。
USE zhiban_children;

CREATE TABLE IF NOT EXISTS course_resources (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    file_type ENUM('video', 'pdf') NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    private_file_path VARCHAR(500) NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
    institution_id INT NULL,
    uploaded_by INT NULL,
    resource_kind ENUM('video', 'document', 'ebook') NOT NULL DEFAULT 'document',
    author VARCHAR(100) NULL,
    description TEXT NULL,
    category VARCHAR(40) NULL,
    grade_min VARCHAR(20) NULL,
    grade_max VARCHAR(20) NULL,
    cover_path VARCHAR(500) NULL,
    source_note TEXT NULL,
    allow_download TINYINT(1) NOT NULL DEFAULT 1,
    featured TINYINT(1) NOT NULL DEFAULT 0,
    review_status ENUM('pending', 'published', 'rejected', 'disabled') NOT NULL DEFAULT 'published',
    reject_reason VARCHAR(500) NULL,
    published_by INT NULL,
    published_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_course_resources_kind_status (resource_kind, review_status, created_at),
    INDEX idx_course_resources_category (category),
    INDEX idx_course_resources_institution (institution_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE course_resources
  ADD COLUMN IF NOT EXISTS resource_kind ENUM('video', 'document', 'ebook') NOT NULL DEFAULT 'document',
  ADD COLUMN IF NOT EXISTS private_file_path VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS author VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS description TEXT NULL,
  ADD COLUMN IF NOT EXISTS category VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS grade_min VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS grade_max VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS cover_path VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS source_note TEXT NULL,
  ADD COLUMN IF NOT EXISTS allow_download TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS featured TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_status ENUM('pending', 'published', 'rejected', 'disabled') NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS reject_reason VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS published_by INT NULL,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

UPDATE course_resources
SET resource_kind = CASE WHEN file_type = 'video' THEN 'video' ELSE 'document' END,
    review_status = COALESCE(review_status, 'published'),
    published_at = COALESCE(published_at, created_at)
WHERE file_type = 'video' OR resource_kind IS NULL OR resource_kind NOT IN ('video', 'document', 'ebook');

SET @ebook_idx_sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE course_resources ADD INDEX idx_course_resources_kind_status (resource_kind, review_status, created_at)',
    'SELECT 1')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'course_resources' AND index_name = 'idx_course_resources_kind_status'
);
PREPARE ebook_idx_stmt FROM @ebook_idx_sql; EXECUTE ebook_idx_stmt; DEALLOCATE PREPARE ebook_idx_stmt;

SET @ebook_idx_sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE course_resources ADD INDEX idx_course_resources_category (category)',
    'SELECT 1')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'course_resources' AND index_name = 'idx_course_resources_category'
);
PREPARE ebook_idx_stmt FROM @ebook_idx_sql; EXECUTE ebook_idx_stmt; DEALLOCATE PREPARE ebook_idx_stmt;

SET @ebook_idx_sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE course_resources ADD INDEX idx_course_resources_institution (institution_id)',
    'SELECT 1')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'course_resources' AND index_name = 'idx_course_resources_institution'
);
PREPARE ebook_idx_stmt FROM @ebook_idx_sql; EXECUTE ebook_idx_stmt; DEALLOCATE PREPARE ebook_idx_stmt;

CREATE TABLE IF NOT EXISTS course_progress (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    course_id INT NOT NULL,
    user_id INT NOT NULL,
    status ENUM('started', 'completed') NOT NULL DEFAULT 'started',
    last_page INT UNSIGNED NOT NULL DEFAULT 0,
    total_pages INT UNSIGNED NOT NULL DEFAULT 0,
    progress_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    last_active_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_course_progress_user_course (course_id, user_id),
    INDEX idx_course_progress_user (user_id, last_active_at),
    CONSTRAINT fk_course_progress_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE course_progress
  ADD COLUMN IF NOT EXISTS last_page INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_pages INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_percent DECIMAL(5,2) NOT NULL DEFAULT 0;
