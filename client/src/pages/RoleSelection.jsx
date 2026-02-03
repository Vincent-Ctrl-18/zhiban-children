import { useNavigate } from 'react-router-dom';
import { 
  TeamOutlined, 
  HomeOutlined, 
  GiftOutlined, 
  BarChartOutlined,
  HeartFilled,
  RightOutlined
} from '@ant-design/icons';
import { Button } from 'antd';

const roles = [
  {
    key: 'parent',
    icon: <TeamOutlined />,
    title: '家长',
    description: '查看孩子的活动记录、照片和机构通知',
    color: '#FF9F43',
    bg: '#FFF5E6'
  },
  {
    key: 'institution',
    icon: <HomeOutlined />,
    title: '托管机构',
    description: '管理儿童信息、签到记录、安全检查和活动记录',
    color: '#1dd1a1',
    bg: '#e3f9f3'
  },
  {
    key: 'resource',
    icon: <GiftOutlined />,
    title: '资源方',
    description: '志愿者/企业/高校，登记可提供的资源与服务',
    color: '#48dbfb',
    bg: '#e8f9fe'
  },
  {
    key: 'government',
    icon: <BarChartOutlined />,
    title: '政府/捐赠方',
    description: '查看项目影响力数据、服务统计和资源对接情况',
    color: '#a55eea',
    bg: '#f3eaff'
  },
];

function RoleSelection() {
  const navigate = useNavigate();

  const handleRoleSelect = (role) => {
    navigate(`/login/${role}`);
  };

  return (
    <div className="role-selection-page">
      <div className="logo-section">
        {/* Simplified Modern Logo */}
        <div style={{ position: 'relative', width: 100, height: 100, margin: '0 auto 20px' }}>
             <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', filter: 'drop-shadow(0 10px 15px rgba(255, 159, 67, 0.3))' }}>
                <circle cx="50" cy="50" r="45" fill="white" />
                <path d="M50 20 C30 20 15 35 15 55 C15 75 35 90 50 90 C65 90 85 75 85 55 C85 35 70 20 50 20 Z" fill="#FF9F43" />
                <circle cx="50" cy="45" r="12" fill="white" />
                <path d="M30 75 Q50 90 70 75" stroke="white" strokeWidth="4" strokeLinecap="round" fill="none" />
                <circle cx="35" cy="45" r="3" fill="#FF9F43" />
                <circle cx="65" cy="45" r="3" fill="#FF9F43" />
             </svg>
        </div>
        <h1>智伴乡童</h1>
        <p className="subtitle">
          聚焦留守儿童情感陪伴与成长支持，构建多方协同的长效关怀网络<br/>
          <span style={{color: '#FF9F43', fontWeight: 500}}>暖护童心，共筑未来</span>
        </p>
      </div>

      <div className="role-cards">
        {roles.map((role) => (
          <div 
            key={role.key} 
            className="role-card"
            onClick={() => handleRoleSelect(role.key)}
          >
            <div 
              className="decorative-bar" 
              style={{ background: role.color }}
            />
            <div 
              className="icon" 
              style={{ color: role.color, background: role.bg }}
            >
              {role.icon}
            </div>
            <h3>{role.title}</h3>
            <p>{role.description}</p>
            <div style={{ marginTop: 'auto', paddingTop: 20 }}>
               <Button type="text" style={{ color: role.color }}>
                 进入入口 <RightOutlined />
               </Button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', color: '#b2bec3', fontSize: 13 }}>
        <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          Made with <HeartFilled style={{ color: '#ff6b6b' }} /> for Children
        </p>
        <p style={{ marginTop: 4 }}>© 2026 智伴乡童 - 留守儿童关怀平台</p>
      </div>
    </div>
  );
}

export default RoleSelection;
