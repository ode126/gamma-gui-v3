'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import ChatPanel from '../components/ChatPanel';
import { useStore } from '../lib/store';

// Load editor client-side only (Monaco requires browser APIs)
const EditorPanel = dynamic(() => import('../components/EditorPanel'), { ssr: false });

export default function Home() {
  const { mode, setMode } = useStore();
  const [splitPct, setSplitPct] = useState(52);
  const dragging = useRef(false);
  const containerRef = useRef(null);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(Math.max(pct, 25), 75));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d0d0f' }}>
      {/* ── Top bar ── */}
      <header style={{
        height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', borderBottom: '1px solid #1a1a26', flexShrink: 0,
        background: '#0a0a12',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🛡️</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#c0c0e0', letterSpacing: '.02em' }}>
            Gamma
          </span>

          {/* ── Mode tabs ── */}
          <div style={{
            display: 'flex', alignItems: 'center',
            background: '#0d0d18', border: '1px solid #1e1e30',
            borderRadius: 8, padding: 3, marginLeft: 8, gap: 2,
          }}>
            {[
              { key: 'finger', icon: '🔍', label: '指纹识别' },
              { key: 'poc', icon: '💥', label: 'POC 检测' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setMode(tab.key)}
                style={{
                  padding: '3px 12px', borderRadius: 6, border: 'none',
                  cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  transition: 'all .15s',
                  background: mode === tab.key ? '#4f46e5' : 'transparent',
                  color: mode === tab.key ? '#fff' : '#50507a',
                }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12 }}>
          <a
            href="https://docs.xray.cool"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#50507a', textDecoration: 'none' }}
            onMouseEnter={(e) => (e.target.style.color = '#8080b0')}
            onMouseLeave={(e) => (e.target.style.color = '#50507a')}
          >
            xray 文档 ↗
          </a>
        </div>
      </header>

      {/* ── Split panels ── */}
      <div ref={containerRef} style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: `${splitPct}%`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ChatPanel />
        </div>

        <div
          className="resize-handle"
          onMouseDown={onMouseDown}
          style={{ background: '#1a1a26' }}
        />

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <EditorPanel />
        </div>
      </div>
    </div>
  );
}
