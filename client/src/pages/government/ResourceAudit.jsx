import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, message, Modal, Space, Input, Select, Badge, Descriptions, Empty, Tooltip, Row, Col } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  AuditOutlined,
  SearchOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { resourcesApi } from '../../services/api';

const { Option } = Select;
const { TextArea } = Input;

const resourceTypeMap = {
  course: { label: '课程资源', color: '#1890ff' },
  material: { label: '物资支持', color: '#52c41a' },
  volunteer: { label: '志愿服务', color: '#eb2f96' },
  fund: { label: '资金捐赠', color: '#faad14' },
  other: { label: '其他资源', color: '#666' },
};

const orgTypeMap = {
  university: '高校',
  enterprise: '企业',
  ngo: '公益组织',
  individual: '个人志愿者',
  other: '其他',
};

const statusMap = {
  pending: { text: '待审核', color: 'orange' },
  approved: { text: '已通过', color: 'green' },
  rejected: { text: '已拒绝', color: 'red' },
  matched: { text: '已对接', color: 'blue' },
  completed: { text: '已完成', color: 'default' },
};

function ResourceAudit() {
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [searchText, setSearchText] = useState('');
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentResource, setCurrentResource] = useState(null);
  const [rejectVisible, setRejectVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState(null);

  useEffect(() => {
    fetchResources();
  }, [filterStatus, filterType]);

  const fetchResources = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      const data = await resourcesApi.getAll(params);
      setResources(data);
    } catch (error) {
      message.error('获取资源列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = (id) => {
    Modal.confirm({
      title: '确认通过审核？',
      icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
      content: '通过后该资源将在资源中心公开展示。',
      okText: '确认通过',
      cancelText: '取消',
      onOk: async () => {
        try {
          await resourcesApi.approve(id, 'approved');
          message.success('资源已审核通过');
          fetchResources();
        } catch (error) {
          message.error('操作失败');
        }
      },
    });
  };

  const openRejectModal = (id) => {
    setRejectingId(id);
    setRejectReason('');
    setRejectVisible(true);
  };

  const handleReject = async () => {
    try {
      await resourcesApi.approve(rejectingId, 'rejected');
      message.success('已拒绝该资源');
      setRejectVisible(false);
      fetchResources();
    } catch (error) {
      message.error('操作失败');
    }
  };

  const showDetail = (record) => {
    setCurrentResource(record);
    setDetailVisible(true);
  };

  const filteredResources = resources.filter(r =>
    (!searchText || r.resource_title?.includes(searchText) || r.org_name?.includes(searchText) || r.contact_name?.includes(searchText)) &&
    (!filterType || r.resource_type === filterType)
  );

  const pendingCount = resources.filter(r => r.status === 'pending').length;
  const approvedCount = resources.filter(r => r.status === 'approved').length;
  const rejectedCount = resources.filter(r => r.status === 'rejected').length;

  const columns = [
    { title: '资源标题', dataIndex: 'resource_title', key: 'resource_title', width: 180, ellipsis: true },
    {
      title: '资源类型', dataIndex: 'resource_type', key: 'resource_type', width: 110,
      render: (type) => <Tag color={(resourceTypeMap[type] || resourceTypeMap.other).color}>{(resourceTypeMap[type] || resourceTypeMap.other).label}</Tag>,
    },
    {
      title: '提供方', dataIndex: 'org_name', key: 'org_name', width: 150, ellipsis: true,
      render: (name, record) => <span><span style={{ color: '#999', fontSize: 12 }}>[{orgTypeMap[record.org_type] || '其他'}] </span>{name}</span>,
    },
    { title: '联系人', dataIndex: 'contact_name', key: 'contact_name', width: 90 },
    { title: '联系电话', dataIndex: 'contact_phone', key: 'contact_phone', width: 130 },
    {
      title: '提交时间', dataIndex: 'created_at', key: 'created_at', width: 110,
      render: (date) => {
        if (!date) return '-';
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      },
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (status) => <Tag color={(statusMap[status] || { color: 'default' }).color}>{(statusMap[status] || { text: status }).text}</Tag>,
    },
    {
      title: '操作', key: 'action', width: 200, fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => showDetail(record)}>详情</Button>
          {record.status === 'pending' && (
            <>
              <Button type="link" size="small" style={{ color: '#52c41a' }} icon={<CheckCircleOutlined />} onClick={() => handleApprove(record.id)}>通过</Button>
              <Button type="link" size="small" danger icon={<CloseCircleOutlined />} onClick={() => openRejectModal(record.id)}>拒绝</Button>
            </>
          )}
          {record.status === 'approved' && (
            <Button type="link" size="small" danger icon={<CloseCircleOutlined />} onClick={() => openRejectModal(record.id)}>撤回</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="page-title-bar">
        <h2><AuditOutlined /> 资源审核管理</h2>
        <p className="page-subtitle">审核资源方提交的资源信息，通过后将在资源中心公开展示</p>
      </div>

      {/* 状态统计 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card className="stat-card" hoverable onClick={() => setFilterStatus('')}>
            <div className="stat-icon" style={{ background: '#f0f5ff' }}><AppstoreOutlined style={{ color: '#3B82F6' }} /></div>
            <div className="stat-text"><span className="stat-label">全部</span><span className="stat-num">{resources.length}<small>项</small></span></div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="stat-card" hoverable onClick={() => setFilterStatus('pending')}>
            <div className="stat-icon" style={{ background: '#fff7e6' }}><ClockCircleOutlined style={{ color: '#faad14' }} /></div>
            <div className="stat-text"><span className="stat-label">待审核</span><span className="stat-num" style={{ color: '#faad14' }}>{pendingCount}<small>项</small></span></div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="stat-card" hoverable onClick={() => setFilterStatus('approved')}>
            <div className="stat-icon" style={{ background: '#f6ffed' }}><CheckCircleOutlined style={{ color: '#52c41a' }} /></div>
            <div className="stat-text"><span className="stat-label">已通过</span><span className="stat-num" style={{ color: '#52c41a' }}>{approvedCount}<small>项</small></span></div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="stat-card" hoverable onClick={() => setFilterStatus('rejected')}>
            <div className="stat-icon" style={{ background: '#fff2f0' }}><CloseCircleOutlined style={{ color: '#ff4d4f' }} /></div>
            <div className="stat-text"><span className="stat-label">已拒绝</span><span className="stat-num" style={{ color: '#ff4d4f' }}>{rejectedCount}<small>项</small></span></div>
          </Card>
        </Col>
      </Row>

      {/* 筛选 */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select value={filterStatus} onChange={setFilterStatus} style={{ width: 130 }} allowClear placeholder="全部状态">
            <Option value="pending">待审核</Option>
            <Option value="approved">已通过</Option>
            <Option value="rejected">已拒绝</Option>
          </Select>
          <Select value={filterType} onChange={setFilterType} style={{ width: 130 }} allowClear placeholder="全部类型">
            {Object.entries(resourceTypeMap).map(([key, val]) => <Option key={key} value={key}>{val.label}</Option>)}
          </Select>
          <Input placeholder="搜索标题/机构/联系人" prefix={<SearchOutlined />} value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: 220 }} allowClear />
        </Space>
      </Card>

      {/* 表格 */}
      <Card>
        <Table columns={columns} dataSource={filteredResources} rowKey="id" loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 1000 }} locale={{ emptyText: <Empty description="暂无资源数据" /> }}
        />
      </Card>

      {/* 详情弹窗 */}
      <Modal title="资源详情" open={detailVisible} onCancel={() => setDetailVisible(false)} width={600}
        footer={currentResource?.status === 'pending' ? (
          <Space>
            <Button onClick={() => setDetailVisible(false)}>关闭</Button>
            <Button danger icon={<CloseCircleOutlined />} onClick={() => { setDetailVisible(false); openRejectModal(currentResource.id); }}>拒绝</Button>
            <Button type="primary" icon={<CheckCircleOutlined />} style={{ background: '#52c41a', borderColor: '#52c41a' }}
              onClick={() => { setDetailVisible(false); handleApprove(currentResource.id); }}>审核通过</Button>
          </Space>
        ) : <Button onClick={() => setDetailVisible(false)}>关闭</Button>}
      >
        {currentResource && (
          <Descriptions column={2} bordered size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="资源标题" span={2}>{currentResource.resource_title}</Descriptions.Item>
            <Descriptions.Item label="资源类型"><Tag color={resourceTypeMap[currentResource.resource_type]?.color}>{resourceTypeMap[currentResource.resource_type]?.label}</Tag></Descriptions.Item>
            <Descriptions.Item label="审核状态"><Tag color={statusMap[currentResource.status]?.color}>{statusMap[currentResource.status]?.text}</Tag></Descriptions.Item>
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

      {/* 拒绝弹窗 */}
      <Modal title={<span><ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />拒绝资源</span>}
        open={rejectVisible} onCancel={() => setRejectVisible(false)} onOk={handleReject}
        okText="确认拒绝" okButtonProps={{ danger: true }} cancelText="取消">
        <p style={{ marginBottom: 12, color: '#666' }}>请输入拒绝原因（选填），以便资源方了解：</p>
        <TextArea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="如：信息不完整、资源描述不清晰等" />
      </Modal>
    </div>
  );
}

export default ResourceAudit;
