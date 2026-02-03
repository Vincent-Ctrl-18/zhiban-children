-- 智伴乡童数据库初始化脚本
-- 创建数据库
CREATE DATABASE IF NOT EXISTS zhiban_children DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE zhiban_children;

-- 用户表（支持四类角色：parent/institution/resource/government）
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('parent', 'institution', 'resource', 'government') NOT NULL,
    real_name VARCHAR(50),
    phone VARCHAR(20),
    email VARCHAR(100),
    organization VARCHAR(100) COMMENT '所属机构/企业/高校名称',
    avatar VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 托管机构表
CREATE TABLE IF NOT EXISTS institutions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL COMMENT '机构名称',
    address VARCHAR(255) COMMENT '机构地址',
    contact_person VARCHAR(50) COMMENT '联系人',
    contact_phone VARCHAR(20) COMMENT '联系电话',
    capacity INT DEFAULT 50 COMMENT '可容纳儿童数',
    description TEXT COMMENT '机构简介',
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 儿童信息表
CREATE TABLE IF NOT EXISTS children (
    id INT PRIMARY KEY AUTO_INCREMENT,
    institution_id INT NOT NULL,
    name VARCHAR(50) NOT NULL COMMENT '姓名',
    gender ENUM('male', 'female') NOT NULL COMMENT '性别',
    birth_date DATE COMMENT '出生日期',
    id_card VARCHAR(18) COMMENT '身份证号',
    school VARCHAR(100) COMMENT '就读学校',
    grade VARCHAR(20) COMMENT '年级',
    parent_id INT COMMENT '关联家长用户ID',
    guardian_name VARCHAR(50) COMMENT '监护人姓名',
    guardian_phone VARCHAR(20) COMMENT '监护人电话',
    guardian_relation VARCHAR(20) COMMENT '与儿童关系',
    health_status TEXT COMMENT '健康状况',
    photo VARCHAR(255) COMMENT '照片',
    notes TEXT COMMENT '备注',
    status ENUM('active', 'graduated', 'transferred') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 每日签到记录表
CREATE TABLE IF NOT EXISTS daily_checkins (
    id INT PRIMARY KEY AUTO_INCREMENT,
    child_id INT NOT NULL,
    institution_id INT NOT NULL,
    checkin_date DATE NOT NULL,
    checkin_time TIME COMMENT '签到时间',
    checkout_time TIME COMMENT '签退时间',
    checkin_by VARCHAR(50) COMMENT '送达人',
    checkout_by VARCHAR(50) COMMENT '接走人',
    status ENUM('present', 'absent', 'late', 'early_leave') DEFAULT 'present',
    notes TEXT COMMENT '备注',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
    UNIQUE KEY unique_checkin (child_id, checkin_date)
);

-- 安全检查打卡表
CREATE TABLE IF NOT EXISTS safety_checks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    institution_id INT NOT NULL,
    check_date DATE NOT NULL,
    checker_id INT NOT NULL COMMENT '检查人',
    venue_clean BOOLEAN DEFAULT FALSE COMMENT '场地是否整洁无杂物',
    furniture_safe BOOLEAN DEFAULT FALSE COMMENT '桌椅设施是否安全',
    electrical_normal BOOLEAN DEFAULT FALSE COMMENT '插座电线是否正常',
    fire_exit_clear BOOLEAN DEFAULT FALSE COMMENT '消防通道是否畅通',
    extinguisher_ready BOOLEAN DEFAULT FALSE COMMENT '灭火器是否在位',
    water_hygiene_ok BOOLEAN DEFAULT FALSE COMMENT '饮水与卫生是否合格',
    attendance_done BOOLEAN DEFAULT FALSE COMMENT '儿童签到是否完成',
    pickup_verified BOOLEAN DEFAULT FALSE COMMENT '接送人是否核实登记',
    firstaid_complete BOOLEAN DEFAULT FALSE COMMENT '急救包是否齐全',
    has_incident BOOLEAN DEFAULT FALSE COMMENT '今日是否发生异常事件',
    incident_notes TEXT COMMENT '异常事件备注',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
    FOREIGN KEY (checker_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_safety_check (institution_id, check_date)
);

-- 每日活动记录表
CREATE TABLE IF NOT EXISTS activities (
    id INT PRIMARY KEY AUTO_INCREMENT,
    institution_id INT NOT NULL,
    activity_date DATE NOT NULL,
    activity_type ENUM('course', 'entertainment', 'outdoor', 'other') NOT NULL COMMENT '活动类型',
    title VARCHAR(100) NOT NULL COMMENT '活动标题',
    description TEXT COMMENT '活动描述',
    start_time TIME COMMENT '开始时间',
    end_time TIME COMMENT '结束时间',
    participant_count INT DEFAULT 0 COMMENT '参与人数',
    photos JSON COMMENT '活动照片URLs',
    recorder_id INT COMMENT '记录人',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
    FOREIGN KEY (recorder_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 机构通知表
CREATE TABLE IF NOT EXISTS notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    institution_id INT NOT NULL,
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    type ENUM('announcement', 'activity', 'emergency', 'other') DEFAULT 'announcement',
    is_public BOOLEAN DEFAULT TRUE COMMENT '是否对家长可见',
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 资源登记表
CREATE TABLE IF NOT EXISTS resources (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL COMMENT '资源提供方用户ID',
    org_type ENUM('university', 'enterprise', 'ngo', 'individual', 'other') NOT NULL COMMENT '组织类型',
    org_name VARCHAR(100) NOT NULL COMMENT '组织/个人名称',
    resource_type ENUM('course', 'material', 'volunteer', 'fund', 'other') NOT NULL COMMENT '资源类型',
    resource_title VARCHAR(100) NOT NULL COMMENT '资源标题',
    resource_description TEXT COMMENT '资源描述',
    contact_name VARCHAR(50) COMMENT '联系人',
    contact_phone VARCHAR(20) COMMENT '联系电话',
    contact_email VARCHAR(100) COMMENT '联系邮箱',
    status ENUM('pending', 'approved', 'matched', 'completed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 统计数据表（用于数据看板）
CREATE TABLE IF NOT EXISTS statistics (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stat_date DATE NOT NULL,
    total_children INT DEFAULT 0 COMMENT '服务儿童总数',
    total_activities INT DEFAULT 0 COMMENT '开展活动总数',
    total_volunteers INT DEFAULT 0 COMMENT '志愿者参与次数',
    total_resources INT DEFAULT 0 COMMENT '合作资源数',
    total_institutions INT DEFAULT 0 COMMENT '托管机构数',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_stat_date (stat_date)
);

-- 插入测试数据
INSERT INTO users (username, password, role, real_name, phone, organization) VALUES
('admin_inst', '$2b$10$rQZ5lN.vYZ1HhJmT0P1kLOJhqKqLqLqLqLqLqLqLqLqLqLqLqLqLq', 'institution', '张老师', '13800138001', '阳光托管中心'),
('parent_wang', '$2b$10$rQZ5lN.vYZ1HhJmT0P1kLOJhqKqLqLqLqLqLqLqLqLqLqLqLqLqLq', 'parent', '王建国', '13800138002', NULL),
('volunteer_li', '$2b$10$rQZ5lN.vYZ1HhJmT0P1kLOJhqKqLqLqLqLqLqLqLqLqLqLqLqLqLq', 'resource', '李志愿', '13800138003', '西南大学'),
('gov_chen', '$2b$10$rQZ5lN.vYZ1HhJmT0P1kLOJhqKqLqLqLqLqLqLqLqLqLqLqLqLqLq', 'government', '陈主任', '13800138004', '民政局');

INSERT INTO institutions (user_id, name, address, contact_person, contact_phone, capacity, description) VALUES
(1, '阳光托管中心', '云南省昆明市盘龙区XX街道', '张老师', '13800138001', 30, '专注于留守儿童关爱服务，提供课后托管、心理辅导等服务。');

INSERT INTO children (institution_id, name, gender, birth_date, school, grade, guardian_name, guardian_phone, guardian_relation) VALUES
(1, '小明', 'male', '2016-05-15', '盘龙小学', '四年级', '王建国', '13800138002', '父亲'),
(1, '小红', 'female', '2017-03-20', '盘龙小学', '三年级', '李秀英', '13800138005', '母亲'),
(1, '小刚', 'male', '2015-11-08', '盘龙小学', '五年级', '张伟', '13800138006', '爷爷');

-- 创建索引优化查询
CREATE INDEX idx_children_institution ON children(institution_id);
CREATE INDEX idx_checkins_date ON daily_checkins(checkin_date);
CREATE INDEX idx_activities_date ON activities(activity_date);
CREATE INDEX idx_resources_status ON resources(status);
