import { useState, useRef } from 'react';
import { Card, Input, Button, Upload, Typography, Space, Tag, Spin, message, Image, Divider } from 'antd';
import {
  CameraOutlined,
  SendOutlined,
  BookOutlined,
  BulbOutlined,
  DeleteOutlined,
  RobotOutlined,
  UserOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import { aiApi } from '../../services/api';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

function HomeworkHelp() {
  const [question, setQuestion] = useState('');
  const [imageUrl, setImageUrl] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const chatEndRef = useRef(null);

  // 滚动到底部
  const scrollToBottom = () => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // 处理图片上传（转为base64）
  const handleImageUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageUrl(e.target.result);
      // 提取base64（去掉data:image/xxx;base64,前缀）
      const base64 = e.target.result.split(',')[1];
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
    return false; // 阻止默认上传
  };

  // 清除图片
  const clearImage = () => {
    setImageUrl(null);
    setImageBase64(null);
  };

  // 发送问题
  const handleSend = async () => {
    if (!question.trim() && !imageBase64) {
      message.warning('请输入问题或上传题目图片');
      return;
    }

    const userMsg = {
      role: 'user',
      content: question || '请帮我分析这道题',
      image: imageUrl,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    };

    setChatHistory((prev) => [...prev, userMsg]);
    setQuestion('');
    setLoading(true);
    scrollToBottom();

    try {
      const res = await aiApi.homeworkHelp({
        question: question || '请帮我看看这道题怎么做，给出详细的解题思路',
        image: imageBase64,
      });

      const aiMsg = {
        role: 'assistant',
        content: res.reply || '抱歉，我暂时无法回答这个问题，请稍后再试。',
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      };

      setChatHistory((prev) => [...prev, aiMsg]);
      clearImage();
    } catch (error) {
      message.error('请求失败：' + (error.message || '请稍后重试'));
      const errorMsg = {
        role: 'assistant',
        content: '网络出了点小问题，请稍后再试试哦～',
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      };
      setChatHistory((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  // 回车发送
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 快捷问题
  const quickQuestions = [
    '这道数学题怎么解？',
    '帮我理解这篇课文的中心思想',
    '这个英语语法怎么用？',
    '教我这个公式怎么推导',
  ];

  return (
    <div className="homework-help-page">
      {/* 页面标题 */}
      <div className="page-title-bar">
        <h2><BookOutlined /> 智能作业辅导</h2>
        <p className="page-subtitle">拍照上传或输入题目，AI 帮你分析解题思路</p>
      </div>

      {/* 聊天区域 */}
      <Card
        className="homework-chat-card"
        bordered={false}
        bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column', height: '60vh' }}
      >
        {/* 消息列表 */}
        <div className="chat-messages" style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {chatHistory.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <RobotOutlined style={{ fontSize: 48, color: 'var(--primary-color)', marginBottom: 16 }} />
              <Title level={4} style={{ color: 'var(--text-secondary)' }}>Hi！我是你的作业小助手</Title>
              <Paragraph type="secondary">
                你可以拍照上传题目，或者直接输入问题，我会帮你分析解题思路。
                <br />注意：我会引导你思考，而不是直接给答案哦～
              </Paragraph>
              <Divider>试试这些问题</Divider>
              <Space wrap>
                {quickQuestions.map((q, i) => (
                  <Tag
                    key={i}
                    color="orange"
                    style={{ cursor: 'pointer', padding: '4px 12px', fontSize: 13 }}
                    onClick={() => {
                      setQuestion(q);
                    }}
                  >
                    <BulbOutlined /> {q}
                  </Tag>
                ))}
              </Space>
            </div>
          )}

          {chatHistory.map((msg, idx) => (
            <div
              key={idx}
              className={`chat-msg ${msg.role === 'user' ? 'chat-msg-user' : 'chat-msg-ai'}`}
            >
              <div className="chat-avatar">
                {msg.role === 'user' ? (
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#FF9F43', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                    <UserOutlined />
                  </div>
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e3f9f3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1dd1a1' }}>
                    <RobotOutlined />
                  </div>
                )}
              </div>
              <div className="chat-bubble">
                {msg.image && (
                  <Image
                    src={msg.image}
                    style={{ maxWidth: 200, borderRadius: 8, marginBottom: 8 }}
                    alt="题目图片"
                  />
                )}
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                <div className="chat-time">{msg.time}</div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="chat-msg chat-msg-ai">
              <div className="chat-avatar">
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e3f9f3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1dd1a1' }}>
                  <RobotOutlined />
                </div>
              </div>
              <div className="chat-bubble">
                <Spin size="small" /> <Text type="secondary">正在思考中...</Text>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* 图片预览 */}
        {imageUrl && (
          <div style={{ padding: '8px 20px', background: '#fafafa', borderTop: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Image src={imageUrl} height={60} style={{ borderRadius: 6 }} alt="待分析图片" />
            <Button type="text" danger icon={<DeleteOutlined />} onClick={clearImage} size="small">
              移除
            </Button>
          </div>
        )}

        {/* 输入区域 */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0f0', background: '#fafafa' }}>
          <Space.Compact style={{ width: '100%' }}>
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={handleImageUpload}
            >
              <Button icon={<CameraOutlined />} style={{ height: 44 }} title="拍照/上传图片">
                <PictureOutlined />
              </Button>
            </Upload>
            <TextArea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="输入你的问题，或拍照上传题目..."
              autoSize={{ minRows: 1, maxRows: 3 }}
              style={{ flex: 1, resize: 'none' }}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={loading}
              style={{ height: 44, background: '#FF9F43', borderColor: '#FF9F43' }}
            >
              发送
            </Button>
          </Space.Compact>
        </div>
      </Card>
    </div>
  );
}

export default HomeworkHelp;
