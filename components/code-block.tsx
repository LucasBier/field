'use client';
import { useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CodeBlock({
  code,
  label = 'Terminal',
}: {
  code: string;
  label?: string;
}) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle');
  const content = useRef<HTMLElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setStatus('copied');
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      if (content.current && selection) {
        range.selectNodeContents(content.current);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setStatus('manual');
    }
  }
  return (
    <div className="field-code">
      <div className="field-code-bar">
        <span>{label}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={copy}
          aria-label={`Copy ${label}`}
        >
          {status === 'copied' ? <Check size={14} /> : <Copy size={14} />}
          <span aria-live="polite">
            {status === 'copied'
              ? 'Copied'
              : status === 'manual'
                ? 'Press Ctrl/Cmd + C'
                : 'Copy'}
          </span>
        </Button>
      </div>
      <pre>
        <code ref={content}>{code}</code>
      </pre>
    </div>
  );
}
