import { useState } from 'react';

// Tab-scoped and account-scoped: drafts are never shared across student accounts.
export default function useSessionDraft(scope, initial = '') {
  let userId = 'anonymous';
  try { userId = JSON.parse(localStorage.getItem('user') || '{}').id || 'anonymous'; } catch {}
  const key = `ai-draft:${userId}:${scope}`;
  const read = () => { try { return sessionStorage.getItem(key) ?? initial; } catch { return initial; } };
  const [state, setState] = useState(() => ({ key, value: read() }));
  const value = state.key === key ? state.value : read();
  const setValue = next => {
    const resolved = typeof next === 'function' ? next(value) : next;
    setState({ key, value: resolved });
    try { if (resolved) sessionStorage.setItem(key, resolved); else sessionStorage.removeItem(key); } catch {}
  };
  return [value, setValue];
}
