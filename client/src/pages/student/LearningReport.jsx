import { useEffect, useState } from 'react';
import { Card, Row, Col, Button, Form, Input, Select, Typography, Tag, Spin, Divider, Rate, Space, Empty, message, Checkbox, Progress, Alert } from 'antd';
import useSessionDraft from '../../hooks/useSessionDraft';
import {
  FileTextOutlined,
  TrophyOutlined,
  RocketOutlined,
  BulbOutlined,
  StarFilled,
  SmileOutlined,
  BookOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { aiApi } from '../../services/api';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;

function LearningReport() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [reportHistory, setReportHistory] = useState([]);
  const [form] = Form.useForm();
  const [draft, setDraft] = useSessionDraft('report-form');
  const [reportId, setReportId] = useState('');
  const [checkedDraft, setCheckedDraft] = useSessionDraft('report-checklist:' + reportId, '[]');
  let checked = [];
  try { checked = JSON.parse(checkedDraft); if (!Array.isArray(checked)) checked = []; } catch {}
  const [errorMessage, setErrorMessage] = useState('');
  const textOf = item => typeof item === 'string' ? item : item?.text || JSON.stringify(item);
  const listOf = value => Array.isArray(value) ? value : [];
  const reportText = report ? [report.summary, ...listOf(report.evidence).map(textOf), ...listOf(report.observations).map(textOf), '本周行动', ...listOf(report.actions).map((item, index) => `${checked.includes(index) ? '☑' : '☐'} ${textOf(item)}`), report.nextCheck, report.limitations].filter(Boolean).join('\n\n') : '';
  const downloadReport = () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + reportText], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = '我的学习报告.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  useEffect(() => {
    try { if (draft) form.setFieldsValue(JSON.parse(draft)); } catch {}
    aiApi.learningReportHistory(5).then(items => {
      setReportHistory(items);
      if (items[0]) { setReport(items[0].report); setReportId(String(items[0].id)); }
    }).catch(() => {});
  }, []);

  const handleGenerate = async (values) => {
    if (loading) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await aiApi.learningReportGenerate({
        grade: values.grade,
        subjects: values.subjects,
        strengths: values.strengths,
        weaknesses: values.weaknesses,
        studyHours: values.studyHours,
        goals: values.goals,
      });
      setReport(res.report || { summary: '暂时无法生成报告，请稍后重试。' });
      setReportId(String(res.id));
      setReportHistory((previous) => [{ id: res.id, periodStart: res.evidence?.period?.start, periodEnd: res.evidence?.period?.end, report: res.report, createdAt: new Date().toISOString() }, ...previous].slice(0, 5));
    } catch (error) {
      setErrorMessage(error.message || '暂时无法生成，已保留填写内容，请稍后重试');
      message.error('生成报告失败：' + (error.message || '请稍后重试'));
    } finally {
      setLoading(false);
    }
  };

  const gradeOptions = [
    '一年级', '二年级', '三年级', '四年级', '五年级', '六年级',
    '初一', '初二', '初三',
  ];

  const subjectOptions = [
    '语文', '数学', '英语', '科学', '历史', '地理', '生物', '物理', '化学', '道德与法治',
  ];

  return (
    <div className="learning-report-page">
      <div className="page-title-bar">
        <h2><FileTextOutlined style={{ color: '#1dd1a1' }} /> 个性化学习报告</h2>
        <p className="page-subtitle">填写你的学习情况，AI 为你生成专属学习分析和建议</p>
      </div>

      {errorMessage && <Alert type="error" showIcon message={errorMessage} description="填写内容和上一次报告已保留，可再次点击生成。" style={{ marginBottom: 16 }} />}
      <Row gutter={[20, 20]}>
        {/* 左侧：信息填写 */}
        <Col xs={24} md={10}>
          <Card
            title={<span><BookOutlined style={{ color: 'var(--primary-color)', marginRight: 8 }} />填写学习信息</span>}
            bordered={false}
            style={{ borderRadius: 16 }}
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleGenerate}
              onValuesChange={(_, values) => setDraft(JSON.stringify(values))}
            >
              <Form.Item
                name="grade"
                label="你的年级"
                rules={[{ required: true, message: '请选择年级' }]}
              >
                <Select placeholder="选择你的年级">
                  {gradeOptions.map((g) => (
                    <Option key={g} value={g}>{g}</Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="subjects"
                label="主要学习科目"
                rules={[{ required: true, message: '请选择学习科目' }]}
              >
                <Select mode="multiple" placeholder="选择你正在学习的科目" maxTagCount={3}>
                  {subjectOptions.map((s) => (
                    <Option key={s} value={s}>{s}</Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="strengths"
                label="擅长科目/领域"
              >
                <TextArea rows={2} placeholder="例如：数学计算比较好，语文阅读理解不错" />
              </Form.Item>

              <Form.Item
                name="weaknesses"
                label="需要提升的地方"
              >
                <TextArea rows={2} placeholder="例如：英语单词记不住，数学应用题不太会" />
              </Form.Item>

              <Form.Item
                name="studyHours"
                label="每天学习时间（小时）"
              >
                <Select placeholder="选择每天学习时间">
                  <Option value="1">1小时以下</Option>
                  <Option value="2">1-2小时</Option>
                  <Option value="3">2-3小时</Option>
                  <Option value="4">3小时以上</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="goals"
                label="你的学习目标"
              >
                <TextArea rows={2} placeholder="例如：下次考试提高10分，把英语学好" />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  size="large"
                  icon={<RocketOutlined />}
                  style={{ background: '#1dd1a1', borderColor: '#1dd1a1', height: 48 }}
                >
                  {loading ? '正在生成报告...' : '生成学习报告'}
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        {/* 右侧：报告展示 */}
        <Col xs={24} md={14}>
          <Card
            title={<span><BarChartOutlined style={{ color: '#1dd1a1', marginRight: 8 }} />学习分析报告</span>}
            bordered={false}
            style={{ borderRadius: 16, minHeight: 500 }}
            extra={report && (
              <Tag color="green">
                <StarFilled /> 已生成
              </Tag>
            )}
          >
            {loading ? (
              <div style={{ textAlign: 'center', padding: '80px 0' }}>
                <Spin size="large" />
                <Paragraph style={{ marginTop: 16, color: 'var(--text-secondary)' }}>
                  AI 正在分析你的学习情况，请稍等...
                </Paragraph>
              </div>
            ) : report ? (
              <div className="report-content" style={{ lineHeight: 1.8 }}>
                <Space wrap style={{ marginBottom: 16 }}><Paragraph style={{ margin: 0 }} copyable={{ text: reportText }}>复制整份报告</Paragraph><Button size="small" onClick={downloadReport}>下载报告</Button></Space>
                <Typography.Title level={4}>{report.summary || '学习情况总结'}</Typography.Title>
                {Array.isArray(report.evidence) && report.evidence.length > 0 && <><Typography.Title level={5}>本周证据</Typography.Title><ul>{report.evidence.map((item, index) => <li key={index}>{typeof item === 'string' ? item : item.text || item.source || JSON.stringify(item)}</li>)}</ul></>}
                {Array.isArray(report.observations) && report.observations.length > 0 && <><Typography.Title level={5}>观察与建议</Typography.Title><ul>{report.observations.map((item, index) => <li key={index}>{typeof item === 'string' ? item : item.text || JSON.stringify(item)}</li>)}</ul></>}
                {Array.isArray(report.actions) && report.actions.length > 0 && <><Typography.Title level={5}>本周行动</Typography.Title><Progress percent={Math.round(checked.filter(index => index < report.actions.length).length / report.actions.length * 100)} size="small" />
                  <Space direction="vertical">{report.actions.map((item, index) => <Checkbox key={index} checked={checked.includes(index)} onChange={e => setCheckedDraft(JSON.stringify(e.target.checked ? [...new Set([...checked, index])] : checked.filter(i => i !== index)))}><span style={{ textDecoration: checked.includes(index) ? 'line-through' : 'none' }}>{textOf(item)}</span></Checkbox>)}</Space>
                  <Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>完成一项就勾选一项，进度在当前浏览器标签页保留。</Paragraph></>}
                {report.nextCheck && <Paragraph><strong>下次检查：</strong>{report.nextCheck}</Paragraph>}
                {report.limitations && <Paragraph type="secondary">{report.limitations}</Paragraph>}
              </div>
            ) : (
              <Empty
                image={<SmileOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />}
                description={
                  <Space direction="vertical">
                    <Text type="secondary">填写左侧信息后，点击生成学习报告</Text>
                    <Text type="secondary">AI会根据你的情况，给出个性化的学习建议哦</Text>
                  </Space>
                }
              />
            )}
          </Card>
        </Col>
      </Row>
      {reportHistory.length > 0 && <Card bordered={false} style={{ marginTop: 20, borderRadius: 16 }} title="最近生成的报告"><Space wrap>{reportHistory.map((item) => <Tag key={item.id} color="green" style={{ cursor: 'pointer' }} onClick={() => { setReport(item.report); setReportId(String(item.id)); }}>{item.periodEnd || '最近一次'}</Tag>)}</Space></Card>}
    </div>
  );
}

export default LearningReport;
