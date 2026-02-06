-- =============================================
-- 管理后台功能增强 - 数据库迁移脚本
-- 日期: 2026-02-07
-- 说明: 资源表增加 rejected 状态和审核相关字段
-- 注意: 此迁移由 admin.js 自动执行，通常无需手动运行
-- =============================================

-- 1. 资源表 status ENUM 增加 'rejected' 值
ALTER TABLE resources 
  MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'matched', 'completed') DEFAULT 'pending';

-- 2. 增加审核相关字段
ALTER TABLE resources 
  ADD COLUMN reject_reason VARCHAR(500) DEFAULT NULL COMMENT '拒绝原因' AFTER status;

ALTER TABLE resources 
  ADD COLUMN reviewed_at TIMESTAMP NULL DEFAULT NULL COMMENT '审核时间' AFTER reject_reason;

ALTER TABLE resources 
  ADD COLUMN reviewed_by VARCHAR(50) DEFAULT NULL COMMENT '审核人' AFTER reviewed_at;
