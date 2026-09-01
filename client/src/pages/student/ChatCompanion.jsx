import { useState, useRef, useEffect } from 'react';
import { Alert, Card, Input, Button, Typography, Spin, Space, Tag, Drawer, Empty, List, message } from 'antd';
import { HeartOutlined, SendOutlined, SmileOutlined, UserOutlined, HeartFilled, StarOutlined, CoffeeOutlined, ThunderboltOutlined, BulbOutlined, PhoneOutlined } from '@ant-design/icons';
import { aiApi } from '../../services/api';
import { useSearchParams } from 'react-router-dom';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;
const timeLabel = (value) => new Date(value || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

function ChatCompanion() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSessionId = searchParams.get('sessionId');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [session, setSession] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [privateSessions, setPrivateSessions] = useState([]);
  const chatEndRef = useRef(null);
  const skipRecentRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!requestedSessionId && skipRecentRef.current) {
      skipRecentRef.current = false;
      setInitializing(false);
      return () => { cancelled = true; };
    }
    (async () => {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      try {
        const data = requestedSessionId ? await aiApi.chatSession(requestedSessionId) : await aiApi.chatRecentSession();
        if (cancelled) return;
        if (data) {
          setSession(data.session);
          setChatHistory((data.messages || []).map((item) => ({ ...item, time: timeLabel(item.createdAt) })));
          const pending = (data.messages || []).some((item) => item.requestStatus === 'pending');
          if (pending) {
            setLoading(true);
            const pollStarted = Date.now();
            const poll = async () => {
              if (cancelled) return;
              try {
                const latest = await aiApi.chatSession(data.session.id);
                const stillPending = (latest.messages || []).some((item) => item.requestStatus === 'pending');
                setSession(latest.session);
                setChatHistory((latest.messages || []).map((item) => ({ ...item, time: timeLabel(item.createdAt) })));
                if (!stillPending || Date.now() - pollStarted > 60_000) { setLoading(false); return; }
                window.setTimeout(poll, 2000);
              } catch { setLoading(false); }
            };
            window.setTimeout(poll, 1200);
          }
        } else {
          setChatHistory([{ role: 'assistant', content: `你好呀${user.realName ? `，${user.realName}` : ''}！我是谈心伙伴小暖。开心或烦恼都可以和我说说，我们一起想下一步。`, time: timeLabel() }]);
        }
      } catch {
        setChatHistory([{ role: 'assistant', content: '你好呀！我是谈心伙伴小暖。网络恢复后，我们可以继续聊。', time: timeLabel() }]);
      } finally { if (!cancelled) setInitializing(false); }
    })();
    return () => { cancelled = true; };
  }, [requestedSessionId]);

  useEffect(() => { setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); }, [chatHistory.length, loading]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || loading || initializing || session?.status === 'completed') return;
    const optimistic = { role: 'user', content, time: timeLabel(), pending: true };
    setChatHistory((prev) => [...prev, optimistic]);
    setInput(''); setLoading(true);
    try {
      const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const result = session
        ? await aiApi.chatSendMessage(session.id, { content, requestId })
        : await aiApi.chatCreateSession({ content, requestId });
      setSession(result.session);
      setChatHistory((prev) => [
        ...prev.filter((item) => !item.pending),
        { ...result.userMessage, time: timeLabel(result.userMessage.createdAt) },
        { ...result.assistantMessage, risk: result.risk, time: timeLabel(result.assistantMessage.createdAt) },
      ]);
    } catch (error) {
      setChatHistory((prev) => prev.filter((item) => !item.pending));
      setInput(content);
      if (error.data?.severity === 'high' || error.data?.severity === 'critical') message.warning('请优先联系身边可信任的大人');
      else message.error(error.message || '发送失败，请稍后重试');
    } finally { setLoading(false); }
  };

  const handleComplete = async () => {
    if (!session || loading) return;
    try { const result = await aiApi.chatComplete(session.id); setSession(result.session); message.success('这次谈心已结束，随时可以开始新的对话'); }
    catch (error) { message.error(error.message || '暂时无法结束对话'); }
  };

  const startNewConversation = () => {
    skipRecentRef.current = true;
    setSearchParams({});
    setSession(null);
    setInput('');
    setChatHistory([{ role: 'assistant', content: '我们可以从一件新的小事开始聊。你现在最想说什么？', time: timeLabel() }]);
  };

  const openPrivateHistory = async () => {
    try {
      const result = await aiApi.chatSessions({ page: 1, pageSize: 40 });
      setPrivateSessions(result.items || result || []);
      setHistoryOpen(true);
    } catch (error) { message.error(error.message || '谈心历史暂不可用'); }
  };

  const openPrivateSession = async (item) => {
    try {
      const detail = await aiApi.chatSession(item.id);
      setSession(detail.session);
      setChatHistory((detail.messages || []).map((entry) => ({ ...entry, time: timeLabel(entry.createdAt) })));
      setSearchParams({ sessionId: item.id });
      setHistoryOpen(false);
    } catch (error) { message.error(error.message || '无法打开谈心记录'); }
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
        <Space direction="vertical" align="end" size={4}><Button type="text" onClick={openPrivateHistory}>历史谈心</Button><p className="page-subtitle">可以分享心情，也可以一起想想下一步怎么做</p></Space>
      </div>
      {session?.status === 'completed' && <Alert type="success" showIcon message="这次谈心已结束" description={<Space>你可以回到历史记录查看，也可以开始一段新的对话。<Button size="small" onClick={startNewConversation}>开始新对话</Button></Space>} style={{ marginBottom: 16 }} />}
      <Card className="chat-companion-card" bordered={false} bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column', height: '65vh' }}>
        <div className="chat-messages" style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {initializing && <div style={{ textAlign: 'center', padding: 48 }}><Spin tip="正在恢复最近的谈心…" /></div>}
          {chatHistory.map((msg, idx) => (
            <div key={`${msg.id || 'local'}-${idx}`} className={`chat-msg ${msg.role === 'user' ? 'chat-msg-user' : 'chat-msg-ai'}`}>
              <div className="chat-avatar">{msg.role === 'user' ? <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#FF9F43', display: 'grid', placeItems: 'center', color: '#fff' }}><UserOutlined /></div> : <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#ffe8e8', display: 'grid', placeItems: 'center', color: '#ff6b6b' }}><HeartFilled /></div>}</div>
              <div className="chat-bubble">
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                {msg.risk?.severity && msg.risk.severity !== 'low' && <Tag color="volcano" style={{ marginTop: 8 }}><PhoneOutlined /> 建议联系可信任的大人</Tag>}
                <div className="chat-time">{msg.time}</div>
              </div>
            </div>
          ))}
          {loading && <div className="chat-msg chat-msg-ai"><div className="chat-avatar"><div style={{ width: 36, height: 36, borderRadius: '50%', background: '#ffe8e8', display: 'grid', placeItems: 'center', color: '#ff6b6b' }}><HeartFilled /></div></div><div className="chat-bubble"><Spin size="small" /> <Text type="secondary">正在认真听你说…</Text></div></div>}
          <div ref={chatEndRef} />
        </div>
        {!initializing && chatHistory.length <= 1 && <div style={{ padding: '8px 20px', background: '#fffbf0', borderTop: '1px solid #f0f0f0' }}><Text type="secondary" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}><BulbOutlined style={{ marginRight: 4 }} />试试这些话题：</Text><Space wrap size={[6, 6]}>{quickTopics.map((topic) => <Tag key={topic.text} style={{ cursor: 'pointer', padding: '3px 10px', borderColor: topic.color, color: topic.color }} onClick={() => setInput(topic.text)}>{topic.icon} {topic.text}</Tag>)}</Space></div>}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0f0', background: '#fafafa' }}><Space.Compact style={{ width: '100%' }}><TextArea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder="说说你的心里话…" autoSize={{ minRows: 1, maxRows: 3 }} style={{ flex: 1, resize: 'none' }} disabled={loading || initializing || session?.status === 'completed'} /><Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={loading} disabled={initializing || session?.status === 'completed'} style={{ height: 44, background: '#ff6b6b', borderColor: '#ff6b6b' }}>发送</Button></Space.Compact></div>
      </Card>
      {session?.status === 'active' && chatHistory.length > 1 && <Button type="link" onClick={handleComplete} style={{ marginTop: 8 }}>结束这次谈心</Button>}
      <Card bordered={false} style={{ marginTop: 16, borderRadius: 16, background: '#fffbf0' }}><Paragraph style={{ margin: 0, fontSize: 13, color: '#6b7280' }}><BulbOutlined style={{ color: 'var(--primary-color)', marginRight: 4 }} /><strong>温馨提示：</strong>小暖可以陪你梳理心情，但不能代替老师、家长或专业人员。遇到危险请立即联系身边的大人、拨打 110/120；青少年服务 <strong style={{ color: '#ff6b6b' }}>12355</strong>，心理援助 <strong style={{ color: '#ff6b6b' }}>12356</strong>。</Paragraph></Card>
      <Drawer title="历史谈心" open={historyOpen} onClose={() => setHistoryOpen(false)} placement="right" width={360}>
        {privateSessions.length ? <List dataSource={privateSessions} renderItem={(item) => <List.Item onClick={() => openPrivateSession(item)} style={{ cursor: 'pointer' }}><List.Item.Meta title="谈心记录" description={`${item.status === 'completed' ? '已结束' : '进行中'} · ${new Date(item.lastActiveAt).toLocaleString('zh-CN')}`} /></List.Item>} /> : <Empty description="还没有谈心记录" />}
      </Drawer>
    </div>
  );
}

export default ChatCompanion;
