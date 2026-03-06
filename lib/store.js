import { create } from 'zustand';

let msgId = 0;

const FINGER_DEFAULT_YAML = `name: finger-example-product
transport: http
finger:
  - method: GET
    path: /
    follow_redirects: true
    expression: |
      response.status == 200 &&
      response.body.bcontains(b"keyword")
    headers:
      User-Agent: Mozilla/5.0
detail:
  author: your-name
  links:
    - https://example.com
`;

const POC_DEFAULT_YAML = `name: poc-yaml-example
manual: true
transport: http
rules:
  r0:
    request:
      method: GET
      path: /
      follow_redirects: false
    expression: response.status == 200
expression: r0()
detail:
  author: your-name
  links:
    - https://example.com
`;

export const useStore = create((set) => ({
  // ── Mode ────────────────────────────────────────────────────────────────────
  mode: 'finger', // 'finger' | 'poc'
  setMode: (mode) => set({ mode }),

  // ── Per-mode YAML editor content ────────────────────────────────────────────
  fingerYaml: FINGER_DEFAULT_YAML,
  pocYaml: POC_DEFAULT_YAML,
  setFingerYaml: (yaml) => set({ fingerYaml: yaml }),
  setPocYaml: (yaml) => set({ pocYaml: yaml }),
  // Convenience: set yaml for whichever mode is active
  setYaml: (yaml) =>
    set((s) => (s.mode === 'finger' ? { fingerYaml: yaml } : { pocYaml: yaml })),

  // ── Per-mode chat messages ───────────────────────────────────────────────────
  fingerMessages: [],
  pocMessages: [],

  // Operate on the current mode's message array
  addMessage: (msg) =>
    set((s) => {
      const key = s.mode === 'finger' ? 'fingerMessages' : 'pocMessages';
      return { [key]: [...s[key], { id: ++msgId, ...msg }] };
    }),
  updateMessage: (id, patch) =>
    set((s) => {
      const key = s.mode === 'finger' ? 'fingerMessages' : 'pocMessages';
      return { [key]: s[key].map((m) => (m.id === id ? { ...m, ...patch } : m)) };
    }),
  clearMessages: () =>
    set((s) => {
      const key = s.mode === 'finger' ? 'fingerMessages' : 'pocMessages';
      return { [key]: [] };
    }),
}));
