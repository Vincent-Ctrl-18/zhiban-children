import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, message, Tabs } from 'antd';
import { UserOutlined, LockOutlined, ArrowLeftOutlined, MailOutlined } from '@ant-design/icons';
import { authApi } from '../services/api';
import { withBasePath } from '../utils/paths';

const roleConfig = {
  parent:      { name: '家长',      color: '#FF9F43', bg: '#FFF5E6',  emoji: '👨‍👩‍👧' },
  institution: { name: '托管机构',  color: '#1dd1a1', bg: '#e3f9f3',  emoji: '🏫' },
  resource:    { name: '资源方',    color: '#48dbfb', bg: '#e8f9fe',  emoji: '🤝' },
  government:  { name: '政府/捐赠方', color: '#a55eea', bg: '#f3eaff', emoji: '🏛️' },
  student:     { name: '学生',      color: '#ff6348', bg: '#ffede9',  emoji: '📚' },
};

const roleDesc = {
  parent:      '随时掌握孩子动态，守护每一个成长瞬间',
  institution: '高效管理托管运营，让每个孩子都被妥善照顾',
  resource:    '连接城乡资源，让爱精准抵达',
  government:  '实时掌握项目数据，推动政策与资源落地',
  student:     '学习有帮手，心事有人听，成长路上不孤单',
};

function Login({ onLogin }) {
  const { role } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('username');

  const cfg = roleConfig[role] || roleConfig.parent;

  const handleUsernameLogin = async (values) => {
    setLoading(true);
    try {
      const response = await authApi.login(values);
      if (response.user.role !== role) {
        message.error(`该账号不是${cfg.name}账号`);
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

  const handleEmailLogin = async (values) => {
    setLoading(true);
    try {
      const response = await authApi.loginEmail(values);
      if (response.user.role !== role) {
        message.error(`该账号不是${cfg.name}账号`);
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
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: '#f8f9fa',
    }}>
      {/* 左侧品牌区 */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(145deg, ${cfg.color}15 0%, ${cfg.color}08 100%)`,
        borderRight: '1px solid #f0f0f0',
        padding: '60px 48px',
        minHeight: '100vh',
      }} className="login-brand-panel">
        <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <img
            src={withBasePath('/logo.png')}
            alt="智伴乡童"
            style={{ width: 96, height: 96, objectFit: 'contain', marginBottom: 24 }}
          />
          <h1 style={{
            fontSize: 32,
            fontWeight: 800,
            color: '#1d1d1f',
            marginBottom: 12,
            letterSpacing: 2,
          }}>
            智伴乡童
          </h1>
          <p style={{
            fontSize: 16,
            color: '#6b7280',
            lineHeight: 1.8,
            marginBottom: 40,
          }}>
            {roleDesc[role] || '让每一个孩子都被温柔以待'}
          </p>

          {/* 角色标签 */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: cfg.bg,
            color: cfg.color,
            borderRadius: 980,
            padding: '10px 24px',
            fontSize: 15,
            fontWeight: 600,
          }}>
            <span style={{ fontSize: 20 }}>{cfg.emoji}</span>
            {cfg.name}登录入口
          </div>

          {/* 装饰图 */}
          <img
            src={withBasePath('/hero-bg.jpg')}
            alt=""
            style={{
              width: '100%',
              maxWidth: 340,
              borderRadius: 20,
              marginTop: 48,
              objectFit: 'cover',
              height: 200,
              opacity: 0.85,
              boxShadow: '0 16px 48px rgba(0,0,0,0.1)',
            }}
          />
        </div>
      </div>

      {/* 右侧表单区 */}
      <div style={{
        width: 480,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 48px',
        background: '#fff',
        minHeight: '100vh',
      }} className="login-form-panel">
        <div style={{ width: '100%', maxWidth: 360 }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/')}
            style={{ color: '#9ca3af', marginBottom: 32, padding: 0, fontSize: 13 }}
          >
            返回首页
          </Button>

          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#1d1d1f', marginBottom: 4 }}>
            欢迎回来
          </h2>
          <p style={{ color: '#9ca3af', marginBottom: 32, fontSize: 14 }}>
            登录您的{cfg.name}账号，继续您的旅程
          </p>

          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            style={{ marginBottom: 8 }}
            items={[
              {
                key: 'username',
                label: '账号登录',
                children: (
                  <Form name="login-username" onFinish={handleUsernameLogin} size="large" layout="vertical">
                    <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                      <Input
                        prefix={<UserOutlined style={{ color: '#d1d5db' }} />}
                        placeholder="用户名"
                        style={{ borderRadius: 10, height: 48 }}
                      />
                    </Form.Item>
                    <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
                      <Input.Password
                        prefix={<LockOutlined style={{ color: '#d1d5db' }} />}
                        placeholder="密码"
                        style={{ borderRadius: 10, height: 48 }}
                      />
                    </Form.Item>
                    <Form.Item style={{ marginTop: 8 }}>
                      <Button
                        type="primary"
                        htmlType="submit"
                        loading={loading}
                        block
                        style={{
                          height: 50,
                          fontSize: 16,
                          borderRadius: 10,
                          background: cfg.color,
                          borderColor: cfg.color,
                          fontWeight: 600,
                          boxShadow: `0 4px 16px ${cfg.color}40`,
                        }}
                      >
                        登录
                      </Button>
                    </Form.Item>
                  </Form>
                ),
              },
              {
                key: 'email',
                label: '邮箱登录',
                children: (
                  <Form name="login-email" onFinish={handleEmailLogin} size="large" layout="vertical">
                    <Form.Item
                      name="email"
                      rules={[
                        { required: true, message: '请输入邮箱' },
                        { type: 'email', message: '请输入有效的邮箱地址' },
                      ]}
                    >
                      <Input
                        prefix={<MailOutlined style={{ color: '#d1d5db' }} />}
                        placeholder="邮箱地址"
                        style={{ borderRadius: 10, height: 48 }}
                      />
                    </Form.Item>
                    <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
                      <Input.Password
                        prefix={<LockOutlined style={{ color: '#d1d5db' }} />}
                        placeholder="密码"
                        style={{ borderRadius: 10, height: 48 }}
                      />
                    </Form.Item>
                    <Form.Item style={{ marginTop: 8 }}>
                      <Button
                        type="primary"
                        htmlType="submit"
                        loading={loading}
                        block
                        style={{
                          height: 50,
                          fontSize: 16,
                          borderRadius: 10,
                          background: cfg.color,
                          borderColor: cfg.color,
                          fontWeight: 600,
                          boxShadow: `0 4px 16px ${cfg.color}40`,
                        }}
                      >
                        登录
                      </Button>
                    </Form.Item>
                  </Form>
                ),
              },
            ]}
          />

          <div style={{
            textAlign: 'center',
            paddingTop: 16,
            borderTop: '1px solid #f3f4f6',
          }}>
            <span style={{ color: '#9ca3af', fontSize: 14 }}>还没有账号？</span>
            <Link
              to={`/register/${role}`}
              style={{ marginLeft: 6, color: cfg.color, fontWeight: 600, fontSize: 14 }}
            >
              立即注册
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
