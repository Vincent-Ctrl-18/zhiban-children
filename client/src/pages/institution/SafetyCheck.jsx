import { useState, useEffect } from 'react';
import { 
  Card, Switch, Button, Input, message, Alert, 
  Row, Col, Tag, Divider 
} from 'antd';
import { 
  CheckCircleOutlined, 
  CloseCircleOutlined,
  SafetyOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { safetyApi } from '../../services/api';

const safetyItems = [
  { key: 'venueClean', label: '场地是否整洁无杂物', icon: '🧹' },
  { key: 'furnitureSafe', label: '桌椅设施是否安全', icon: '🪑' },
  { key: 'electricalNormal', label: '插座电线是否正常', icon: '🔌' },
  { key: 'fireExitClear', label: '消防通道是否畅通', icon: '🚪' },
  { key: 'extinguisherReady', label: '灭火器是否在位', icon: '🧯' },
  { key: 'waterHygieneOk', label: '饮水与卫生是否合格', icon: '💧' },
  { key: 'attendanceDone', label: '儿童签到是否完成', icon: '✅' },
  { key: 'pickupVerified', label: '接送人是否核实登记', icon: '👤' },
  { key: 'firstaidComplete', label: '急救包是否齐全', icon: '🩹' },
];

function SafetyCheck() {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alreadyChecked, setAlreadyChecked] = useState(false);
  const [formData, setFormData] = useState({
    venueClean: false,
    furnitureSafe: false,
    electricalNormal: false,
    fireExitClear: false,
    extinguisherReady: false,
    waterHygieneOk: false,
    attendanceDone: false,
    pickupVerified: false,
    firstaidComplete: false,
    hasIncident: false,
    incidentNotes: '',
  });

  useEffect(() => {
    fetchTodayStatus();
  }, []);

  const fetchTodayStatus = async () => {
    setLoading(true);
    try {
      const response = await safetyApi.getToday();
      if (response.checked && response.data) {
        setAlreadyChecked(true);
        const data = response.data;
        setFormData({
          venueClean: data.venue_clean,
          furnitureSafe: data.furniture_safe,
          electricalNormal: data.electrical_normal,
          fireExitClear: data.fire_exit_clear,
          extinguisherReady: data.extinguisher_ready,
          waterHygieneOk: data.water_hygiene_ok,
          attendanceDone: data.attendance_done,
          pickupVerified: data.pickup_verified,
          firstaidComplete: data.firstaid_complete,
          hasIncident: data.has_incident,
          incidentNotes: data.incident_notes || '',
        });
      }
    } catch (error) {
      message.error('获取检查状态失败');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (key, checked) => {
    setFormData(prev => ({
      ...prev,
      [key]: checked,
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await safetyApi.submit(formData);
      message.success('安全检查提交成功');
      setAlreadyChecked(true);
    } catch (error) {
      message.error('提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 计算完成进度
  const checkedCount = safetyItems.filter(item => formData[item.key]).length;
  const totalCount = safetyItems.length;
  const isAllChecked = checkedCount === totalCount && !formData.hasIncident;

  return (
    <div className="form-page">
      <div className="page-header">
        <h2>
          <SafetyOutlined style={{ marginRight: 8 }} />
          每日安全检查打卡
        </h2>
      </div>

      {alreadyChecked && (
        <Alert
          message="今日安全检查已完成"
          description="您可以修改检查结果并重新提交"
          type="success"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {/* 进度显示 */}
      <Card style={{ marginBottom: 24 }}>
        <Row align="middle" justify="space-between">
          <Col>
            <span style={{ fontSize: 16 }}>检查进度：</span>
            <Tag color={isAllChecked ? 'success' : 'processing'} style={{ fontSize: 14 }}>
              {checkedCount} / {totalCount} 项
            </Tag>
          </Col>
          <Col>
            {isAllChecked ? (
              <Tag color="success" icon={<CheckCircleOutlined />}>
                全部通过
              </Tag>
            ) : (
              <Tag color="warning" icon={<ExclamationCircleOutlined />}>
                有未完成项
              </Tag>
            )}
          </Col>
        </Row>
      </Card>

      {/* 检查项列表 */}
      <Card title="安全检查项目" style={{ marginBottom: 24 }}>
        {safetyItems.map((item, index) => (
          <div key={item.key}>
            <div className="safety-check-item">
              <span style={{ fontSize: 20, marginRight: 12 }}>{item.icon}</span>
              <span className="check-label">{item.label}</span>
              <Switch
                checked={formData[item.key]}
                onChange={(checked) => handleToggle(item.key, checked)}
                checkedChildren={<CheckCircleOutlined />}
                unCheckedChildren={<CloseCircleOutlined />}
              />
            </div>
            {index < safetyItems.length - 1 && <Divider style={{ margin: '0' }} />}
          </div>
        ))}
      </Card>

      {/* 异常事件 */}
      <Card 
        title={
          <span>
            <ExclamationCircleOutlined style={{ marginRight: 8, color: '#fa8c16' }} />
            异常事件记录
          </span>
        }
        style={{ marginBottom: 24 }}
      >
        <div style={{ marginBottom: 16 }}>
          <span style={{ marginRight: 16 }}>今日是否发生异常事件：</span>
          <Switch
            checked={formData.hasIncident}
            onChange={(checked) => handleToggle('hasIncident', checked)}
            checkedChildren="是"
            unCheckedChildren="否"
          />
        </div>
        
        {formData.hasIncident && (
          <Input.TextArea
            rows={4}
            placeholder="请详细描述异常事件情况..."
            value={formData.incidentNotes}
            onChange={(e) => setFormData(prev => ({
              ...prev,
              incidentNotes: e.target.value,
            }))}
          />
        )}
      </Card>

      {/* 提交按钮 */}
      <div style={{ textAlign: 'center' }}>
        <Button 
          type="primary" 
          size="large"
          loading={submitting}
          onClick={handleSubmit}
          style={{ width: 200, height: 48 }}
        >
          {alreadyChecked ? '更新检查结果' : '提交安全检查'}
        </Button>
      </div>
    </div>
  );
}

export default SafetyCheck;
