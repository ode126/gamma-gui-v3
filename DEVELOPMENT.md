# Gamma GUI v3 — 开发文档

## 项目概述

Gamma GUI v3 是一个 xray 插件 AI 辅助生成工具，基于 Next.js 构建。用户通过对话描述漏洞或产品特征，AI 自动生成并实时推送至编辑器。项目支持两种模式：

- **指纹识别（Finger）**：生成 xray finger 插件，用于识别目标技术栈
- **POC 检测**：生成 xray poc-yaml 插件，用于验证具体安全漏洞

凭证（API Key）由服务端环境变量统一管理，前端无配置界面，最终用户无法更改 AI 配置。

---

## 技术栈

| 层次 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) | 16.x |
| UI | React | 19.x |
| AI SDK | @anthropic-ai/claude-agent-sdk | 0.2.x |
| 代码编辑器 | @monaco-editor/react | 4.7.x |
| Markdown 渲染 | react-markdown + remark-gfm | 10.x / 4.x |
| 语法高亮 | react-syntax-highlighter (Prism) | 16.x |
| 状态管理 | Zustand | 5.x |
| 样式 | Tailwind CSS v4 + 内联 style | 4.x |
| 构建工具 | Turbopack (next dev) | — |

---

## 目录结构

```
gamma-gui-v3/
├── app/
│   ├── layout.js          # 根布局，全局字体、meta
│   ├── page.js            # 主页面：分栏布局 + 模式切换 Tab
│   ├── globals.css        # 全局样式（暗色主题基础变量）
│   └── api/
│       └── chat/
│           └── route.js   # 唯一 API 路由：GET 状态探测 / POST 对话
├── components/
│   ├── ChatPanel.jsx      # 对话面板（消息列表、输入框、快捷操作）
│   └── EditorPanel.jsx    # YAML 编辑器（Monaco，仅客户端渲染）
├── lib/
│   ├── constants.js       # 系统提示词、快捷操作定义
│   └── store.js           # Zustand 全局状态（模式、消息、YAML）
├── .env.local             # 本地凭证（不提交 git）
├── .env.local.example     # 凭证模板（提交 git，供参考）
└── .gitignore
```

---

## 核心模块说明

### `lib/constants.js`

导出三类内容：

| 导出名 | 说明 |
|--------|------|
| `FINGER_SYSTEM_PROMPT` | 指纹模式的 AI 系统提示词，包含插件格式、CEL 速查、最佳实践 |
| `POC_SYSTEM_PROMPT` | POC 模式的 AI 系统提示词，包含各类漏洞模板 |
| `FINGER_QUICK_ACTIONS` | 指纹模式快捷操作数组 `{ label, prompt }[]` |
| `POC_QUICK_ACTIONS` | POC 模式快捷操作数组 `{ label, prompt }[]` |
| `TOOLS` | （保留）原 Anthropic SDK tool-use 定义，现由 route.js 通过 YAML 提取代替 |

修改提示词后无需重启，下次请求自动生效。

### `lib/store.js`

Zustand store，按模式隔离状态：

```js
{
  mode: 'finger' | 'poc',         // 当前模式
  setMode(mode),

  fingerYaml, pocYaml,            // 各模式编辑器内容
  setFingerYaml, setPocYaml,
  setYaml(yaml),                  // 根据当前 mode 写入对应 yaml

  fingerMessages, pocMessages,    // 各模式消息历史
  addMessage(msg),                // 追加消息（mode-aware）
  updateMessage(id, patch),       // 更新消息（流式更新内容）
  clearMessages(),                // 清空当前模式历史
}
```

消息对象结构：

```js
{ id: string, role: 'user'|'assistant', content: string, streaming?: bool, error?: bool }
```

### `app/api/chat/route.js`

**GET** `/api/chat`  
探测服务端配置，返回 `{ ok: boolean, model: string | null }`。前端 ChatPanel 挂载时调用，用于显示连接状态。

**POST** `/api/chat`  
Request body：
```json
{ "messages": [...], "yamlCtx": "当前编辑器 YAML 内容", "mode": "finger|poc" }
```

Response：`text/event-stream`，逐条推送 SSE 事件：

| 事件类型 | 数据格式 | 说明 |
|----------|----------|------|
| `text_delta` | `{ type, content }` | AI 输出文本片段（实时） |
| `tool_use` | `{ type, name, input: { yaml } }` | 提取到 YAML，推送到编辑器 |
| `done` | `{ type }` | 本次请求完成 |
| `error` | `{ type, message }` | 服务端错误 |

内部流程：
1. 读取 env 配置，构造 system prompt（含编辑器当前 YAML 上下文）
2. 将对话历史拼接为单个 prompt 字符串（Human/Assistant 格式）
3. 调用 `query()` from `@anthropic-ai/claude-agent-sdk`，`maxTurns: 1`，不开启内置工具
4. 实时转发 `stream_event` 中的 `text_delta`
5. 在 `result` 事件中，从完整响应文本提取第一个 ` ```yaml ` 代码块，通过 `tool_use` 事件推送

### `components/ChatPanel.jsx`

- 挂载时 `GET /api/chat` 探测服务端状态，显示在顶栏
- 消息输入通过 `streamChat()` 函数建立 SSE 连接
- 流式消息：`streaming: true` + 空 content 时显示弹跳动画（`ThinkingDots`），有内容时渲染 Markdown
- YAML 代码块带「应用到编辑器」按钮（`CodeBlock` 组件）
- 通过 `useStore()` 订阅 mode-aware 的 messages 和 yaml

### `components/EditorPanel.jsx`

- 使用 `dynamic(() => import(...), { ssr: false })` 仅在客户端加载 Monaco Editor（避免 SSR 问题）
- 编辑器内容绑定 `fingerYaml` 或 `pocYaml`，通过 `setYaml()` 写入 store
- 顶栏图标和标题随模式切换（指纹 / POC）

---

## 环境变量

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `ANTHROPIC_AUTH_TOKEN` | 是（二选一） | API 鉴权 Token（支持 Anthropic / DeepSeek 等兼容服务） |
| `ANTHROPIC_API_KEY` | 是（二选一） | 与上面等价，优先级更高 |
| `ANTHROPIC_BASE_URL` | 否 | 第三方兼容服务的 Base URL，例如 `https://api.deepseek.com/anthropic` |
| `ANTHROPIC_MODEL` | 否 | 模型名，默认 `claude-opus-4-5` |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | 否 | SDK 内部路由用，设为同一模型即可 |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | 否 | SDK 内部路由用，设为同一模型即可 |

---

## 本地开发

### 环境要求

- Node.js >= 20.x
- npm >= 9.x

### 启动步骤

```bash
# 1. 进入项目目录
cd gamma-gui-v3

# 2. 安装依赖
npm install

# 3. 配置凭证
cp .env.local.example .env.local
# 编辑 .env.local，填入真实的 API Key 和模型名

# 4. 启动开发服务器（Turbopack，热更新）
npm run dev
# 访问 http://localhost:3000
```

### 常用命令

```bash
npm run dev      # 开发模式（http://localhost:3000）
npm run build    # 生产构建
npm run start    # 以生产模式运行已构建产物
npm run lint     # ESLint 检查
```

---

## 添加快捷操作

在 `lib/constants.js` 的 `FINGER_QUICK_ACTIONS` 或 `POC_QUICK_ACTIONS` 中追加：

```js
{ label: '🔥 新操作', prompt: '帮我生成一个 xxx 的插件…' }
```

### 修改系统提示词

直接编辑 `lib/constants.js` 中的 `FINGER_SYSTEM_PROMPT` 或 `POC_SYSTEM_PROMPT`，重新构建即可生效。

### 添加新模式

1. `lib/store.js`：新增 `xxxYaml`、`xxxMessages` 状态
2. `lib/constants.js`：新增对应 system prompt 和快捷操作
3. `app/page.js`：在 Tab 数组中添加新模式入口
4. `app/api/chat/route.js`：在 `BASE_PROMPT` 选择逻辑中增加分支
