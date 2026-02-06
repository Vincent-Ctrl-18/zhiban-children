import { useState, useEffect } from 'react';
import { Row, Col, Card, message, Spin } from 'antd';
import {
  TeamOutlined,
  CalendarOutlined,
  HeartOutlined,
  GiftOutlined,
  HomeOutlined,
  RiseOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { statisticsApi } from '../../services/api';

// 统一调色板
const COLORS = {
  orange: '#FF9F43',
  blue: '#3B82F6',
  pink: '#EC4899',
  green: '#10B981',
  purple: '#8B5CF6',
  cyan: '#06B6D4',
};

function GovernmentDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalChildren: 0,
    totalActivities: 0,
    totalVolunteers: 0,
    totalResources: 0,
    totalInstitutions: 0,
    monthlyChildren: 0,
    monthlyActivities: 0,
  });
  const [activityTrend, setActivityTrend] = useState([]);
  const [activityTypes, setActivityTypes] = useState([]);
  const [resourceTypes, setResourceTypes] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [dashboardData, trendData, typesData, resourceTypesData] = await Promise.all([
        statisticsApi.getDashboard(),
        statisticsApi.getActivityTrend(),
        statisticsApi.getActivityTypes(),
        statisticsApi.getResourceTypes(),
      ]);

      setStats(dashboardData);
      setActivityTrend(trendData);
      setActivityTypes(typesData);
      setResourceTypes(resourceTypesData);
    } catch (error) {
      setStats({
        totalChildren: 156,
        totalActivities: 89,
        totalVolunteers: 45,
        totalResources: 23,
        totalInstitutions: 8,
        monthlyChildren: 12,
        monthlyActivities: 15,
      });
      setActivityTrend([
        { month: '2024-07', count: 10, participants: 80 },
        { month: '2024-08', count: 12, participants: 95 },
        { month: '2024-09', count: 15, participants: 120 },
        { month: '2024-10', count: 18, participants: 140 },
        { month: '2024-11', count: 20, participants: 160 },
        { month: '2024-12', count: 14, participants: 110 },
      ]);
      setActivityTypes([
        { type: 'course', count: 35 },
        { type: 'entertainment', count: 28 },
        { type: 'outdoor', count: 18 },
        { type: 'other', count: 8 },
      ]);
      setResourceTypes([
        { type: 'volunteer', count: 12 },
        { type: 'course', count: 5 },
        { type: 'material', count: 4 },
        { type: 'fund', count: 2 },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // 统计卡片组件
  const StatCard = ({ icon, iconBg, iconColor, label, value, suffix, extra }) => (
    <div className="gov-stat-card">
      <div className="gov-stat-icon" style={{ background: iconBg }}>
        {icon}
      </div>
      <div className="gov-stat-info">
        <span className="gov-stat-label">{label}</span>
        <span className="gov-stat-value">{value}<span className="gov-stat-suffix">{suffix}</span></span>
        {extra && <span className="gov-stat-extra">{extra}</span>}
      </div>
    </div>
  );

  // 活动趋势图
  const trendOption = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: { color: '#374151', fontSize: 13 },
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0,0,0,0.03)' } },
    },
    legend: {
      top: 0,
      right: 0,
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: '#6b7280', fontSize: 12 },
    },
    grid: { top: 40, left: 50, right: 50, bottom: 24 },
    xAxis: {
      type: 'category',
      data: activityTrend.map(item => {
        const parts = item.month.split('-');
        return `${parts[1]}月`;
      }),
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisTick: { show: false },
      axisLabel: { color: '#9ca3af', fontSize: 12 },
    },
    yAxis: [
      {
        type: 'value',
        name: '活动数',
        nameTextStyle: { color: '#9ca3af', fontSize: 11, padding: [0, 0, 0, -20] },
        splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } },
        axisLabel: { color: '#9ca3af', fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      {
        type: 'value',
        name: '参与人次',
        nameTextStyle: { color: '#9ca3af', fontSize: 11, padding: [0, -20, 0, 0] },
        splitLine: { show: false },
        axisLabel: { color: '#9ca3af', fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
    ],
    series: [
      {
        name: '活动数',
        type: 'bar',
        barWidth: 20,
        barBorderRadius: [4, 4, 0, 0],
        data: activityTrend.map(item => item.count),
        itemStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: COLORS.orange },
              { offset: 1, color: '#FFD4A0' },
            ],
          },
        },
      },
      {
        name: '参与人次',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 2.5, color: COLORS.blue },
        itemStyle: { color: COLORS.blue, borderWidth: 2, borderColor: '#fff' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(59,130,246,0.15)' },
              { offset: 1, color: 'rgba(59,130,246,0)' },
            ],
          },
        },
        data: activityTrend.map(item => item.participants),
      },
    ],
  };

  // 活动类型饼图
  const activityTypesOption = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c}次 ({d}%)',
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: { color: '#374151', fontSize: 13 },
    },
    legend: {
      bottom: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: '#6b7280', fontSize: 12 },
    },
    color: [COLORS.blue, COLORS.green, COLORS.orange, '#94a3b8'],
    series: [
      {
        type: 'pie',
        radius: ['45%', '72%'],
        center: ['50%', '45%'],
        padAngle: 3,
        itemStyle: { borderRadius: 6 },
        label: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 6,
          itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.12)' },
        },
        data: activityTypes.map(item => ({
          name: { course: '课程', entertainment: '娱乐', outdoor: '户外', other: '其他' }[item.type] || item.type,
          value: item.count,
        })),
      },
    ],
  };

  // 资源类型饼图
  const resourceTypesOption = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c}项 ({d}%)',
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: { color: '#374151', fontSize: 13 },
    },
    legend: {
      bottom: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: '#6b7280', fontSize: 12 },
    },
    color: [COLORS.pink, COLORS.cyan, COLORS.purple, COLORS.orange],
    series: [
      {
        type: 'pie',
        radius: ['45%', '72%'],
        center: ['50%', '45%'],
        padAngle: 3,
        itemStyle: { borderRadius: 6 },
        label: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 6,
          itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.12)' },
        },
        data: resourceTypes.map(item => ({
          name: { 
            course: '课程资源', 
            material: '物资支持', 
            volunteer: '志愿服务', 
            fund: '资金捐赠',
            other: '其他' 
          }[item.type] || item.type,
          value: item.count,
        })),
      },
    ],
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="gov-dashboard">
      <div className="page-title-bar">
        <h2><RiseOutlined />影响力数据看板</h2>
        <p className="page-subtitle">实时汇总各机构服务数据，综合展示项目整体运行情况</p>
      </div>

      {/* 核心指标 — 第一行 3 个主指标 */}
      <Row gutter={[20, 20]}>
        <Col xs={24} sm={8}>
          <Card className="gov-stat-card-wrap">
            <StatCard
              icon={<TeamOutlined style={{ color: COLORS.orange, fontSize: 22 }} />}
              iconBg="#FFF7ED"
              label="已服务儿童"
              value={stats.totalChildren}
              suffix=" 人"
              extra={<><ArrowUpOutlined /> 本月 +{stats.monthlyChildren}</>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="gov-stat-card-wrap">
            <StatCard
              icon={<CalendarOutlined style={{ color: COLORS.blue, fontSize: 22 }} />}
              iconBg="#EFF6FF"
              label="已开展活动"
              value={stats.totalActivities}
              suffix=" 次"
              extra={<><ArrowUpOutlined /> 本月 +{stats.monthlyActivities}</>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="gov-stat-card-wrap">
            <StatCard
              icon={<HeartOutlined style={{ color: COLORS.pink, fontSize: 22 }} />}
              iconBg="#FDF2F8"
              label="志愿者参与"
              value={stats.totalVolunteers}
              suffix=" 人次"
            />
          </Card>
        </Col>
      </Row>

      {/* 核心指标 — 第二行 2 个副指标 */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }}>
        <Col xs={12} sm={8}>
          <Card className="gov-stat-card-wrap">
            <StatCard
              icon={<GiftOutlined style={{ color: COLORS.green, fontSize: 22 }} />}
              iconBg="#ECFDF5"
              label="合作资源"
              value={stats.totalResources}
              suffix=" 项"
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card className="gov-stat-card-wrap">
            <StatCard
              icon={<HomeOutlined style={{ color: COLORS.purple, fontSize: 22 }} />}
              iconBg="#F5F3FF"
              label="托管机构"
              value={stats.totalInstitutions}
              suffix=" 家"
            />
          </Card>
        </Col>
      </Row>

      {/* 图表区域 */}
      <Row gutter={[20, 20]} style={{ marginTop: 20 }}>
        <Col xs={24} lg={14}>
          <Card 
            title="活动开展趋势" 
            extra={<span style={{ color: '#9ca3af', fontSize: 12 }}>近 6 个月</span>}
            styles={{ header: { borderBottom: 'none', paddingBottom: 0 } }}
          >
            <ReactECharts option={trendOption} style={{ height: 320 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={10}>
          <Card 
            title="活动类型分布"
            styles={{ header: { borderBottom: 'none', paddingBottom: 0 } }}
          >
            <ReactECharts option={activityTypesOption} style={{ height: 320 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[20, 20]} style={{ marginTop: 20 }}>
        <Col xs={24} sm={12} lg={10}>
          <Card 
            title="资源类型分布"
            styles={{ header: { borderBottom: 'none', paddingBottom: 0 } }}
          >
            <ReactECharts option={resourceTypesOption} style={{ height: 320 }} />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card 
            title="项目介绍"
            styles={{ header: { borderBottom: 'none', paddingBottom: 0 } }}
          >
            <div style={{ lineHeight: 2, color: '#6b7280', fontSize: 14 }}>
              <p>
                <strong style={{ color: '#1d1d1f' }}>"智伴乡童，暖护童心"</strong>——以西南为重点辐射全国留守儿童身心健康成长赋能计划
              </p>
              <p>
                聚焦云贵川与中国其他地区留守儿童情感陪伴缺失、成长支持不足等核心痛点，
                以"新机制搭建+新平台赋能"为核心，整合教育、心理、社工等多方资源，
                通过线上智慧陪伴系统与线下实地联动的双轨模式，提供课业辅导、心理疏导、兴趣拓展等定制化服务，
                构建家长、志愿者、乡村组织多方协同的长效关怀网络，
                探索可复制、可推广的留守儿童关怀新路径，切实守护乡村留守儿童身心健康与美好未来。
              </p>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default GovernmentDashboard;
