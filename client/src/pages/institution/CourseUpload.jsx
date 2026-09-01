import { useState, useEffect, useRef } from 'react';
import { Table, Button, Tag, message, Popconfirm, Upload, Empty, Modal, Tabs, Form, Input, Select, Switch } from 'antd';
import {
  InboxOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  FilePdfOutlined,
  BookOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons';
import { coursesApi } from '../../services/api';
import { withBasePath } from '../../utils/paths';

const ebookCategories = ['文学故事', '科普百科', '学习辅导', '传统文化', '心理成长', '其他'];

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
  const [ebookFileList, setEbookFileList] = useState([]);
  const [coverFileList, setCoverFileList] = useState([]);
  const [ebookUploading, setEbookUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('files');
  const [ebookForm] = Form.useForm();
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

  const handleEbookUpload = async () => {
    if (ebookFileList.length === 0) {
      message.warning('请先选择 PDF 电子书');
      return;
    }
    try {
      const values = await ebookForm.validateFields();
      const formData = new FormData();
      formData.append('file', ebookFileList[0].originFileObj || ebookFileList[0]);
      if (coverFileList[0]) formData.append('cover', coverFileList[0].originFileObj || coverFileList[0]);
      Object.entries(values).forEach(([key, value]) => formData.append(key, value === true ? 'true' : String(value ?? '')));
      setEbookUploading(true);
      const result = await coursesApi.ebookUpload(formData);
      message.success(result.message || '电子书已提交审核');
      ebookForm.resetFields();
      setEbookFileList([]);
      setCoverFileList([]);
      setActiveTab('files');
      fetchCourses();
    } catch (error) {
      if (error?.errorFields) return;
      message.error(error.message || '电子书上传失败');
    } finally { setEbookUploading(false); }
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
      render: (t, record) => record.resource_kind === 'ebook'
        ? <Tag icon={<BookOutlined />} color="orange">电子书</Tag>
        : t === 'video'
          ? <Tag icon={<PlayCircleOutlined />} color="blue">视频</Tag>
          : <Tag icon={<FilePdfOutlined />} color="red">资料</Tag>,
    },
    {
      title: '文件名',
      dataIndex: 'title',
      ellipsis: true,
      render: (text, record) => (
        <span
          style={{ color: '#4F7942', cursor: 'pointer', fontWeight: 500 }}
          onClick={() => record.resource_kind === 'ebook' ? message.info('电子书需要管理员发布后由学生阅读') : setPreviewFile(record)}
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
      title: '审核状态',
      dataIndex: 'review_status',
      width: 100,
      render: (status) => <Tag color={{ pending: 'orange', published: 'green', rejected: 'red', disabled: 'default' }[status] || 'default'}>{{ pending: '待审核', published: '已发布', rejected: '已拒绝', disabled: '已下架' }[status] || '已发布'}</Tag>,
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
        <h2><CloudUploadOutlined /> 学习资源管理</h2>
        <p className="page-subtitle">上传课程文件或电子书，审核通过后供学生使用</p>
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[{ key: 'files', label: '课程文件' }, { key: 'ebook', label: '上传电子书' }]} />

      {/* 上传区 */}
      {activeTab === 'files' && <div
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
      </div>}

      {activeTab === 'ebook' && <div className="ebook-upload-panel">
        <Form form={ebookForm} layout="vertical" initialValues={{ allowDownload: true }}>
          <div className="ebook-upload-grid">
            <Form.Item label="PDF 电子书" required>
              <Upload
                accept=".pdf,application/pdf"
                maxCount={1}
                beforeUpload={() => false}
                fileList={ebookFileList}
                onChange={({ fileList: next }) => setEbookFileList(next.slice(-1))}
              >
                <Button icon={<FilePdfOutlined />}>选择 PDF 文件</Button>
              </Upload>
              <div className="form-help">仅支持 PDF，单文件最大 100MB</div>
            </Form.Item>
            <Form.Item label="封面（可选）">
              <Upload
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                maxCount={1}
                beforeUpload={() => false}
                fileList={coverFileList}
                onChange={({ fileList: next }) => setCoverFileList(next.slice(-1))}
              >
                <Button icon={<BookOutlined />}>选择封面</Button>
              </Upload>
              <div className="form-help">JPG/PNG，建议使用竖版封面</div>
            </Form.Item>
          </div>
          <div className="ebook-upload-grid">
            <Form.Item name="title" label="书名" rules={[{ required: true, message: '请输入书名' }]}><Input placeholder="例如：十万个为什么" maxLength={200} /></Form.Item>
            <Form.Item name="author" label="作者" rules={[{ required: true, message: '请输入作者' }]}><Input placeholder="请输入作者" maxLength={100} /></Form.Item>
            <Form.Item name="category" label="分类" rules={[{ required: true, message: '请选择分类' }]}><Select placeholder="请选择分类" options={ebookCategories.map((value) => ({ value, label: value }))} /></Form.Item>
            <Form.Item name="gradeMin" label="最低年级" rules={[{ required: true, message: '请输入最低年级' }]}><Input placeholder="例如：三" /></Form.Item>
            <Form.Item name="gradeMax" label="最高年级" rules={[{ required: true, message: '请输入最高年级' }]}><Input placeholder="例如：六" /></Form.Item>
          </div>
          <Form.Item name="description" label="内容简介" rules={[{ required: true, message: '请输入内容简介' }]}><Input.TextArea rows={4} maxLength={1000} showCount placeholder="用几句话介绍这本书适合学生学习的内容" /></Form.Item>
          <Form.Item name="sourceNote" label="来源或授权说明" rules={[{ required: true, message: '请输入来源或授权说明' }]}><Input.TextArea rows={3} maxLength={500} placeholder="例如：出版社公益授权 / 公版作品 / 机构自有教材" /></Form.Item>
          <Form.Item name="allowDownload" label="允许学生下载" valuePropName="checked"><Switch /></Form.Item>
          <Button type="primary" icon={<CloudUploadOutlined />} loading={ebookUploading} onClick={handleEbookUpload}>提交审核</Button>
        </Form>
      </div>}

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
            src={withBasePath(previewFile.file_path)}
          />
        )}
        {previewFile?.file_type === 'pdf' && (
          <iframe
            src={withBasePath(previewFile.file_path)}
            style={{ width: '100%', height: 560, border: 'none', borderRadius: 8 }}
            title={previewFile?.title}
          />
        )}
      </Modal>
    </div>
  );
}

export default CourseUpload;
