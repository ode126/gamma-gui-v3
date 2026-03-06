'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FINGER_QUICK_ACTIONS, POC_QUICK_ACTIONS } from '../lib/constants';
import { useStore } from '../lib/store';

// ── Streaming helper ───────────────────────────────────────────────────────────
// Sends chat history to /api/chat and forwards SSE events to callbacks.
// Returns an abort function.
function streamChat(messages, yamlCtx, mode, onChunk, onToolUse, onDone, onError) {
  const controller = new AbortController();

  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, yamlCtx, mode }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const read = async () => {
        try {
          const { done, value } = await reader.read();
          if (done) { onDone(); return; }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            const trimmed = line.replace(/^data: /, '').trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed);
              if (event.type === 'text_delta') onChunk(event.content);
              else if (event.type === 'tool_use') onToolUse(event);
              else if (event.type === 'done') { onDone(); return; }
              else if (event.type === 'error') { onError(new Error(event.message)); return; }
            } catch { /* ignore SSE parse errors */ }
          }
          read();
        } catch (err) {
          if (err.name !== 'AbortError') onError(err);
        }
      };
      read();
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError(err);
    });

  return () => controller.abort();
}

// ── Copy button ────────────────────────────────────────────────────────────────
function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return <button onClick={copy}>{copied ? '✓ 已复制' : '复制'}</button>;
}

// ── Code block ─────────────────────────────────────────────────────────────────
function CodeBlock({ lang = '', value = '', onApply }) {
  const isYaml = /^ya?ml$/i.test(lang);
  return (
    <div className="code-wrap">
      <div className="code-header">
        <span>{lang || 'code'}</span>
        <span className="btns">
          {isYaml && (
            <button className="apply-btn" onClick={() => onApply?.(value)}>
              应用到编辑器
            </button>
          )}
          <CopyBtn text={value} />
        </span>
      </div>
      <SyntaxHighlighter
        language={isYaml ? 'yaml' : lang}
        style={vscDarkPlus}
        customStyle={{ margin: 0, borderRadius: 0, fontSize: 13 }}
        showLineNumbers={value.split('\n').length > 6}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
}

// ── Markdown renderer ──────────────────────────────────────────────────────────
function MdContent({ content, onApply, isStreaming }) {
  return (
    <div className={`md-body${isStreaming ? ' stream-cursor' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Remove <pre> wrapper so CodeBlock's <div> doesn't nest inside <pre>
          pre({ children }) { return <>{children}</>; },
          code({ className, children, ...props }) {
            const lang = /language-(\w+)/.exec(className || '')?.[1] || '';
            const value = String(children).replace(/\n$/, '');
            // Fenced code blocks have a "language-xxx" className; inline code does not
            if (!className) return <code {...props}>{children}</code>;
            return <CodeBlock lang={lang} value={value} onApply={onApply} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ── Welcome screen ─────────────────────────────────────────────────────────────
function Welcome({ onAction, serverStatus, mode }) {
  const isLoading = serverStatus === null;
  const isReady = serverStatus?.ok === true;
  const quickActions = mode === 'finger' ? FINGER_QUICK_ACTIONS : POC_QUICK_ACTIONS;
  const modeLabel = mode === 'finger' ? '🔍 指纹识别' : '💥 POC 检测';

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '24px', gap: 20,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>🛡️</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#e0e0f0' }}>Gamma v3</div>
        <div style={{ fontSize: 13, color: '#50506a', marginTop: 4 }}>
          {modeLabel} · Claude AI
        </div>

        {isLoading && (
          <div style={{ marginTop: 14, fontSize: 12, color: '#60607a' }}>正在连接服务…</div>
        )}

        {!isLoading && !isReady && (
          <div style={{
            marginTop: 14, fontSize: 12, color: '#f87171',
            background: '#1e0f0f', border: '1px solid #5a1d1d',
            borderRadius: 8, padding: '10px 16px', lineHeight: 1.6,
          }}>
            ⚠️ 服务端未配置 API Key<br />
            <span style={{ color: '#808090' }}>
              请在 <code style={{ color: '#a5b4fc' }}>.env.local</code> 中设置{' '}
              <code style={{ color: '#a5b4fc' }}>ANTHROPIC_API_KEY</code>
            </span>
          </div>
        )}
      </div>

      {isReady && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 400, justifyContent: 'center' }}>
          {quickActions.map((a) => (
            <button
              key={a.label}
              onClick={() => onAction(a.prompt)}
              style={{
                background: '#13131c', border: '1px solid #252535',
                borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
                fontSize: 12, color: '#9090b8', transition: 'all .15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#1e1e2e';
                e.currentTarget.style.color = '#d0d0f0';
                e.currentTarget.style.borderColor = '#3a3a5a';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#13131c';
                e.currentTarget.style.color = '#9090b8';
                e.currentTarget.style.borderColor = '#252535';
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Message row ────────────────────────────────────────────────────────────────
function MessageRow({ msg, onApply }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', background: '#1a1a30',
          border: '1px solid #2a2a4a', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, marginTop: 2,
        }}>
          🤖
        </div>
      )}
      <div style={{
        maxWidth: isUser ? '80%' : '88%',
        background: isUser ? '#1e2040' : '#0f0f18',
        border: `1px solid ${isUser ? '#2a2a5a' : '#1e1e30'}`,
        borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        padding: isUser ? '8px 14px' : '10px 14px',
        fontSize: 14, lineHeight: 1.6,
        color: msg.error ? '#f87171' : (isUser ? '#c0c0e0' : '#d0d0e8'),
      }}>
        {isUser ? (
          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
        ) : msg.streaming && !msg.content ? (
          <ThinkingDots />
        ) : (
          <MdContent
            content={msg.content || '…'}
            onApply={onApply}
            isStreaming={msg.streaming}
          />
        )}
      </div>
    </div>
  );
}

// ── Thinking dots ────────────────────────────────────────────────────────────
function ThinkingDots() {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const frames = ['', '.', '..', '...'];
    let i = 0;
    const timer = setInterval(() => {
      i = (i + 1) % frames.length;
      setDots(frames[i]);
    }, 420);
    return () => clearInterval(timer);
  }, []);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
      <span style={{ fontSize: 13, color: '#6060a0', fontStyle: 'italic' }}>
        思考中{dots}
      </span>
      <span style={{
        display: 'inline-flex', gap: 4, alignItems: 'center',
      }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 5, height: 5, borderRadius: '50%',
              background: '#4f46e5',
              display: 'inline-block',
              animation: `thinking-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </span>
      <style>{`
        @keyframes thinking-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Icon button ────────────────────────────────────────────────────────────────
function IconBtn({ children, onClick, title, disabled }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'none', border: '1px solid #2a2a3a', borderRadius: 6,
        padding: '4px 8px', cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 14, color: disabled ? '#303040' : '#808090',
        transition: 'all .15s', opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = '#1e1e2e';
          e.currentTarget.style.color = '#c0c0d0';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none';
        e.currentTarget.style.color = disabled ? '#303040' : '#808090';
      }}
    >
      {children}
    </button>
  );
}

// ── Quick chip ─────────────────────────────────────────────────────────────────
function Chip({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: '#0f0f18', border: '1px solid #252535', borderRadius: 20,
        padding: '3px 10px', cursor: 'pointer', fontSize: 11, color: '#6060a0',
        transition: 'all .15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#1a1a28';
        e.currentTarget.style.color = '#a0a0c8';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#0f0f18';
        e.currentTarget.style.color = '#6060a0';
      }}
    >
      {children}
    </button>
  );
}

// ── Main ChatPanel ─────────────────────────────────────────────────────────────
export default function ChatPanel() {
  const mode = useStore((s) => s.mode);
  const messages = useStore((s) =>
    s.mode === 'finger' ? s.fingerMessages : s.pocMessages
  );
  const yaml = useStore((s) =>
    s.mode === 'finger' ? s.fingerYaml : s.pocYaml
  );
  const { addMessage, updateMessage, clearMessages } = useStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // null = fetching, { ok, model } = resolved
  const [serverStatus, setServerStatus] = useState(null);
  const abortRef = useRef(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const streamingIdRef = useRef(null);

  // Probe server config on mount
  useEffect(() => {
    fetch('/api/chat')
      .then((r) => r.json())
      .then((data) => setServerStatus(data))
      .catch(() => setServerStatus({ ok: false, model: null }));
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleApply = useCallback((yamlText) => {
    useStore.getState().setYaml(yamlText);
  }, []);

  const send = useCallback((overrideText) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading || !serverStatus?.ok) return;

    addMessage({ role: 'user', content: text });
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Build history (exclude in-progress streaming placeholder)
    const state = useStore.getState();
    const history = (state.mode === 'finger' ? state.fingerMessages : state.pocMessages)
      .filter((m) => !m.streaming)
      .map(({ role, content }) => ({ role, content }));

    // Add assistant placeholder
    addMessage({ role: 'assistant', content: '', streaming: true });
    const st = useStore.getState();
    const activeMsgs = st.mode === 'finger' ? st.fingerMessages : st.pocMessages;
    streamingIdRef.current = activeMsgs.at(-1)?.id;
    setLoading(true);

    let accumulated = '';

    abortRef.current = streamChat(
      history,
      yaml,
      mode,
      // onChunk
      (chunk) => {
        accumulated += chunk;
        updateMessage(streamingIdRef.current, { content: accumulated, streaming: true });
      },
      // onToolUse — Agent called update_yaml_editor
      (event) => {
        if (event.name === 'update_yaml_editor' && event.input?.yaml) {
          useStore.getState().setYaml(event.input.yaml);
          accumulated += '\n\n> ✅ 已将 YAML 应用到编辑器';
          updateMessage(streamingIdRef.current, { content: accumulated, streaming: true });
        }
      },
      // onDone
      () => {
        updateMessage(streamingIdRef.current, { streaming: false });
        setLoading(false);
        streamingIdRef.current = null;
      },
      // onError
      (err) => {
        updateMessage(streamingIdRef.current, {
          content: `❌ 错误：${err.message}`,
          streaming: false,
          error: true,
        });
        setLoading(false);
        streamingIdRef.current = null;
      },
    );
  }, [input, loading, yaml, mode, serverStatus, addMessage, updateMessage]);

  const stop = () => {
    abortRef.current?.();
    if (streamingIdRef.current) {
      updateMessage(streamingIdRef.current, { streaming: false });
    }
    setLoading(false);
    streamingIdRef.current = null;
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const isReady = serverStatus?.ok === true;
  const isLoading = serverStatus === null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderBottom: '1px solid #1e1e2e', flexShrink: 0,
        background: '#0d0d0f',
      }}>
        <span style={{
          fontSize: 14, fontWeight: 600, color: '#e0e0f0',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>🤖</span> AI 助手
          <span style={{
            fontSize: 11, padding: '1px 8px', borderRadius: 10,
            background: isLoading ? '#1a1a2a' : (isReady ? '#1a3a1a' : '#2a1a1a'),
            color: isLoading ? '#50507a' : (isReady ? '#4ade80' : '#f87171'),
            border: `1px solid ${isLoading ? '#2a2a3a' : (isReady ? '#166534' : '#7f1d1d')}`,
          }}>
            {isLoading ? '连接中…' : (isReady ? serverStatus.model : '未配置')}
          </span>
        </span>

        <IconBtn
          title="清空对话"
          disabled={messages.length === 0}
          onClick={() => { if (loading) stop(); clearMessages(); }}
        >
          🗑
        </IconBtn>
      </div>

      {/* ── Messages ── */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px 12px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {messages.length === 0 ? (
          <Welcome onAction={(p) => send(p)} serverStatus={serverStatus} mode={mode} />
        ) : (
          messages.map((msg) => (
            <MessageRow key={msg.id} msg={msg} onApply={handleApply} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Quick chips (when conversation is active) ── */}
      {messages.length > 0 && (
        <div style={{
          padding: '6px 12px', borderTop: '1px solid #1a1a28',
          display: 'flex', flexWrap: 'wrap', gap: 5, flexShrink: 0,
          background: '#0d0d0f',
        }}>
          {(mode === 'finger' ? FINGER_QUICK_ACTIONS : POC_QUICK_ACTIONS).map((a) => (
            <Chip key={a.label} onClick={() => send(a.prompt)}>{a.label}</Chip>
          ))}
        </div>
      )}

      {/* ── Input area ── */}
      <div style={{
        padding: '10px 12px', borderTop: '1px solid #1e1e2e',
        flexShrink: 0, background: '#0d0d0f',
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={loading || !isReady}
            placeholder={
              !isReady
                ? (isLoading ? '连接中…' : '请先配置 ANTHROPIC_API_KEY')
                : '描述漏洞或目标，Claude 将自动生成 xray 插件…（Enter 发送，Shift+Enter 换行）'
            }
            rows={1}
            style={{
              flex: 1, resize: 'none', background: '#14141e',
              border: '1px solid #2a2a3a', borderRadius: 8,
              padding: '9px 12px', color: '#e0e0f0', fontSize: 13,
              outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
              maxHeight: 120, overflow: 'auto', transition: 'border-color .15s',
              opacity: !isReady ? 0.45 : 1,
            }}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onFocus={(e) => { e.target.style.borderColor = '#4f46e5'; }}
            onBlur={(e) => { e.target.style.borderColor = '#2a2a3a'; }}
          />

          {loading ? (
            <button
              onClick={stop}
              style={{
                background: '#2a1010', border: '1px solid #6b1d1d',
                borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
                color: '#f87171', fontSize: 13, flexShrink: 0,
              }}
            >
              ⏹ 停止
            </button>
          ) : (
            <button
              onClick={() => send()}
              disabled={!input.trim() || !isReady}
              style={{
                background: (!input.trim() || !isReady) ? '#1a1a2a' : '#4f46e5',
                border: 'none', borderRadius: 8, padding: '8px 16px',
                cursor: (!input.trim() || !isReady) ? 'not-allowed' : 'pointer',
                color: (!input.trim() || !isReady) ? '#35354a' : '#fff',
                fontSize: 13, fontWeight: 600, flexShrink: 0, transition: 'all .15s',
              }}
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
