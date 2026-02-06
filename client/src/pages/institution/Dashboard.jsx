import { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, message, Modal, Typography, Button, Space, List, Avatar } from 'antd';
import {
  TeamOutlined,
  CheckCircleOutlined,
  SafetyOutlined,
  CalendarOutlined,
  KeyOutlined,
  CopyOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { childrenApi, checkinApi, safetyApi, activitiesApi, authApi } from '../../services/api';

const { Text, Paragraph } = Typography;

function InstitutionDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    childrenCount: 0,
    todayCheckin: 0,
    safetyDone: false,
    monthActivities: 0,
  });
  const [recentActivities, setRecentActivities] = useState([]);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [members, setMembers] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 获取儿童数量
      const children = await childrenApi.getList({ status: 'active' });
      
      // 获取今日签到状态
      const todayCheckins = await checkinApi.getToday();
      const checkedInCount = todayCheckins.filter(c => c.checkin_time).length;
      
      // 获取今日安全检查状态
      const safetyStatus = await safetyApi.getToday();
      
      // 获取近期活动
      const activities = await activitiesApi.getList({});
      
      setStats({
        childrenCount: children.length,
        todayCheckin: checkedInCount,
        safetyDone: safetyStatus.checked,
        monthActivities: activities.length,
      });
      
      setRecentActivities(activities.slice(0, 5));
    } catch (error) {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const activityColumns = [
    {
      title: '活动名称',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '类型',
      dataIndex: 'activity_type',
      key: 'activity_type',
      render: (type) => {
        const typeMap = {
          course: { text: '课程', color: 'blue' },
          entertainment: { text: '娱乐', color: 'green' },
          outdoor: { text: '户外', color: 'orange' },
          other: { text: '其他', color: 'default' },
        };
        const t = typeMap[type] || typeMap.other;
        return <Tag color={t.color}>{t.text}</Tag>;
      },
    },
    {
      title: '日期',
      dataIndex: 'activity_date',
      key: 'activity_date',
      render: (date) => date ? date.slice(0, 10) : '-',
    },
    {
      title: '参与人数',
      dataIndex: 'participant_count',
      key: 'participant_count',
    },
  ];

  // 显示邀请码弹窗
  const showInviteCode = async () => {
    try {
      const data = await authApi.getInviteCode();
      setInviteCode(data.inviteCode);
      setInstitutionName(data.institutionName);
      // 获取成员列表
      const memberList = await authApi.getMembers();
      setMembers(memberList);
      setInviteModalVisible(true);
    } catch (error) {
      message.error('获取邀请码失败');
    }
  };

  // 复制邀请码
  const copyInviteCode = () => {
    navigator.clipboard.writeText(inviteCode);
    message.success('邀请码已复制到剪贴板');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>工作台</h2>
        <Button 
          type="primary" 
          icon={<KeyOutlined />} 
          onClick={showInviteCode}
        >
          邀请员工加入
        </Button>
      </div>
      
      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <div className="stat-icon" style={{ background: '#fff5e6' }}>
              <TeamOutlined style={{ color: '#FF9F43' }} />
            </div>
            <Statistic
              title="在册儿童"
              value={stats.childrenCount}
              suffix="人"
              loading={loading}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <div className="stat-icon" style={{ background: '#e6f7ff' }}>
              <CheckCircleOutlined style={{ color: '#1890ff' }} />
            </div>
            <Statistic
              title="今日签到"
              value={stats.todayCheckin}
              suffix={`/ ${stats.childrenCount} 人`}
              loading={loading}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <div className="stat-icon" style={{ background: stats.safetyDone ? '#f6ffed' : '#fff2e8' }}>
              <SafetyOutlined style={{ color: stats.safetyDone ? '#52c41a' : '#fa8c16' }} />
            </div>
            <Statistic
              title="安全检查"
              value={stats.safetyDone ? '已完成' : '待完成'}
              valueStyle={{ color: stats.safetyDone ? '#52c41a' : '#fa8c16' }}
              loading={loading}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <div className="stat-icon" style={{ background: '#f9f0ff' }}>
              <CalendarOutlined style={{ color: '#722ed1' }} />
            </div>
            <Statistic
              title="累计活动"
              value={stats.monthActivities}
              suffix="次"
              loading={loading}
            />
          </Card>
        </Col>
      </Row>

      <Card title="近期活动" style={{ marginTop: 24 }}>
        <Table
          columns={activityColumns}
          dataSource={recentActivities}
          rowKey="id"
          loading={loading}
          pagination={false}
          locale={{ emptyText: '暂无活动记录' }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      {/* 邀请码弹窗 */}
      <Modal
        title="邀请员工加入机构"
        open={inviteModalVisible}
        onCancel={() => setInviteModalVisible(false)}
        footer={null}
        width={500}
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Text type="secondary">机构名称</Text>
          <h3 style={{ margin: '8px 0 24px' }}>{institutionName}</h3>
          
          <Text type="secondary">机构邀请码</Text>
          <div style={{ 
            background: '#f5f5f5', 
            padding: '16px 24px', 
            borderRadius: 8, 
            margin: '8px 0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12
          }}>
            <Text strong style={{ fontSize: 28, letterSpacing: 4, fontFamily: 'monospace' }}>
              {inviteCode}
            </Text>
            <Button 
              type="primary" 
              icon={<CopyOutlined />} 
              onClick={copyInviteCode}
            >
              复制
            </Button>
          </div>
          
          <Paragraph type="secondary" style={{ marginBottom: 24 }}>
            将此邀请码分享给机构员工，他们注册时选择"加入现有机构"并输入此邀请码即可
          </Paragraph>
        </div>

        {members.length > 0 && (
          <>
            <Text strong>当前机构成员 ({members.length}人)</Text>
            <List
              style={{ marginTop: 12, maxHeight: 200, overflow: 'auto' }}
              dataSource={members}
              renderItem={member => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<Avatar icon={<UserOutlined />} />}
                    title={member.real_name || member.username}
                    description={member.phone || '未填写电话'}
                  />
                </List.Item>
              )}
            />
          </>
        )}
      </Modal>
    </div>
  );
}

export default InstitutionDashboard;
