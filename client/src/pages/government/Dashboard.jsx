import { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, message, Spin } from 'antd';
import {
  TeamOutlined,
  CalendarOutlined,
  HeartOutlined,
  GiftOutlined,
  HomeOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { statisticsApi } from '../../services/api';

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
      // 使用模拟数据
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

  // 活动趋势图配置
  const trendOption = {
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      data: ['活动数', '参与人次'],
    },
    xAxis: {
      type: 'category',
      data: activityTrend.map(item => item.month),
    },
    yAxis: [
      { type: 'value', name: '活动数' },
      { type: 'value', name: '参与人次' },
    ],
    series: [
      {
        name: '活动数',
        type: 'bar',
        data: activityTrend.map(item => item.count),
        itemStyle: { color: '#FF9F43' },
      },
      {
        name: '参与人次',
        type: 'line',
        yAxisIndex: 1,
        data: activityTrend.map(item => item.participants),
        itemStyle: { color: '#1890ff' },
      },
    ],
  };

  // 活动类型饼图配置
  const activityTypesOption = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
    },
    legend: {
      bottom: 0,
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        data: activityTypes.map(item => ({
          name: { course: '课程', entertainment: '娱乐', outdoor: '户外', other: '其他' }[item.type] || item.type,
          value: item.count,
        })),
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      },
    ],
  };

  // 资源类型饼图配置
  const resourceTypesOption = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
    },
    legend: {
      bottom: 0,
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
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
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
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
    <div>
      <h2 style={{ marginBottom: 24 }}>影响力数据看板</h2>

      {/* 核心指标 */}
      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <div className="stat-icon" style={{ background: '#fff7e6' }}>
              <TeamOutlined style={{ color: '#fa8c16' }} />
            </div>
            <div style={{ flex: 1 }}>
              <Statistic
                title="已服务儿童数"
                value={stats.totalChildren}
                suffix="人"
              />
              <div style={{ marginTop: 4, color: '#52c41a', fontSize: 12 }}>
                <RiseOutlined /> 本月新增 {stats.monthlyChildren} 人
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <div className="stat-icon" style={{ background: '#e6f7ff' }}>
              <CalendarOutlined style={{ color: '#1890ff' }} />
            </div>
            <div style={{ flex: 1 }}>
              <Statistic
                title="已开展活动数"
                value={stats.totalActivities}
                suffix="次"
              />
              <div style={{ marginTop: 4, color: '#52c41a', fontSize: 12 }}>
                <RiseOutlined /> 本月新增 {stats.monthlyActivities} 次
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <div className="stat-icon" style={{ background: '#fff0f6' }}>
              <HeartOutlined style={{ color: '#eb2f96' }} />
            </div>
            <Statistic
              title="志愿者参与"
              value={stats.totalVolunteers}
              suffix="人次"
              style={{ flex: 1 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <div className="stat-icon" style={{ background: '#f6ffed' }}>
              <GiftOutlined style={{ color: '#52c41a' }} />
            </div>
            <Statistic
              title="合作资源数"
              value={stats.totalResources}
              suffix="项"
              style={{ flex: 1 }}
            />
          </Card>
        </Col>
      </Row>

      {/* 托管机构数 */}
      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={8}>
          <Card>
            <Statistic
              title="托管机构数"
              value={stats.totalInstitutions}
              prefix={<HomeOutlined style={{ color: '#722ed1' }} />}
              suffix="家"
            />
          </Card>
        </Col>
      </Row>

      {/* 图表区域 */}
      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={16}>
          <Card title="活动开展趋势（近6个月）">
            <ReactECharts option={trendOption} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="活动类型分布">
            <ReactECharts option={activityTypesOption} style={{ height: 300 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={8}>
          <Card title="资源类型分布">
            <ReactECharts option={resourceTypesOption} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card title="项目介绍">
            <div style={{ lineHeight: 2, color: '#666' }}>
              <p>
                <strong>"智伴乡童，暖护童心"</strong>——以西南为重点辐射全国留守儿童身心健康成长赋能计划
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
