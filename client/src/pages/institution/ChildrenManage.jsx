import { useState, useEffect } from 'react';
import { 
  Table, Button, Modal, Form, Input, Select, DatePicker, 
  Space, Tag, message, Popconfirm, Card, Divider 
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { childrenApi, parentsApi } from '../../services/api';

const { Option } = Select;

function ChildrenManage() {
  const [loading, setLoading] = useState(false);
  const [children, setChildren] = useState([]);
  const [parents, setParents] = useState([]);
  const [parentsLoading, setParentsLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingChild, setEditingChild] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();

  useEffect(() => {
    fetchChildren();
    fetchParents();
  }, []);

  const fetchChildren = async (search = '') => {
    setLoading(true);
    try {
      const data = await childrenApi.getList({ search });
      setChildren(data);
    } catch (error) {
      message.error('获取儿童列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchParents = async (search = '') => {
    setParentsLoading(true);
    try {
      const data = await parentsApi.getList({ search });
      setParents(data);
    } catch (error) {
      console.error('获取家长列表失败:', error);
    } finally {
      setParentsLoading(false);
    }
  };

  const handleParentChange = (parentId) => {
    // 当选择家长时，自动填充监护人信息
    const selectedParent = parents.find(p => p.id === parentId);
    if (selectedParent) {
      form.setFieldsValue({
        guardianName: selectedParent.real_name || selectedParent.username,
        guardianPhone: selectedParent.phone || '',
      });
    }
  };

  const handleSearch = () => {
    fetchChildren(searchText);
  };

  const showModal = (child = null) => {
    setEditingChild(child);
    if (child) {
      // 处理日期时区问题：提取日期字符串的年月日部分
      const birthDateStr = child.birth_date ? child.birth_date.slice(0, 10) : null;
      form.setFieldsValue({
        ...child,
        birthDate: birthDateStr ? dayjs(birthDateStr, 'YYYY-MM-DD') : null,
        parentId: child.parent_id,
        guardianName: child.guardian_name,
        guardianPhone: child.guardian_phone,
        guardianRelation: child.guardian_relation,
        healthStatus: child.health_status,
      });
    } else {
      form.resetFields();
    }
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const data = {
        ...values,
        birthDate: values.birthDate ? values.birthDate.format('YYYY-MM-DD') : null,
      };

      if (editingChild) {
        await childrenApi.update(editingChild.id, data);
        message.success('更新成功');
      } else {
        await childrenApi.create(data);
        message.success('添加成功');
      }
      
      setModalVisible(false);
      fetchChildren();
    } catch (error) {
      if (error.errorFields) return; // 表单验证错误
      message.error(error.message || '操作失败');
    }
  };

  const handleDelete = async (id) => {
    try {
      await childrenApi.delete(id);
      message.success('删除成功');
      fetchChildren();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 100,
    },
    {
      title: '性别',
      dataIndex: 'gender',
      key: 'gender',
      width: 80,
      render: (gender) => gender === 'male' ? '男' : '女',
    },
    {
      title: '年级',
      dataIndex: 'grade',
      key: 'grade',
      width: 100,
    },
    {
      title: '学校',
      dataIndex: 'school',
      key: 'school',
      ellipsis: true,
    },
    {
      title: '监护人',
      dataIndex: 'guardian_name',
      key: 'guardian_name',
      width: 100,
    },
    {
      title: '联系电话',
      dataIndex: 'guardian_phone',
      key: 'guardian_phone',
      width: 130,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const statusMap = {
          active: { text: '在册', color: 'green' },
          graduated: { text: '已毕业', color: 'blue' },
          transferred: { text: '已转出', color: 'default' },
        };
        const s = statusMap[status] || statusMap.active;
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
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
            title="确定要删除该儿童信息吗？"
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
        <h2>儿童信息管理</h2>
        <Space>
          <Input
            placeholder="搜索姓名/学校"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 200 }}
          />
          <Button icon={<SearchOutlined />} onClick={handleSearch}>搜索</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>
            添加儿童
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={children}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: '暂无儿童信息' }}
        scroll={{ x: 'max-content' }}
      />

      <Modal
        title={editingChild ? '编辑儿童信息' : '添加儿童信息'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={700}
      >
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              name="name"
              label="姓名"
              rules={[{ required: true, message: '请输入姓名' }]}
            >
              <Input placeholder="请输入姓名" />
            </Form.Item>

            <Form.Item
              name="gender"
              label="性别"
              rules={[{ required: true, message: '请选择性别' }]}
            >
              <Select placeholder="请选择性别">
                <Option value="male">男</Option>
                <Option value="female">女</Option>
              </Select>
            </Form.Item>

            <Form.Item name="birthDate" label="出生日期">
              <DatePicker style={{ width: '100%' }} placeholder="请选择出生日期" />
            </Form.Item>

            <Form.Item name="idCard" label="身份证号">
              <Input placeholder="请输入身份证号" />
            </Form.Item>

            <Form.Item name="school" label="就读学校">
              <Input placeholder="请输入就读学校" />
            </Form.Item>

            <Form.Item name="grade" label="年级">
              <Input placeholder="请输入年级，如：三年级" />
            </Form.Item>
          </div>

          <Divider orientation="left">
            <Space><UserOutlined />绑定家长账号</Space>
          </Divider>
          
          <Form.Item
            name="parentId"
            label="选择已注册家长"
            extra="选择已注册的家长账号进行绑定，绑定后家长可在其账户中查看孩子信息"
          >
            <Select
              placeholder="请选择要绑定的家长账号"
              allowClear
              showSearch
              loading={parentsLoading}
              onChange={handleParentChange}
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {parents.map(parent => (
                <Option key={parent.id} value={parent.id}>
                  {parent.real_name || parent.username} - {parent.phone || '未填写电话'}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Divider orientation="left">监护人补充信息</Divider>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <Form.Item
              name="guardianName"
              label="监护人姓名"
              rules={[{ required: true, message: '请输入监护人姓名' }]}
            >
              <Input placeholder="选择家长后自动填充" />
            </Form.Item>

            <Form.Item
              name="guardianPhone"
              label="监护人电话"
              rules={[{ required: true, message: '请输入监护人电话' }]}
            >
              <Input placeholder="选择家长后自动填充" />
            </Form.Item>

            <Form.Item name="guardianRelation" label="与儿童关系">
              <Select placeholder="请选择关系">
                <Option value="父亲">父亲</Option>
                <Option value="母亲">母亲</Option>
                <Option value="爷爷">爷爷</Option>
                <Option value="奶奶">奶奶</Option>
                <Option value="外公">外公</Option>
                <Option value="外婆">外婆</Option>
                <Option value="其他">其他</Option>
              </Select>
            </Form.Item>
          </div>

          {editingChild && (
            <Form.Item name="status" label="儿童状态">
              <Select>
                <Option value="active">在册</Option>
                <Option value="graduated">已毕业</Option>
                <Option value="transferred">已转出</Option>
              </Select>
            </Form.Item>
          )}

          <Form.Item name="healthStatus" label="健康状况">
            <Input.TextArea rows={2} placeholder="请输入健康状况说明" />
          </Form.Item>

          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="其他需要记录的信息" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default ChildrenManage;
