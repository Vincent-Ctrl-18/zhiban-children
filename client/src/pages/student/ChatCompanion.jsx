import { useState, useRef, useEffect } from 'react';
import { Card, Input, Button, Typography, Spin, Space, Tag, message } from 'antd';
import {
  HeartOutlined,
  SendOutlined,
  SmileOutlined,
  UserOutlined,
  HeartFilled,
  StarOutlined,
  CoffeeOutlined,
  ThunderboltOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { aiApi } from '../../services/api';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

function ChatCompanion() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [messages, setMessages] = useState([]); // 用于维护上下文
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // 初始欢迎消息
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setChatHistory([{
      role: 'assistant',
      content: `你好呀${user.realName ? '，' + user.realName : ''}！我是你的谈心伙伴小暖，很高兴见到你！\n\n有什么开心的事想分享，或者有什么烦恼想倾诉，都可以跟我说说哦。我会一直在这里陂着你。`,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    }]);
  }, []);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = {
      role: 'user',
      content: input.trim(),
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    };

    setChatHistory((prev) => [...prev, userMsg]);

    // 维护上下文消息（保留最近10条）
    const newMessages = [...messages, { role: 'user', content: input.trim() }];
    if (newMessages.length > 10) {
      newMessages.splice(0, newMessages.length - 10);
    }
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    scrollToBottom();

    try {
      const res = await aiApi.chat({
        messages: newMessages,
        mode: 'companion',
      });

      const reply = res.reply || '嗯嗯，我听到了。你还想和我说说什么呢？';

      const aiMsg = {
        role: 'assistant',
        content: reply,
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      };

      setChatHistory((prev) => [...prev, aiMsg]);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (error) {
      message.error('发送失败，请稍后重试');
      const errorMsg = {
        role: 'assistant',
        content: '网络出了点小问题，不过没关系，我一直在这里陂着你，等网络好了再聊吧～',
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      };
      setChatHistory((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickTopics = [
    { icon: <SmileOutlined />, text: '今天过得怎么样？', color: '#FF9F43' },
    { icon: <StarOutlined />, text: '我有一件开心的事想分享', color: '#1dd1a1' },
    { icon: <CoffeeOutlined />, text: '学习压力有点大', color: '#48dbfb' },
    { icon: <HeartOutlined />, text: '我想念爸爸妈妈了', color: '#ff6b6b' },
    { icon: <ThunderboltOutlined />, text: '和同学之间有矛盾', color: '#a55eea' },
  ];

  return (
    <div className="chat-companion-page">
      <div className="page-title-bar">
        <h2><HeartFilled style={{ color: '#ff6b6b' }} /> 谈心伙伴</h2>
        <p className="page-subtitle">有什么烦恼都可以和小暖说说，我会一直陂着你</p>
      </div>

      <Card
        className="chat-companion-card"
        bordered={false}
        bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column', height: '65vh' }}
      >
        {/* 消息列表 */}
        <div className="chat-messages" style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
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
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#ffe8e8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff6b6b' }}>
                    <HeartFilled />
                  </div>
                )}
              </div>
              <div className="chat-bubble">
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                <div className="chat-time">{msg.time}</div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="chat-msg chat-msg-ai">
              <div className="chat-avatar">
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#ffe8e8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff6b6b' }}>
                  <HeartFilled />
                </div>
              </div>
              <div className="chat-bubble">
                <Spin size="small" /> <Text type="secondary">小暖正在想...</Text>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* 快捷话题 */}
        {chatHistory.length <= 1 && (
          <div style={{ padding: '8px 20px', background: '#fffbf0', borderTop: '1px solid #f0f0f0' }}>
            <Text type="secondary" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>
              <BulbOutlined style={{ marginRight: 4 }} />试试这些话题：
            </Text>
            <Space wrap size={[6, 6]}>
              {quickTopics.map((topic, i) => (
                <Tag
                  key={i}
                  style={{ cursor: 'pointer', padding: '3px 10px', borderColor: topic.color, color: topic.color }}
                  onClick={() => setInput(topic.text)}
                >
                  {topic.icon} {topic.text}
                </Tag>
              ))}
            </Space>
          </div>
        )}

        {/* 输入区域 */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0f0', background: '#fafafa' }}>
          <Space.Compact style={{ width: '100%' }}>
            <TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="说说你的心里话..."
              autoSize={{ minRows: 1, maxRows: 3 }}
              style={{ flex: 1, resize: 'none' }}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={loading}
              style={{ height: 44, background: '#ff6b6b', borderColor: '#ff6b6b' }}
            >
              发送
            </Button>
          </Space.Compact>
        </div>
      </Card>

      {/* 温馨提示 */}
      <Card bordered={false} style={{ marginTop: 16, borderRadius: 16, background: '#fffbf0' }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          <BulbOutlined style={{ color: 'var(--primary-color)', marginRight: 4 }} />
          <strong>温馨提示：</strong>小暖是一个 AI 陂伴伙伴，可以帮你分享快乐、倾诉烦恼。
          如果你遇到严重的困扰，请及时告诉身边的老师或大人哦。
          全国24小时心理援助热线：<strong style={{ color: '#ff6b6b' }}>12355</strong>
        </Text>
      </Card>
    </div>
  );
}

export default ChatCompanion;
