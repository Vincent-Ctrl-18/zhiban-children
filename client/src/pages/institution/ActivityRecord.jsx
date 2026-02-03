import { useState, useEffect } from 'react';
import { 
  Table, Button, Modal, Form, Input, Select, DatePicker, TimePicker,
  Space, Tag, message, Popconfirm, InputNumber, Upload, Image
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined, PictureOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { activitiesApi } from '../../services/api';

const { Option } = Select;
const { TextArea } = Input;

const activityTypes = [
  { value: 'course', label: '课程', color: 'blue' },
  { value: 'entertainment', label: '娱乐', color: 'green' },
  { value: 'outdoor', label: '户外', color: 'orange' },
  { value: 'other', label: '其他', color: 'default' },
];

function ActivityRecord() {
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState([]);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImage, setPreviewImage] = useState('');

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const data = await activitiesApi.getList({});
      setActivities(data);
    } catch (error) {
      message.error('获取活动记录失败');
    } finally {
      setLoading(false);
    }
  };

  const showModal = (activity = null) => {
    setEditingActivity(activity);
    if (activity) {
      // 处理日期时区问题：将UTC时间转换为本地日期
      let activityDate = null;
      if (activity.activity_date) {
        // 创建日期对象并获取本地日期
        const date = new Date(activity.activity_date);
        activityDate = dayjs(date);
      }
      form.setFieldsValue({
        ...activity,
        activityDate: activityDate,
        activityType: activity.activity_type,
        startTime: activity.start_time ? dayjs(activity.start_time, 'HH:mm:ss') : null,
        endTime: activity.end_time ? dayjs(activity.end_time, 'HH:mm:ss') : null,
        participantCount: activity.participant_count,
      });
      // 设置已有的照片
      const photos = activity.photos || [];
      setFileList(photos.map((url, index) => ({
        uid: `-${index}`,
        name: `photo-${index}.jpg`,
        status: 'done',
        url: url,
      })));
    } else {
      form.resetFields();
      form.setFieldsValue({
        activityDate: dayjs(),
      });
      setFileList([]);
    }
    setModalVisible(true);
  };

  // 处理图片上传状态变化
  const handleUploadChange = ({ file, fileList: newFileList }) => {
    // 当文件上传完成时，确保 url 被正确设置
    const updatedFileList = newFileList.map(f => {
      if (f.uid === file.uid && file.status === 'done' && file.response?.url) {
        return { ...f, status: 'done', url: file.response.url };
      }
      // 保留已经有 url 的文件
      if (f.url) {
        return f;
      }
      return f;
    });
    setFileList(updatedFileList);
  };

  // 自定义上传
  const customUpload = async ({ file, onSuccess, onError }) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/upload/image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });
      
      const result = await response.json();
      if (response.ok) {
        onSuccess({ url: result.url }, file);
      } else {
        onError(new Error(result.message));
      }
    } catch (error) {
      onError(error);
    }
  };

  // 预览图片
  const handlePreview = async (file) => {
    setPreviewImage(file.url || file.thumbUrl);
    setPreviewVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      // 收集已上传的图片URL
      const photos = fileList
        .filter(file => file.status === 'done' && file.url)
        .map(file => file.url);
      
      const data = {
        ...values,
        activityDate: values.activityDate ? values.activityDate.format('YYYY-MM-DD') : null,
        startTime: values.startTime ? values.startTime.format('HH:mm:ss') : null,
        endTime: values.endTime ? values.endTime.format('HH:mm:ss') : null,
        photos: photos.length > 0 ? photos : null,
      };

      if (editingActivity) {
        await activitiesApi.update(editingActivity.id, data);
        message.success('更新成功');
      } else {
        await activitiesApi.create(data);
        message.success('添加成功');
      }
      
      // 先获取最新数据，再关闭弹窗
      await fetchActivities();
      setModalVisible(false);
    } catch (error) {
      if (error.errorFields) return;
      message.error(error.message || '操作失败');
    }
  };

  const handleDelete = async (id) => {
    try {
      await activitiesApi.delete(id);
      message.success('删除成功');
      fetchActivities();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const columns = [
    {
      title: '活动名称',
      dataIndex: 'title',
      key: 'title',
      width: 200,
      align: 'center',
    },
    {
      title: '类型',
      dataIndex: 'activity_type',
      key: 'activity_type',
      width: 100,
      align: 'center',
      render: (type) => {
        const t = activityTypes.find(a => a.value === type) || activityTypes[3];
        return <Tag color={t.color}>{t.label}</Tag>;
      },
    },
    {
      title: '日期',
      dataIndex: 'activity_date',
      key: 'activity_date',
      width: 120,
      align: 'center',
      render: (date) => {
        if (!date) return '-';
        // 转换为本地日期显示
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      },
    },
    {
      title: '时间',
      key: 'time',
      width: 150,
      align: 'center',
      render: (_, record) => {
        if (record.start_time && record.end_time) {
          return `${record.start_time.slice(0, 5)} - ${record.end_time.slice(0, 5)}`;
        }
        return record.start_time ? record.start_time.slice(0, 5) : '-';
      },
    },
    {
      title: '参与人数',
      dataIndex: 'participant_count',
      key: 'participant_count',
      width: 100,
      align: 'center',
      render: (count) => `${count || 0} 人`,
    },
    {
      title: '记录人',
      dataIndex: 'recorder_name',
      key: 'recorder_name',
      width: 100,
      align: 'center',
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      align: 'center',
    },
    {
      title: '照片',
      dataIndex: 'photos',
      key: 'photos',
      width: 100,
      align: 'center',
      render: (photos) => {
        const photoList = photos || [];
        if (photoList.length === 0) return '-';
        return (
          <Space>
            <PictureOutlined style={{ color: '#1890ff' }} />
            <span>{photoList.length}张</span>
          </Space>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      align: 'center',
      render: (_, record) => (
        <Space>
          <Button 
            type="link" 
            icon={<EditOutlined />} 
            onClick={() => showModal(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除该活动记录吗？"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="form-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>每日活动记录</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>
          添加活动
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={activities}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: '暂无活动记录' }}
      />

      <Modal
        title={editingActivity ? '编辑活动记录' : '添加活动记录'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={700}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="活动名称"
            rules={[{ required: true, message: '请输入活动名称' }]}
          >
            <Input placeholder="请输入活动名称" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              name="activityType"
              label="活动类型"
              rules={[{ required: true, message: '请选择活动类型' }]}
            >
              <Select placeholder="请选择活动类型">
                {activityTypes.map(type => (
                  <Option key={type.value} value={type.value}>{type.label}</Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="activityDate"
              label="活动日期"
              rules={[{ required: true, message: '请选择活动日期' }]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="startTime" label="开始时间">
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="endTime" label="结束时间">
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="participantCount" label="参与人数">
              <InputNumber min={0} style={{ width: '100%' }} placeholder="请输入参与人数" />
            </Form.Item>
          </div>

          <Form.Item name="description" label="活动描述">
            <TextArea rows={3} placeholder="请输入活动描述" />
          </Form.Item>

          <Form.Item label="活动照片" extra="支持上传最多9张图片，单张不超过5MB">
            <Upload
              listType="picture-card"
              fileList={fileList}
              onChange={handleUploadChange}
              customRequest={customUpload}
              onPreview={handlePreview}
              accept="image/*"
              maxCount={9}
            >
              {fileList.length >= 9 ? null : (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>上传照片</div>
                </div>
              )}
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      {/* 图片预览 */}
      <Image
        style={{ display: 'none' }}
        preview={{
          visible: previewVisible,
          src: previewImage,
          onVisibleChange: (visible) => setPreviewVisible(visible),
        }}
      />
    </div>
  );
}

export default ActivityRecord;
