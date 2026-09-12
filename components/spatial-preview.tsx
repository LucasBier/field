'use client';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Zone } from '@/lib/entity-schema';
import { useFieldReducedMotion } from '@/components/field-story';
const AgentScene = lazy(() => import('@/components/agent-scene'));
export function SpatialPreview() {
  const [zone, setZone] = useState<Zone>('center');
  const [nearby, setNearby] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const paused = useFieldReducedMotion();
  useEffect(() => {
    if (!host.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearby(true);
          observer.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="field-spatial-preview" ref={host}>
      {nearby && (
        <Suspense
          fallback={
            <span className="field-preview-hint">Preparing the space…</span>
          }
        >
          <AgentScene compact zone={zone} onMove={setZone} paused={paused} />
        </Suspense>
      )}
      <div className="field-preview-label">ZURI / LIVE 3D PREVIEW</div>
      <div className="field-preview-locations" aria-label="Zuri’s location">
        {(['desk', 'center', 'window'] as Zone[]).map((z) => (
          <button key={z} aria-pressed={zone === z} onClick={() => setZone(z)}>
            {z}
          </button>
        ))}
      </div>
      <span className="field-preview-hint">
        Drag to orbit · Select a place to move
      </span>
    </div>
  );
}
