import { useState } from 'react';
import { Form, Input, Button, Card, message, Typography } from 'antd';
import { UserOutlined, LockOutlined, CodeOutlined, SafetyOutlined } from '@ant-design/icons';
import { adminApi } from '../../services/api';

const { Title, Text } = Typography;

function AdminLogin({ onAdminLogin }) {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const res = await adminApi.login(values);
      message.success('登录成功');
      onAdminLogin(res.user, res.token);
    } catch (error) {
      message.error(error.message || '账号或密码错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-bg" />
      <Card className="admin-login-card" bordered={false}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div className="admin-login-icon">
            <CodeOutlined />
          </div>
          <Title level={3} style={{ margin: '20px 0 6px', color: 'var(--text-main)', fontWeight: 700 }}>
            开发者后台
          </Title>
          <Text style={{ color: 'var(--text-light)', fontSize: 14 }}>仅限授权开发人员访问</Text>
        </div>
        <Form name="admin-login" onFinish={handleSubmit} size="large" layout="vertical">
          <Form.Item name="username" rules={[{ required: true, message: '请输入账号' }]}>
            <Input prefix={<UserOutlined style={{ color: 'var(--text-light)' }} />} placeholder="管理员账号" autoComplete="off" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: 'var(--text-light)' }} />} placeholder="管理员密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block
              className="admin-login-btn">
              登录
            </Button>
          </Form.Item>
        </Form>
        <div className="admin-login-footer">
          <SafetyOutlined /> 安全通道 · 数据已加密传输
        </div>
      </Card>
    </div>
  );
}

export default AdminLogin;
