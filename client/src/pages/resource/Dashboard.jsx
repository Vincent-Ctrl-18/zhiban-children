import { useState, useEffect } from 'react';
import { Card, Row, Col, Tag, Empty, message, Spin, Input, Select } from 'antd';
import { 
  TeamOutlined, 
  BookOutlined,
  GiftOutlined,
  HeartOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { resourcesApi } from '../../services/api';

const { Option } = Select;

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

function ResourceDashboard() {
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState([]);
  const [filterType, setFilterType] = useState('');
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    fetchResources();
  }, [filterType]);

  const fetchResources = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterType) params.resourceType = filterType;
      const data = await resourcesApi.getList(params);
      setResources(data);
    } catch (error) {
      // 使用模拟数据展示
      setResources([
        {
          id: 1,
          org_name: '西南大学',
          org_type: 'university',
          resource_type: 'volunteer',
          resource_title: '周末支教志愿者',
          resource_description: '提供每周末2名志愿者进行课业辅导',
          contact_name: '李老师',
          status: 'approved',
        },
        {
          id: 2,
          org_name: '某爱心企业',
          org_type: 'enterprise',
          resource_type: 'material',
          resource_title: '学习用品捐赠',
          resource_description: '捐赠文具、书包等学习用品100套',
          contact_name: '王经理',
          status: 'approved',
        },
        {
          id: 3,
          org_name: '在线教育平台',
          org_type: 'enterprise',
          resource_type: 'course',
          resource_title: '免费在线课程',
          resource_description: '提供小学全科在线课程资源',
          contact_name: '张老师',
          status: 'approved',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const filteredResources = resources.filter(r => 
    !searchText || 
    r.resource_title.includes(searchText) || 
    r.org_name.includes(searchText)
  );

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>资源中心</h2>

      {/* 筛选区域 */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={16} align="middle">
          <Col>
            <span style={{ marginRight: 8 }}>资源类型：</span>
            <Select 
              value={filterType} 
              onChange={setFilterType}
              style={{ width: 150 }}
              allowClear
              placeholder="全部类型"
            >
              {Object.entries(resourceTypeMap).map(([key, value]) => (
                <Option key={key} value={key}>{value.label}</Option>
              ))}
            </Select>
          </Col>
          <Col flex={1}>
            <Input
              placeholder="搜索资源标题或机构名称"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{ maxWidth: 300 }}
            />
          </Col>
        </Row>
      </Card>

      {/* 资源列表 */}
      {filteredResources.length > 0 ? (
        <Row gutter={[24, 24]}>
          {filteredResources.map(resource => {
            const typeInfo = resourceTypeMap[resource.resource_type] || resourceTypeMap.other;
            return (
              <Col xs={24} sm={12} lg={8} key={resource.id}>
                <div className="resource-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <span className="resource-type">{typeInfo.label}</span>
                    <Tag color={resource.status === 'approved' ? 'green' : 'orange'}>
                      {resource.status === 'approved' ? '已认证' : '待审核'}
                    </Tag>
                  </div>
                  <h4>{resource.resource_title}</h4>
                  <p>{resource.resource_description}</p>
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
                  </div>
                </div>
              </Col>
            );
          })}
        </Row>
      ) : (
        <Card>
          <Empty description="暂无资源信息" />
        </Card>
      )}
    </div>
  );
}

export default ResourceDashboard;
