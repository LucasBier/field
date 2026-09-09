'use client';
import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { repairSample } from '@/lib/story-sample';
import { applyMemoryRepair, previewMemoryRepair } from '@/lib/memory-repair';
import { entityContext } from '@/lib/entity';

const correction =
  'I avoided parties during a difficult month. Ask what sounds good now.';
const revisedPlan = 'Ask what I feel like doing this weekend.';

export function MemoryRepairWalkthrough({ quiet }: { quiet: boolean }) {
  const [sample, setSample] = useState(repairSample);
  const [phase, setPhase] = useState<'before' | 'review' | 'after'>('before');
  const [rewrite, setRewrite] = useState(false);
  const [adapter, setAdapter] = useState('Local');
  const context = entityContext(sample, 'parties this weekend');
  function confirm() {
    const preview = previewMemoryRepair(sample, 'sample-social', correction);
    setSample(
      applyMemoryRepair(
        sample,
        preview,
        preview.items.map((item) => ({
          key: item.key,
          action: rewrite ? 'rewrite' : 'keep',
          text: revisedPlan,
        })),
      ),
    );
    setPhase('after');
  }
  return (
    <div className="walkthrough repair-walkthrough">
      <div className="walkthrough-top">
        <span>ROOM TO CHANGE</span>
        <b>Sample data</b>
      </div>
      <div
        className="repair-walkthrough-steps"
        aria-label="Correction progress"
      >
        {['before', 'review', 'after'].map((step, index) => (
          <span key={step} aria-current={phase === step ? 'step' : undefined}>
            {index + 1}. {['Remember', 'Reconsider', 'Continue'][index]}
          </span>
        ))}
      </div>
      <motion.div
        className="repair-walkthrough-body"
        key={phase}
        initial={false}
        animate={quiet ? {} : { opacity: [0.5, 1], y: [8, 0] }}
        transition={{ duration: 0.25 }}
        aria-live="polite"
      >
        {phase === 'before' ? (
          <>
            <span className="repair-label">SOMETHING SHE REMEMBERS</span>
            <p className="repair-quote">“I do not like parties.”</p>
            <div className="repair-plan">
              <span>THE WEEKEND PLAN</span>
              <p>{sample.entity!.tasks[0].title}</p>
            </div>
            <p className="repair-walkthrough-copy">
              But a difficult month is not the whole of you.
            </p>
            <button
              className="walkthrough-primary"
              onClick={() => setPhase('review')}
            >
              Help her understand <ArrowRight size={15} />
            </button>
          </>
        ) : phase === 'review' ? (
          <>
            <span className="repair-label">WHAT YOU MEAN NOW</span>
            <p className="repair-quote repair-quote-small">“{correction}”</p>
            <div className="repair-plan">
              <span>REVIEW THE PLAN</span>
              <p>{rewrite ? revisedPlan : sample.entity!.tasks[0].title}</p>
              <div className="repair-choice">
                <button
                  aria-pressed={!rewrite}
                  onClick={() => setRewrite(false)}
                >
                  Keep the plan
                </button>
                <button aria-pressed={rewrite} onClick={() => setRewrite(true)}>
                  Leave it open
                </button>
              </div>
            </div>
            <p className="repair-walkthrough-copy">
              The old memory leaves recall. Only the plan change you choose is
              applied.
            </p>
            <button className="walkthrough-primary" onClick={confirm}>
              Confirm correction <ArrowRight size={15} />
            </button>
          </>
        ) : (
          <>
            <span className="repair-label">
              READY FOR THE NEXT CONVERSATION
            </span>
            <p className="repair-quote repair-quote-small">
              {context.memories.find((m) => m.supersedes)?.text}
            </p>
            <div className="repair-plan">
              <span>YOUR REVIEWED PLAN</span>
              <p>{sample.entity!.tasks[0].title}</p>
            </div>
            <div className="repair-context-preview">
              <span>Context preview</span>
              <div className="repair-choice">
                {['Local', 'Hosted'].map((name) => (
                  <button
                    key={name}
                    aria-pressed={adapter === name}
                    onClick={() => setAdapter(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <p>{adapter} adapter · current memory only. No model call.</p>
            </div>
            <details className="repair-history-preview">
              <summary>What happened to the old memory?</summary>
              <p>
                “{sample.memories.find((m) => m.id === 'sample-social')!.text}”
              </p>
              <span>Kept as an earlier version. Excluded from recall.</span>
            </details>
            <Link href="/space" className="walkthrough-primary">
              Make room for your story <ArrowRight size={15} />
            </Link>
          </>
        )}
      </motion.div>
      <div className="walkthrough-bottom">
        <span>Real correction logic · no account needed</span>
        {phase !== 'before' && (
          <button
            onClick={() => {
              setSample(repairSample());
              setPhase('before');
              setRewrite(false);
              setAdapter('Local');
            }}
          >
            <RotateCcw size={12} /> Start again
          </button>
        )}
      </div>
    </div>
  );
}
