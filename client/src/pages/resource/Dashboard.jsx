import { useState, useEffect } from 'react';
import { Card, Row, Col, Tag, Empty, message, Spin, Input, Select, Button, Modal, Form, Space, Tooltip, Descriptions } from 'antd';
import { 
  TeamOutlined, 
  BookOutlined,
  GiftOutlined,
  HeartOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { resourcesApi } from '../../services/api';

const { Option } = Select;
const { TextArea } = Input;

const resourceTypeMap = {
  course: { label: '课程资源', icon: <BookOutlined />, color: '#1890ff' },
  material: { label: '物资支持', icon: <GiftOutlined />, color: '#52c41a' },
  volunteer: { label: '志愿服务', icon: <HeartOutlined />, color: '#eb2f96' },
  fund: { label: '资金捐赠', icon: <TeamOutlined />, color: '#faad14' },
  other: { label: '其他资源', icon: <GiftOutlined />, color: '#666' },
};

const orgTypeMap = {
  university: '高校',
  enterprise: '企业',
  ngo: '公益组织',
  individual: '个人',
  other: '其他',
};

const statusMap = {
  pending: { text: '待审核', color: 'orange', icon: <ClockCircleOutlined /> },
  approved: { text: '已通过', color: 'green', icon: <CheckCircleOutlined /> },
  rejected: { text: '已拒绝', color: 'red', icon: <CloseCircleOutlined /> },
  matched: { text: '已对接', color: 'blue', icon: <CheckCircleOutlined /> },
  completed: { text: '已完成', color: 'default', icon: <CheckCircleOutlined /> },
};

const orgTypes = [
  { value: 'university', label: '高校' },
  { value: 'enterprise', label: '企业' },
  { value: 'ngo', label: '公益组织' },
  { value: 'individual', label: '个人志愿者' },
  { value: 'other', label: '其他' },
];

const resourceTypes = [
  { value: 'course', label: '课程资源' },
  { value: 'material', label: '物资支持' },
  { value: 'volunteer', label: '志愿服务' },
  { value: 'fund', label: '资金捐赠' },
  { value: 'other', label: '其他资源' },
];

function ResourceDashboard() {
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState([]);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchText, setSearchText] = useState('');
  const [editVisible, setEditVisible] = useState(false);
  const [editingResource, setEditingResource] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentResource, setCurrentResource] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchResources();
  }, [filterType, filterStatus]);

  const fetchResources = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterType) params.resourceType = filterType;
      if (filterStatus) params.status = filterStatus;
      const data = await resourcesApi.getList(params);
      setResources(data);
    } catch (error) {
      message.error('获取资源列表失败');
    } finally {
      setLoading(false);
    }
  };

  const filteredResources = resources.filter(r => 
    !searchText || 
    r.resource_title?.includes(searchText) || 
    r.org_name?.includes(searchText)
  );

  // 编辑
  const handleEdit = (resource) => {
    setEditingResource(resource);
    form.setFieldsValue({
      orgType: resource.org_type,
      orgName: resource.org_name,
      resourceType: resource.resource_type,
      resourceTitle: resource.resource_title,
      resourceDescription: resource.resource_description,
      contactName: resource.contact_name,
      contactPhone: resource.contact_phone,
      contactEmail: resource.contact_email,
    });
    setEditVisible(true);
  };

  const handleEditSubmit = async (values) => {
    setEditLoading(true);
    try {
      await resourcesApi.update(editingResource.id, values);
      message.success('资源信息更新成功');
      setEditVisible(false);
      fetchResources();
    } catch (error) {
      message.error(error.message || '更新失败');
    } finally {
      setEditLoading(false);
    }
  };

  // 删除
  const handleDelete = (id) => {
    Modal.confirm({
      title: '确认删除？',
      content: '删除后将无法恢复该资源登记信息。',
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await resourcesApi.delete(id);
          message.success('删除成功');
          fetchResources();
        } catch (error) {
          message.error('删除失败');
        }
      },
    });
  };

  // 详情
  const showDetail = (resource) => {
    setCurrentResource(resource);
    setDetailVisible(true);
  };

  // 统计
  const pendingCount = resources.filter(r => r.status === 'pending').length;
  const approvedCount = resources.filter(r => r.status === 'approved').length;
  const rejectedCount = resources.filter(r => r.status === 'rejected').length;

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div className="page-title-bar">
        <h2><GiftOutlined /> 资源中心</h2>
        <p className="page-subtitle">管理您提交的资源信息，追踪审核进度</p>
      </div>

      {/* 状态统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card className="stat-card" hoverable onClick={() => setFilterStatus('')}>
            <div className="stat-icon" style={{ background: '#f0f5ff' }}>
              <AppstoreOutlined style={{ color: '#3B82F6' }} />
            </div>
            <div className="stat-text">
              <span className="stat-label">全部资源</span>
              <span className="stat-num">{resources.length}<small>项</small></span>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="stat-card" hoverable onClick={() => setFilterStatus('pending')}>
            <div className="stat-icon" style={{ background: '#fff7e6' }}>
              <ClockCircleOutlined style={{ color: '#faad14' }} />
            </div>
            <div className="stat-text">
              <span className="stat-label">待审核</span>
              <span className="stat-num" style={{ color: '#faad14' }}>{pendingCount}<small>项</small></span>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="stat-card" hoverable onClick={() => setFilterStatus('approved')}>
            <div className="stat-icon" style={{ background: '#f6ffed' }}>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
            </div>
            <div className="stat-text">
              <span className="stat-label">已通过</span>
              <span className="stat-num" style={{ color: '#52c41a' }}>{approvedCount}<small>项</small></span>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="stat-card" hoverable onClick={() => setFilterStatus('rejected')}>
            <div className="stat-icon" style={{ background: '#fff2f0' }}>
              <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
            </div>
            <div className="stat-text">
              <span className="stat-label">已拒绝</span>
              <span className="stat-num" style={{ color: '#ff4d4f' }}>{rejectedCount}<small>项</small></span>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 筛选区域 */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={16} align="middle">
          <Col>
            <Select value={filterStatus} onChange={setFilterStatus} style={{ width: 130 }} allowClear placeholder="全部状态">
              <Option value="pending">待审核</Option>
              <Option value="approved">已通过</Option>
              <Option value="rejected">已拒绝</Option>
            </Select>
          </Col>
          <Col>
            <Select value={filterType} onChange={setFilterType} style={{ width: 130 }} allowClear placeholder="全部类型">
              {Object.entries(resourceTypeMap).map(([key, value]) => (
                <Option key={key} value={key}>{value.label}</Option>
              ))}
            </Select>
          </Col>
          <Col flex={1}>
            <Input placeholder="搜索资源标题或机构名称" prefix={<SearchOutlined />} value={searchText} onChange={e => setSearchText(e.target.value)} style={{ maxWidth: 300 }} allowClear />
          </Col>
        </Row>
      </Card>

      {/* 资源列表 */}
      {filteredResources.length > 0 ? (
        <Row gutter={[24, 24]}>
          {filteredResources.map(resource => {
            const typeInfo = resourceTypeMap[resource.resource_type] || resourceTypeMap.other;
            const sInfo = statusMap[resource.status] || statusMap.pending;
            return (
              <Col xs={24} sm={12} lg={8} key={resource.id}>
                <div className="resource-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <span className="resource-type">{typeInfo.label}</span>
                    <Tag color={sInfo.color} icon={sInfo.icon}>{sInfo.text}</Tag>
                  </div>
                  <h4>{resource.resource_title}</h4>
                  <p>{resource.resource_description || '暂无描述'}</p>
                  <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginTop: 12 }}>
                    <div style={{ color: '#666', fontSize: 13 }}>
                      <span style={{ marginRight: 16 }}>
                        {orgTypeMap[resource.org_type] || '组织'}：{resource.org_name}
                      </span>
                    </div>
                    {resource.contact_name && (
                      <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                        联系人：{resource.contact_name}
                      </div>
                    )}
                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                      <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => showDetail(resource)}>详情</Button>
                      {(resource.status === 'pending' || resource.status === 'rejected') && (
                        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(resource)}>编辑</Button>
                      )}
                      <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(resource.id)}>删除</Button>
                    </div>
                  </div>
                </div>
              </Col>
            );
          })}
        </Row>
      ) : (
        <Card>
          <Empty description="暂无资源信息，请前往「资源登记」提交您的资源" />
        </Card>
      )}

      {/* 详情弹窗 */}
      <Modal title="资源详情" open={detailVisible} onCancel={() => setDetailVisible(false)} footer={<Button onClick={() => setDetailVisible(false)}>关闭</Button>} width={560}>
        {currentResource && (
          <Descriptions column={2} bordered size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="资源标题" span={2}>{currentResource.resource_title}</Descriptions.Item>
            <Descriptions.Item label="资源类型"><Tag color={resourceTypeMap[currentResource.resource_type]?.color}>{resourceTypeMap[currentResource.resource_type]?.label}</Tag></Descriptions.Item>
            <Descriptions.Item label="审核状态"><Tag color={statusMap[currentResource.status]?.color} icon={statusMap[currentResource.status]?.icon}>{statusMap[currentResource.status]?.text}</Tag></Descriptions.Item>
            <Descriptions.Item label="组织类型">{orgTypeMap[currentResource.org_type]}</Descriptions.Item>
            <Descriptions.Item label="机构名称">{currentResource.org_name}</Descriptions.Item>
            <Descriptions.Item label="联系人">{currentResource.contact_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="联系电话">{currentResource.contact_phone || '-'}</Descriptions.Item>
            <Descriptions.Item label="电子邮箱" span={2}>{currentResource.contact_email || '-'}</Descriptions.Item>
            <Descriptions.Item label="资源描述" span={2}><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{currentResource.resource_description || '暂无描述'}</div></Descriptions.Item>
            <Descriptions.Item label="提交时间" span={2}>{currentResource.created_at ? new Date(currentResource.created_at).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* 编辑弹窗 */}
      <Modal title="编辑资源信息" open={editVisible} onCancel={() => setEditVisible(false)} footer={null} width={560} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleEditSubmit} style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="orgType" label="组织类型" rules={[{ required: true }]}>
                <Select placeholder="选择组织类型">{orgTypes.map(t => <Option key={t.value} value={t.value}>{t.label}</Option>)}</Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="orgName" label="机构名称" rules={[{ required: true }]}>
                <Input placeholder="机构/组织名称" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="resourceType" label="资源类型" rules={[{ required: true }]}>
                <Select placeholder="选择资源类型">{resourceTypes.map(t => <Option key={t.value} value={t.value}>{t.label}</Option>)}</Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="resourceTitle" label="资源标题" rules={[{ required: true }]}>
                <Input placeholder="资源标题" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="resourceDescription" label="详细描述">
            <TextArea rows={3} placeholder="资源详细描述" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="contactName" label="联系人" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="contactPhone" label="联系电话" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="contactEmail" label="邮箱"><Input /></Form.Item></Col>
          </Row>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space><Button onClick={() => setEditVisible(false)}>取消</Button><Button type="primary" htmlType="submit" loading={editLoading}>保存修改</Button></Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default ResourceDashboard;
