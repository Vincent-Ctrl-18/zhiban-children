import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, message } from 'antd';
import {
  HomeOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  SafetyOutlined,
  CalendarOutlined,
  GiftOutlined,
  BarChartOutlined,
  BellOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BookOutlined,
  FileTextOutlined,
  HeartOutlined,
  ReadOutlined,
} from '@ant-design/icons';

// 页面组件
import RoleSelection from './pages/RoleSelection';
import Login from './pages/Login';
import Register from './pages/Register';
import InstitutionDashboard from './pages/institution/Dashboard';
import ChildrenManage from './pages/institution/ChildrenManage';
import DailyCheckin from './pages/institution/DailyCheckin';
import SafetyCheck from './pages/institution/SafetyCheck';
import ActivityRecord from './pages/institution/ActivityRecord';
import NotificationManage from './pages/institution/NotificationManage';
import ParentDashboard from './pages/parent/Dashboard';
import ResourceDashboard from './pages/resource/Dashboard';
import ResourceRegister from './pages/resource/ResourceRegister';
import GovernmentDashboard from './pages/government/Dashboard';
import StudentDashboard from './pages/student/Dashboard';
import HomeworkHelp from './pages/student/HomeworkHelp';
import LearningReport from './pages/student/LearningReport';
import ChatCompanion from './pages/student/ChatCompanion';
import AdminLogin from './pages/admin/AdminLogin';
import AdminPanel from './pages/admin/AdminPanel';

const { Header, Sider, Content } = Layout;

// 菜单配置
const menuConfig = {
  institution: [
    { key: '/institution', icon: <HomeOutlined />, label: '工作台' },
    { key: '/institution/children', icon: <TeamOutlined />, label: '儿童管理' },
    { key: '/institution/checkin', icon: <CheckCircleOutlined />, label: '每日签到' },
    { key: '/institution/safety', icon: <SafetyOutlined />, label: '安全检查' },
    { key: '/institution/activities', icon: <CalendarOutlined />, label: '活动记录' },
    { key: '/institution/notifications', icon: <BellOutlined />, label: '通知管理' },
  ],
  parent: [
    { key: '/parent', icon: <HomeOutlined />, label: '首页' },
  ],
  resource: [
    { key: '/resource', icon: <HomeOutlined />, label: '资源中心' },
    { key: '/resource/register', icon: <GiftOutlined />, label: '资源登记' },
  ],
  government: [
    { key: '/government', icon: <BarChartOutlined />, label: '数据看板' },
  ],
  student: [
    { key: '/student', icon: <HomeOutlined />, label: '学习中心' },
    { key: '/student/homework', icon: <BookOutlined />, label: '作业辅导' },
    { key: '/student/report', icon: <FileTextOutlined />, label: '学习报告' },
    { key: '/student/chat', icon: <HeartOutlined />, label: '谈心伙伴' },
  ],
};

function App() {
  const [user, setUser] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // 检查本地存储的用户信息
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (storedUser && token) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const handleLogin = (userData, token) => {
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', token);
    setUser(userData);
    navigate(`/${userData.role}`);
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setUser(null);
    message.success('已退出登录');
    navigate('/');
  };

  const userMenu = (
    <Menu
      items={[
        {
          key: 'profile',
          icon: <UserOutlined />,
          label: user?.realName || user?.username,
          disabled: true,
        },
        { type: 'divider' },
        {
          key: 'logout',
          icon: <LogoutOutlined />,
          label: '退出登录',
          onClick: handleLogout,
        },
      ]}
    />
  );

  // 管理员登录处理
  const handleAdminLogin = (userData, token) => {
    localStorage.setItem('adminUser', JSON.stringify(userData));
    localStorage.setItem('adminToken', token);
    setUser(userData);
  };

  const handleAdminLogout = () => {
    localStorage.removeItem('adminUser');
    localStorage.removeItem('adminToken');
    setUser(null);
    message.success('已退出开发者后台');
  };

  // /admin 独立路由（不受普通登录态影响）
  if (location.pathname.startsWith('/admin')) {
    const adminUser = localStorage.getItem('adminUser');
    const adminToken = localStorage.getItem('adminToken');
    if (adminUser && adminToken) {
      return <AdminPanel onLogout={handleAdminLogout} />;
    }
    return (
      <Routes>
        <Route path="/admin" element={<AdminLogin onAdminLogin={handleAdminLogin} />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    );
  }

  // 未登录时显示的页面
  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<RoleSelection />} />
        <Route path="/login/:role" element={<Login onLogin={handleLogin} />} />
        <Route path="/register/:role" element={<Register onLogin={handleLogin} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  const currentMenuItems = menuConfig[user.role] || [];

  return (
    <Layout className="main-layout" style={{ minHeight: '100vh' }}>
      <Sider 
        trigger={null} 
        collapsible 
        collapsed={collapsed}
        width={220}
        breakpoint="lg"
        collapsedWidth="0"
        onBreakpoint={(broken) => {
          if (broken) setCollapsed(true);
        }}
        style={{
          zIndex: 100, 
        }}
      >
        <div className="logo-container">
          {!collapsed && 
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#FF9F43' }}></div>
              <span style={{ color: '#2d3436', fontSize: 18 }}>智伴乡童</span>
            </div>
          }
        </div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={currentMenuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout>
        <Header style={{ 
          padding: '0 24px', 
          background: '#fff', 
          display: 'flex', 
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {collapsed ? (
              <MenuUnfoldOutlined 
                style={{ fontSize: 20, cursor: 'pointer' }}
                onClick={() => setCollapsed(false)}
              />
            ) : (
              <MenuFoldOutlined 
                style={{ fontSize: 20, cursor: 'pointer' }}
                onClick={() => setCollapsed(true)}
              />
            )}
            <span style={{ marginLeft: 16, fontSize: 16, color: '#636e72' }}>
              {user.role === 'institution' && '托管机构管理后台'}
              {user.role === 'parent' && '家长服务中心'}
              {user.role === 'resource' && '资源方服务中心'}
              {user.role === 'government' && '政府数据看板'}
              {user.role === 'student' && '学生学习中心'}
            </span>
          </div>
          <Dropdown overlay={userMenu} placement="bottomRight">
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <Avatar 
                style={{ backgroundColor: '#FF9F43' }} 
                icon={<UserOutlined />}
              />
              <span style={{ marginLeft: 8, color: '#2D3436' }}>
                {user.realName || user.username}
              </span>
            </div>
          </Dropdown>
        </Header>
        <Content className="main-content">
          <Routes>
            {/* 托管机构路由 */}
            <Route path="/institution" element={<InstitutionDashboard />} />
            <Route path="/institution/children" element={<ChildrenManage />} />
            <Route path="/institution/checkin" element={<DailyCheckin />} />
            <Route path="/institution/safety" element={<SafetyCheck />} />
            <Route path="/institution/activities" element={<ActivityRecord />} />
            <Route path="/institution/notifications" element={<NotificationManage />} />
            
            {/* 家长路由 */}
            <Route path="/parent" element={<ParentDashboard />} />
            
            {/* 资源方路由 */}
            <Route path="/resource" element={<ResourceDashboard />} />
            <Route path="/resource/register" element={<ResourceRegister />} />
            
            {/* 政府路由 */}
            <Route path="/government" element={<GovernmentDashboard />} />
            
            {/* 学生路由 */}
            <Route path="/student" element={<StudentDashboard />} />
            <Route path="/student/homework" element={<HomeworkHelp />} />
            <Route path="/student/report" element={<LearningReport />} />
            <Route path="/student/chat" element={<ChatCompanion />} />
            
            {/* 默认重定向 */}
            <Route path="*" element={<Navigate to={`/${user.role}`} replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;
