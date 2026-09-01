import { useEffect, useMemo, useState } from 'react';
import { Button, Card, DatePicker, Empty, Input, List, Modal, Popconfirm, Select, Space, Spin, Switch, Tabs, Tag, Typography, message } from 'antd';
import { HistoryOutlined, EditOutlined, DeleteOutlined, PauseCircleOutlined, CheckCircleOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { aiApi } from '../../services/api';

const labels = { homework: '作业辅导', report: '学习报告' };
const routes = { homework: '/student/homework', report: '/student/report' };
const memoryLabels = { learning_goal: '学习目标', response_preference: '回答偏好', subject_interest: '感兴趣的科目', knowledge_gap: '知识薄弱点', mastered_topic: '已掌握内容', grade: '学习阶段' };

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN');
}

function AIHistory() {
  const [tab, setTab] = useState('history');
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [agentType, setAgentType] = useState('');
  const [status, setStatus] = useState('');
  const [subject, setSubject] = useState('');
  const [range, setRange] = useState(null);
  const [memories, setMemories] = useState([]);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (tab !== 'history') return undefined;
    let cancelled = false;
    setLoading(true);
    aiApi.listSessions({
      withTotal: true,
      page,
      pageSize: 20,
      agentType: agentType || undefined,
      status: status || undefined,
      subject: subject || undefined,
      from: range?.[0]?.format('YYYY-MM-DD'),
      to: range?.[1]?.format('YYYY-MM-DD'),
    }).then((data) => {
      if (cancelled) return;
      if (Array.isArray(data)) { setSessions(data); setTotal(data.length); }
      else { setSessions(data.items || []); setTotal(Number(data.total || 0)); }
    }).catch((error) => { if (!cancelled) message.error(error.message || '历史记录暂不可用'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, page, agentType, status, subject, range]);

  useEffect(() => {
    if (tab !== 'memory') return undefined;
    let cancelled = false;
    setMemoryLoading(true);
    aiApi.listMemories().then((data) => {
      if (cancelled) return;
      setMemoryEnabled(data.enabled !== false);
      setMemories(data.items || []);
    }).catch((error) => { if (!cancelled) message.error(error.message || 'AI 记忆暂不可用'); })
      .finally(() => { if (!cancelled) setMemoryLoading(false); });
    return () => { cancelled = true; };
  }, [tab]);

  const openSession = (item) => aiApi.getSession(item.id).then(setDetail).catch((error) => message.error(error.message || '无法打开会话'));

  const continueSession = async (item) => {
    try {
      const result = await aiApi.resumeSession(item.id);
      const target = result.session?.id || item.id;
      navigate(`${routes[item.agentType] || '/student/history'}?sessionId=${encodeURIComponent(target)}`);
    } catch (error) { message.error(error.message || '无法继续该会话'); }
  };

  const rename = async () => {
    if (!editing) return;
    try {
      await aiApi.renameSession(editing.id, editText);
      setSessions((items) => items.map((item) => item.id === editing.id ? { ...item, title: editText, titleSource: 'user' } : item));
      if (detail?.session?.id === editing.id) setDetail((value) => ({ ...value, session: { ...value.session, title: editText, titleSource: 'user' } }));
      setEditing(null);
    } catch (error) { message.error(error.message || '修改标题失败'); }
  };

  const forget = async (item) => {
    try {
      await aiApi.forgetMemory(item.id);
      setMemories((items) => items.filter((memory) => memory.id !== item.id));
      message.success('已让 AI 忘记这条内容');
    } catch (error) { message.error(error.message || '忘记失败'); }
  };

  const updateMemory = async () => {
    if (!editing || !editText.trim()) return;
    try {
      const updated = await aiApi.updateMemory(editing.id, { content: editText });
      setMemories((items) => items.map((item) => item.id === editing.id ? updated : item));
      setEditing(null);
    } catch (error) { message.error(error.message || '修改记忆失败'); }
  };

  const groupedMemories = useMemo(() => memories.reduce((groups, item) => {
    const key = memoryLabels[item.type] || item.type;
    groups[key] = groups[key] || [];
    groups[key].push(item);
    return groups;
  }, {}), [memories]);

  const historyContent = (
    <div className={`ai-history-layout${detail ? ' has-detail' : ''}`}>
      <Card bordered={false} className="ai-history-list-panel" style={{ borderRadius: 16 }}>
        <Space wrap style={{ marginBottom: 16 }}>
          <Select allowClear value={agentType || undefined} onChange={(value) => { setAgentType(value || ''); setPage(1); }} placeholder="按智能体筛选" options={[{ value: 'homework', label: '作业辅导' }, { value: 'report', label: '学习报告' }]} style={{ width: 150 }} />
          <Select allowClear value={status || undefined} onChange={(value) => { setStatus(value || ''); setPage(1); }} placeholder="按状态筛选" options={[{ value: 'active', label: '进行中' }, { value: 'completed', label: '已完成' }, { value: 'abandoned', label: '已结束' }]} style={{ width: 130 }} />
          <Select allowClear showSearch value={subject || undefined} onChange={(value) => { setSubject(value || ''); setPage(1); }} placeholder="按科目筛选" options={['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'].map((value) => ({ value, label: value }))} style={{ width: 130 }} />
          <DatePicker.RangePicker value={range} onChange={(value) => { setRange(value); setPage(1); }} />
        </Space>
        {loading ? <Spin /> : sessions.length === 0 ? <Empty description="还没有历史学习会话" /> : <List dataSource={sessions} pagination={{ current: page, pageSize: 20, total, onChange: setPage, hideOnSinglePage: true }} renderItem={(item) => <List.Item actions={[item.status === 'active' ? <Button key="continue" type="link" onClick={(event) => { event.stopPropagation(); continueSession(item); }}>继续</Button> : item.status === 'completed' && item.agentType === 'homework' ? <Button key="fork" type="link" onClick={(event) => { event.stopPropagation(); continueSession(item); }}>基于此继续</Button> : null, <Button key="rename" type="link" icon={<EditOutlined />} onClick={(event) => { event.stopPropagation(); setEditing(item); setEditText(item.title || ''); }}>改名</Button>]} onClick={() => openSession(item)} style={{ cursor: 'pointer' }}><List.Item.Meta title={<span>{item.title || labels[item.agentType]} <Tag color={item.status === 'completed' ? 'green' : item.status === 'active' ? 'orange' : 'default'}>{item.status === 'completed' ? '已完成' : item.status === 'active' ? '进行中' : '已结束'}</Tag></span>} description={`${labels[item.agentType] || item.agentType}${item.subject ? ` · ${item.subject}` : ''} · ${formatDate(item.lastActiveAt)}${item.summary ? `\n${item.summary}` : ''}`} /></List.Item>} />}
      </Card>
      {detail ? <Card bordered={false} className="ai-history-detail-panel" style={{ borderRadius: 16 }} title={<Space><Button className="ai-history-mobile-back" type="text" icon={<ArrowLeftOutlined />} onClick={() => setDetail(null)}>返回</Button>{detail.session.title || labels[detail.session.agentType]}<Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(detail.session); setEditText(detail.session.title || ''); }}>改名</Button></Space>} extra={detail.session.summary ? <Typography.Text type="secondary" ellipsis style={{ maxWidth: 260 }}>{detail.session.summary}</Typography.Text> : null}><div style={{ maxHeight: 620, overflow: 'auto' }}>{detail.messages.map((item) => <div key={item.id} style={{ marginBottom: 12, textAlign: item.role === 'user' ? 'right' : 'left' }}><Typography.Text type="secondary" style={{ fontSize: 12 }}>{item.role === 'user' ? '我' : 'AI'}</Typography.Text><div style={{ display: 'inline-block', maxWidth: '85%', marginLeft: item.role === 'user' ? 0 : 8, marginRight: item.role === 'user' ? 8 : 0, padding: '8px 12px', borderRadius: 10, background: item.role === 'user' ? '#fff3e0' : '#f0fdf4', whiteSpace: 'pre-wrap' }}>{item.imageUrl && <img src={item.imageUrl} alt="题目" style={{ display: 'block', maxWidth: 220, maxHeight: 160, objectFit: 'contain', borderRadius: 8, marginBottom: 8 }} />}<div>{item.contentJson?.summary || item.content}</div>{Array.isArray(item.contentJson?.steps) && <ol style={{ margin: '8px 0 0 20px' }}>{item.contentJson.steps.map((step, index) => <li key={index}>{typeof step === 'string' ? step : step.text || JSON.stringify(step)}</li>)}</ol>}{item.generationStatus === 'stopped' && <Tag color="orange" style={{ marginLeft: 8 }}>已停止</Tag>}{item.requestStatus === 'failed' && <Tag color="red" style={{ marginLeft: 8 }}>生成失败</Tag>}</div></div>)}</div></Card> : <Card bordered={false} className="ai-history-detail-panel ai-history-detail-empty" style={{ borderRadius: 16 }}><Empty description="选择一条学习记录查看详情" /></Card>}
    </div>
  );

  const memoryContent = (
    <Card bordered={false} style={{ borderRadius: 16 }}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <AlertMemory enabled={memoryEnabled} onChange={async (enabled) => { try { await aiApi.setMemoryEnabled(enabled); setMemoryEnabled(enabled); } catch (error) { message.error(error.message || '设置失败'); } }} />
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>AI 只会使用学习目标、回答偏好和知识点等学习事实；倾诉内容不会进入这里。</Typography.Paragraph>
        {memoryLoading ? <Spin /> : Object.keys(groupedMemories).length === 0 ? <Empty description="AI 还没有记住学习内容" /> : Object.entries(groupedMemories).map(([group, items]) => <div key={group}><Typography.Title level={5}>{group}</Typography.Title><List dataSource={items} renderItem={(item) => <List.Item actions={[<Button key="edit" type="link" icon={<EditOutlined />} onClick={() => { setEditing(item); setEditText(item.content); }}>修改</Button>, <Popconfirm key="forget" title="让 AI 忘记这条内容？" onConfirm={() => forget(item)}><Button type="link" danger icon={<DeleteOutlined />}>忘记</Button></Popconfirm>]}><List.Item.Meta title={<Space>{item.content}{item.firstSeenAt && Date.now() - new Date(item.firstSeenAt).getTime() < 7 * 86400000 && <Tag color="blue">新记忆</Tag>}</Space>} description={`${item.subject ? `${item.subject} · ` : ''}来源：${labels[item.sourceAgentType] || '学习记录'} · ${formatDate(item.updatedAt || item.lastConfirmedAt)}`} /></List.Item>} /></div>)}
      </Space>
    </Card>
  );

  return <div className="ai-history-page"><div className="page-title-bar"><h2><HistoryOutlined /> 最近学习</h2><p className="page-subtitle">继续上次任务，或管理 AI 记住的学习内容</p></div><Tabs activeKey={tab} onChange={setTab} items={[{ key: 'history', label: '学习历史', children: historyContent }, { key: 'memory', label: 'AI 记忆', children: memoryContent }]} /><Modal open={Boolean(editing)} title={editing?.type ? '修改 AI 记忆' : '修改会话标题'} onCancel={() => setEditing(null)} onOk={editing?.type ? updateMemory : rename} okText="保存"><Input value={editText} onChange={(event) => setEditText(event.target.value)} maxLength={editing?.type ? 500 : 160} /></Modal></div>;
}

function AlertMemory({ enabled, onChange }) {
  return <Card size="small" style={{ background: '#f7fbff' }}><Space><span><PauseCircleOutlined /> 允许 AI 使用学习记忆</span><Switch checked={enabled} onChange={onChange} /><CheckCircleOutlined style={{ color: enabled ? '#16a34a' : '#94a3b8' }} /></Space></Card>;
}

export default AIHistory;
