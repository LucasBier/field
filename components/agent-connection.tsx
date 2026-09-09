'use client';
import { useState } from 'react';
import {
  Cpu,
  Cloud,
  CircleDot,
  Check,
  ArrowUpRight,
  Loader2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectValue,
  SelectItem,
} from '@/components/ui/select';
import { discoverLocalModels, type AgentConnection } from '@/lib/inference';
import type { SiteAccess } from '@/lib/hosted-config';
export default function AgentConnectionDialog({
  open,
  onOpenChange,
  connection,
  onConnect,
  site,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  connection: AgentConnection;
  onConnect: (c: AgentConnection) => void;
  site: SiteAccess | null;
}) {
  const [key, setKey] = useState(''),
    [model, setModel] = useState('deepseek-v4-flash'),
    [models, setModels] = useState<string[]>([]),
    [localModel, setLocalModel] = useState(''),
    [checking, setChecking] = useState(false),
    [notice, setNotice] = useState('');
  const detect = async () => {
    setChecking(true);
    setNotice('');
    try {
      const found = await discoverLocalModels();
      setModels(found);
      setLocalModel(found[0] || '');
      setNotice(
        found.length
          ? `${found.length} installed model${found.length === 1 ? '' : 's'} found.`
          : 'Ollama is running, but no models are installed.',
      );
    } catch {
      setNotice(
        'Ollama is not reachable from this browser. Start it locally and follow the connection notes below.',
      );
    } finally {
      setChecking(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setKey('');
      }}
    >
      <DialogContent className="agent-dialog sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Choose how your agent thinks</DialogTitle>
          <DialogDescription>
            The connection changes. Your agent’s identity, memories,
            relationships, and tasks stay.
          </DialogDescription>
        </DialogHeader>
        <div className="site-connection-card">
          <strong>Talk with Nia</strong>
          <p>
            {site?.provider === 'ollama'
              ? site.enabled
                ? 'Running on this computer. Your conversations stay local, with no model key or per-message API fee.'
                : 'The local model is offline. Start Ollama on this computer to talk with Nia.'
              : site?.enabled
                ? 'Provided by Field. No model key or installation needed. Your selected conversation context is sent to DeepSeek.'
                : 'Shared conversations are not enabled on this installation yet. Room controls are available. Connect your model below to start talking.'}
          </p>
          {site?.enabled && (
            <>
              <p>
                {site.remaining} messages left today. Resets at{' '}
                {site.resetAt
                  ? new Date(site.resetAt).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : 'midnight UTC'}
                .
              </p>
              <Button
                disabled={!site.model}
                onClick={() => {
                  onConnect({ provider: 'site', model: site.model! });
                  onOpenChange(false);
                }}
              >
                Use Field’s connection
              </Button>
            </>
          )}
        </div>
        <Tabs
          defaultValue={connection.provider === 'ollama' ? 'local' : 'hosted'}
        >
          <TabsList className="w-full">
            <TabsTrigger value="hosted">
              <Cloud size={16} />
              Hosted API
            </TabsTrigger>
            <TabsTrigger value="local">
              <Cpu size={16} />
              Local model
            </TabsTrigger>
          </TabsList>
          <TabsContent value="hosted" className="connection-tab">
            <label htmlFor="hosted-model">Model</label>
            <Select value={model} onValueChange={(v) => v && setModel(v)}>
              <SelectTrigger id="hosted-model" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deepseek-v4-flash">
                  DeepSeek V4 Flash
                </SelectItem>
                <SelectItem value="deepseek-v4-pro">DeepSeek V4 Pro</SelectItem>
              </SelectContent>
            </Select>
            <label htmlFor="hosted-key">DeepSeek API key</label>
            <Input
              id="hosted-key"
              type="password"
              autoComplete="off"
              maxLength={256}
              placeholder="Kept only for this browser session"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <p>
              The selected context, including recent memories, relationships,
              tasks, and messages, is sent to DeepSeek when you send a message.
              Provider charges apply. Your key is not saved or exported.
            </p>
            <Button
              disabled={!/^[-A-Za-z0-9_.]{10,256}$/.test(key.trim())}
              onClick={() => {
                onConnect({ provider: 'deepseek', model, key: key.trim() });
                setKey('');
                onOpenChange(false);
              }}
            >
              Use hosted model
              <ArrowUpRight size={16} />
            </Button>
            <a
              href="https://platform.deepseek.com/api_keys"
              target="_blank"
              rel="noreferrer"
            >
              Get a DeepSeek key
              <ArrowUpRight size={14} />
            </a>
          </TabsContent>
          <TabsContent value="local" className="connection-tab">
            <p>
              Connect directly from this browser to Ollama on your computer.
              Your prompts go to localhost. This hosted workspace still stores
              your agent data in Field’s database.
            </p>
            <Button
              variant="outline"
              onClick={() => void detect()}
              disabled={checking}
            >
              {checking ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Cpu size={16} />
              )}
              Find local models
            </Button>
            {models.length > 0 && (
              <>
                <label htmlFor="local-model">Installed model</label>
                <Select
                  value={localModel}
                  onValueChange={(v) => v && setLocalModel(v)}
                >
                  <SelectTrigger id="local-model" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  disabled={!localModel}
                  onClick={() => {
                    onConnect({ provider: 'ollama', model: localModel });
                    onOpenChange(false);
                  }}
                >
                  Use this local model
                  <Check size={16} />
                </Button>
              </>
            )}
            <details className="local-setup">
              <summary>Connection notes</summary>
              <p>
                Install Ollama, download a model that supports JSON responses,
                and start the service on localhost:11434. Allow this Field site
                in OLLAMA_ORIGINS. Your browser may ask for local-network
                access.
              </p>
              <code>
                {'OLLAMA_ORIGINS="http://localhost:3001" ollama serve'}
              </code>
              <p>
                On macOS, if you use the Ollama app, set this environment
                variable with launchctl and restart Ollama. For a fully local
                workspace, run Field locally as well.
              </p>
              <a
                href="https://docs.ollama.com/faq"
                target="_blank"
                rel="noreferrer"
              >
                Ollama setup reference
                <ArrowUpRight size={14} />
              </a>
            </details>
          </TabsContent>
        </Tabs>
        <output className="connection-notice">{notice}</output>
        <div className="connection-demo">
          <CircleDot size={17} />
          <div>
            <strong>Explore without a model</strong>
            <p>
              Keep room controls available while conversations are disconnected.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              onConnect({ provider: 'demo' });
              onOpenChange(false);
            }}
          >
            Disconnect
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
