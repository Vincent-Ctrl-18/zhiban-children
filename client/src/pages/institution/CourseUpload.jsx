import { useState, useEffect, useRef } from 'react';
import { Table, Button, Tag, message, Popconfirm, Upload, Empty, Modal } from 'antd';
import {
  InboxOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  FilePdfOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons';
import { coursesApi } from '../../services/api';

const { Dragger } = Upload;

function formatSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function CourseUpload() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileList, setFileList] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const dragRef = useRef(null);

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const data = await coursesApi.getList();
      setCourses(data);
    } catch (e) {
      message.error('获取课程列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCourses(); }, []);

  const handleUpload = async () => {
    if (fileList.length === 0) {
      message.warning('请先选择要上传的文件');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      fileList.forEach((f) => formData.append('files', f.originFileObj || f));
      const res = await coursesApi.upload(formData);
      message.success(res.message);
      setFileList([]);
      fetchCourses();
    } catch (e) {
      message.error(e.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await coursesApi.delete(id);
      message.success('删除成功');
      fetchCourses();
    } catch (e) {
      message.error(e.message || '删除失败');
    }
  };

  // 处理文件夹拖拽（webkitGetAsEntry）
  const handleFolderDrop = (e) => {
    e.preventDefault();
    const items = Array.from(e.dataTransfer.items || []);
    const collected = [];

    const readEntry = (entry) => new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((file) => {
          const ext = file.name.split('.').pop().toLowerCase();
          if (['mp4', 'webm', 'mov', 'pdf'].includes(ext)) {
            collected.push(file);
          }
          resolve();
        });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        reader.readEntries(async (entries) => {
          for (const e of entries) await readEntry(e);
          resolve();
        });
      } else {
        resolve();
      }
    });

    Promise.all(items.map((item) => {
      const entry = item.webkitGetAsEntry?.();
      return entry ? readEntry(entry) : Promise.resolve();
    })).then(() => {
      if (collected.length === 0) {
        message.warning('未找到支持的文件（mp4、pdf）');
        return;
      }
      const antFiles = collected.map((f, i) => ({
        uid: `drop-${i}`,
        name: f.name,
        size: f.size,
        originFileObj: f,
        status: 'done',
      }));
      setFileList((prev) => [...prev, ...antFiles]);
      message.success(`已添加 ${collected.length} 个文件`);
    });
  };

  const columns = [
    {
      title: '类型',
      dataIndex: 'file_type',
      width: 80,
      render: (t) => t === 'video'
        ? <Tag icon={<PlayCircleOutlined />} color="blue">视频</Tag>
        : <Tag icon={<FilePdfOutlined />} color="red">PDF</Tag>,
    },
    {
      title: '文件名',
      dataIndex: 'title',
      ellipsis: true,
      render: (text, record) => (
        <span
          style={{ color: '#4F7942', cursor: 'pointer', fontWeight: 500 }}
          onClick={() => setPreviewFile(record)}
        >
          {text}
        </span>
      ),
    },
    {
      title: '大小',
      dataIndex: 'file_size',
      width: 100,
      render: formatSize,
    },
    {
      title: '上传时间',
      dataIndex: 'created_at',
      width: 160,
      render: (v) => new Date(v).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' }),
    },
    {
      title: '操作',
      width: 100,
      render: (_, record) => (
        <Popconfirm title="确定删除这个文件吗？" onConfirm={() => handleDelete(record.id)} okText="删除" cancelText="取消">
          <Button type="text" danger icon={<DeleteOutlined />} size="small">删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div className="page-title-bar">
        <h2><CloudUploadOutlined /> 课程资源管理</h2>
        <p className="page-subtitle">上传视频和PDF课程资源，供学生在线学习</p>
      </div>

      {/* 上传区 */}
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: 24,
          marginBottom: 24,
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}
        onDrop={handleFolderDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 16 }}>
          上传文件
          <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 400, marginLeft: 8 }}>
            支持 mp4、pdf 格式，可直接拖入整个 course 文件夹
          </span>
        </h3>

        <Dragger
          multiple
          beforeUpload={() => false}
          fileList={fileList}
          onChange={({ fileList: fl }) => setFileList(fl)}
          accept=".mp4,.webm,.mov,.pdf"
          style={{ borderRadius: 12 }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ fontSize: 48, color: '#4F7942' }} />
          </p>
          <p style={{ fontSize: 15, color: '#374151', fontWeight: 500 }}>
            拖拽文件或文件夹到此处，或点击选择文件
          </p>
          <p style={{ fontSize: 13, color: '#9ca3af' }}>
            支持 mp4、pdf，单文件最大 500MB
          </p>
        </Dragger>

        {fileList.length > 0 && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="primary"
              loading={uploading}
              onClick={handleUpload}
              icon={<CloudUploadOutlined />}
              style={{
                height: 42,
                borderRadius: 10,
                background: '#4F7942',
                borderColor: '#4F7942',
                fontWeight: 600,
                padding: '0 28px',
              }}
            >
              {uploading ? '上传中...' : `上传 ${fileList.length} 个文件`}
            </Button>
          </div>
        )}
      </div>

      {/* 已上传列表 */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 16 }}>
          已上传资源
          <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 400, marginLeft: 8 }}>
            共 {courses.length} 个
          </span>
        </h3>
        <Table
          columns={columns}
          dataSource={courses}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <Empty description="暂无课程资源，请上传文件" /> }}
        />
      </div>

      {/* 预览弹窗 */}
      <Modal
        open={!!previewFile}
        onCancel={() => setPreviewFile(null)}
        footer={null}
        width={800}
        title={previewFile?.title}
        destroyOnClose
      >
        {previewFile?.file_type === 'video' && (
          <video
            controls
            autoPlay
            style={{ width: '100%', borderRadius: 8, maxHeight: 480 }}
            src={previewFile.file_path}
          />
        )}
        {previewFile?.file_type === 'pdf' && (
          <iframe
            src={previewFile.file_path}
            style={{ width: '100%', height: 560, border: 'none', borderRadius: 8 }}
            title={previewFile?.title}
          />
        )}
      </Modal>
    </div>
  );
}

export default CourseUpload;
