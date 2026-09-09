// Offline HTTP fixture. Only bind loopback; never use it as an AI provider.
import { createServer } from 'node:http';
const calls = [];
const pending = new Map();
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/calls') {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(calls));
    return;
  }
  if (url.pathname === '/release') {
    pending.get(url.searchParams.get('message'))?.();
    response.end('released');
    return;
  }
  if (request.method !== 'POST' || url.pathname !== '/chat/completions') {
    response.writeHead(404).end();
    return;
  }
  try {
    let raw = '';
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 100000) throw new Error('Fixture input limit');
    }
    const body = JSON.parse(raw),
      payload = JSON.parse(body.messages.at(-1).content);
    const message = payload.request;
    calls.push({ message, context: payload.context, model: body.model });
    if (message.startsWith('FAIL')) {
      response.writeHead(503).end('Private fixture upstream detail');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = (data) => response.write(`data: ${JSON.stringify(data)}\n\n`);
    const reply = JSON.stringify({
      reply: 'Mock response only.',
      actions: message.startsWith('INVALID')
        ? [{ type: 'invalid' }]
        : [{ type: 'task', title: 'Fixture plan only' }],
    });
    send({ choices: [{ delta: { content: reply.slice(0, 22) } }] });
    if (message.startsWith('HOLD')) {
      await new Promise((resolve) => {
        pending.set(message, resolve);
        response.on('close', resolve);
      });
      pending.delete(message);
    }
    if (response.destroyed) return;
    send({ choices: [{ delta: { content: reply.slice(22) } }] });
    if (!message.startsWith('TRUNCATED')) {
      send({
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 },
      });
      response.write('data: [DONE]\n\n');
    }
    response.end();
  } catch {
    if (!response.headersSent) response.writeHead(400);
    response.end();
  }
});
server.listen(Number(process.env.FIELD_FIXTURE_PORT || 3003), '127.0.0.1', () =>
  process.stdout.write('Offline provider fixture ready.\n'),
);
