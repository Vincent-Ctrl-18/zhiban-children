import { useState, useEffect } from 'react';
import { Card, Row, Col, Empty, Tag, List, message, Spin, Modal, Image, Avatar, Typography, Button, Space } from 'antd';
import { 
  CalendarOutlined, 
  BellOutlined,
  PictureOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  RightOutlined,
  UserOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { childrenApi, activitiesApi, notificationsApi } from '../../services/api';

const { Title, Text } = Typography;

const activityTypeMap = {
  course: { text: '课程', color: 'blue' },
  entertainment: { text: '娱乐', color: 'green' },
  outdoor: { text: '户外', color: 'orange' },
  other: { text: '其他', color: 'default' }
};

// 安全解析照片数据
const safeParsePhotos = (photos) => {
  if (!photos) return [];
  if (Array.isArray(photos)) return photos;
  if (typeof photos === 'string') {
    try {
      const parsed = JSON.parse(photos);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

function ParentDashboard() {
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState([]);
  const [activities, setActivities] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [activityDetailVisible, setActivityDetailVisible] = useState(false);
  const [notificationDetailVisible, setNotificationDetailVisible] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [selectedNotification, setSelectedNotification] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 获取孩子信息
      const childrenData = await childrenApi.getMyChildren();
      setChildren(childrenData);
      
      // 获取活动记录
      const activitiesData = await activitiesApi.getList({});
      setActivities(activitiesData.slice(0, 10));
      
      // 获取通知
      const notificationsData = await notificationsApi.getList({});
      setNotifications(notificationsData.slice(0, 5));
    } catch (error) {
      // 演示模式下使用模拟数据
      setChildren([]);
      setActivities([]);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  // 查看活动详情
  const showActivityDetail = (activity) => {
    setSelectedActivity(activity);
    setActivityDetailVisible(true);
  };

  // 查看通知详情
  const showNotificationDetail = (notification) => {
    setSelectedNotification(notification);
    setNotificationDetailVisible(true);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ marginBottom: 8, color: '#2d3436' }}>家长服务中心</Title>
        <Text type="secondary">关注孩子成长的每一天</Text>
      </div>

      {/* 孩子信息 */}
      <Card 
        title={<span><TeamOutlined style={{ marginRight: 8, color: '#FF9F43' }} />我的孩子</span>} 
        style={{ marginBottom: 24 }}
        className="modern-card"
      >
        {children.length > 0 ? (
          <Row gutter={[24, 24]}>
            {children.map(child => (
              <Col xs={24} sm={12} md={8} key={child.id}>
                <Card 
                  hoverable 
                  bodyStyle={{ padding: 20 }}
                  style={{ background: '#FFF5E6', border: '1px solid #ffeaa7' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Avatar 
                      size={64} 
                      icon={<UserOutlined />} 
                      src={child.header_url} 
                      style={{ backgroundColor: '#FF9F43', marginRight: 16 }}
                    />
                    <div>
                      <Title level={4} style={{ margin: 0, marginBottom: 4 }}>{child.name}</Title>
                      <Space>
                        <Tag color="blue">{child.gender === 'male' ? '男孩' : '女孩'}</Tag>
                        <Tag color="cyan">{child.age}岁</Tag>
                        {child.grade && <Tag>{child.grade}</Tag>}
                      </Space>
                    </div>
                  </div>
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#666' }}>
                     <span><CheckCircleOutlined style={{ color: '#52c41a' }} /> 今日已签到</span>
                     <span>健康状况: 良好</span>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        ) : (
          <Empty description="暂无关联儿童信息，请联系托管机构添加" />
        )}
      </Card>

      <Row gutter={24}>
        <Col xs={24} lg={14}>
          <Card 
            title={<span><CalendarOutlined style={{ marginRight: 8, color: '#54a0ff' }} />最新活动</span>}
            style={{ marginBottom: 24, minHeight: 400 }}
            extra={<Button type="link">查看全部</Button>}
          >
            <List
              itemLayout="horizontal"
              dataSource={activities}
              locale={{ emptyText: '暂无活动记录' }}
              renderItem={item => {
                const photos = safeParsePhotos(item.photos);
                const typeConfig = activityTypeMap[item.activity_type] || activityTypeMap.other;
                
                return (
                  <List.Item 
                    actions={[<Button type="link" size="small" onClick={() => showActivityDetail(item)}>查看详情</Button>]}
                    style={{ padding: '16px 0' }}
                  >
                    <List.Item.Meta
                      avatar={
                        <div style={{ 
                          width: 60, 
                          height: 60, 
                          borderRadius: 8, 
                          overflow: 'hidden', 
                          background: '#f0f2f5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {photos.length > 0 ? (
                            <img src={photos[0]} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <PictureOutlined style={{ fontSize: 24, color: '#ccc' }} />
                          )}
                        </div>
                      }
                      title={
                        <Space>
                          <Text strong>{item.title}</Text>
                          <Tag color={typeConfig.color}>{typeConfig.text}</Tag>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={2} style={{ fontSize: 13 }}>
                           <span><ClockCircleOutlined /> {item.activity_date ? item.activity_date.slice(0, 10) : '未知日期'}</span>
                           <Text type="secondary" ellipsis style={{ maxWidth: 300 }}>{item.description}</Text>
                        </Space>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card 
            title={<span><BellOutlined style={{ marginRight: 8, color: '#ff6b6b' }} />机构通知</span>}
            style={{ marginBottom: 24, minHeight: 400 }}
            extra={<Button type="link">查看全部</Button>}
          >
            <List
              dataSource={notifications}
              renderItem={item => (
                <List.Item style={{ padding: '12px 0' }}>
                   <div style={{ width: '100%', cursor: 'pointer' }} onClick={() => showNotificationDetail(item)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                         <Text strong>{item.title}</Text>
                         <Tag color={item.type === 'urgent' ? 'red' : 'blue'}>
                            {item.type === 'urgent' ? '紧急' : '通知'}
                         </Tag>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#999', fontSize: 12 }}>
                         <span>{item.institution_name}</span>
                         <span>{item.created_at?.slice(0, 10)}</span>
                      </div>
                   </div>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      {/* 活动详情弹窗 */}
      <Modal
        title="活动详情"
        open={activityDetailVisible}
        onCancel={() => setActivityDetailVisible(false)}
        footer={null}
        width={700}
      >
        {selectedActivity && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Tag color="blue">{activityTypeMap[selectedActivity.activity_type]?.text}</Tag>
              <span style={{ color: '#999', marginLeft: 8 }}>
                <ClockCircleOutlined /> {selectedActivity.activity_date?.slice(0, 10)}
              </span>
            </div>
            
            <Title level={4}>{selectedActivity.title}</Title>
            <div style={{ margin: '16px 0', lineHeight: '1.6', color: '#333' }}>
              {selectedActivity.description}
            </div>

            {safeParsePhotos(selectedActivity.photos).length > 0 && (
              <div style={{ marginTop: 24 }}>
                <Title level={5}>活动剪影</Title>
                <Row gutter={[8, 8]}>
                  {safeParsePhotos(selectedActivity.photos).map((photo, index) => (
                    <Col span={8} key={index}>
                      <Image
                        src={photo}
                        style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 4 }}
                      />
                    </Col>
                  ))}
                </Row>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 通知详情弹窗 */}
      <Modal
        title="通知详情"
        open={notificationDetailVisible}
        onCancel={() => setNotificationDetailVisible(false)}
        footer={null}
      >
        {selectedNotification && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <Title level={4}>{selectedNotification.title}</Title>
              <Space>
                <Tag color={selectedNotification.type === 'urgent' ? 'red' : 'blue'}>
                  {selectedNotification.type === 'urgent' ? '紧急' : '普通通知'}
                </Tag>
                <span style={{ color: '#999' }}>{selectedNotification.created_at?.slice(0, 10)}</span>
              </Space>
            </div>
            
            <div style={{ 
              background: '#f9f9f9', 
              padding: 20, 
              borderRadius: 8,
              lineHeight: 1.8 
            }}>
              {selectedNotification.content}
            </div>
            
            <div style={{ textAlign: 'right', marginTop: 16, color: '#999' }}>
              —— {selectedNotification.institution_name}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default ParentDashboard;
