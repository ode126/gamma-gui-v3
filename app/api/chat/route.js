import { query } from '@anthropic-ai/claude-agent-sdk';
import { FINGER_SYSTEM_PROMPT, POC_SYSTEM_PROMPT } from '../../../lib/constants';

function getConfig() {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  const baseURL = process.env.ANTHROPIC_BASE_URL;
  const model = process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || 'claude-opus-4-5';
  return { apiKey, baseURL, model };
}

// ── GET /api/chat — returns server-side model configuration status ─────────────
export async function GET() {
  const { apiKey, model } = getConfig();
  if (!apiKey) return Response.json({ ok: false, model: null });
  return Response.json({ ok: true, model });
}

// ── POST /api/chat — runs Claude Agent SDK query, streams SSE back to client ───
export async function POST(req) {
  const { apiKey, baseURL, model } = getConfig();
  if (!apiKey) {
    return Response.json(
      { error: '服务端未配置 ANTHROPIC_AUTH_TOKEN 或 ANTHROPIC_API_KEY' },
      { status: 500 },
    );
  }

  const { messages, yamlCtx, mode } = await req.json();

  const BASE_PROMPT = mode === 'poc' ? POC_SYSTEM_PROMPT : FINGER_SYSTEM_PROMPT;
  const systemPrompt = yamlCtx
    ? `${BASE_PROMPT}\n\n# 当前编辑器内容\n\`\`\`yaml\n${yamlCtx}\n\`\`\``
    : BASE_PROMPT;

  // Build a single-turn prompt string that includes prior conversation history
  const history = messages.slice(0, -1).filter((m) => !m.streaming);
  const last = messages[messages.length - 1];
  const prompt =
    (history.length > 0
      ? history
          .map((m) => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
          .join('\n\n') + '\n\nHuman: '
      : '') + (last?.content ?? '');

  // Forward credentials into the Claude Code subprocess env
  const subprocessEnv = { ...process.env };
  if (!subprocessEnv.ANTHROPIC_API_KEY && subprocessEnv.ANTHROPIC_AUTH_TOKEN) {
    subprocessEnv.ANTHROPIC_API_KEY = subprocessEnv.ANTHROPIC_AUTH_TOKEN;
  }

  // Wire request abort signal to the SDK's AbortController
  const abortController = new AbortController();
  req.signal?.addEventListener('abort', () => abortController.abort(), { once: true });

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let accumulatedText = '';
      let resultSent = false;

      try {
        for await (const message of query({
          prompt,
          options: {
            systemPrompt,
            model,
            maxTurns: 1,
            tools: [],              // no built-in filesystem tools needed
            permissionMode: 'dontAsk',
            includePartialMessages: true,
            persistSession: false,
            abortController,
            env: subprocessEnv,
          },
        })) {
          // Real-time text streaming
          if (message.type === 'stream_event') {
            const ev = message.event;
            if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
              accumulatedText += ev.delta.text;
              send({ type: 'text_delta', content: ev.delta.text });
            }

          // Prefer the fully-assembled assistant message for YAML extraction
          } else if (message.type === 'assistant') {
            const full = message.message.content
              .filter((b) => b.type === 'text')
              .map((b) => b.text)
              .join('');
            if (full) accumulatedText = full;

          // Session complete
          } else if (message.type === 'result') {
            if (message.is_error) {
              send({ type: 'error', message: (message.errors ?? []).join(', ') || '执行错误' });
            } else {
              const yaml = extractYaml(accumulatedText);
              if (yaml) {
                send({ type: 'tool_use', name: 'update_yaml_editor', input: { yaml } });
              }
              send({ type: 'done' });
            }
            resultSent = true;
          }
        }

        if (!resultSent) send({ type: 'done' });
      } catch (err) {
        if (err?.name !== 'AbortError') {
          console.error('[chat/route] SDK error:', err);
          send({ type: 'error', message: err?.message || '请求失败' });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// Extract the first ```yaml / ```yml block from the response text
function extractYaml(text) {
  const match = text.match(/```ya?ml\r?\n([\s\S]+?)```/);
  return match ? match[1].trim() : null;
}
