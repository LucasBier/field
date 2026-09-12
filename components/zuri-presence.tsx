'use client';
import AgentScene from './agent-scene';

export default function ZuriPresence({
  status = 'Here with you',
  compact = false,
}: {
  status?: string;
  compact?: boolean;
}) {
  return (
    <figure
      className={`zuri-presence${compact ? ' zuri-presence-compact' : ''}`}
    >
      <div className="zuri-presence-model">
        <AgentScene
          compact
          framing="follow"
          busy={status === 'In motion'}
          greeting={status === 'Placed' ? 1 : 0}
        />
      </div>
      <figcaption>
        <strong>Zuri</strong>
        <span aria-live="polite">{status}</span>
      </figcaption>
    </figure>
  );
}
