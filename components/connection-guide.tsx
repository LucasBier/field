'use client';
import Link from 'next/link';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CodeBlock } from '@/components/code-block';

export function ConnectionGuide() {
  return (
    <Tabs defaultValue="local" className="guide-tabs">
      <TabsList aria-label="Model connection">
        <TabsTrigger value="local">Local · Ollama</TabsTrigger>
        <TabsTrigger value="hosted">Hosted · DeepSeek</TabsTrigger>
      </TabsList>
      <TabsContent value="local">
        <h3>Let your computer do the thinking.</h3>
        <p>
          Install{' '}
          <a
            href="https://ollama.com/download"
            target="_blank"
            rel="noreferrer"
          >
            Ollama
          </a>{' '}
          and download a chat model that supports JSON responses. Field lists
          models you already have; it does not download them for you.
        </p>
        <CodeBlock label="Check your installed models" code={'ollama list'} />
        <p>
          Allow your local Field address, then start Ollama. If another Ollama
          process is already running, quit it first. These examples start it in
          a terminal.
        </p>
        <Tabs defaultValue="unix" className="guide-os-tabs">
          <TabsList aria-label="Operating system">
            <TabsTrigger value="unix">macOS / Linux</TabsTrigger>
            <TabsTrigger value="windows">Windows PowerShell</TabsTrigger>
          </TabsList>
          <TabsContent value="unix">
            <CodeBlock
              label="macOS / Linux terminal"
              code={'OLLAMA_ORIGINS="http://localhost:3001" ollama serve'}
            />
          </TabsContent>
          <TabsContent value="windows">
            <CodeBlock
              label="Windows PowerShell"
              code={'$env:OLLAMA_ORIGINS="http://localhost:3001"\nollama serve'}
            />
          </TabsContent>
        </Tabs>
        <p>
          Open your local Field space, select the model connection button,
          choose <strong>Local model → Find local models</strong>, pick a model,
          and select <strong>Use this local model</strong>. Allow local-network
          access if your browser asks.
        </p>
        <p className="guide-note">
          Using the Ollama desktop app or a Linux service? Follow{' '}
          <a
            href="https://docs.ollama.com/faq#how-do-i-configure-ollama-server"
            target="_blank"
            rel="noreferrer"
          >
            Ollama’s environment settings
          </a>
          , then restart it. When connecting from a hosted Field site, use that
          site’s exact origin in OLLAMA_ORIGINS. Local inference alone does not
          move a hosted workspace onto your computer.
        </p>
      </TabsContent>
      <TabsContent value="hosted">
        <h3>Connect a hosted model.</h3>
        <p>
          Get an API key from{' '}
          <a
            href="https://platform.deepseek.com/api_keys"
            target="_blank"
            rel="noreferrer"
          >
            DeepSeek
          </a>
          . In your Field space, open the model connection button and select{' '}
          <strong>Hosted API</strong>.
        </p>
        <ol>
          <li>Choose DeepSeek V4 Flash or DeepSeek V4 Pro.</li>
          <li>Paste your key into the connection dialog.</li>
          <li>
            Select <strong>Use hosted model</strong> and send a message to
            verify it.
          </li>
        </ol>
        <p>
          No source-code change or environment file is needed. The key stays in
          the current tab’s memory and travels through Field’s server only when
          you send a model request. Reloading the page clears the connection.
        </p>
        <p className="guide-note">
          Your selected conversation context is sent to DeepSeek. Provider usage
          charges apply. The current adapter supports DeepSeek; other hosted
          providers require adapter work.
        </p>
        <Link className="guide-inline-link" href="/space">
          Open your space →
        </Link>
      </TabsContent>
    </Tabs>
  );
}
