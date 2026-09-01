import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Divider,
  Image,
  Input,
  Progress,
  Space,
  Spin,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  BookOutlined,
  BulbOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  LoadingOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  SendOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { aiApi } from '../../services/api';
import { useSearchParams } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const getRequestId = () => {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
};

const toViewMessage = (messageItem) => ({
  ...messageItem,
  image: messageItem.imageUrl || messageItem.image || null,
  time: formatTime(messageItem.createdAt || messageItem.time),
  status: messageItem.status || (messageItem.requestStatus === 'failed' ? 'failed' : messageItem.generationStatus === 'stopped' ? 'stopped' : 'success'),
});

async function compressImage(file) {
  const image = await new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const imageElement = new window.Image();
    imageElement.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(imageElement);
    };
    imageElement.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('图片无法读取，请重新选择'));
    };
    imageElement.src = objectUrl;
  });

  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!blob) throw new Error('图片压缩失败，请重试');
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'homework'}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

function HomeworkHelp() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSessionId = searchParams.get('sessionId');
  const [question, setQuestion] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [recognition, setRecognition] = useState(null);
  const [recognizing, setRecognizing] = useState(false);
  const [session, setSession] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const chatEndRef = useRef(null);
  const streamAbortRef = useRef(null);
  const skipRecentRef = useRef(false);

  const scrollToBottom = () => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  useEffect(() => {
    let cancelled = false;
    if (!requestedSessionId && skipRecentRef.current) {
      skipRecentRef.current = false;
      setInitializing(false);
      return () => { cancelled = true; };
    }
    const loadRecentSession = async () => {
      try {
        const data = requestedSessionId ? await aiApi.getSession(requestedSessionId) : await aiApi.homeworkRecentSession();
        if (cancelled) return;
        if (data?.session?.agentType === 'homework' || data?.session?.agent_type === 'homework') {
          setSession(data.session);
          setChatHistory((data.messages || []).map(toViewMessage));
          const pending = (data.messages || []).find((item) => item.requestStatus === 'pending');
          if (pending) {
            setLoading(true);
            const pollStarted = Date.now();
            const poll = async () => {
              if (cancelled) return;
              try {
                const latest = await aiApi.getSession(data.session.id);
                const latestPending = (latest.messages || []).some((item) => item.requestStatus === 'pending');
                setSession(latest.session);
                setChatHistory((latest.messages || []).map(toViewMessage));
                if (!latestPending || Date.now() - pollStarted > 60_000) { setLoading(false); return; }
                window.setTimeout(poll, 2000);
              } catch { setLoading(false); }
            };
            window.setTimeout(poll, 1200);
          }
        }
      } catch (error) {
        if (!cancelled) setErrorMessage(error.message || '暂时无法恢复最近的辅导记录');
      } finally {
        if (!cancelled) setInitializing(false);
      }
    };
    loadRecentSession();
    return () => { cancelled = true; };
  }, [requestedSessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory.length, loading]);

  const clearImage = () => {
    if (imageUrl?.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    setImageFile(null);
    setRecognition(null);
  };

  const handleImageUpload = async (file) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      message.error('只支持 JPG、PNG、WEBP 格式的图片');
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      message.error('图片原文件不能超过 10MB');
      return false;
    }
    try {
      const compressed = await compressImage(file);
      if (compressed.size > 5 * 1024 * 1024) {
        message.error('图片压缩后仍超过 5MB，请选择更清晰或更小的图片');
        return false;
      }
      clearImage();
      setImageFile(compressed);
      setImageUrl(URL.createObjectURL(compressed));
      setRecognizing(true);
      try {
        const recognized = await aiApi.homeworkRecognize({ image: compressed, onUploadProgress: (event) => {
          if (event.total) setUploadProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
        } });
        setRecognition(recognized);
        setQuestion(recognized.recognizedText || '');
      } catch (error) {
        message.warning(error.message || '题目识别失败，可直接发送图片继续');
      } finally {
        setRecognizing(false);
        setUploadProgress(null);
      }
    } catch (error) {
      message.error(error.message || '图片处理失败');
    }
    return false;
  };

  const replacePendingMessage = (requestId, nextMessage) => {
    setChatHistory((previous) => previous.map((item) => (
      item.requestId === requestId ? { ...item, ...toViewMessage(nextMessage) } : item
    )));
  };

  const handleSend = async () => {
    if (loading) return;
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion && !imageFile) {
      message.warning('请输入问题或上传题目图片');
      return;
    }
    if (trimmedQuestion.length > 2000) {
      message.warning('问题不能超过 2000 个字符');
      return;
    }

    if (imageFile && !recognition) {
      message.warning('请先等待题目识别完成，并确认识别文字');
      return;
    }

    const requestId = getRequestId();
    const optimisticMessage = {
      id: `pending-${requestId}`,
      role: 'user',
      content: trimmedQuestion || '请帮我分析这道题，给出解题思路。',
      image: imageUrl,
      requestId,
      status: 'sending',
      time: formatTime(new Date()),
    };
    setChatHistory((previous) => [...previous, optimisticMessage]);
    setQuestion('');
    setLoading(true);
    setUploadProgress(imageFile ? 0 : null);
    setErrorMessage('');

    try {
      let sendQuestion = trimmedQuestion;
      if (recognition) {
        const confirmed = await aiApi.homeworkConfirmRecognition(recognition.id, trimmedQuestion || recognition.recognizedText);
        sendQuestion = confirmed.confirmedText;
      }
      let result;
      {
        let streamedResult = null;
        let streamError = null;
        const controller = new AbortController();
        streamAbortRef.current = controller;
        await aiApi.homeworkStreamMessage({
          sessionId: session?.id,
          question: sendQuestion,
          recognitionId: recognition?.id,
          image: recognition ? null : imageFile,
          requestId,
          signal: controller.signal,
          onEvent: (event, data) => {
            if (event === 'done') streamedResult = data;
            if (event === 'error') streamError = data;
            if (event === 'delta' && data?.text) {
              setChatHistory((previous) => {
                const partialId = `stream-${requestId}`;
                const existingPartial = previous.find((item) => item.id === partialId);
                if (existingPartial) return previous.map((item) => item.id === partialId ? { ...item, content: `${item.content || ''}${data.text}` } : item);
                return [...previous, { id: partialId, role: 'assistant', content: data.text, requestId, status: 'streaming', time: formatTime(new Date()) }];
              });
            }
          },
        });
        if (streamError) {
          const error = new Error(streamError.message || '生成失败，请重试');
          error.data = streamError;
          error.retryable = streamError.retryable;
          throw error;
        }
        result = streamedResult;
      }

      setSession(result.session);
      setChatHistory((previous) => [
        ...previous.filter((item) => item.requestId !== requestId && item.id !== `stream-${requestId}`),
        toViewMessage(result.userMessage),
        toViewMessage(result.assistantMessage),
      ]);
      clearImage();
    } catch (error) {
      setChatHistory((previous) => previous.filter((item) => item.id !== `stream-${requestId}`));
      const details = error.data || {};
      if (details.userMessageId && details.sessionId) {
        replacePendingMessage(requestId, {
          id: details.userMessageId,
          sessionId: details.sessionId,
          role: 'user',
          content: optimisticMessage.content,
          imageUrl: details.imageUrl || optimisticMessage.image,
          requestId,
          status: 'failed',
          time: optimisticMessage.time,
        });
        setSession((previous) => previous || { id: details.sessionId, status: 'active' });
        clearImage();
      } else {
        setChatHistory((previous) => previous.filter((item) => item.requestId !== requestId));
        setQuestion(trimmedQuestion);
      }
      setErrorMessage(error.message || '网络出了点小问题，请稍后重试');
    } finally {
      setLoading(false);
      streamAbortRef.current = null;
      setUploadProgress(null);
      scrollToBottom();
    }
  };

  const handleRetry = async (failedMessage) => {
    if (!session || loading) return;
    const requestId = getRequestId();
    setChatHistory((previous) => previous.map((item) => (
      item.id === failedMessage.id ? { ...item, status: 'retrying', requestId } : item
    )));
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await aiApi.homeworkRetry({
        sessionId: session.id,
        messageId: failedMessage.id,
        requestId,
      });
      setSession(result.session);
      setChatHistory((previous) => [
        ...previous.map((item) => item.id === failedMessage.id ? toViewMessage(result.userMessage) : item),
        toViewMessage(result.assistantMessage),
      ]);
    } catch (error) {
      setChatHistory((previous) => previous.map((item) => (
        item.id === failedMessage.id ? { ...item, status: 'failed' } : item
      )));
      setErrorMessage(error.message || '重试失败，请稍后再试');
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const handleComplete = async () => {
    if (!session || completing) return;
    setCompleting(true);
    try {
      const result = await aiApi.homeworkComplete(session.id);
      setSession(result.session);
      message.success('已记录本次作业辅导完成');
    } catch (error) {
      message.error(error.message || '暂时无法记录完成状态');
    } finally {
      setCompleting(false);
    }
  };

  const handleNewSession = async () => {
    if (loading) return;
    skipRecentRef.current = true;
    setSearchParams({});
    setSession(null);
    setChatHistory([]);
    setErrorMessage('');
    setQuestion('');
    clearImage();
  };

  const lastAssistantIndex = [...chatHistory].map((item) => item.role).lastIndexOf('assistant');

  const copyReply = async (content) => {
    try {
      await navigator.clipboard.writeText(content);
      message.success('已复制回复');
    } catch {
      message.warning('当前浏览器不支持复制');
    }
  };

  const stopGeneration = () => streamAbortRef.current?.abort();

  const quickQuestions = [
    '这道数学题怎么解？',
    '帮我理解这篇课文的中心思想',
    '这个英语语法怎么用？',
    '教我这个公式怎么推导',
  ];

  return (
    <div className="homework-help-page">
      <div className="page-title-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <h2><BookOutlined /> 智能作业辅导</h2>
          <p className="page-subtitle">拍照上传或输入题目，AI 帮你分析解题思路</p>
        </div>
        {(session || chatHistory.length > 0) && (
          <Button type="text" icon={<PlusOutlined />} onClick={handleNewSession} disabled={loading}>
            开始新题目
          </Button>
        )}
      </div>

      {errorMessage && (
        <Alert
          type="warning"
          showIcon
          closable
          message={errorMessage}
          onClose={() => setErrorMessage('')}
          style={{ marginBottom: 16 }}
        />
      )}

      <Card
        className="homework-chat-card"
        bordered={false}
        bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column', height: '60vh' }}
      >
        <div className="chat-messages" style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {initializing && (
            <div style={{ textAlign: 'center', padding: 48 }}><Spin tip="正在恢复最近的辅导..." /></div>
          )}
          {!initializing && chatHistory.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <RobotOutlined style={{ fontSize: 48, color: 'var(--primary-color)', marginBottom: 16 }} />
              <Title level={4} style={{ color: 'var(--text-secondary)' }}>Hi！我是你的作业小助手</Title>
              <Paragraph type="secondary">
                你可以拍照上传题目，或者直接输入问题，我会帮你分析解题思路。
                <br />这次辅导会自动保存，刷新页面后可以继续。
              </Paragraph>
              <Divider>试试这些问题</Divider>
              <Space wrap>
                {quickQuestions.map((item, index) => (
                  <Tag
                    key={index}
                    color="orange"
                    style={{ cursor: 'pointer', padding: '4px 12px', fontSize: 13 }}
                    onClick={() => setQuestion(item)}
                  >
                    <BulbOutlined /> {item}
                  </Tag>
                ))}
              </Space>
            </div>
          )}

          {!initializing && chatHistory.map((item, index) => (
            <div key={`${item.id}-${index}`} className={`chat-msg ${item.role === 'user' ? 'chat-msg-user' : 'chat-msg-ai'}`}>
              <div className="chat-avatar">
                {item.role === 'user' ? (
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
                {item.image && <Image src={item.image} style={{ maxWidth: 200, borderRadius: 8, marginBottom: 8 }} alt="题目图片" />}
                <div style={{ whiteSpace: 'pre-wrap' }}>{item.structured?.summary || item.content}</div>
                {item.status === 'stopped' && <Tag color="orange" style={{ marginTop: 8 }}>已停止生成，可继续追问</Tag>}
                {Array.isArray(item.structured?.steps) && <ol style={{ margin: '8px 0 0 20px' }}>{item.structured.steps.map((step, stepIndex) => <li key={stepIndex}>{typeof step === 'string' ? step : step.text || JSON.stringify(step)}</li>)}</ol>}
                {item.structured?.questionToStudent && <div style={{ marginTop: 8, color: '#4F7942' }}>想一想：{item.structured.questionToStudent}</div>}
                <div className="chat-time">{item.time}</div>
                {item.role === 'assistant' && item.id && !String(item.id).startsWith('pending-') && (
                  <Space size={4} style={{ marginTop: 4 }}>
                    <Button type="text" size="small" onClick={() => copyReply(item.content)}>复制</Button>
                    <Button type="text" size="small" onClick={() => aiApi.homeworkFeedback({ sessionId: item.sessionId, messageId: item.id, rating: 'helpful' })}>有帮助</Button>
                    <Button type="text" size="small" onClick={() => aiApi.homeworkFeedback({ sessionId: item.sessionId, messageId: item.id, rating: 'not_helpful' })}>需改进</Button>
                  </Space>
                )}
                {item.status === 'failed' && (
                  <div className="homework-failed-action">
                    <Text type="secondary">这次没有成功送达</Text>
                    <Button type="link" size="small" icon={<ReloadOutlined />} onClick={() => handleRetry(item)} disabled={loading}>
                      重新尝试
                    </Button>
                  </div>
                )}
                {item.status === 'retrying' && (
                  <div className="homework-failed-action"><Spin indicator={<LoadingOutlined spin />} size="small" /> <Text type="secondary">正在重试...</Text></div>
                )}
                {item.role === 'assistant' && index === lastAssistantIndex && session?.status === 'active' && !loading && (
                  <div className="homework-complete-action">
                    <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={handleComplete} loading={completing}>
                      已解决
                    </Button>
                  </div>
                )}
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
              <div className="chat-bubble"><Spin size="small" /> <Text type="secondary">正在思考中...</Text> <Button type="link" size="small" onClick={stopGeneration}>停止生成</Button></div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {imageUrl && (
          <div style={{ padding: '8px 20px', background: '#fafafa', borderTop: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Image src={imageUrl} height={60} style={{ borderRadius: 6 }} alt="待分析图片" />
            <Button type="text" danger icon={<DeleteOutlined />} onClick={clearImage} size="small" disabled={loading}>移除</Button>
          </div>
        )}

        {recognition && (
          <Alert
            type="info"
            showIcon
            message="请确认题目文字"
            description="识别结果可能有误；发送时可直接修改输入框中的文字。"
            style={{ margin: '0 20px 12px' }}
          />
        )}
        {recognizing && <div style={{ padding: '0 20px 10px', color: '#6b7280', fontSize: 12 }}>正在识别题目文字…</div>}

        {uploadProgress !== null && (
          <div style={{ padding: '0 20px', background: '#fafafa' }}>
            <Progress percent={uploadProgress} size="small" status={uploadProgress === 100 ? 'active' : 'normal'} showInfo={false} />
          </div>
        )}

        {session?.status === 'completed' && (
          <Alert
            type="success"
            showIcon
            message="本次辅导已记录完成"
            description="点击右上角“开始新题目”，继续解决下一道题。"
            style={{ margin: '0 20px 12px' }}
          />
        )}

        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0f0', background: '#fafafa' }}>
          <Space.Compact style={{ width: '100%' }}>
            <Upload accept="image/jpeg,image/png,image/webp" showUploadList={false} beforeUpload={handleImageUpload} disabled={loading || session?.status === 'completed'}>
              <Button icon={<CameraOutlined />} style={{ height: 44 }} title="拍照/上传图片" disabled={loading || session?.status === 'completed'}><PictureOutlined /></Button>
            </Upload>
            <TextArea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              placeholder="输入你的问题，或拍照上传题目..."
              autoSize={{ minRows: 1, maxRows: 3 }}
              style={{ flex: 1, resize: 'none' }}
              disabled={loading || initializing || session?.status === 'completed'}
            />
            <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={loading} disabled={initializing || recognizing || session?.status === 'completed'} style={{ height: 44, background: '#FF9F43', borderColor: '#FF9F43' }}>
              发送
            </Button>
          </Space.Compact>
          <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
            每次辅导最多 20 次提问；图片会先压缩后安全上传。
          </Text>
        </div>
      </Card>
    </div>
  );
}

export default HomeworkHelp;
