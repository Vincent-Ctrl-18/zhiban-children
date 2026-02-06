import { useState, useEffect } from 'react';
import { Card, Row, Col, Typography, Button, Tag, Space, List, message } from 'antd';
import {
  BookOutlined,
  FileTextOutlined,
  HeartOutlined,
  SmileOutlined,
  StarFilled,
  RightOutlined,
  ClockCircleOutlined,
  TrophyOutlined,
  ThunderboltOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;

// 每日一句励志话
const dailyQuotes = [
  '每一个努力的日子，都是在为未来积攒力量',
  '知识就像星星，学得越多，夜空越璀璨',
  '今天的进步，就是明天的骄傲',
  '不要害怕困难，因为困难是通往成功的阶梯',
  '阅读是打开世界之窗的钥匙',
  '每个问题背后都藏着一个新发现',
  '坚持就是最好的天赋',
];

function StudentDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [dailyQuote, setDailyQuote] = useState('');
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    // 随机每日一句
    setDailyQuote(dailyQuotes[Math.floor(Math.random() * dailyQuotes.length)]);
    // 时段问候
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('早上好');
    else if (hour < 18) setGreeting('下午好');
    else setGreeting('晚上好');
  }, []);

  const functionCards = [
    {
      key: '/student/homework',
      icon: <BookOutlined style={{ fontSize: 32 }} />,
      title: '智能作业辅导',
      desc: '拍照上传题目，AI帮你分析解题思路',
      color: '#FF9F43',
      bg: 'linear-gradient(135deg, #FFE5B4 0%, #FFF5E6 100%)',
      tag: 'AI 助手',
    },
    {
      key: '/student/report',
      icon: <FileTextOutlined style={{ fontSize: 32 }} />,
      title: '个性化学习报告',
      desc: '了解你的学习特点，获取专属建议',
      color: '#1dd1a1',
      bg: 'linear-gradient(135deg, #b8f0d8 0%, #e3f9f3 100%)',
      tag: '学习分析',
    },
    {
      key: '/student/chat',
      icon: <HeartOutlined style={{ fontSize: 32 }} />,
      title: '谈心伙伴',
      desc: '有什么烦恼都可以和我说说',
      color: '#ff6b6b',
      bg: 'linear-gradient(135deg, #ffc9c9 0%, #ffe8e8 100%)',
      tag: '温暖陪伴',
    },
  ];

  const learningTips = [
    { icon: <ThunderboltOutlined />, text: '每天坚持阅读30分钟，一年可以读完20本书' },
    { icon: <TrophyOutlined />, text: '做错题本是提高成绩的好方法' },
    { icon: <StarFilled />, text: '课前预习5分钟，上课效率翻一倍' },
    { icon: <ClockCircleOutlined />, text: '每学习45分钟，记得休息10分钟' },
  ];

  return (
    <div className="student-dashboard">
      {/* 页面标题 */}
      <div className="page-title-bar">
        <h2><SmileOutlined /> 学习空间</h2>
        <p className="page-subtitle">欢迎回来，{user?.realName || '同学'}。今天也是充满收获的一天。</p>
      </div>

      {/* 欢迎区域 */}
      <Card className="student-welcome-card" bordered={false}>
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} md={16}>
            <Space direction="vertical" size={8}>
              <Title level={4} style={{ margin: 0, color: 'var(--text-main)', fontWeight: 600 }}>
                {greeting}，{user?.realName || '同学'}
              </Title>
              <Paragraph style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 15 }}>
                <BulbOutlined style={{ color: 'var(--primary-color)', marginRight: 6 }} />
                {dailyQuote}
              </Paragraph>
            </Space>
          </Col>
          <Col xs={24} md={8} style={{ textAlign: 'right' }}>
            <Tag color="orange" style={{ fontSize: 13, padding: '4px 12px' }}>
              <ClockCircleOutlined style={{ marginRight: 4 }} />
              {new Date().toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Tag>
          </Col>
        </Row>
      </Card>

      {/* 功能卡片 */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }}>
        {functionCards.map((card) => (
          <Col xs={24} md={8} key={card.key}>
            <Card
              hoverable
              className="student-func-card"
              style={{ background: card.bg, borderColor: 'transparent' }}
              onClick={() => navigate(card.key)}
            >
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ 
                    width: 60, height: 60, borderRadius: 16, 
                    background: 'rgba(255,255,255,0.8)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: card.color,
                  }}>
                    {card.icon}
                  </div>
                  <Tag color={card.color} style={{ borderRadius: 12 }}>{card.tag}</Tag>
                </div>
                <Title level={4} style={{ marginTop: 16, marginBottom: 4 }}>{card.title}</Title>
                <Text type="secondary">{card.desc}</Text>
                <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                  <Button type="text" style={{ color: card.color, fontWeight: 600, padding: 0 }}>
                    立即使用 <RightOutlined />
                  </Button>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 学习小贴士 */}
      <Card
        title={<span><StarFilled style={{ color: 'var(--primary-color)', marginRight: 8 }} />学习小贴士</span>}
        bordered={false}
        style={{ marginTop: 20, borderRadius: 16 }}
      >
        <List
          dataSource={learningTips}
          renderItem={(item) => (
            <List.Item style={{ borderBottom: '1px solid #f0f0f0', padding: '12px 0' }}>
              <Space>
                <span style={{ color: 'var(--primary-color)', fontSize: 18 }}>{item.icon}</span>
                <Text>{item.text}</Text>
              </Space>
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}

export default StudentDashboard;
