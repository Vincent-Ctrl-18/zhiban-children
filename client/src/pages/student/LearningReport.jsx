import { useState } from 'react';
import { Card, Row, Col, Button, Form, Input, Select, Typography, Tag, Spin, Divider, Rate, Space, Empty, message } from 'antd';
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
  const [form] = Form.useForm();

  const handleGenerate = async (values) => {
    setLoading(true);
    try {
      const res = await aiApi.learningReport({
        grade: values.grade,
        subjects: values.subjects,
        strengths: values.strengths,
        weaknesses: values.weaknesses,
        studyHours: values.studyHours,
        goals: values.goals,
      });
      setReport(res.reply || '暂时无法生成报告，请稍后重试。');
    } catch (error) {
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
              <div className="report-content" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
                {report}
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
    </div>
  );
}

export default LearningReport;
