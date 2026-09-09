'use client';
import { useState } from 'react';
import Link from 'next/link';
import { NiaStudio } from '@/components/nia-studio';
export default function SocialConnection() {
  const [key, setKey] = useState(''),
    [result, setResult] = useState(''),
    [busy, setBusy] = useState(false);
  async function run(action: string) {
    setBusy(true);
    setResult('');
    try {
      const r = await fetch('/api/social/x', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + key,
        },
        body: JSON.stringify({ action }),
      });
      const data = (await r.json()) as {
        error?: string;
        url?: string;
        user?: { username: string };
        verified?: boolean;
      };
      if (!r.ok) {
        setResult(`Connection needs attention: ${data.error}.`);
        return;
      }
      if (data.url) {
        setKey('');
        window.location.assign(data.url);
        return;
      }
      setResult(
        data.user
          ? `${data.verified ? 'Verified' : 'Connected'} as @${data.user.username}. Automatic posting is off.`
          : 'No X account connected.',
      );
    } catch {
      setResult(
        'The connection could not be confirmed. Try checking its status.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      style={{
        maxWidth: 820,
        margin: '80px auto',
        padding: '0 24px',
        fontSize: 16,
        lineHeight: 1.6,
      }}
    >
      <Link href="/" style={{ color: '#784be8' }}>
        Field
      </Link>
      <h1 style={{ fontSize: 36, margin: '28px 0 12px' }}>
        Nia’s X connection
      </h1>
      <p>
        Connect Nia’s account to Field. Only the account owner can manage this
        connection.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run('status');
        }}
      >
        <label htmlFor="owner-key">Owner access key</label>
        <input
          id="owner-key"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          style={{
            display: 'block',
            width: '100%',
            padding: 12,
            border: '1px solid #ccc',
            borderRadius: 8,
            margin: '8px 0 20px',
          }}
        />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            ['status', 'Check connection'],
            ['connect', 'Connect X'],
            ['verify', 'Verify with X'],
          ].map(([action, label]) => (
            <button
              key={action}
              type="button"
              disabled={busy || !key}
              onClick={() => void run(action)}
              style={{
                padding: '12px 18px',
                background: action === 'connect' ? '#784be8' : '#eeeaf6',
                color: action === 'connect' ? 'white' : '#302246',
                border: 0,
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </form>
      <output style={{ display: 'block', marginTop: 24 }}>
        {busy ? 'Checking…' : result}
      </output>
      <p style={{ color: '#665d75', marginTop: 32 }}>
        Connecting does not publish a post. Verification reads the connected
        account through X’s API and may use API credits.
      </p>
      <NiaStudio ownerKey={key} />
    </main>
  );
}
