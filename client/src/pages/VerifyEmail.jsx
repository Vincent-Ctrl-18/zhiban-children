import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Spin } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { authApi } from '../services/api';
import { withBasePath } from '../utils/paths';

function VerifyEmail({ onLogin }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setErrorMsg('验证链接无效');
      return;
    }

    authApi.verifyEmail(token)
      .then((res) => {
        setStatus('success');
        if (res.token && res.user) {
          setTimeout(() => {
            onLogin(res.user, res.token);
          }, 1800);
        }
      })
      .catch((err) => {
        setStatus('error');
        setErrorMsg(err.message || '验证失败，链接可能已过期');
      });
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f0fdf4 0%, #f8fafc 100%)',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 20,
        padding: '56px 48px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
        textAlign: 'center',
        maxWidth: 420,
        width: '90%',
      }}>
        <img src={withBasePath('/logo.png')} alt="智伴乡童" style={{ width: 64, height: 64, objectFit: 'contain', marginBottom: 24 }} />

        {status === 'loading' && (
          <>
            <Spin size="large" />
            <p style={{ marginTop: 24, color: '#6b7280', fontSize: 16 }}>正在验证邮箱...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircleOutlined style={{ fontSize: 56, color: '#1dd1a1', display: 'block', marginBottom: 16 }} />
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1d1d1f', marginBottom: 8 }}>邮箱验证成功！</h2>
            <p style={{ color: '#6b7280', marginBottom: 32, lineHeight: 1.8 }}>
              您的邮箱已成功验证<br />正在自动跳转到您的主页...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <CloseCircleOutlined style={{ fontSize: 56, color: '#ff6b6b', display: 'block', marginBottom: 16 }} />
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1d1d1f', marginBottom: 8 }}>验证失败</h2>
            <p style={{ color: '#9ca3af', marginBottom: 32, lineHeight: 1.8 }}>
              {errorMsg}<br />
              验证链接有效期为 10 分钟
            </p>
            <Button
              type="primary"
              onClick={() => navigate('/')}
              style={{
                height: 46,
                borderRadius: 10,
                background: '#4F7942',
                borderColor: '#4F7942',
                fontWeight: 600,
                padding: '0 32px',
              }}
            >
              返回首页重新注册
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default VerifyEmail;
