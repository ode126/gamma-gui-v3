'use client';

import { useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useStore } from '../lib/store';

export default function EditorPanel() {
  const mode = useStore((s) => s.mode);
  const yaml = useStore((s) => (s.mode === 'finger' ? s.fingerYaml : s.pocYaml));
  const setYaml = useStore((s) => s.setYaml);
  const editorRef = useRef(null);

  function handleMount(editor) {
    editorRef.current = editor;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderBottom: '1px solid #1e1e2e', flexShrink: 0,
        background: '#0d0d0f',
      }}>
        <span style={{
          fontSize: 14, fontWeight: 600, color: '#e0e0f0',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>{mode === 'finger' ? '🔍' : '💥'}</span>
          {mode === 'finger' ? '指纹插件' : 'POC 插件'} 编辑器
          <span style={{
            fontSize: 11, padding: '1px 8px', borderRadius: 10,
            background: '#1a2a1a', color: '#4ade80', border: '1px solid #166534',
          }}>
            xray plugin
          </span>
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <IconBtn
            title="复制 YAML"
            onClick={() => {
            const s = useStore.getState();
            const currentYaml = s.mode === 'finger' ? s.fingerYaml : s.pocYaml;
            navigator.clipboard.writeText(currentYaml);
          }}
          >
            📋
          </IconBtn>
          <IconBtn
            title="清空编辑器"
            onClick={() => useStore.getState().setYaml('')}
          >
            🗑
          </IconBtn>
        </div>
      </div>

      {/* Monaco Editor */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Editor
          height="100%"
          language="yaml"
          theme="vs-dark"
          value={yaml}
          onChange={(val) => setYaml(val ?? '')}
          onMount={handleMount}
          options={{
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
            fontLigatures: true,
            lineHeight: 22,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            wordWrap: 'on',
            padding: { top: 16, bottom: 16 },
            tabSize: 2,
            insertSpaces: true,
            folding: true,
            lineNumbers: 'on',
            renderLineHighlight: 'gutter',
            bracketPairColorization: { enabled: true },
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            scrollbar: { verticalScrollbarSize: 5, horizontalScrollbarSize: 5 },
          }}
          loading={
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', background: '#1e1e1e', color: '#505060', fontSize: 13,
            }}>
              载入编辑器…
            </div>
          }
        />
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        background: 'none', border: '1px solid #2a2a3a', borderRadius: 6,
        padding: '4px 8px', cursor: 'pointer', fontSize: 14,
        color: '#808090', transition: 'all .15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#1e1e2e';
        e.currentTarget.style.color = '#c0c0d0';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none';
        e.currentTarget.style.color = '#808090';
      }}
    >
      {children}
    </button>
  );
}
