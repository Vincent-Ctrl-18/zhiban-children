import { useState, useEffect } from 'react';
import { 
  Table, Button, Modal, Form, Input, Select, 
  Space, Tag, message, Popconfirm, Switch 
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { notificationsApi } from '../../services/api';

const { Option } = Select;
const { TextArea } = Input;

const notificationTypes = [
  { value: 'announcement', label: '公告', color: 'blue' },
  { value: 'activity', label: '活动通知', color: 'green' },
  { value: 'emergency', label: '紧急通知', color: 'red' },
  { value: 'other', label: '其他', color: 'default' },
];

function NotificationManage() {
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const data = await notificationsApi.getList({});
      setNotifications(data);
    } catch (error) {
      message.error('获取通知列表失败');
    } finally {
      setLoading(false);
    }
  };

  const showModal = () => {
    form.resetFields();
    form.setFieldsValue({
      type: 'announcement',
      isPublic: true,
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      await notificationsApi.create(values);
      message.success('通知发布成功');
      setModalVisible(false);
      fetchNotifications();
    } catch (error) {
      if (error.errorFields) return;
      message.error(error.message || '发布失败');
    }
  };

  const handleDelete = async (id) => {
    try {
      await notificationsApi.delete(id);
      message.success('删除成功');
      fetchNotifications();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: 200,
      align: 'center',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      align: 'center',
      render: (type) => {
        const t = notificationTypes.find(n => n.value === type) || notificationTypes[3];
        return <Tag color={t.color}>{t.label}</Tag>;
      },
    },
    {
      title: '内容',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      align: 'center',
    },
    {
      title: '家长可见',
      dataIndex: 'is_public',
      key: 'is_public',
      width: 100,
      align: 'center',
      render: (isPublic) => isPublic ? <Tag color="green">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: '发布人',
      dataIndex: 'creator_name',
      key: 'creator_name',
      width: 100,
      align: 'center',
    },
    {
      title: '发布时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      align: 'center',
      render: (time) => time ? time.slice(0, 19).replace('T', ' ') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      align: 'center',
      render: (_, record) => (
        <Popconfirm
          title="确定要删除该通知吗？"
          onConfirm={() => handleDelete(record.id)}
        >
          <Button type="link" danger icon={<DeleteOutlined />}>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="form-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>通知管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={showModal}>
          发布通知
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={notifications}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: '暂无通知' }}
        scroll={{ x: 'max-content' }}
      />

      <Modal
        title="发布通知"
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="通知标题"
            rules={[{ required: true, message: '请输入通知标题' }]}
          >
            <Input placeholder="请输入通知标题" />
          </Form.Item>

          <Form.Item
            name="type"
            label="通知类型"
            rules={[{ required: true, message: '请选择通知类型' }]}
          >
            <Select placeholder="请选择通知类型">
              {notificationTypes.map(type => (
                <Option key={type.value} value={type.value}>{type.label}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="content"
            label="通知内容"
            rules={[{ required: true, message: '请输入通知内容' }]}
          >
            <TextArea rows={6} placeholder="请输入通知内容" />
          </Form.Item>

          <Form.Item
            name="isPublic"
            label="家长可见"
            valuePropName="checked"
          >
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default NotificationManage;
