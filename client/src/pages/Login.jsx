import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, Card, message, Avatar } from 'antd';
import { UserOutlined, LockOutlined, ArrowLeftOutlined, TeamOutlined, HomeOutlined, GiftOutlined, BarChartOutlined, ReadOutlined } from '@ant-design/icons';
import { authApi } from '../services/api';

const roleConfig = {
  parent: { name: '家长', icon: <TeamOutlined />, color: '#FF9F43', bg: '#FFF5E6' },
  institution: { name: '托管机构', icon: <HomeOutlined />, color: '#1dd1a1', bg: '#e3f9f3' },
  resource: { name: '资源方', icon: <GiftOutlined />, color: '#48dbfb', bg: '#e8f9fe' },
  government: { name: '政府/捐赠方', icon: <BarChartOutlined />, color: '#a55eea', bg: '#f3eaff' },
  student: { name: '学生', icon: <ReadOutlined />, color: '#ff6348', bg: '#ffede9' },
};

function Login({ onLogin }) {
  const { role } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  const currentRole = roleConfig[role] || roleConfig.parent;

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const response = await authApi.login(values);
      
      // 检查角色是否匹配
      if (response.user.role !== role) {
        message.error(`该账号不是${currentRole.name}账号`);
        return;
      }
      
      message.success('登录成功');
      onLogin(response.user, response.token);
    } catch (error) {
      message.error(error.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="role-selection-page">
      <Card 
        style={{ 
          width: '100%',
          maxWidth: 420, 
          boxShadow: '0 12px 40px rgba(0,0,0,0.08)',
          borderRadius: 20,
          border: 'none',
          overflow: 'hidden',
          margin: '0 10px'
        }}
        bodyStyle={{ padding: 40 }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Avatar 
            size={64} 
            icon={currentRole.icon} 
            style={{ 
              backgroundColor: currentRole.bg, 
              color: currentRole.color,
              marginBottom: 16
            }} 
          />
          <h2 style={{ marginBottom: 8, fontSize: 24, color: '#2d3436' }}>{currentRole.name}登录</h2>
          <p style={{ color: '#b2bec3' }}>欢迎回到智伴乡童平台</p>
        </div>

        <Form
          name="login"
          onFinish={handleSubmit}
          size="large"
          layout="vertical"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input 
              prefix={<UserOutlined style={{ color: '#b2bec3' }} />} 
              placeholder="请输入用户名" 
              style={{ borderRadius: 8, padding: '10px 12px' }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password 
              prefix={<LockOutlined style={{ color: '#b2bec3' }} />} 
              placeholder="请输入密码" 
              style={{ borderRadius: 8, padding: '10px 12px' }}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 16 }}>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={loading}
              block
              style={{ 
                height: 48, 
                fontSize: 16, 
                borderRadius: 8, 
                backgroundColor: currentRole.color,
                borderColor: currentRole.color,
                boxShadow: `0 4px 12px ${currentRole.color}40`
              }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <p style={{ marginBottom: 24, color: '#636e72' }}>
            还没有账号？
            <Link to={`/register/${role}`} style={{ marginLeft: 4, color: currentRole.color, fontWeight: 500 }}>
              立即注册
            </Link>
          </p>
          <Button 
            type="text" 
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/')}
            style={{ color: '#b2bec3' }}
          >
            返回选择身份
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default Login;
