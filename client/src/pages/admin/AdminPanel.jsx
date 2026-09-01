import { useState, useEffect } from 'react';
import { Layout, Menu, Card, Row, Col, Statistic, Table, Tag, Button, Input, Select, Space, Modal, message, Typography, Badge, Tabs, Descriptions, Empty, Tooltip, Slider, InputNumber, Alert, Switch } from 'antd';
import {
  DashboardOutlined,
  AuditOutlined,
  KeyOutlined,
  LogoutOutlined,
  UserOutlined,
  TeamOutlined,
  HomeOutlined,
  BookOutlined,
  SafetyOutlined,
  BellOutlined,
  GiftOutlined,
  BarChartOutlined,
  ReadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
  SearchOutlined,
  AppstoreOutlined,
  CalendarOutlined,
  RiseOutlined,
  CodeOutlined,
  ReloadOutlined,
  EditOutlined,
  UndoOutlined,
  FileTextOutlined,
  HeartOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { adminApi } from '../../services/api';
import ReactECharts from 'echarts-for-react';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

// ========== 资源审核子组件 ==========
const resourceTypeMap = {
  course: { label: '课程资源', color: '#1890ff' },
  material: { label: '物资支持', color: '#52c41a' },
  volunteer: { label: '志愿服务', color: '#eb2f96' },
  fund: { label: '资金捐赠', color: '#faad14' },
  other: { label: '其他资源', color: '#666' },
};
const orgTypeMap = { university: '高校', enterprise: '企业', ngo: '公益组织', individual: '个人志愿者', other: '其他' };
const statusMap = {
  pending: { text: '待审核', color: 'orange' },
  approved: { text: '已通过', color: 'green' },
  rejected: { text: '已拒绝', color: 'red' },
  matched: { text: '已对接', color: 'blue' },
  completed: { text: '已完成', color: 'default' },
};

function AdminPanel({ onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
    { key: 'dashboard', icon: <DashboardOutlined />, label: '数据总览' },
    { key: 'users', icon: <TeamOutlined />, label: '用户管理' },
    { key: 'audit', icon: <AuditOutlined />, label: '资源审核' },
    { key: 'ebooks', icon: <ReadOutlined />, label: '电子书审核' },
    { key: 'apikey', icon: <KeyOutlined />, label: 'API 密钥' },
    { key: 'prompts', icon: <MessageOutlined />, label: 'AI Prompt' },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible collapsed={collapsed} onCollapse={setCollapsed}
        width={200}
        style={{ background: '#fff', borderRight: '1px solid #f0f0f0' }}
        theme="light"
      >
        <div style={{ padding: '20px 16px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <CodeOutlined style={{ fontSize: 20, color: '#6c5ce7' }} />
              <span style={{ color: '#1d1d1f', fontSize: 16, fontWeight: 700 }}>开发者后台</span>
            </div>
          )}
          {collapsed && <CodeOutlined style={{ fontSize: 20, color: '#6c5ce7' }} />}
        </div>
        <Menu
          mode="inline" selectedKeys={[activeTab]}
          onClick={({ key }) => setActiveTab(key)}
          items={menuItems}
          style={{ borderRight: 0 }}
        />
        <div style={{ position: 'absolute', bottom: 16, width: '100%', textAlign: 'center' }}>
          <Button type="text" icon={<LogoutOutlined />} onClick={onLogout}
            style={{ color: '#86868b' }}>
            {!collapsed && '退出'}
          </Button>
        </div>
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            {activeTab === 'dashboard' && <><BarChartOutlined style={{ color: '#6c5ce7' }} /> 数据总览</>}
            {activeTab === 'users' && <><TeamOutlined style={{ color: '#6c5ce7' }} /> 用户管理</>}
            {activeTab === 'audit' && <><AuditOutlined style={{ color: '#6c5ce7' }} /> 资源审核</>}
            {activeTab === 'ebooks' && <><ReadOutlined style={{ color: '#6c5ce7' }} /> 电子书审核</>}
            {activeTab === 'apikey' && <><KeyOutlined style={{ color: '#6c5ce7' }} /> API 密钥管理</>}
            {activeTab === 'prompts' && <><MessageOutlined style={{ color: '#6c5ce7' }} /> AI Prompt 管理</>}
          </Title>
          <Space>
            <Badge dot color="#52c41a" />
            <Text type="secondary">开发者模式</Text>
          </Space>
        </Header>
        <Content style={{ padding: 24, background: '#f5f6fa' }}>
          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'audit' && <AuditTab />}
          {activeTab === 'ebooks' && <EbookAuditTab />}
          {activeTab === 'apikey' && <ApiKeyTab />}
          {activeTab === 'prompts' && <PromptTab />}
        </Content>
      </Layout>
    </Layout>
  );
}

// ========== 数据总览 Tab ==========
function DashboardTab() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [homeworkLoading, setHomeworkLoading] = useState(true);
  const [homeworkRange, setHomeworkRange] = useState('7d');
  const [homeworkStats, setHomeworkStats] = useState(null);
  const [projectRange, setProjectRange] = useState('7d');
  const [projectStats, setProjectStats] = useState(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectFeature, setProjectFeature] = useState('');
  const [projectRole, setProjectRole] = useState('');
  const [projectInstitution, setProjectInstitution] = useState('');
  const [riskStats, setRiskStats] = useState([]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getStatistics();
      setStats(data);
    } catch (error) {
      message.error('获取统计数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  const fetchHomeworkStats = async () => {
    setHomeworkLoading(true);
    try {
      const data = await adminApi.getHomeworkStatistics(homeworkRange);
      setHomeworkStats(data);
    } catch (error) {
      message.error('获取 AI 作业统计失败');
    } finally {
      setHomeworkLoading(false);
    }
  };

  useEffect(() => { fetchHomeworkStats(); }, [homeworkRange]);

  useEffect(() => {
    let cancelled = false;
    setProjectLoading(true);
    adminApi.getProjectStatistics({ range: projectRange, featureCode: projectFeature || undefined, role: projectRole || undefined, institutionId: projectInstitution || undefined }).then((data) => { if (!cancelled) setProjectStats(data); }).catch(() => { if (!cancelled) setProjectStats(null); }).finally(() => { if (!cancelled) setProjectLoading(false); });
    return () => { cancelled = true; };
  }, [projectRange, projectFeature, projectRole, projectInstitution]);
  useEffect(() => { adminApi.getCompanionRiskStatistics().then(setRiskStats).catch(() => setRiskStats([])); }, []);

  const exportProjectCsv = async () => {
    try {
      const blob = await adminApi.downloadProjectStatisticsCsv({ range: projectRange, featureCode: projectFeature || undefined, role: projectRole || undefined, institutionId: projectInstitution || undefined });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `project-metrics-${projectRange}.csv`; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) { message.error(error.message || 'CSV 导出暂不可用'); }
  };

  if (loading || !stats) {
    return <Card loading={loading} style={{ borderRadius: 12 }} />;
  }

  const userCards = [
    { title: '总用户', value: stats.users.total, icon: <UserOutlined />, color: '#6c5ce7', bg: '#f3f0ff' },
    { title: '家长', value: stats.users.parent, icon: <TeamOutlined />, color: '#FF9F43', bg: '#fff5e6' },
    { title: '机构用户', value: stats.users.institution, icon: <HomeOutlined />, color: '#1dd1a1', bg: '#e3f9f3' },
    { title: '资源方', value: stats.users.resource, icon: <GiftOutlined />, color: '#48dbfb', bg: '#e8f9fe' },
    { title: '政府端', value: stats.users.government, icon: <BarChartOutlined />, color: '#a55eea', bg: '#f3eaff' },
    { title: '学生', value: stats.users.student, icon: <ReadOutlined />, color: '#ff6348', bg: '#ffede9' },
  ];

  const dataCards = [
    { title: '托管机构', value: stats.institutions, icon: <HomeOutlined />, color: '#1dd1a1' },
    { title: '服务儿童', value: stats.children, icon: <TeamOutlined />, color: '#FF9F43' },
    { title: '活动总数', value: stats.activities, icon: <CalendarOutlined />, color: '#3B82F6' },
    { title: '签到记录', value: stats.checkins, icon: <CheckCircleOutlined />, color: '#10b981' },
    { title: '安全检查', value: stats.safetyChecks, icon: <SafetyOutlined />, color: '#f59e0b' },
    { title: '通知数', value: stats.notifications, icon: <BellOutlined />, color: '#8b5cf6' },
  ];

  const homeworkTotals = homeworkStats?.totals || {
    attempts: 0,
    successes: 0,
    failures: 0,
    completedSessions: 0,
    uniqueStudents: 0,
    successRate: 0,
    completionRate: 0,
  };
  const homeworkTrend = homeworkStats?.trend || [];
  const homeworkTrendOption = {
    tooltip: { trigger: 'axis' },
    legend: { top: 0, right: 0, textStyle: { color: '#6b7280', fontSize: 12 } },
    grid: { top: 38, left: 42, right: 20, bottom: 30 },
    xAxis: {
      type: 'category',
      data: homeworkTrend.map((item) => item.date.slice(5)),
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisTick: { show: false },
      axisLabel: { color: '#9ca3af', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } },
      axisLabel: { color: '#9ca3af', fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      { name: '提交', type: 'line', smooth: true, data: homeworkTrend.map((item) => item.attempts), lineStyle: { color: '#FF9F43', width: 2 }, itemStyle: { color: '#FF9F43' } },
      { name: '成功', type: 'line', smooth: true, data: homeworkTrend.map((item) => item.successes), lineStyle: { color: '#1dd1a1', width: 2 }, itemStyle: { color: '#1dd1a1' } },
      { name: '完成', type: 'line', smooth: true, data: homeworkTrend.map((item) => item.completions), lineStyle: { color: '#6c5ce7', width: 2 }, itemStyle: { color: '#6c5ce7' } },
    ],
  };

  return (
    <div>
      {/* 今日概况 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)' }}>
            <Statistic title={<span style={{ color: 'rgba(255,255,255,0.8)' }}>今日新增用户</span>}
              value={stats.users.todayNew}
              valueStyle={{ color: '#fff', fontSize: 36 }}
              prefix={<RiseOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg, #00b894 0%, #55efc4 100%)' }}>
            <Statistic title={<span style={{ color: 'rgba(255,255,255,0.8)' }}>今日签到</span>}
              value={stats.todayCheckins}
              valueStyle={{ color: '#fff', fontSize: 36 }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg, #e17055 0%, #fab1a0 100%)' }}>
            <Statistic title={<span style={{ color: 'rgba(255,255,255,0.8)' }}>待审核资源</span>}
              value={stats.resources.pending}
              valueStyle={{ color: '#fff', fontSize: 36 }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 用户分布 */}
      <Card title={<span style={{ fontSize: 17, fontWeight: 600 }}><TeamOutlined style={{ color: '#6c5ce7', marginRight: 8 }} />用户分布</span>} bordered={false} style={{ borderRadius: 12, marginBottom: 24 }}
        extra={<Button type="text" icon={<ReloadOutlined />} onClick={fetchStats}>刷新</Button>}>
        <Row gutter={[12, 12]}>
          {userCards.map((c, i) => (
            <Col xs={12} sm={8} md={4} key={i}>
              <Card bordered={false} style={{ borderRadius: 10, background: c.bg, textAlign: 'center' }}>
                <div style={{ fontSize: 28, color: c.color, marginBottom: 4 }}>{c.icon}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 13, color: '#666' }}>{c.title}</div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* 业务数据 */}
      <Card title={<span style={{ fontSize: 17, fontWeight: 600 }}><BarChartOutlined style={{ color: '#6c5ce7', marginRight: 8 }} />业务数据</span>} bordered={false} style={{ borderRadius: 12, marginBottom: 24 }}>
        <Row gutter={[12, 12]}>
          {dataCards.map((c, i) => (
            <Col xs={12} sm={8} md={4} key={i}>
              <Card bordered={false} hoverable style={{ borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 24, color: c.color, marginBottom: 4 }}>{c.icon}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#2d3436' }}>{c.value}</div>
                <div style={{ fontSize: 13, color: '#999' }}>{c.title}</div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* 资源状态 */}
      <Card title={<span style={{ fontSize: 17, fontWeight: 600 }}><GiftOutlined style={{ color: '#6c5ce7', marginRight: 8 }} />资源状态总览</span>} bordered={false} style={{ borderRadius: 12 }}>
        <Row gutter={[12, 12]}>
          {[
            { label: '总资源', val: stats.resources.total, color: '#6c5ce7' },
            { label: '待审核', val: stats.resources.pending, color: '#faad14' },
            { label: '已通过', val: stats.resources.approved, color: '#52c41a' },
            { label: '已拒绝', val: stats.resources.rejected, color: '#ff4d4f' },
            { label: '已对接', val: stats.resources.matched, color: '#1890ff' },
            { label: '已完成', val: stats.resources.completed, color: '#999' },
          ].map((item, i) => (
            <Col xs={8} sm={4} key={i}>
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: item.color }}>{item.val}</div>
                <div style={{ fontSize: 13, color: '#666' }}>{item.label}</div>
              </div>
            </Col>
          ))}
        </Row>
      </Card>

      <Card
        title={<span style={{ fontSize: 17, fontWeight: 600 }}><BookOutlined style={{ color: '#FF9F43', marginRight: 8 }} />AI 作业辅导成果</span>}
        bordered={false}
        style={{ borderRadius: 12, marginTop: 24 }}
        extra={(
          <Space size={8}>
            <Text type="secondary">统计范围</Text>
            <Select
              size="small"
              value={homeworkRange}
              onChange={setHomeworkRange}
              options={[{ value: '7d', label: '近 7 天' }, { value: '30d', label: '近 30 天' }, { value: 'all', label: '全部' }]}
              style={{ width: 92 }}
            />
          </Space>
        )}
      >
        {homeworkStats?.unavailable && (
          <Alert type="info" showIcon message="作业成果统计表尚未迁移，当前显示为 0。" style={{ marginBottom: 16 }} />
        )}
        <Row gutter={[12, 12]}>
          {[
            { title: '提交次数', value: homeworkTotals.attempts, color: '#FF9F43' },
            { title: '成功回复', value: homeworkTotals.successes, color: '#1dd1a1' },
            { title: '失败次数', value: homeworkTotals.failures, color: '#fc5c65' },
            { title: '已解决辅导', value: homeworkTotals.completedSessions, color: '#6c5ce7' },
            { title: '使用学生', value: homeworkTotals.uniqueStudents, color: '#3B82F6' },
            { title: '成功率', value: `${(homeworkTotals.successRate * 100).toFixed(1)}%`, color: '#00b894' },
            { title: '完成率', value: `${(homeworkTotals.completionRate * 100).toFixed(1)}%`, color: '#8b5cf6' },
          ].map((item) => (
            <Col xs={12} sm={8} md={Math.floor(24 / 7)} key={item.title}>
              <Card loading={homeworkLoading && !homeworkStats} bordered={false} style={{ borderRadius: 10, background: '#fafafa' }}>
                <Statistic title={item.title} value={item.value} valueStyle={{ color: item.color, fontSize: 24 }} />
              </Card>
            </Col>
          ))}
        </Row>
        <div style={{ marginTop: 20 }}>
          {homeworkTrend.length > 0 ? (
            <ReactECharts option={homeworkTrendOption} style={{ height: 260 }} />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={homeworkLoading ? '正在加载趋势...' : '当前范围暂无作业辅导数据'} />
          )}
        </div>
      </Card>

      <Card title={<span style={{ fontSize: 17, fontWeight: 600 }}><SafetyOutlined style={{ color: '#ff6b6b', marginRight: 8 }} />谈心安全事件</span>} bordered={false} style={{ borderRadius: 12, marginTop: 24 }} extra={<Text type="secondary">近 30 天，仅显示分类与处理状态</Text>}>
        {riskStats.length > 0 ? <Space wrap>{riskStats.map((item) => <Tag key={`${item.category}-${item.severity}-${item.status}`} color={item.severity === 'critical' ? 'red' : item.severity === 'high' ? 'volcano' : 'gold'}>{item.category} · {item.status}：{item.count}</Tag>)}</Space> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待处理安全事件" />}
      </Card>

      <Card
        title={<span style={{ fontSize: 17, fontWeight: 600 }}><RiseOutlined style={{ color: '#1dd1a1', marginRight: 8 }} />全站成果数据</span>}
        bordered={false}
        style={{ borderRadius: 12, marginTop: 24 }}
        extra={<Space size={8}><Text type="secondary">统计范围</Text><Select size="small" value={projectRange} onChange={setProjectRange} options={[{ value: '7d', label: '近 7 天' }, { value: '30d', label: '近 30 天' }, { value: 'all', label: '全部' }]} style={{ width: 92 }} /></Space>}
      >
        <Space wrap size={8} style={{ marginBottom: 12 }}>
          <Select allowClear size="small" value={projectFeature || undefined} onChange={(value) => setProjectFeature(value || '')} placeholder="功能筛选" options={[{ value: 'homework', label: '作业' }, { value: 'course', label: '课程' }, { value: 'companion', label: '谈心' }, { value: 'learning_report', label: '报告' }]} style={{ width: 110 }} />
          <Select allowClear size="small" value={projectRole || undefined} onChange={(value) => setProjectRole(value || '')} placeholder="角色筛选" options={[{ value: 'student', label: '学生' }, { value: 'institution', label: '机构' }, { value: 'government', label: '政府' }, { value: 'resource', label: '资源方' }]} style={{ width: 110 }} />
          <Input size="small" value={projectInstitution} onChange={(event) => setProjectInstitution(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="机构 ID" style={{ width: 90 }} />
          <Button size="small" icon={<ReloadOutlined />} onClick={exportProjectCsv}>导出 CSV</Button>
        </Space>
        {projectStats ? <>
          <Row gutter={[12, 12]}>
            {[
              ['有效使用次数', projectStats.totals.usageCount, '#FF9F43'],
              ['成功动作', projectStats.totals.successCount, '#1dd1a1'],
              ['有效完成', projectStats.totals.completionCount, '#6c5ce7'],
              ['独立使用者', projectStats.totals.uniqueUsers, '#3B82F6'],
              ['课程完成', projectStats.totals.completedCourses, '#00b894'],
              ['作业已解决', projectStats.totals.completedHomework, '#8b5cf6'],
              ['报告生成', projectStats.totals.reportsGenerated, '#e17055'],
              ['谈心服务', projectStats.totals.companionUses, '#ff6b6b'],
            ].map(([title, value, color]) => <Col xs={12} sm={8} md={6} key={title}><Card loading={projectLoading} bordered={false} style={{ borderRadius: 10, background: '#fafafa' }}><Statistic title={title} value={value} valueStyle={{ color, fontSize: 24 }} /></Card></Col>)}
          </Row>
          {projectStats.trend?.length > 0 ? <ReactECharts option={{ tooltip: { trigger: 'axis' }, legend: { top: 0 }, grid: { top: 35, left: 42, right: 20, bottom: 30 }, xAxis: { type: 'category', data: projectStats.trend.map((item) => item.date.slice(5)) }, yAxis: { type: 'value', minInterval: 1 }, series: [{ name: '有效使用', type: 'line', smooth: true, data: projectStats.trend.map((item) => item.usageCount), itemStyle: { color: '#FF9F43' } }, { name: '完成', type: 'line', smooth: true, data: projectStats.trend.map((item) => item.completionCount), itemStyle: { color: '#6c5ce7' } }] }} style={{ height: 240, marginTop: 16 }} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前范围暂无成果事件" />}
        </> : <Alert type="info" showIcon message="全站成果统计暂不可用" description="请先执行第二阶段数据库迁移。" />}
      </Card>
    </div>
  );
}

// ========== 用户管理 Tab ==========
const roleMap = {
  parent: { label: '家长', color: '#FF9F43' },
  institution: { label: '托管机构', color: '#1dd1a1' },
  resource: { label: '资源方', color: '#48dbfb' },
  government: { label: '政府/捐赠方', color: '#a55eea' },
  student: { label: '学生', color: '#ff6348' },
};

function UsersTab() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ total: 0, list: [] });
  const [params, setParams] = useState({ page: 1, pageSize: 15, role: '', keyword: '' });
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const query = { page: params.page, pageSize: params.pageSize };
      if (params.role) query.role = params.role;
      if (params.keyword) query.keyword = params.keyword;
      const res = await adminApi.getUsers(query);
      setData(res);
    } catch (error) {
      message.error('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, [params.page, params.pageSize, params.role]);

  const handleSearch = () => {
    setParams(prev => ({ ...prev, page: 1 }));
    fetchUsers();
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username', key: 'username', width: 130, ellipsis: true },
    {
      title: '角色', dataIndex: 'role', key: 'role', width: 110,
      render: (role) => {
        const r = roleMap[role];
        return r ? <Tag color={r.color}>{r.label}</Tag> : <Tag>{role}</Tag>;
      },
      filters: Object.entries(roleMap).map(([k, v]) => ({ text: v.label, value: k })),
      filterMultiple: false,
    },
    { title: '真实姓名', dataIndex: 'real_name', key: 'real_name', width: 100, render: (v) => v || '-' },
    { title: '手机号', dataIndex: 'phone', key: 'phone', width: 130, render: (v) => v || '-' },
    { title: '邮箱', dataIndex: 'email', key: 'email', width: 180, ellipsis: true, render: (v) => v || '-' },
    {
      title: '邮箱验证', dataIndex: 'email_verified', key: 'email_verified', width: 90, align: 'center',
      render: (v, record) => !record.email ? <Text type="secondary">-</Text> : v ? <Tag color="green">已验证</Tag> : <Tag color="orange">未验证</Tag>,
    },
    { title: '机构/组织', dataIndex: 'organization', key: 'organization', width: 150, ellipsis: true, render: (v) => v || '-' },
    {
      title: '所属机构', dataIndex: 'institution_name', key: 'institution_name', width: 140, ellipsis: true,
      render: (v) => v || '-',
    },
    {
      title: '注册时间', dataIndex: 'created_at', key: 'created_at', width: 170, sorter: true,
      render: (date) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作', key: 'action', width: 80, fixed: 'right',
      render: (_, record) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => { setCurrentUser(record); setDetailVisible(true); }}>详情</Button>
      ),
    },
  ];

  return (
    <div>
      {/* 筛选栏 */}
      <Card style={{ marginBottom: 16, borderRadius: 10 }} bordered={false}>
        <Space wrap>
          <Select
            value={params.role || undefined}
            onChange={v => setParams(prev => ({ ...prev, role: v || '', page: 1 }))}
            style={{ width: 140 }} allowClear placeholder="全部角色"
          >
            {Object.entries(roleMap).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
          </Select>
          <Input
            placeholder="搜索用户名/姓名/手机/邮箱/组织"
            prefix={<SearchOutlined />}
            value={params.keyword}
            onChange={e => setParams(prev => ({ ...prev, keyword: e.target.value }))}
            onPressEnter={handleSearch}
            style={{ width: 280 }}
            allowClear
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}
            style={{ background: '#6c5ce7', borderColor: '#6c5ce7' }}>搜索</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { setParams({ page: 1, pageSize: 15, role: '', keyword: '' }); }}>重置</Button>
        </Space>
      </Card>

      {/* 表格 */}
      <Card bordered={false} style={{ borderRadius: 10 }}>
        <Table
          columns={columns}
          dataSource={data.list}
          rowKey="id"
          loading={loading}
          pagination={{
            current: params.page,
            pageSize: params.pageSize,
            total: data.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t) => `共 ${t} 位用户`,
            onChange: (page, pageSize) => setParams(prev => ({ ...prev, page, pageSize })),
          }}
          scroll={{ x: 1400 }}
          locale={{ emptyText: <Empty description="暂无用户数据" /> }}
        />
      </Card>

      {/* 用户详情弹窗 */}
      <Modal title="用户详情" open={detailVisible} onCancel={() => setDetailVisible(false)}
        footer={<Button onClick={() => setDetailVisible(false)}>关闭</Button>} width={600}>
        {currentUser && (
          <Descriptions column={2} bordered size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="ID">{currentUser.id}</Descriptions.Item>
            <Descriptions.Item label="用户名">{currentUser.username}</Descriptions.Item>
            <Descriptions.Item label="角色">
              <Tag color={roleMap[currentUser.role]?.color}>{roleMap[currentUser.role]?.label || currentUser.role}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="真实姓名">{currentUser.real_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="手机号">{currentUser.phone || '-'}</Descriptions.Item>
            <Descriptions.Item label="邮箱">{currentUser.email || '-'}</Descriptions.Item>
            <Descriptions.Item label="邮箱验证">
              {!currentUser.email ? '-' : currentUser.email_verified ? <Tag color="green">已验证</Tag> : <Tag color="orange">未验证</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="机构/组织">{currentUser.organization || '-'}</Descriptions.Item>
            <Descriptions.Item label="所属机构" span={2}>{currentUser.institution_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="注册时间" span={2}>{currentUser.created_at ? new Date(currentUser.created_at).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
            <Descriptions.Item label="更新时间" span={2}>{currentUser.updated_at ? new Date(currentUser.updated_at).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}

// ========== 资源审核 Tab ==========
function AuditTab() {
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

  useEffect(() => { fetchResources(); }, [filterStatus]);

  const fetchResources = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      const data = await adminApi.getResources(params);
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
      okText: '确认通过', cancelText: '取消',
      onOk: async () => {
        try {
          await adminApi.approveResource(id, 'approved');
          message.success('资源已审核通过');
          fetchResources();
        } catch (error) { message.error('操作失败'); }
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
      await adminApi.approveResource(rejectingId, 'rejected', rejectReason);
      message.success('已拒绝该资源');
      setRejectVisible(false);
      fetchResources();
    } catch (error) { message.error('操作失败'); }
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
      {/* 状态统计 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card hoverable onClick={() => setFilterStatus('')} bordered={false} style={{ borderRadius: 10, textAlign: 'center', cursor: 'pointer' }}>
            <AppstoreOutlined style={{ fontSize: 24, color: '#3B82F6' }} />
            <div style={{ fontSize: 24, fontWeight: 700, margin: '8px 0 4px' }}>{resources.length}</div>
            <Text type="secondary">全部</Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable onClick={() => setFilterStatus('pending')} bordered={false} style={{ borderRadius: 10, textAlign: 'center', cursor: 'pointer' }}>
            <ClockCircleOutlined style={{ fontSize: 24, color: '#faad14' }} />
            <div style={{ fontSize: 24, fontWeight: 700, margin: '8px 0 4px', color: '#faad14' }}>{pendingCount}</div>
            <Text type="secondary">待审核</Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable onClick={() => setFilterStatus('approved')} bordered={false} style={{ borderRadius: 10, textAlign: 'center', cursor: 'pointer' }}>
            <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a' }} />
            <div style={{ fontSize: 24, fontWeight: 700, margin: '8px 0 4px', color: '#52c41a' }}>{approvedCount}</div>
            <Text type="secondary">已通过</Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable onClick={() => setFilterStatus('rejected')} bordered={false} style={{ borderRadius: 10, textAlign: 'center', cursor: 'pointer' }}>
            <CloseCircleOutlined style={{ fontSize: 24, color: '#ff4d4f' }} />
            <div style={{ fontSize: 24, fontWeight: 700, margin: '8px 0 4px', color: '#ff4d4f' }}>{rejectedCount}</div>
            <Text type="secondary">已拒绝</Text>
          </Card>
        </Col>
      </Row>

      {/* 筛选 */}
      <Card style={{ marginBottom: 16, borderRadius: 10 }} bordered={false}>
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
      <Card bordered={false} style={{ borderRadius: 10 }}>
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
            {currentResource.reviewed_at && (
              <Descriptions.Item label="审核时间" span={2}>{new Date(currentResource.reviewed_at).toLocaleString('zh-CN')}</Descriptions.Item>
            )}
            {currentResource.reject_reason && (
              <Descriptions.Item label="拒绝原因" span={2}><Text type="danger">{currentResource.reject_reason}</Text></Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>

      {/* 拒绝弹窗 */}
      <Modal title={<span><ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />拒绝资源</span>}
        open={rejectVisible} onCancel={() => setRejectVisible(false)} onOk={handleReject}
        okText="确认拒绝" okButtonProps={{ danger: true }} cancelText="取消">
        <p style={{ marginBottom: 12, color: '#666' }}>请输入拒绝原因（选填）：</p>
        <TextArea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="如：信息不完整、资源描述不清晰等" />
      </Modal>
    </div>
  );
}

// ========== 电子书审核 Tab ==========
function EbookAuditTab() {
  const [loading, setLoading] = useState(true);
  const [books, setBooks] = useState([]);
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchBooks = async () => {
    setLoading(true);
    try { setBooks(await adminApi.getCourses(status ? { status } : undefined)); }
    catch (error) { message.error(error.message || '获取电子书列表失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchBooks(); }, [status]);

  const review = async (id, nextStatus, reason = '') => {
    try {
      await adminApi.reviewCourse(id, nextStatus, reason);
      message.success(nextStatus === 'published' ? '电子书已发布' : nextStatus === 'disabled' ? '电子书已下架' : '电子书已拒绝');
      fetchBooks();
    } catch (error) { message.error(error.message || '审核操作失败'); }
  };

  const openPreview = async (book) => {
    try {
      const response = await fetch(adminApi.courseContentUrl(book.id), { headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` } });
      if (!response.ok) throw new Error('无法预览该电子书');
      const url = URL.createObjectURL(await response.blob());
      setPreviewUrl(url);
    } catch (error) { message.error(error.message || '预览失败'); }
  };

  const closePreview = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(''); };

  const columns = [
    { title: '书名', dataIndex: 'title', key: 'title', ellipsis: true, width: 220 },
    { title: '作者', dataIndex: 'author', key: 'author', width: 120 },
    { title: '分类', dataIndex: 'category', key: 'category', width: 110, render: (value) => <Tag>{value || '-'}</Tag> },
    { title: '适读年级', key: 'grade', width: 120, render: (_, row) => `${row.grade_min || '-'}—${row.grade_max || '-'}` },
    {
      title: '下载', dataIndex: 'allow_download', key: 'allow_download', width: 90,
      render: (value, row) => <Switch size="small" checked={Boolean(value)} onChange={async (checked) => { try { await adminApi.updateCourseDownloadPolicy(row.id, checked); fetchBooks(); } catch (error) { message.error(error.message || '更新下载权限失败'); } }} />,
    },
    {
      title: '状态', dataIndex: 'review_status', key: 'review_status', width: 100,
      render: (value) => <Tag color={{ pending: 'orange', published: 'green', rejected: 'red', disabled: 'default' }[value] || 'default'}>{{ pending: '待审核', published: '已发布', rejected: '已拒绝', disabled: '已下架' }[value] || value}</Tag>,
    },
    {
      title: '操作', key: 'action', width: 250,
      render: (_, row) => (
        <Space size={4} wrap>
          <Button type="link" size="small" onClick={() => setDetail(row)}>详情</Button>
          <Button type="link" size="small" onClick={() => openPreview(row)}>预览</Button>
          {row.review_status === 'pending' && <Button type="link" size="small" style={{ color: '#52c41a' }} onClick={() => review(row.id, 'published')}>发布</Button>}
          {row.review_status === 'pending' && <Button type="link" size="small" danger onClick={() => { setRejectingId(row.id); setRejectReason(''); }}>拒绝</Button>}
          {row.review_status === 'published' && <Button type="link" size="small" danger onClick={() => review(row.id, 'disabled')}>下架</Button>}
          {row.review_status === 'disabled' && <Button type="link" size="small" onClick={() => review(row.id, 'published')}>重新发布</Button>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card bordered={false} style={{ borderRadius: 10, marginBottom: 16 }}>
        <Space wrap>
          <Select value={status} onChange={setStatus} style={{ width: 140 }} options={[{ value: '', label: '全部状态' }, { value: 'pending', label: '待审核' }, { value: 'published', label: '已发布' }, { value: 'rejected', label: '已拒绝' }, { value: 'disabled', label: '已下架' }]} />
          <Text type="secondary">机构提交的电子书需要审核通过后才会展示给学生。</Text>
        </Space>
      </Card>
      <Card bordered={false} style={{ borderRadius: 10 }}>
        <Table columns={columns} dataSource={books} rowKey="id" loading={loading} pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 本` }} scroll={{ x: 1050 }} locale={{ emptyText: <Empty description="暂无电子书" /> }} />
      </Card>
      <Modal title="电子书详情" open={!!detail} onCancel={() => setDetail(null)} footer={<Button onClick={() => setDetail(null)}>关闭</Button>} width={620}>
        {detail && <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="书名" span={2}>{detail.title}</Descriptions.Item>
          <Descriptions.Item label="作者">{detail.author || '-'}</Descriptions.Item>
          <Descriptions.Item label="分类">{detail.category || '-'}</Descriptions.Item>
          <Descriptions.Item label="适读年级">{detail.grade_min || '-'}—{detail.grade_max || '-'}</Descriptions.Item>
          <Descriptions.Item label="上传者">{detail.uploader_name || '-'}</Descriptions.Item>
          <Descriptions.Item label="内容简介" span={2}><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{detail.description || '-'}</div></Descriptions.Item>
          <Descriptions.Item label="来源/授权" span={2}><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{detail.source_note || '-'}</div></Descriptions.Item>
          <Descriptions.Item label="下载权限">{detail.allow_download ? '允许' : '禁止'}</Descriptions.Item>
          <Descriptions.Item label="提交时间">{detail.created_at ? new Date(detail.created_at).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
          {detail.reject_reason && <Descriptions.Item label="拒绝原因" span={2}><Text type="danger">{detail.reject_reason}</Text></Descriptions.Item>}
        </Descriptions>}
      </Modal>
      <Modal title="预览电子书" open={!!previewUrl} onCancel={closePreview} footer={null} width={840} destroyOnClose>
        {previewUrl && <iframe src={previewUrl} title="电子书预览" style={{ width: '100%', height: 640, border: 0 }} />}
      </Modal>
      <Modal title="拒绝电子书" open={!!rejectingId} onCancel={() => setRejectingId(null)} onOk={async () => { if (!rejectReason.trim()) { message.warning('请填写拒绝原因'); return; } await review(rejectingId, 'rejected', rejectReason); setRejectingId(null); }} okText="确认拒绝" okButtonProps={{ danger: true }} cancelText="取消">
        <Input.TextArea rows={4} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="请说明需要补充或修改的内容" />
      </Modal>
    </div>
  );
}

// ========== API 密钥管理 Tab ==========
function ApiKeyTab() {
  const [loading, setLoading] = useState(true);
  const [keyInfo, setKeyInfo] = useState({ masked: '', isSet: false });
  const [newKey, setNewKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const fetchKey = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getApiKey();
      setKeyInfo(data);
    } catch (error) {
      message.error('获取 API Key 状态失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchKey(); }, []);

  const handleSave = async () => {
    if (!newKey.trim()) {
      message.warning('请输入 API Key');
      return;
    }
    setSaving(true);
    try {
      await adminApi.updateApiKey(newKey.trim());
      message.success('API Key 已更新，即时生效');
      setNewKey('');
      fetchKey();
    } catch (error) {
      message.error('更新失败：' + (error.message || '未知错误'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await adminApi.testApiKey();
      setTestResult(result);
    } catch (error) {
      setTestResult({ success: false, message: error.message || '测试请求失败' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <Row gutter={[24, 24]}>
        <Col xs={24} md={14}>
          <Card title={<span style={{ fontSize: 17, fontWeight: 600 }}><KeyOutlined style={{ color: '#6c5ce7', marginRight: 8 }} />豆包 AI API Key</span>} bordered={false} style={{ borderRadius: 12 }}>
            <div style={{ marginBottom: 24 }}>
              <Text type="secondary">当前状态：</Text>
              {loading ? (
                <Tag>加载中...</Tag>
              ) : keyInfo.isSet ? (
                <Tag color="green">已配置</Tag>
              ) : (
                <Tag color="red">未配置</Tag>
              )}
              {keyInfo.isSet && (
                <Text style={{ marginLeft: 12 }} code>{keyInfo.masked}</Text>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <Text strong>更新 API Key：</Text>
            </div>
            <Space.Compact style={{ width: '100%' }}>
              <Input.Password
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                placeholder="输入新的豆包 API Key"
                style={{ flex: 1 }}
              />
              <Button type="primary" onClick={handleSave} loading={saving}
                style={{ background: '#6c5ce7', borderColor: '#6c5ce7' }}>
                保存
              </Button>
            </Space.Compact>
            <div style={{ marginTop: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                更新后即时生效，无需重启服务器。该 Key 用于学生端智能作业辅导、学习报告和谈心伙伴功能。
              </Text>
            </div>

            <div style={{ marginTop: 20, padding: 16, background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}>
              <div style={{ marginBottom: 8 }}><Text strong><SafetyOutlined style={{ marginRight: 6 }} />连接测试</Text></div>
              <Space wrap>
                <Button onClick={handleTest} loading={testing} disabled={!keyInfo.isSet}>
                  测试 API Key 连通性
                </Button>
                {testResult && (
                  <Tag color={testResult.success ? 'success' : 'error'} style={{ padding: '4px 12px' }}>
                    {testResult.message}
                  </Tag>
                )}
              </Space>
              {!keyInfo.isSet && (
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>请先配置 API Key 后再进行测试</Text>
                </div>
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} md={10}>
          <Card title={<span style={{ fontSize: 17, fontWeight: 600 }}><FileTextOutlined style={{ color: '#6c5ce7', marginRight: 8 }} />使用说明</span>} bordered={false} style={{ borderRadius: 12 }}>
            <div style={{ lineHeight: 2 }}>
              <p><strong>模型：</strong>doubao-seed-1-8-251228</p>
              <p><strong>接口：</strong>ark.cn-beijing.volces.com</p>
              <p><strong>功能：</strong></p>
              <ul style={{ paddingLeft: 20 }}>
                <li>智能作业辅导（支持图片识别）</li>
                <li>个性化学习报告生成</li>
                <li>AI 谈心陪伴</li>
              </ul>
              <p><strong>获取方式：</strong></p>
              <ol style={{ paddingLeft: 20 }}>
                <li>访问<a href="https://console.volcengine.com/ark" target="_blank" rel="noreferrer"> 火山引擎控制台</a></li>
                <li>开通模型服务 → 创建 API Key</li>
                <li>将 Key 粘贴到左侧输入框</li>
              </ol>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// ========== AI Prompt 管理 Tab ==========
function PromptTab() {
  const [loading, setLoading] = useState(true);
  const [prompts, setPrompts] = useState({});
  const [editingType, setEditingType] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState([]);

  const promptTypes = [
    { key: 'homework', icon: <BookOutlined />, color: '#3B82F6', bg: '#eff6ff' },
    { key: 'learningReport', icon: <FileTextOutlined />, color: '#10b981', bg: '#ecfdf5' },
    { key: 'chat', icon: <HeartOutlined />, color: '#ef4444', bg: '#fef2f2' },
  ];

  const fetchPrompts = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getPrompts();
      setPrompts(data);
    } catch (error) {
      message.error('获取 Prompt 配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPrompts(); }, []);
  useEffect(() => { adminApi.getPromptVersions().then(setVersions).catch(() => setVersions([])); }, []);

  const createVersion = async (type) => {
    try {
      const config = prompts[type];
      const version = `${new Date().toISOString().slice(0, 10)}-${Date.now().toString().slice(-4)}`;
      await adminApi.createPromptVersion({ agentType: type === 'learningReport' ? 'report' : type === 'chat' ? 'companion' : type, version, config, changeNote: '从当前配置创建版本' });
      setVersions(await adminApi.getPromptVersions());
      message.success('已创建 Prompt 草稿');
    } catch (error) { message.error(error.message || '创建版本失败'); }
  };

  const startEdit = (type) => {
    setEditingType(type);
    setEditForm({ ...prompts[type] });
  };

  const handleSave = async () => {
    if (!editForm.systemPrompt?.trim()) {
      message.warning('System Prompt 不能为空');
      return;
    }
    setSaving(true);
    try {
      await adminApi.updatePrompt(editingType, editForm);
      message.success('Prompt 已保存，即时生效');
      setEditingType(null);
      fetchPrompts();
    } catch (error) {
      message.error('保存失败：' + (error.message || '未知错误'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = (type) => {
    Modal.confirm({
      title: '确认重置？',
      icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
      content: `将「${prompts[type]?.name}」的所有配置恢复为系统默认值，此操作不可撤销。`,
      okText: '确认重置',
      cancelText: '取消',
      onOk: async () => {
        try {
          await adminApi.resetPrompt(type);
          message.success('已重置为默认值');
          fetchPrompts();
          if (editingType === type) setEditingType(null);
        } catch (error) {
          message.error('重置失败');
        }
      },
    });
  };

  const handleResetAll = () => {
    Modal.confirm({
      title: '确认重置所有 Prompt？',
      icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
      content: '将所有 AI 功能的 Prompt 恢复为系统默认值，此操作不可撤销。',
      okText: '确认全部重置',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await adminApi.resetAllPrompts();
          message.success('所有 Prompt 已重置');
          setEditingType(null);
          fetchPrompts();
        } catch (error) {
          message.error('重置失败');
        }
      },
    });
  };

  if (loading) return <Card loading style={{ borderRadius: 12 }} />;

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <Text type="secondary">管理学生端各 AI 功能的 System Prompt 和生成参数，修改后即时生效，无需重启服务。</Text>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchPrompts}>刷新</Button>
          <Button danger onClick={handleResetAll}>全部重置为默认</Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        {promptTypes.map(({ key, icon, color, bg }) => {
          const config = prompts[key];
          if (!config) return null;
          return (
            <Col xs={24} md={8} key={key}>
              <Card
                bordered={false}
                style={{ borderRadius: 12, height: '100%', borderTop: `3px solid ${color}` }}
                actions={[
                  <Button type="link" icon={<EditOutlined />} onClick={() => startEdit(key)} key="edit">编辑</Button>,
                  <Tooltip title="重置为默认值" key="reset"><Button type="text" danger icon={<UndoOutlined />} onClick={() => handleReset(key)} /></Tooltip>,
                ]}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color }}>
                    {icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{config.name}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>AI 角色：{config.role}</Text>
                  </div>
                </div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>{config.description}</Text>
                <div style={{
                  background: '#fafafa', borderRadius: 8, padding: '10px 12px',
                  maxHeight: 160, overflow: 'auto', fontSize: 12, lineHeight: 1.8,
                  whiteSpace: 'pre-wrap', color: '#555', border: '1px solid #f0f0f0',
                }}>
                  {config.systemPrompt?.substring(0, 300)}{config.systemPrompt?.length > 300 ? '...' : ''}
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <Tag>Token上限: {config.maxTokens}</Tag>
                  <Tag>温度: {config.temperature}</Tag>
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>

      <Card title="Prompt 版本" bordered={false} style={{ borderRadius: 12, marginTop: 20 }} extra={<Text type="secondary">草稿 → 测试 → 发布，可随时回滚</Text>}>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={versions}
          locale={{ emptyText: '迁移 Prompt 版本表后显示生命周期记录' }}
          columns={[
            { title: '智能体', dataIndex: 'agent_type', render: (value) => ({ homework: '作业辅导', report: '学习报告', companion: '谈心小屋' }[value] || value) },
            { title: '版本', dataIndex: 'version' },
            { title: '状态', dataIndex: 'status', render: (value) => <Tag color={{ draft: 'default', tested: 'blue', published: 'green', archived: 'red' }[value]}>{value}</Tag> },
            { title: '创建时间', dataIndex: 'created_at', render: (value) => value ? new Date(value).toLocaleString('zh-CN') : '-' },
            { title: '操作', key: 'actions', render: (_, row) => <Space size={4}>{row.status === 'draft' && <Button size="small" onClick={async () => { await adminApi.testPromptVersion(row.id); setVersions(await adminApi.getPromptVersions()); }}>测试</Button>}{row.status === 'tested' && <Button size="small" type="primary" onClick={async () => { await adminApi.publishPromptVersion(row.id); setVersions(await adminApi.getPromptVersions()); }}>发布</Button>}{row.status === 'published' && <Button size="small" danger onClick={async () => { await adminApi.rollbackPromptVersion(row.id); setVersions(await adminApi.getPromptVersions()); }}>回滚</Button>}</Space> },
          ]}
        />
        <Space wrap style={{ marginTop: 12 }}>{promptTypes.map((type) => <Button key={type.key} size="small" onClick={() => createVersion(type.key)}>从{type.key}配置创建草稿</Button>)}</Space>
      </Card>

      {/* Prompt 编辑弹窗 */}
      <Modal
        title={<Space>{editingType && promptTypes.find(t => t.key === editingType)?.icon}<span>编辑「{editForm.name}」Prompt</span></Space>}
        open={!!editingType}
        onCancel={() => setEditingType(null)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={750}
        destroyOnClose
      >
        {editForm && (
          <div style={{ marginTop: 8 }}>
            <Row gutter={[16, 16]}>
              <Col span={8}>
                <div style={{ marginBottom: 4 }}><Text strong>功能名称</Text></div>
                <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
              </Col>
              <Col span={8}>
                <div style={{ marginBottom: 4 }}><Text strong>AI 角色名</Text></div>
                <Input value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })} />
              </Col>
              <Col span={8}>
                <div style={{ marginBottom: 4 }}><Text strong>功能描述</Text></div>
                <Input value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
              </Col>
            </Row>
            <div style={{ marginTop: 16 }}>
              <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                <Text strong>System Prompt</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>字数：{editForm.systemPrompt?.length || 0}</Text>
              </div>
              <TextArea
                value={editForm.systemPrompt}
                onChange={e => setEditForm({ ...editForm, systemPrompt: e.target.value })}
                rows={14}
                style={{ fontFamily: "'SF Mono', 'Monaco', 'Menlo', 'Consolas', monospace", fontSize: 13, lineHeight: 1.7 }}
                placeholder="输入 System Prompt..."
              />
            </div>
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col span={12}>
                <div style={{ marginBottom: 4 }}><Text strong>最大 Token 数</Text></div>
                <Row gutter={8} align="middle">
                  <Col flex="auto">
                    <Slider min={100} max={8000} step={100} value={editForm.maxTokens}
                      onChange={v => setEditForm({ ...editForm, maxTokens: v })} />
                  </Col>
                  <Col>
                    <InputNumber min={100} max={8000} step={100} value={editForm.maxTokens}
                      onChange={v => setEditForm({ ...editForm, maxTokens: v })} style={{ width: 90 }} />
                  </Col>
                </Row>
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: 4 }}>
                  <Text strong>Temperature </Text>
                  <Tooltip title="值越高回复越有创意和随机性，值越低越精确和确定"><ExclamationCircleOutlined style={{ color: '#999', fontSize: 12 }} /></Tooltip>
                </div>
                <Row gutter={8} align="middle">
                  <Col flex="auto">
                    <Slider min={0} max={2} step={0.1} value={editForm.temperature}
                      onChange={v => setEditForm({ ...editForm, temperature: v })} />
                  </Col>
                  <Col>
                    <InputNumber min={0} max={2} step={0.1} value={editForm.temperature}
                      onChange={v => setEditForm({ ...editForm, temperature: v })} style={{ width: 90 }} />
                  </Col>
                </Row>
              </Col>
            </Row>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default AdminPanel;
