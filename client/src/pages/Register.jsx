import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, Card, message, Select, Radio, Alert, Space, Typography } from 'antd';
import { 
  UserOutlined, 
  LockOutlined, 
  PhoneOutlined,
  HomeOutlined,
  ArrowLeftOutlined,
  TeamOutlined,
  KeyOutlined,
  ReadOutlined,
} from '@ant-design/icons';
import { authApi } from '../services/api';

const { Text } = Typography;

const roleNames = {
  parent: '家长',
  institution: '托管机构',
  resource: '资源方',
  government: '政府/捐赠方',
  student: '学生',
};

const orgTypeOptions = {
  resource: [
    { value: 'university', label: '高校' },
    { value: 'enterprise', label: '企业' },
    { value: 'ngo', label: '公益组织' },
    { value: 'individual', label: '个人志愿者' },
  ],
};

function Register({ onLogin }) {
  const { role } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [institutionMode, setInstitutionMode] = useState('new'); // 'new' 或 'join'
  const [inviteCode, setInviteCode] = useState('');

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      // 构建注册数据
      const registerData = {
        ...values,
        role,
      };

      // 机构角色特殊处理
      if (role === 'institution') {
        if (institutionMode === 'new') {
          registerData.isNewInstitution = true;
        } else {
          registerData.inviteCode = values.inviteCode;
          delete registerData.organization;
        }
      }

      // 注册
      const registerResponse = await authApi.register(registerData);
      
      // 如果是创建新机构，显示邀请码
      if (role === 'institution' && institutionMode === 'new' && registerResponse.inviteCode) {
        setInviteCode(registerResponse.inviteCode);
        message.success(`机构创建成功！邀请码: ${registerResponse.inviteCode}`);
      }
      
      // 注册成功后自动登录
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
    <div className="role-selection-page">
      <Card 
        style={{ 
          width: '100%',
          maxWidth: 450, 
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          borderRadius: 16,
          margin: '0 10px'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h2 style={{ marginBottom: 8 }}>{roleNames[role]}注册</h2>
          <p style={{ color: '#636e72' }}>加入智伴乡童，共同守护留守儿童</p>
        </div>

        <Form
          name="register"
          onFinish={handleSubmit}
          size="large"
          layout="vertical"
        >
          <Form.Item
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 4, message: '用户名至少4个字符' },
            ]}
          >
            <Input 
              prefix={<UserOutlined />} 
              placeholder="用户名（登录使用）" 
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password 
              prefix={<LockOutlined />} 
              placeholder="密码" 
            />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password 
              prefix={<LockOutlined />} 
              placeholder="确认密码" 
            />
          </Form.Item>

          <Form.Item
            name="realName"
            rules={[{ required: true, message: '请输入真实姓名' }]}
          >
            <Input 
              prefix={<UserOutlined />} 
              placeholder="真实姓名" 
            />
          </Form.Item>

          <Form.Item
            name="phone"
            rules={[
              { required: true, message: '请输入手机号' },
              { pattern: /^1\d{10}$/, message: '请输入正确的手机号' },
            ]}
          >
            <Input 
              prefix={<PhoneOutlined />} 
              placeholder="手机号" 
            />
          </Form.Item>

          {/* 托管机构特殊处理：选择创建新机构或加入现有机构 */}
          {role === 'institution' && (
            <>
              <Form.Item label="注册方式">
                <Radio.Group 
                  value={institutionMode} 
                  onChange={(e) => setInstitutionMode(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Radio value="new">
                      <Space>
                        <HomeOutlined />
                        <span>创建新机构（我是机构负责人）</span>
                      </Space>
                    </Radio>
                    <Radio value="join">
                      <Space>
                        <TeamOutlined />
                        <span>加入现有机构（我是机构员工）</span>
                      </Space>
                    </Radio>
                  </Space>
                </Radio.Group>
              </Form.Item>

              {institutionMode === 'new' ? (
                <Form.Item
                  name="organization"
                  rules={[{ required: true, message: '请输入托管机构名称' }]}
                >
                  <Input 
                    prefix={<HomeOutlined />} 
                    placeholder="托管机构名称" 
                  />
                </Form.Item>
              ) : (
                <>
                  <Alert
                    message="请向机构管理员获取邀请码"
                    description="加入后，您将与机构其他成员共享数据"
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />
                  <Form.Item
                    name="inviteCode"
                    rules={[{ required: true, message: '请输入机构邀请码' }]}
                  >
                    <Input 
                      prefix={<KeyOutlined />} 
                      placeholder="机构邀请码（8位）" 
                      maxLength={8}
                      style={{ textTransform: 'uppercase' }}
                    />
                  </Form.Item>
                </>
              )}
            </>
          )}

          {/* 资源方需要填写组织名称 */}
          {role === 'resource' && (
            <Form.Item
              name="organization"
              rules={[{ required: true, message: '请输入所属机构/组织名称' }]}
            >
              <Input 
                prefix={<HomeOutlined />} 
                placeholder="所属机构/组织名称" 
              />
            </Form.Item>
          )}

          {/* 学生需要填写学校和年级 */}
          {role === 'student' && (
            <>
              <Form.Item
                name="organization"
                rules={[{ required: true, message: '请输入就读学校' }]}
              >
                <Input 
                  prefix={<ReadOutlined />} 
                  placeholder="就读学校名称" 
                />
              </Form.Item>
              <Form.Item
                name="grade"
              >
                <Select placeholder="选择年级（可选）">
                  <Select.Option value="一年级">一年级</Select.Option>
                  <Select.Option value="二年级">二年级</Select.Option>
                  <Select.Option value="三年级">三年级</Select.Option>
                  <Select.Option value="四年级">四年级</Select.Option>
                  <Select.Option value="五年级">五年级</Select.Option>
                  <Select.Option value="六年级">六年级</Select.Option>
                  <Select.Option value="初一">初一</Select.Option>
                  <Select.Option value="初二">初二</Select.Option>
                  <Select.Option value="初三">初三</Select.Option>
                </Select>
              </Form.Item>
            </>
          )}

          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={loading}
              block
              style={{ height: 44 }}
            >
              注册
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center' }}>
          <p style={{ marginBottom: 16 }}>
            已有账号？
            <Link to={`/login/${role}`} style={{ marginLeft: 4 }}>
              立即登录
            </Link>
          </p>
          <Button 
            type="link" 
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/')}
          >
            返回选择身份
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default Register;
