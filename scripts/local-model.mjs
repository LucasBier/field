import { spawn } from 'node:child_process';

const mode = process.argv[2];
if (!['serve', 'pull'].includes(mode))
  throw new Error('Use model:serve or model:pull.');
const child = spawn(
  'ollama',
  mode === 'serve' ? ['serve'] : ['pull', 'qwen3.5:9b'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      OLLAMA_HOST: '127.0.0.1:11434',
      OLLAMA_NO_CLOUD: '1',
      OLLAMA_ORIGINS: 'http://localhost:3001,http://127.0.0.1:3001',
      OLLAMA_NUM_PARALLEL: '1',
      OLLAMA_MAX_LOADED_MODELS: '1',
      OLLAMA_MAX_QUEUE: '4',
      OLLAMA_CONTEXT_LENGTH: '16384',
      OLLAMA_FLASH_ATTENTION: '1',
      OLLAMA_KV_CACHE_TYPE: 'q8_0',
    },
  },
);
child.on('error', () => {
  process.stderr.write(
    'Ollama is not installed or could not start. Install it from https://ollama.com/download, then retry.\n',
  );
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
