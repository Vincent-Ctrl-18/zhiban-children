import { useState } from 'react';
import { Card, Form, Input, Select, Button, message, Result } from 'antd';
import { GiftOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { resourcesApi } from '../../services/api';

const { Option } = Select;
const { TextArea } = Input;

const orgTypes = [
  { value: 'university', label: '高校' },
  { value: 'enterprise', label: '企业' },
  { value: 'ngo', label: '公益组织' },
  { value: 'individual', label: '个人志愿者' },
  { value: 'other', label: '其他' },
];

const resourceTypes = [
  { value: 'course', label: '课程资源（如：支教、在线课程）' },
  { value: 'material', label: '物资支持（如：学习用品、生活用品）' },
  { value: 'volunteer', label: '志愿服务（如：心理辅导、陪伴）' },
  { value: 'fund', label: '资金捐赠' },
  { value: 'other', label: '其他资源' },
];

function ResourceRegister() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form] = Form.useForm();

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      await resourcesApi.create(values);
      message.success('资源登记提交成功');
      setSubmitted(true);
    } catch (error) {
      message.error(error.message || '提交失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Card>
        <Result
          status="success"
          title="资源登记提交成功！"
          subTitle="感谢您的爱心支持，我们将尽快审核您的资源信息，审核通过后将在资源中心展示。"
          extra={[
            <Button type="primary" key="back" onClick={() => setSubmitted(false)}>
              继续登记
            </Button>,
          ]}
        />
      </Card>
    );
  }

  return (
    <div className="form-page">
      <div className="page-header">
        <h2>
          <GiftOutlined style={{ marginRight: 8 }} />
          资源登记
        </h2>
        <p style={{ color: '#666', marginTop: 8 }}>
          感谢您愿意为留守儿童提供帮助！请填写以下信息，我们会尽快与您联系。
        </p>
      </div>

      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          style={{ maxWidth: 600 }}
        >
          <Form.Item
            name="orgType"
            label="您的身份"
            rules={[{ required: true, message: '请选择您的身份' }]}
          >
            <Select placeholder="请选择您的身份类型">
              {orgTypes.map(type => (
                <Option key={type.value} value={type.value}>{type.label}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="orgName"
            label="机构/组织名称"
            rules={[{ required: true, message: '请输入机构或组织名称' }]}
          >
            <Input placeholder="如：西南大学青年志愿者协会" />
          </Form.Item>

          <Form.Item
            name="resourceType"
            label="资源类型"
            rules={[{ required: true, message: '请选择资源类型' }]}
          >
            <Select placeholder="请选择您能提供的资源类型">
              {resourceTypes.map(type => (
                <Option key={type.value} value={type.value}>{type.label}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="resourceTitle"
            label="资源标题"
            rules={[{ required: true, message: '请输入资源标题' }]}
          >
            <Input placeholder="如：周末支教志愿者、学习用品捐赠" />
          </Form.Item>

          <Form.Item
            name="resourceDescription"
            label="详细描述"
          >
            <TextArea 
              rows={4} 
              placeholder="请详细描述您能提供的资源，包括数量、时间、地点等信息"
            />
          </Form.Item>

          <Form.Item
            name="contactName"
            label="联系人"
            rules={[{ required: true, message: '请输入联系人姓名' }]}
          >
            <Input placeholder="请输入联系人姓名" />
          </Form.Item>

          <Form.Item
            name="contactPhone"
            label="联系电话"
            rules={[
              { required: true, message: '请输入联系电话' },
              { pattern: /^1\d{10}$/, message: '请输入正确的手机号' },
            ]}
          >
            <Input placeholder="请输入联系电话" />
          </Form.Item>

          <Form.Item
            name="contactEmail"
            label="电子邮箱"
          >
            <Input placeholder="请输入电子邮箱（选填）" />
          </Form.Item>

          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={loading}
              size="large"
              style={{ width: '100%' }}
            >
              提交登记
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

export default ResourceRegister;
