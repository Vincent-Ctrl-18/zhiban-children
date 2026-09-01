const { pool } = require('../config/database');
const { recordEvent } = require('./eventService');

async function loadCourse(courseId) {
  const [rows] = await pool.query(
    `SELECT id, title, file_type, resource_kind, review_status
     FROM course_resources WHERE id = ? LIMIT 1`, [courseId]
  );
  const course = rows[0] || null;
  if (course && (course.resource_kind || (course.file_type === 'video' ? 'video' : 'document')) === 'ebook' && course.review_status !== 'published') {
    const error = new Error('资源不存在或暂未发布');
    error.status = 404;
    error.code = 'RESOURCE_NOT_PUBLISHED';
    throw error;
  }
  return course;
}

async function startCourse({ userId, institutionId = null, courseId }) {
  const course = await loadCourse(courseId);
  if (!course) {
    const error = new Error('课程不存在');
    error.status = 404;
    error.code = 'COURSE_NOT_FOUND';
    throw error;
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query(
      'SELECT * FROM course_progress WHERE course_id = ? AND user_id = ? FOR UPDATE',
      [courseId, userId]
    );
    if (existing[0]?.status === 'completed') {
      await connection.query('UPDATE course_progress SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?', [existing[0].id]);
      await connection.commit();
      return { course, progress: { ...existing[0], status: 'completed' }, alreadyCompleted: true };
    }
    if (existing[0]) {
      await connection.query('UPDATE course_progress SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?', [existing[0].id]);
      await connection.commit();
      return { course, progress: { ...existing[0], status: 'started' }, alreadyStarted: true };
    }
    const [result] = await connection.query(
      `INSERT INTO course_progress (course_id, user_id, status)
       VALUES (?, ?, 'started')`, [courseId, userId]
    );
    await recordEvent({
      eventName: 'course_started', userId, userRole: 'student', institutionId,
      objectId: courseId, requestId: `course-start:${userId}:${courseId}`, connection,
    });
    await connection.commit();
    return { course, progress: { id: result.insertId, course_id: courseId, user_id: userId, status: 'started', last_page: 0, total_pages: 0, progress_percent: 0 } };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

async function completeCourse({ userId, institutionId = null, courseId }) {
  const course = await loadCourse(courseId);
  if (!course) {
    const error = new Error('课程不存在');
    error.status = 404;
    error.code = 'COURSE_NOT_FOUND';
    throw error;
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query(
      'SELECT * FROM course_progress WHERE course_id = ? AND user_id = ? FOR UPDATE',
      [courseId, userId]
    );
    if (existing[0]?.status === 'completed') {
      await connection.commit();
      return { course, progress: existing[0], alreadyCompleted: true };
    }
    const [result] = existing[0]
      ? await connection.query(
        `UPDATE course_progress SET status = 'completed', progress_percent = 100,
         completed_at = CURRENT_TIMESTAMP, last_active_at = CURRENT_TIMESTAMP WHERE id = ?`, [existing[0].id]
      )
      : await connection.query(
        `INSERT INTO course_progress (course_id, user_id, status, progress_percent, completed_at)
         VALUES (?, ?, 'completed', 100, CURRENT_TIMESTAMP)`, [courseId, userId]
      );
    await recordEvent({
      eventName: 'course_completed', userId, userRole: 'student', institutionId,
      objectId: courseId, requestId: `course-complete:${userId}:${courseId}`, connection,
    });
    await connection.commit();
    const [rows] = await pool.query('SELECT * FROM course_progress WHERE course_id = ? AND user_id = ?', [courseId, userId]);
    return { course, progress: rows[0] || { id: result.insertId, course_id: courseId, user_id: userId, status: 'completed', progress_percent: 100 } };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

async function updateCourseProgress({ userId, institutionId = null, courseId, lastPage = 0, totalPages = 0, progressPercent = 0 }) {
  const course = await loadCourse(courseId);
  if (!course) {
    const error = new Error('课程不存在');
    error.status = 404;
    error.code = 'COURSE_NOT_FOUND';
    throw error;
  }
  const normalizedTotal = Math.max(0, Math.floor(Number(totalPages) || 0));
  const normalizedPage = Math.min(normalizedTotal || Math.max(0, Math.floor(Number(lastPage) || 0)), Math.max(0, Math.floor(Number(lastPage) || 0)));
  const computedPercent = normalizedTotal > 0
    ? Math.min(100, Math.max(0, Number(((normalizedPage / normalizedTotal) * 100).toFixed(2))))
    : Math.min(100, Math.max(0, Number(progressPercent) || 0));
  const shouldComplete = computedPercent >= 90;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query(
      'SELECT * FROM course_progress WHERE course_id = ? AND user_id = ? FOR UPDATE', [courseId, userId]
    );
    const wasCompleted = existing[0]?.status === 'completed';
    if (existing[0]) {
      await connection.query(
        `UPDATE course_progress SET last_page = ?, total_pages = ?, progress_percent = ?,
         status = ?, completed_at = CASE WHEN ? = 1 AND completed_at IS NULL THEN CURRENT_TIMESTAMP ELSE completed_at END,
         last_active_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [normalizedPage, normalizedTotal, wasCompleted || shouldComplete ? 100 : computedPercent, wasCompleted || shouldComplete ? 'completed' : 'started', shouldComplete || wasCompleted ? 1 : 0, existing[0].id]
      );
    } else {
      await connection.query(
        `INSERT INTO course_progress (course_id, user_id, status, last_page, total_pages, progress_percent, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END)`,
        [courseId, userId, shouldComplete ? 'completed' : 'started', normalizedPage, normalizedTotal, shouldComplete ? 100 : computedPercent, shouldComplete ? 1 : 0]
      );
    }
    if (shouldComplete && !wasCompleted) {
      await recordEvent({ eventName: 'course_completed', userId, userRole: 'student', institutionId, objectId: courseId, requestId: `course-complete:${userId}:${courseId}`, connection });
    }
    await connection.commit();
    const [rows] = await pool.query('SELECT * FROM course_progress WHERE course_id = ? AND user_id = ?', [courseId, userId]);
    return rows[0];
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

async function getUserProgress(userId) {
  const [rows] = await pool.query(
    `SELECT p.*, c.title, c.file_type, c.resource_kind, c.cover_path
     FROM course_progress p JOIN course_resources c ON c.id = p.course_id
     WHERE p.user_id = ? ORDER BY p.last_active_at DESC`, [userId]
  );
  return rows;
}

module.exports = { startCourse, completeCourse, updateCourseProgress, getUserProgress };
