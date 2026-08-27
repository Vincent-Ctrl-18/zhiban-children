import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, message, Select, Radio, Alert, Space } from 'antd';
import {
  UserOutlined,
  LockOutlined,
  PhoneOutlined,
  HomeOutlined,
  ArrowLeftOutlined,
  TeamOutlined,
  KeyOutlined,
  ReadOutlined,
  MailOutlined,
} from '@ant-design/icons';
import { authApi } from '../services/api';
import { withBasePath } from '../utils/paths';

const roleConfig = {
  parent:      { name: '家长',       color: '#FF9F43', bg: '#FFF5E6', emoji: '👨‍👩‍👧' },
  institution: { name: '托管机构',   color: '#1dd1a1', bg: '#e3f9f3', emoji: '🏫' },
  resource:    { name: '资源方',     color: '#48dbfb', bg: '#e8f9fe', emoji: '🤝' },
  government:  { name: '政府/捐赠方', color: '#a55eea', bg: '#f3eaff', emoji: '🏛️' },
  student:     { name: '学生',       color: '#ff6348', bg: '#ffede9', emoji: '📚' },
};

function Register({ onLogin }) {
  const { role } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [institutionMode, setInstitutionMode] = useState('new');
  const [inviteCode, setInviteCode] = useState('');

  const cfg = roleConfig[role] || roleConfig.parent;

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const registerData = { ...values, role };

      if (role === 'institution') {
        if (institutionMode === 'new') {
          registerData.isNewInstitution = true;
        } else {
          registerData.inviteCode = values.inviteCode;
          delete registerData.organization;
        }
      }

      const registerResponse = await authApi.register(registerData);

      if (role === 'institution' && institutionMode === 'new' && registerResponse.inviteCode) {
        setInviteCode(registerResponse.inviteCode);
        message.success(`机构创建成功！邀请码: ${registerResponse.inviteCode}`);
      }

      // 检查是否需要邮箱验证
      if (registerResponse.needVerify) {
        message.success('注册成功！请查收验证邮件后登录');
        navigate(`/login/${role}`);
        return;
      }

      const loginResponse = await authApi.login({
        username: values.username,
        password: values.password,
      });

      message.success('注册成功');
      onLogin(loginResponse.user, loginResponse.token);
    } catch (error) {
      message.error(error.message || '注册失败');
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
          <h1 style={{ fontSize: 32, fontWeight: 800, color: '#1d1d1f', marginBottom: 12, letterSpacing: 2 }}>
            智伴乡童
          </h1>
          <p style={{ fontSize: 16, color: '#6b7280', lineHeight: 1.8, marginBottom: 40 }}>
            加入我们，共同守护每一位留守儿童的成长
          </p>
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
            {cfg.name}注册入口
          </div>
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
        width: 520,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 48px',
        background: '#fff',
        overflowY: 'auto',
      }} className="login-form-panel">
        <div style={{ width: '100%', maxWidth: 400 }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/')}
            style={{ color: '#9ca3af', marginBottom: 24, padding: 0, fontSize: 13 }}
          >
            返回首页
          </Button>

          <h2 style={{ fontSize: 26, fontWeight: 700, color: '#1d1d1f', marginBottom: 4 }}>
            创建账号
          </h2>
          <p style={{ color: '#9ca3af', marginBottom: 28, fontSize: 14 }}>
            填写信息，加入智伴乡童大家庭
          </p>

          <Form name="register" onFinish={handleSubmit} size="large" layout="vertical">
            <Form.Item
              name="username"
              label={<span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>用户名</span>}
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 4, message: '用户名至少4个字符' },
              ]}
            >
              <Input prefix={<UserOutlined style={{ color: '#d1d5db' }} />} placeholder="4位以上，用于登录" style={{ borderRadius: 10, height: 46 }} />
            </Form.Item>

            <Form.Item
              name="email"
              label={<span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>邮箱（可选）</span>}
              rules={[{ type: 'email', message: '请输入有效的邮箱地址' }]}
            >
              <Input prefix={<MailOutlined style={{ color: '#d1d5db' }} />} placeholder="用于邮箱登录和找回密码" style={{ borderRadius: 10, height: 46 }} />
            </Form.Item>

            <Form.Item
              name="password"
              label={<span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>密码</span>}
              rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少6个字符' }]}
            >
              <Input.Password prefix={<LockOutlined style={{ color: '#d1d5db' }} />} placeholder="至少6位" style={{ borderRadius: 10, height: 46 }} />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              label={<span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>确认密码</span>}
              dependencies={['password']}
              rules={[
                { required: true, message: '请确认密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) return Promise.resolve();
                    return Promise.reject(new Error('两次输入的密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined style={{ color: '#d1d5db' }} />} placeholder="再次输入密码" style={{ borderRadius: 10, height: 46 }} />
            </Form.Item>

            <Form.Item
              name="realName"
              label={<span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>真实姓名</span>}
              rules={[{ required: true, message: '请输入真实姓名' }]}
            >
              <Input prefix={<UserOutlined style={{ color: '#d1d5db' }} />} placeholder="真实姓名" style={{ borderRadius: 10, height: 46 }} />
            </Form.Item>

            <Form.Item
              name="phone"
              label={<span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>手机号</span>}
              rules={[
                { required: true, message: '请输入手机号' },
                { pattern: /^1\d{10}$/, message: '请输入正确的手机号' },
              ]}
            >
              <Input prefix={<PhoneOutlined style={{ color: '#d1d5db' }} />} placeholder="11位手机号" style={{ borderRadius: 10, height: 46 }} />
            </Form.Item>

            {/* 托管机构 */}
            {role === 'institution' && (
              <>
                <Form.Item label={<span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>注册方式</span>}>
                  <Radio.Group value={institutionMode} onChange={(e) => setInstitutionMode(e.target.value)} style={{ width: '100%' }}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Radio value="new"><Space><HomeOutlined /><span>创建新机构（我是机构负责人）</span></Space></Radio>
                      <Radio value="join"><Space><TeamOutlined /><span>加入现有机构（我是机构员工）</span></Space></Radio>
                    </Space>
                  </Radio.Group>
                </Form.Item>
                {institutionMode === 'new' ? (
                  <Form.Item name="organization" rules={[{ required: true, message: '请输入托管机构名称' }]}>
                    <Input prefix={<HomeOutlined style={{ color: '#d1d5db' }} />} placeholder="托管机构名称" style={{ borderRadius: 10, height: 46 }} />
                  </Form.Item>
                ) : (
                  <>
                    <Alert message="请向机构管理员获取邀请码" description="加入后，您将与机构其他成员共享数据" type="info" showIcon style={{ marginBottom: 16, borderRadius: 10 }} />
                    <Form.Item name="inviteCode" rules={[{ required: true, message: '请输入机构邀请码' }]}>
                      <Input prefix={<KeyOutlined style={{ color: '#d1d5db' }} />} placeholder="机构邀请码（8位）" maxLength={8} style={{ borderRadius: 10, height: 46, textTransform: 'uppercase' }} />
                    </Form.Item>
                  </>
                )}
              </>
            )}

            {/* 资源方 */}
            {role === 'resource' && (
              <Form.Item name="organization" rules={[{ required: true, message: '请输入所属机构/组织名称' }]}>
                <Input prefix={<HomeOutlined style={{ color: '#d1d5db' }} />} placeholder="所属机构/组织名称" style={{ borderRadius: 10, height: 46 }} />
              </Form.Item>
            )}

            {/* 学生 */}
            {role === 'student' && (
              <>
                <Form.Item name="organization" rules={[{ required: true, message: '请输入就读学校' }]}>
                  <Input prefix={<ReadOutlined style={{ color: '#d1d5db' }} />} placeholder="就读学校名称" style={{ borderRadius: 10, height: 46 }} />
                </Form.Item>
                <Form.Item name="grade">
                  <Select placeholder="选择年级（可选）" style={{ borderRadius: 10 }}>
                    {['一年级','二年级','三年级','四年级','五年级','六年级','初一','初二','初三'].map(g => (
                      <Select.Option key={g} value={g}>{g}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </>
            )}

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
                注册
              </Button>
            </Form.Item>
          </Form>

          <div style={{ textAlign: 'center', paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
            <span style={{ color: '#9ca3af', fontSize: 14 }}>已有账号？</span>
            <Link to={`/login/${role}`} style={{ marginLeft: 6, color: cfg.color, fontWeight: 600, fontSize: 14 }}>
              立即登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Register;
