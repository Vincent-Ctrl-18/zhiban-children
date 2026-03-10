import { useState, useEffect } from 'react';
import { Tabs, Card, Row, Col, Tag, Empty, Spin, Modal, Input, message } from 'antd';
import {
  PlayCircleOutlined,
  FilePdfOutlined,
  SearchOutlined,
  ClockCircleOutlined,
  BookOutlined,
} from '@ant-design/icons';
import { coursesApi } from '../../services/api';

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function CourseCard({ course, onPlay }) {
  const isVideo = course.file_type === 'video';
  return (
    <Card
      hoverable
      onClick={() => onPlay(course)}
      style={{ borderRadius: 14, overflow: 'hidden', height: '100%' }}
      bodyStyle={{ padding: 0 }}
    >
      {/* 封面区 */}
      <div style={{
        height: 120,
        background: isVideo
          ? 'linear-gradient(135deg, #1e3a5f 0%, #2d6a9f 100%)'
          : 'linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}>
        {isVideo
          ? <PlayCircleOutlined style={{ fontSize: 48, color: 'rgba(255,255,255,0.9)' }} />
          : <FilePdfOutlined style={{ fontSize: 48, color: 'rgba(255,255,255,0.9)' }} />
        }
        <Tag
          color={isVideo ? 'blue' : 'red'}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            borderRadius: 6,
            fontWeight: 600,
          }}
        >
          {isVideo ? '视频' : 'PDF'}
        </Tag>
      </div>

      {/* 信息区 */}
      <div style={{ padding: '14px 16px' }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: '#1d1d1f',
          marginBottom: 8,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {course.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#9ca3af' }}>
          {course.file_size > 0 && (
            <span>{formatSize(course.file_size)}</span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ClockCircleOutlined />
            {new Date(course.created_at).toLocaleDateString('zh-CN')}
          </span>
        </div>
      </div>
    </Card>
  );
}

function CourseResources() {
  const [allCourses, setAllCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [playingFile, setPlayingFile] = useState(null);

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const data = await coursesApi.getList();
      setAllCourses(data);
    } catch (e) {
      message.error('获取课程列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCourses(); }, []);

  const filtered = allCourses.filter((c) => {
    const matchType = activeTab === 'all' || c.file_type === activeTab;
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const videos = allCourses.filter((c) => c.file_type === 'video');
  const pdfs = allCourses.filter((c) => c.file_type === 'pdf');

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="page-title-bar">
        <h2><BookOutlined /> 课程资源</h2>
        <p className="page-subtitle">在线观看视频课程，阅读学习资料</p>
      </div>

      {/* 搜索栏 */}
      <div style={{
        background: '#fff',
        borderRadius: 14,
        padding: '16px 20px',
        marginBottom: 20,
        boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#d1d5db' }} />}
          placeholder="搜索课程名称..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ borderRadius: 10, maxWidth: 320 }}
          allowClear
        />
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', fontSize: 13, color: '#6b7280' }}>
          <span>共 {allCourses.length} 个资源</span>
          <span>·</span>
          <PlayCircleOutlined style={{ color: '#3b82f6' }} />
          <span>{videos.length} 个视频</span>
          <span>·</span>
          <FilePdfOutlined style={{ color: '#ef4444' }} />
          <span>{pdfs.length} 个PDF</span>
        </div>
      </div>

      {/* 内容 */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            { key: 'all', label: `全部 (${allCourses.length})` },
            { key: 'video', label: <span><PlayCircleOutlined /> 视频 ({videos.length})</span> },
            { key: 'pdf', label: <span><FilePdfOutlined /> PDF ({pdfs.length})</span> },
          ]}
        />

        <Spin spinning={loading}>
          {filtered.length === 0 ? (
            <Empty
              description={search ? '没有找到匹配的课程' : '暂无课程资源'}
              style={{ padding: '40px 0' }}
            />
          ) : (
            <Row gutter={[16, 16]}>
              {filtered.map((course) => (
                <Col key={course.id} xs={24} sm={12} md={8} lg={6}>
                  <CourseCard course={course} onPlay={setPlayingFile} />
                </Col>
              ))}
            </Row>
          )}
        </Spin>
      </div>

      {/* 播放/预览弹窗 */}
      <Modal
        open={!!playingFile}
        onCancel={() => setPlayingFile(null)}
        footer={null}
        width={playingFile?.file_type === 'video' ? 860 : 800}
        title={
          <span>
            {playingFile?.file_type === 'video'
              ? <><PlayCircleOutlined style={{ color: '#3b82f6', marginRight: 8 }} />{playingFile?.title}</>
              : <><FilePdfOutlined style={{ color: '#ef4444', marginRight: 8 }} />{playingFile?.title}</>
            }
          </span>
        }
        destroyOnClose
        centered
      >
        {playingFile?.file_type === 'video' && (
          <video
            controls
            autoPlay
            style={{ width: '100%', borderRadius: 10, maxHeight: 500, background: '#000' }}
            src={playingFile.file_path}
          >
            您的浏览器不支持视频播放
          </video>
        )}
        {playingFile?.file_type === 'pdf' && (
          <iframe
            src={playingFile.file_path}
            style={{ width: '100%', height: 600, border: 'none', borderRadius: 10 }}
            title={playingFile?.title}
          />
        )}
      </Modal>
    </div>
  );
}

export default CourseResources;
