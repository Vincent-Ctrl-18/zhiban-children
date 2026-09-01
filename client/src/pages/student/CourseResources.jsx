import { useEffect, useMemo, useState } from 'react';
import { Tabs, Card, Row, Col, Tag, Empty, Spin, Modal, Input, Button, message, Select, Progress, Space, Typography } from 'antd';
import {
  PlayCircleOutlined,
  FilePdfOutlined,
  SearchOutlined,
  ClockCircleOutlined,
  BookOutlined,
  DownloadOutlined,
  RightOutlined,
  ReadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { coursesApi } from '../../services/api';
import { withBasePath } from '../../utils/paths';

const { Text, Paragraph } = Typography;
const categories = ['文学故事', '科普百科', '学习辅导', '传统文化', '心理成长', '其他'];

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getKind(course) {
  return course.resource_kind || (course.file_type === 'video' ? 'video' : 'document');
}

function displayProgress(progress) {
  if (!progress) return 0;
  return Math.min(100, Math.max(0, Number(progress.progress_percent || 0)));
}

function CourseCard({ course, progress, onOpen, onDownload }) {
  const kind = getKind(course);
  const isVideo = kind === 'video';
  const isBook = kind === 'ebook';
  const percent = displayProgress(progress);
  const cover = course.cover_path ? withBasePath(course.cover_path) : null;
  return (
    <Card
      hoverable
      className="learning-resource-card"
      onClick={() => onOpen(course)}
      style={{ borderRadius: 14, overflow: 'hidden', height: '100%' }}
      bodyStyle={{ padding: 0 }}
    >
      <div className={`learning-resource-cover ${isVideo ? 'video' : isBook ? 'ebook' : 'document'}`}>
        {cover ? <img src={cover} alt="" /> : isVideo ? <PlayCircleOutlined /> : isBook ? <ReadOutlined /> : <FilePdfOutlined />}
        <Tag color={isVideo ? 'blue' : isBook ? 'orange' : 'red'} className="learning-resource-type">
          {isVideo ? '视频' : isBook ? '电子书' : '学习资料'}
        </Tag>
      </div>
      <div className="learning-resource-body">
        <div className="learning-resource-title" title={course.title}>{course.title}</div>
        {isBook && <div className="learning-resource-author">{course.author || '作者未填写'}</div>}
        <div className="learning-resource-meta">
          {course.category && <Tag bordered={false}>{course.category}</Tag>}
          {(course.grade_min || course.grade_max) && <span>{course.grade_min}—{course.grade_max}年级</span>}
          {course.file_size > 0 && <span>{formatSize(course.file_size)}</span>}
          <span><ClockCircleOutlined /> {course.created_at ? new Date(course.created_at).toLocaleDateString('zh-CN') : '-'}</span>
        </div>
        {isBook && percent > 0 && (
          <div className="learning-resource-progress">
            <Progress percent={percent} size="small" showInfo={false} strokeColor="#FF9F43" />
            <Text type="secondary">{percent >= 90 ? '已读完' : `已读 ${percent}%`}</Text>
          </div>
        )}
        <div className="learning-resource-actions">
          <Button type="link" onClick={(event) => { event.stopPropagation(); onOpen(course); }}>
            {isVideo ? '开始观看' : isBook && percent > 0 ? '继续阅读' : isBook ? '开始阅读' : '打开资料'} <RightOutlined />
          </Button>
          {isBook && course.allow_download && (
            <Button
              type="text"
              icon={<DownloadOutlined />}
              aria-label={`下载${course.title}`}
              onClick={(event) => { event.stopPropagation(); onDownload(course); }}
            />
          )}
        </div>
      </div>
    </Card>
  );
}

function CourseResources() {
  const navigate = useNavigate();
  const [allCourses, setAllCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [playingFile, setPlayingFile] = useState(null);
  const [progressMap, setProgressMap] = useState({});

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const data = await coursesApi.getList();
      setAllCourses(Array.isArray(data) ? data : []);
    } catch (e) {
      message.error(e.message || '获取学习资源失败');
      setAllCourses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
    coursesApi.getProgress()
      .then((rows) => setProgressMap(Object.fromEntries((rows || []).map((row) => [String(row.course_id), row]))))
      .catch(() => {});
  }, []);

  const handleOpen = async (course) => {
    if (getKind(course) === 'ebook') {
      navigate(`/student/resources/${course.id}/read`);
      return;
    }
    try {
      const result = await coursesApi.start(course.id);
      setProgressMap((previous) => ({ ...previous, [String(course.id)]: result.progress }));
      setPlayingFile(course);
    } catch (error) { message.error(error.message || '无法打开资源'); }
  };

  const handleDownload = async (course) => {
    try {
      const response = await coursesApi.download(course.id);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = course.file_name || `${course.title}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      message.success('下载已开始');
    } catch (error) { message.error(error.message || '下载失败'); }
  };

  const filtered = useMemo(() => allCourses.filter((course) => {
    const kind = getKind(course);
    const matchType = activeTab === 'all' || (activeTab === 'ebook' ? kind === 'ebook' : activeTab === 'document' ? kind === 'document' : kind === activeTab);
    const normalizedSearch = search.trim().toLowerCase();
    const matchSearch = !normalizedSearch || [course.title, course.author, course.description].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedSearch));
    const matchCategory = !category || course.category === category;
    return matchType && matchSearch && matchCategory;
  }), [activeTab, allCourses, category, search]);

  const counts = useMemo(() => allCourses.reduce((acc, course) => {
    acc[getKind(course)] = (acc[getKind(course)] || 0) + 1;
    acc.all += 1;
    return acc;
  }, { all: 0, video: 0, document: 0, ebook: 0 }), [allCourses]);

  return (
    <div className="learning-resources-page">
      <div className="page-title-bar">
        <h2><BookOutlined /> 学习资源</h2>
        <p className="page-subtitle">视频课程、学习资料和适合你的电子书</p>
      </div>

      <div className="learning-resource-filters">
        <Input
          prefix={<SearchOutlined style={{ color: '#d1d5db' }} />}
          placeholder="搜索书名、作者或课程..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          allowClear
        />
        <Select allowClear value={category || undefined} onChange={(value) => setCategory(value || '')} placeholder="全部分类" options={categories.map((item) => ({ value: item, label: item }))} />
        <div className="learning-resource-count">共 {allCourses.length} 个资源</div>
      </div>

      <div className="learning-resource-panel">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            { key: 'all', label: `全部 (${counts.all})` },
            { key: 'video', label: <span><PlayCircleOutlined /> 视频 ({counts.video})</span> },
            { key: 'document', label: <span><FilePdfOutlined /> 学习资料 ({counts.document})</span> },
            { key: 'ebook', label: <span><ReadOutlined /> 电子书 ({counts.ebook})</span> },
          ]}
        />
        <Spin spinning={loading}>
          {filtered.length === 0 ? (
            <Empty description={search || category ? '没有找到匹配的资源' : '暂无学习资源'} style={{ padding: '40px 0' }} />
          ) : (
            <Row gutter={[16, 16]}>
              {filtered.map((course) => (
                <Col key={course.id} xs={24} sm={12} md={8} lg={6}>
                  <CourseCard course={course} progress={progressMap[String(course.id)]} onOpen={handleOpen} onDownload={handleDownload} />
                </Col>
              ))}
            </Row>
          )}
        </Spin>
      </div>

      <Modal
        open={!!playingFile}
        onCancel={() => setPlayingFile(null)}
        footer={null}
        width={playingFile?.file_type === 'video' ? 860 : 800}
        title={playingFile?.title}
        destroyOnClose
        centered
      >
        {playingFile?.file_type === 'video' && <video controls autoPlay style={{ width: '100%', borderRadius: 10, maxHeight: 500, background: '#000' }} src={withBasePath(playingFile.file_path)} />}
        {playingFile?.file_type === 'pdf' && <iframe src={withBasePath(playingFile.file_path)} style={{ width: '100%', height: 600, border: 'none', borderRadius: 10 }} title={playingFile.title} />}
      </Modal>
    </div>
  );
}

export default CourseResources;
