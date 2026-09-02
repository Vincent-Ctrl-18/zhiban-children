import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  TeamOutlined, 
  HomeOutlined, 
  GiftOutlined, 
  BarChartOutlined,
  HeartFilled,
  RightOutlined,
  SafetyOutlined,
  CheckCircleOutlined,
  GlobalOutlined,
  PhoneOutlined,
  MailOutlined,
  EnvironmentOutlined,
  LeftOutlined,
  ReadOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import { withBasePath } from '../utils/paths';
import { statisticsApi } from '../services/api';
import { practiceArticles } from '../data/practiceArticles';

const roles = [
  {
    key: 'parent',
    icon: <TeamOutlined />,
    title: '家长',
    description: '查看孩子的活动记录、照片和机构通知，随时掌握孩子动态',
    color: '#FF9F43',
    bg: '#FFF5E6',
  },
  {
    key: 'institution',
    icon: <HomeOutlined />,
    title: '托管机构',
    description: '管理儿童信息、签到记录、安全检查和活动记录',
    color: '#1dd1a1',
    bg: '#e3f9f3',
  },
  {
    key: 'resource',
    icon: <GiftOutlined />,
    title: '资源方',
    description: '志愿者/企业/高校，登记可提供的资源与服务',
    color: '#48dbfb',
    bg: '#e8f9fe',
  },
  {
    key: 'government',
    icon: <BarChartOutlined />,
    title: '政府/捐赠方',
    description: '查看项目影响力数据、服务统计和资源对接情况',
    color: '#a55eea',
    bg: '#f3eaff',
  },
  {
    key: 'student',
    icon: <ReadOutlined />,
    title: '学生',
    description: '作业帮手辅导答疑、个性化学习报告、温暖倾诉小屋陪伴',
    color: '#ff6348',
    bg: '#ffede9',
  },
];

const heroSlides = [
  '/hero-bg.jpg',
  '/show-image1.jpg',
  '/show-image2.jpg',
  '/show-image3.jpg',
].map(withBasePath);

const features = [
  {
    icon: <SafetyOutlined />,
    title: '安全管理',
    desc: '每日安全检查打卡，10 项标准化检查清单，全方位守护孩子安全',
  },
  {
    icon: <CheckCircleOutlined />,
    title: '签到记录',
    desc: '每日签到签退管理，实时追踪儿童到托状态与接送信息',
  },
  {
    icon: <TeamOutlined />,
    title: '家校互联',
    desc: '家长随时查看活动照片、通知公告，打破城乡信息壁垒',
  },
  {
    icon: <GlobalOutlined />,
    title: '资源对接',
    desc: '连接企业、高校、公益组织，精准匹配乡村需求与城市资源',
  },
];

/* ---- Scroll reveal hook ---- */
function useScrollReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.classList.add('revealed');
          observer.unobserve(node);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function RevealSection({ children, className = '', delay = 0 }) {
  const ref = useScrollReveal();
  return (
    <div
      ref={ref}
      className={`scroll-reveal ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ---- Animated counter hook ---- */
function useCountUp(end, duration = 2000) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const numEnd = parseInt(end.replace(/[^0-9]/g, ''), 10);
          const startTime = performance.now();
          const animate = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * numEnd));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
          observer.unobserve(node);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [end, duration]);

  const suffix = end.includes('+') ? '+' : '';
  return { ref, display: count.toLocaleString() + suffix };
}

function StatItem({ number, label }) {
  const { ref, display } = useCountUp(number);
  return (
    <div className="stats-item" ref={ref}>
      <div className="stats-number">{display}</div>
      <div className="stats-label">{label}</div>
    </div>
  );
}

function RoleSelection() {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [navScrolled, setNavScrolled] = useState(false);
  const [impact, setImpact] = useState(null);
  const [transitionRole, setTransitionRole] = useState(null);
  const [selectedRole, setSelectedRole] = useState('parent');
  const slideTimer = useRef(null);

  const handleRoleSelect = (role) => {
    setTransitionRole(role);
    window.setTimeout(() => navigate(`/login/${role}`), 360);
  };

  const scrollToRoles = () => {
    document.getElementById('role-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  /* Navbar glass effect on scroll */
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    statisticsApi.getImpact().then(setImpact).catch(() => setImpact(null));
  }, []);

  /* Auto carousel */
  const resetTimer = useCallback(() => {
    clearInterval(slideTimer.current);
    slideTimer.current = setInterval(() => {
      setCurrentSlide((p) => (p + 1) % heroSlides.length);
    }, 5000);
  }, []);

  const nextSlide = useCallback(() => {
    setCurrentSlide((p) => (p + 1) % heroSlides.length);
    resetTimer();
  }, [resetTimer]);

  const prevSlide = useCallback(() => {
    setCurrentSlide((p) => (p - 1 + heroSlides.length) % heroSlides.length);
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    resetTimer();
    return () => clearInterval(slideTimer.current);
  }, [resetTimer]);

  const goToSlide = (i) => {
    setCurrentSlide(i);
    resetTimer();
  };

  return (
    <div className="homepage">
      <div className={`role-transition${transitionRole ? ' active' : ''}`} aria-hidden="true"><span>{transitionRole ? '正在打开专属空间' : ''}</span></div>
      {/* ========== Navbar (glass on scroll) ========== */}
      <nav className={`site-navbar${navScrolled ? ' navbar-scrolled' : ''}`}>
        <div className="nav-logo">
          <img src={withBasePath('/logo.png')} alt="智伴乡童" className="nav-icon" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          智伴乡童
        </div>
        <div className="nav-links">
          <span className="nav-link" onClick={scrollToRoles}>关于我们</span>
          <span className="nav-link" onClick={() => navigate('/practice')}>实践专栏</span>
          <span className="nav-link" onClick={() => handleRoleSelect('parent')}>家长端</span>
          <span className="nav-link" onClick={() => handleRoleSelect('institution')}>托管机构</span>
          <span className="nav-link" onClick={() => handleRoleSelect('resource')}>资源方</span>
          <span className="nav-link" onClick={() => handleRoleSelect('government')}>基金会</span>
          <span className="nav-link" onClick={() => handleRoleSelect('student')}>学生端</span>
          <Button className="signup-btn" onClick={scrollToRoles}>立即加入</Button>
        </div>
        <div className="mobile-menu-btn" onClick={scrollToRoles}>
          <span></span><span></span><span></span>
        </div>
      </nav>

      {/* ========== Hero Carousel (full-screen) ========== */}
      <section className="hero-carousel">
        {/* Slides */}
        {heroSlides.map((src, i) => (
          <div
            key={i}
            className={`hero-slide${i === currentSlide ? ' active' : ''}`}
            style={{ backgroundImage: `url(${src})` }}
          />
        ))}

        {/* Dark overlay */}
        <div className="hero-overlay" />

        {/* Content */}
        <div className="hero-content">
          <h1 className="hero-title">
            智伴乡童&nbsp;&nbsp;暖护童心
          </h1>
          <p className="hero-subtitle">
            以西南为重点辐射全国，聚焦留守儿童情感陪伴缺失、成长支持不足等核心痛点<br />构建多方协同的长效关怀网络
          </p>
        </div>

        {/* Arrow nav */}
        <button className="carousel-arrow carousel-prev" onClick={prevSlide} aria-label="上一张">
          <LeftOutlined />
        </button>
        <button className="carousel-arrow carousel-next" onClick={nextSlide} aria-label="下一张">
          <RightOutlined />
        </button>

        {/* Dots */}
        <div className="carousel-dots">
          {heroSlides.map((_, i) => (
            <button
              key={i}
              className={`carousel-dot${i === currentSlide ? ' active' : ''}`}
              onClick={() => goToSlide(i)}
              aria-label={`第${i + 1}张`}
            />
          ))}
        </div>

        {/* Scroll hint */}
        <div className="scroll-hint" onClick={scrollToRoles}>
          <span className="scroll-mouse">
            <span className="scroll-wheel" />
          </span>
        </div>
      </section>

      {/* ========== Stats Bar (animated counters) ========== */}
      {impact && <RevealSection className="stats-bar-wrapper">
        <section className="stats-bar">
          {[
            { number: String(impact.metrics?.uniqueUsers || 0), label: '独立使用人数' },
            { number: String(impact.metrics?.usageCount || 0), label: '有效服务次数' },
            { number: String(impact.metrics?.completedCourses || 0), label: '课程完成' },
            { number: String(impact.metrics?.completedHomework || 0), label: '作业已解决' },
          ].map((s, i) => <StatItem key={i} number={s.number} label={s.label} />)}
        </section>
      </RevealSection>}

      <div className="content-journey">
      {/* ========== Features Section ========== */}
      <div className="features-section-wrapper">
      <section className="features-section">
        <RevealSection>
          <div className="section-header">
            <span className="section-tag">核心功能</span>
            <h2 className="section-title">全方位守护留守儿童成长</h2>
            <p className="section-desc">标准化托管运营 · 数字化资源对接 · 可视化数据看板</p>
          </div>
        </RevealSection>
        <div className="features-grid">
          {features.map((f, i) => (
            <RevealSection key={i} delay={i * 120}>
              <div className="feature-card">
                <span className="feature-index">0{i + 1}</span>
                <div className="feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            </RevealSection>
          ))}
        </div>
      </section>
      </div>
      <section className="role-section" id="role-section">
        <RevealSection>
          <div className="section-header">
            <span className="section-tag">服务入口</span>
            <h2 className="section-title">选择您的身份，立即开始</h2>
            <p className="section-desc">我们为不同角色的用户提供定制化的功能与服务</p>
          </div>
        </RevealSection>
        <div className="role-tabs" role="tablist">
          {roles.map((role, i) => (
            <button key={role.key} className={`role-tab${selectedRole === role.key ? ' active' : ''}`} role="tab" aria-selected={selectedRole === role.key} onClick={() => setSelectedRole(role.key)}>
              <span className="role-tab-icon" style={{ color: role.color }}>{role.icon}</span><strong>{role.title}</strong><small>{String(i + 1).padStart(2, '0')}</small>
            </button>
          ))}
        </div>
        {(() => { const role = roles.find(item => item.key === selectedRole) || roles[0]; return <div className="role-active-panel" key={role.key} style={{ '--role-color': role.color, '--role-bg': role.bg }}><div className="role-active-copy"><span className="role-active-kicker">{String(roles.indexOf(role) + 1).padStart(2, '0')} / 05 · 当前入口</span><h3>{role.title}</h3><p>{role.description}</p><Button className="role-active-button" onClick={() => handleRoleSelect(role.key)}>进入{role.title} <RightOutlined /></Button></div><div className="role-active-orbit"><div className="role-orbit-dot" /><div className="role-active-icon">{role.icon}</div></div></div>; })()}
      </section>

      <section className="practice-strip" id="practice">
        <RevealSection>
          <div className="practice-strip-heading">
            <div className="section-header section-header-left"><span className="section-tag">FIELD NOTES · 实践专栏</span><h2 className="section-title">来自 11 个地方的真实陪伴记录</h2></div>
            <Button className="practice-strip-more" onClick={() => navigate('/practice')}>浏览全部记录 <RightOutlined /></Button>
          </div>
        </RevealSection>
        <div className="practice-strip-list">
          {practiceArticles.slice(0, 4).map((article, index) => (
            <RevealSection key={article.id} delay={index * 70}>
              <a className={`practice-strip-row${index === 2 ? ' featured' : ''}`} href={article.url} target="_blank" rel="noreferrer">
                <span className="practice-strip-location"><strong>{String(index + 1).padStart(2, '0')}</strong><small>{article.place}</small></span>
                <span className="practice-strip-thumb"><img src={article.cover} alt="" loading="lazy" /></span>
                <div className="practice-strip-copy"><small>{article.category}</small><h3>{article.title}</h3></div>
                <RightOutlined />
              </a>
            </RevealSection>
          ))}
        </div>
      </section>

      </div>

      {/* ========== CTA Section with parallax bg ========== */}
      <section className="cta-section" style={{ backgroundImage: `url(${withBasePath('/show-image2.jpg')})` }}>
        <div className="cta-overlay" />
        <RevealSection className="cta-content">
          <h2>加入我们，让爱不再留守</h2>
          <p>无论您是家长、托管机构、志愿者还是爱心企业，都可以在智伴乡童找到贡献力量的方式</p>
          <div className="cta-buttons">
            <Button className="cta-btn-primary" onClick={() => handleRoleSelect('institution')}>机构入驻</Button>
            <Button className="cta-btn-secondary" onClick={() => handleRoleSelect('resource')}>志愿报名</Button>
          </div>
        </RevealSection>
      </section>

      {/* ========== Footer ========== */}
      <footer className="site-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="footer-logo">
              <img src={withBasePath('/logo.png')} alt="智伴乡童" style={{ width: 36, height: 36, objectFit: 'contain' }} />
              <span>智伴乡童</span>
            </div>
            <p className="footer-slogan">智伴乡童，暖护童心<br/>让每一个孩子都被温柔以待</p>
          </div>
          <div className="footer-links-group">
            <div className="footer-col">
              <h4>平台服务</h4>
              <span onClick={() => handleRoleSelect('parent')}>家长端</span>
              <span onClick={() => handleRoleSelect('institution')}>托管机构</span>
              <span onClick={() => handleRoleSelect('resource')}>资源对接</span>
              <span onClick={() => handleRoleSelect('government')}>数据看板</span>
              <span onClick={() => handleRoleSelect('student')}>学生端</span>
            </div>
            <div className="footer-col">
              <h4>关于我们</h4>
              <span>项目介绍</span>
              <span>发展历程</span>
              <span>合作伙伴</span>
              <span>加入我们</span>
            </div>
            <div className="footer-col">
              <h4>联系方式</h4>
              <span><PhoneOutlined /> 400-888-0000</span>
              <span><MailOutlined /> contact@zhibanxt.org</span>
              <span><EnvironmentOutlined /> 武汉市武昌区</span>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2026 智伴乡童 - 留守儿童关怀平台 &nbsp;|&nbsp; Made with <HeartFilled style={{ color: '#ff6b6b' }} /> for Children</p>
        </div>
      </footer>
    </div>
  );
}

export default RoleSelection;
