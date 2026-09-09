'use client';
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import {
  MotionConfig,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  Cpu,
  Database,
  Download,
  Fingerprint,
  Globe2,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { CodeBlock } from '@/components/code-block';
import { MemoryRepairWalkthrough } from '@/components/memory-repair-walkthrough';
import { applyEntityActions } from '@/lib/entity';
import { storySample } from '@/lib/story-sample';
import { canonicalWorkspace } from '@/lib/validation';

const QuietMotion = createContext(false);
export const useFieldReducedMotion = () => useContext(QuietMotion);
export function FieldMotion({ children }: { children: ReactNode }) {
  const prefersReduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const quiet = !!prefersReduced || paused;
  const { scrollYProgress } = useScroll();
  return (
    <QuietMotion.Provider value={quiet}>
      <MotionConfig reducedMotion={quiet ? 'always' : 'user'}>
        <motion.div
          className="field-reading-progress"
          style={{ scaleX: scrollYProgress }}
          aria-hidden="true"
        />
        {children}
        <button
          className="field-motion-toggle"
          aria-pressed={quiet}
          onClick={() => setPaused(!paused)}
          disabled={!!prefersReduced}
          title={
            prefersReduced
              ? 'Reduced motion follows your system preference'
              : 'Toggle page motion'
          }
        >
          {quiet ? <Play size={13} /> : <Pause size={13} />}
          <span>{quiet ? 'Motion off' : 'Pause motion'}</span>
        </button>
      </MotionConfig>
    </QuietMotion.Provider>
  );
}

export function PortraitMotion({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const quiet = useContext(QuietMotion);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, -65]);
  const rotate = useSpring(0, { stiffness: 160, damping: 24 });
  return (
    <motion.figure
      ref={ref}
      className="field-entry-art"
      style={{ y: quiet ? 0 : y, rotate: quiet ? 0 : rotate }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse' || quiet) return;
        const box = e.currentTarget.getBoundingClientRect();
        rotate.set(((e.clientX - box.left - box.width / 2) / box.width) * 3);
      }}
      onPointerLeave={() => rotate.set(0)}
    >
      {children}
      <span className="field-portrait-seal">A continuing story</span>
    </motion.figure>
  );
}

export function Reveal({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const quiet = useContext(QuietMotion);
  return (
    <motion.div
      className={className}
      initial={false}
      whileInView={quiet ? {} : { y: [22, 0], opacity: [0.6, 1] }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

const chapters = [
  {
    number: '01',
    label: 'CHANGE',
    title: (
      <>
        A moment in your life.
        <br />
        <em>Not a definition of you.</em>
      </>
    ),
    text: 'You once needed quiet. Today you might want company. A continuing relationship needs room for a different answer.',
    technical:
      'Correct an understanding. Review the plans around it. Keep the earlier version in history while current memory shapes the next conversation.',
  },
  {
    number: '02',
    label: 'AGENCY',
    title: (
      <>
        A thought becomes
        <br />
        <em>something shared.</em>
      </>
    ),
    text: 'Leave a thought by the window. Make a plan at the desk. Give Nia a way to participate in your world, with boundaries that belong to you.',
    technical:
      'Typed actions pass through permissions before anything changes. Every committed action leaves a receipt.',
  },
  {
    number: '03',
    label: 'CONTINUITY',
    title: (
      <>
        Different models.
        <br />
        <em>The same Nia.</em>
      </>
    ),
    text: 'More capable models will come. New bodies and new spaces will follow. The relationship you have built should be able to come with you.',
    technical:
      'Identity lives outside inference. Local and hosted connections share one state and action contract. Export the history you own.',
  },
];

function MemoryWalkthrough() {
  const quiet = useContext(QuietMotion);
  return <MemoryRepairWalkthrough quiet={quiet} />;
}

function ActionWalkthrough() {
  const [sample, setSample] = useState(storySample);
  const [outcome, setOutcome] = useState<'ready' | 'applied' | 'blocked'>(
    'ready',
  );
  const allowed = sample.entity!.permissions.notes;
  function apply() {
    try {
      setSample(
        applyEntityActions(
          sample,
          [
            { type: 'move', zone: 'window' },
            {
              type: 'note',
              text: 'Let’s pick this up tomorrow.',
              zone: 'window',
            },
          ],
          'agent',
          'Sample',
        ),
      );
      setOutcome('applied');
    } catch {
      setOutcome('blocked');
    }
  }
  return (
    <div className="walkthrough action-walkthrough">
      <div className="walkthrough-top">
        <ShieldCheck size={17} />
        <span>THE ACTION CONTRACT</span>
        <b>Sample data</b>
      </div>
      <div className="walkthrough-intent">
        <span>YOUR REQUEST</span>
        <p>
          “Go to the window.
          <br />
          Leave a note for tomorrow.”
        </p>
      </div>
      <div className="walkthrough-pipeline">
        <span>Intent</span>
        <ArrowRight size={12} />
        <span>Permission</span>
        <ArrowRight size={12} />
        <span>Commit</span>
      </div>
      <div className="walkthrough-permission">
        <span>Allow notes</span>
        <button
          role="switch"
          aria-checked={allowed}
          aria-label="Allow notes in the sample"
          onClick={() => {
            setSample((w) => ({
              ...w,
              entity: {
                ...w.entity!,
                permissions: { ...w.entity!.permissions, notes: !allowed },
              },
            }));
            setOutcome('ready');
          }}
        >
          <i />
        </button>
      </div>
      <div
        className={`walkthrough-outcome outcome-${outcome}`}
        aria-live="polite"
      >
        {outcome === 'ready' ? (
          <>
            <ShieldCheck size={19} />
            <p>Turn the permission off and try the same request.</p>
          </>
        ) : outcome === 'blocked' ? (
          <>
            <X size={19} />
            <p>Batch rejected. Position and notes stayed unchanged.</p>
          </>
        ) : (
          <>
            <CheckCheck size={19} />
            <p>Moved to the window. Note created. Two receipts saved.</p>
          </>
        )}
      </div>
      <div className="walkthrough-action-buttons">
        <button
          className="walkthrough-primary"
          disabled={sample.entity!.notes.length >= 40}
          onClick={apply}
        >
          Run the action <ArrowUpRight size={15} />
        </button>
        <button
          aria-label="Reset action sample"
          onClick={() => {
            setSample(storySample());
            setOutcome('ready');
          }}
        >
          <RotateCcw size={15} />
        </button>
      </div>
      <div className="walkthrough-bottom">
        <span>Position: {sample.entity!.zone}</span>
        <span>
          {sample.entity!.notes.length} notes · {sample.entity!.receipts.length}{' '}
          receipts
        </span>
      </div>
    </div>
  );
}

function ContinuityWalkthrough() {
  const [model, setModel] = useState('Local');
  const sample = storySample();
  function download() {
    const data = new Blob(
      [
        JSON.stringify(
          {
            format: 'field-agent',
            version: 2,
            workspace: canonicalWorkspace(sample),
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nia-sample-agent.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="walkthrough continuity-walkthrough">
      <div className="walkthrough-top">
        <Fingerprint size={17} />
        <span>THE CONTINUING IDENTITY</span>
        <b>Sample data</b>
      </div>
      <div className="walkthrough-identity">
        <div className="identity-orbit">
          <Fingerprint size={52} strokeWidth={0.8} />
        </div>
        <h3>Nia</h3>
        <p>nia-sample-01</p>
      </div>
      <div
        className="walkthrough-models"
        aria-label="Illustrate a model handoff"
      >
        {['Local', 'Hosted'].map((name) => (
          <button
            key={name}
            aria-pressed={name === model}
            onClick={() => setModel(name)}
          >
            {name === 'Local' ? <Cpu size={17} /> : <Globe2 size={17} />}
            {name}
            {name === model && <Check size={13} />}
          </button>
        ))}
      </div>
      <div className="walkthrough-continuity-status" aria-live="polite">
        <span>{model} adapter selected</span>
        <p>
          Same ID. Same {sample.memories.length} memories. Same permissions.
        </p>
      </div>
      <button className="walkthrough-export" onClick={download}>
        <Download size={14} /> Download sample agent <ArrowUpRight size={14} />
      </button>
      <div className="walkthrough-bottom">
        <span>Portable JSON · credentials excluded</span>
        <span>No model call</span>
      </div>
    </div>
  );
}

const demos = [MemoryWalkthrough, ActionWalkthrough, ContinuityWalkthrough];
export function ContinuityStory() {
  const region = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const quiet = useContext(QuietMotion);
  const { scrollYProgress } = useScroll({
    target: region,
    offset: ['start center', 'end center'],
  });
  useMotionValueEvent(scrollYProgress, 'change', (value) =>
    setActive(Math.min(2, Math.max(0, Math.floor(value * 3)))),
  );
  return (
    <section className="continuity-story" id="continuity">
      <Reveal className="story-section-heading">
        <p className="field-eyebrow">
          THE WORLD CHANGES. YOUR STORY CONTINUES.
        </p>
        <h2>
          What makes a presence
          <br />
          <em>feel like someone?</em>
        </h2>
        <p>Memory, agency, and a place to return to.</p>
      </Reveal>
      <div className="story-scroll-grid" ref={region}>
        <div className="story-chapters">
          {chapters.map((chapter, i) => {
            const Demo = demos[i];
            return (
              <article
                className={`story-chapter ${active === i ? 'is-active' : ''}`}
                id={`chapter-${i}`}
                key={chapter.number}
              >
                <p className="field-eyebrow">
                  <span>{chapter.number}</span> / {chapter.label}
                </p>
                <h3>{chapter.title}</h3>
                <p>{chapter.text}</p>
                <div className="story-technical">
                  <span />
                  <p>{chapter.technical}</p>
                </div>
                <div className="story-mobile-demo">
                  <Demo />
                </div>
              </article>
            );
          })}
        </div>
        <div className="story-sticky-stage">
          <div className="story-stage-progress" aria-label="Story chapters">
            {chapters.map((chapter, i) => (
              <a
                key={chapter.number}
                href={`#chapter-${i}`}
                aria-current={active === i ? 'step' : undefined}
              >
                <span>{chapter.number}</span>
                {chapter.label}
              </a>
            ))}
          </div>
          <div className="story-stage-panels">
            {demos.map((Demo, i) => (
              <motion.div
                key={i}
                className="story-stage-panel"
                inert={i !== active}
                aria-hidden={i !== active}
                initial={false}
                animate={{
                  opacity: i === active ? 1 : 0,
                  y: quiet ? 0 : i === active ? 0 : 12,
                }}
                transition={{ duration: quiet ? 0 : 0.35 }}
                style={{
                  pointerEvents: i === active ? 'auto' : 'none',
                  zIndex: i === active ? 1 : 0,
                }}
              >
                <Demo />
              </motion.div>
            ))}
          </div>
          <p className="story-stage-footnote">
            Interactive walkthroughs · your saved space is untouched.
          </p>
        </div>
      </div>
    </section>
  );
}

export function RuntimeArchitecture() {
  return (
    <section className="field-runtime-section" id="architecture">
      <Reveal>
        <div className="field-runtime-heading">
          <div>
            <p className="field-eyebrow">A COMPANION DESERVES A FOUNDATION.</p>
            <h2>
              Continuity,
              <br />
              <em>by architecture.</em>
            </h2>
          </div>
          <p>
            Models generate a moment.
            <br />
            Field carries what comes next.
          </p>
        </div>
        <div className="field-architecture-flow">
          <div>
            <span>01 / UNDERSTAND</span>
            <Database size={27} strokeWidth={1} />
            <h3>Recall the context.</h3>
            <p>
              Identity, relationships, relevant memories, and recent
              conversation.
            </p>
            <b>BOUNDED · INSPECTABLE</b>
          </div>
          <ArrowRight className="architecture-arrow" size={22} />
          <div>
            <span>02 / REASON</span>
            <Cpu size={27} strokeWidth={1} />
            <h3>Choose the model.</h3>
            <p>
              Browser-to-Ollama locally. A server adapter for hosted DeepSeek.
            </p>
            <b>ONE RESPONSE CONTRACT</b>
          </div>
          <ArrowRight className="architecture-arrow" size={22} />
          <div>
            <span>03 / PARTICIPATE</span>
            <ShieldCheck size={27} strokeWidth={1} />
            <h3>Make it accountable.</h3>
            <p>
              Validate actions, check permissions, and commit results with a run
              record.
            </p>
            <b>ALL OR NOTHING</b>
          </div>
        </div>
        <Accordion
          className="field-architecture-details"
          defaultValue={['memory']}
        >
          <AccordionItem value="memory">
            <AccordionTrigger>
              01 / What actually goes into memory?
            </AccordionTrigger>
            <AccordionContent>
              <p>
                You decide what to keep. Saved statements retain their source;
                lab findings carry a frozen calculation. BM25 keyword retrieval
                selects up to eight memories within a 6,000-character text
                budget, prioritizing pinned entries. You can preview recall and
                correct or delete records in Memory. Corrections retain earlier
                versions outside recall, let you review plans and room notes,
                and start a fresh conversation context.
              </p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="runtime">
            <AccordionTrigger>
              02 / How do I know what happened?
            </AccordionTrigger>
            <AccordionContent>
              <p>
                Runtime shows each request’s selected memory IDs, ranking
                reasons, completion status, duration, provider token counts when
                available, and action receipts. Responses and actions commit
                together. An interrupted request stays unfinished until it
                reports a result. These are inspectable application records, not
                hidden model reasoning.
              </p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="ownership">
            <AccordionTrigger>
              03 / What belongs to the model, and what belongs to me?
            </AccordionTrigger>
            <AccordionContent>
              <p>
                The model supplies a response. Field stores the identity,
                history, relationships, permissions, and tasks independently.
                Exports preserve that state and exclude credentials. Local and
                hosted models are selected explicitly; there is no automatic
                paid fallback.
              </p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="horizon">
            <AccordionTrigger>
              04 / Where does the world go from here?
            </AccordionTrigger>
            <AccordionContent>
              <p>
                Voice, richer bodies, spatial perception, and device adapters
                are the next horizon. The current foundation is a virtual
                desktop, persistent state, and a bounded action runtime. Each
                new surface should join that continuing identity through
                explicit permissions and observable actions.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <Link href="/docs#runtime" className="field-text-link">
          Read the runtime guide <ArrowUpRight size={16} />
        </Link>
      </Reveal>
    </section>
  );
}

export function SetupConsole() {
  return (
    <section className="field-build-section" id="setup">
      <Reveal className="field-build-grid">
        <div>
          <p className="field-eyebrow">FROM A VISION TO YOUR MACHINE</p>
          <h2>
            Build a world
            <br />
            <em>she can call home.</em>
          </h2>
          <p>
            Start with the source. Connect your model. Shape the companion, the
            tools, and the space around her.
          </p>
          <a
            href="/downloads/field-source.zip"
            download
            className="field-solid-link"
          >
            <ArrowDown size={16} /> Download source
          </a>
          <Link href="/docs" className="field-install-help">
            Full setup guide <ArrowUpRight size={14} />
          </Link>
        </div>
        <Tabs defaultValue="install" className="field-setup-tabs">
          <TabsList aria-label="Setup steps">
            <TabsTrigger value="install">01 / Install</TabsTrigger>
            <TabsTrigger value="connect">02 / Connect</TabsTrigger>
            <TabsTrigger value="shape">03 / Shape</TabsTrigger>
          </TabsList>
          <TabsContent value="install">
            <h3>A few commands. A place to begin.</h3>
            <p>
              Extract the source. Open a terminal in its folder. Use Node.js
              22.13 or newer.
            </p>
            <CodeBlock
              label="Terminal"
              code={'npm ci\nnpm run db:setup\nnpm run dev -- --port 3001'}
            />
            <p>
              Open{' '}
              <a href="http://localhost:3001/space">localhost:3001/space</a>.
              The room works without a model key.
            </p>
          </TabsContent>
          <TabsContent value="connect">
            <h3>Your machine, or a frontier API.</h3>
            <p>
              With Ollama installed and running, check your available models:
            </p>
            <CodeBlock label="Ollama" code={'ollama list'} />
            <p>
              In your space, choose{' '}
              <strong>Connect model → Local Ollama</strong>. Select an installed
              model with JSON support. For hosted inference, select DeepSeek and
              enter your key.
            </p>
            <Link href="/docs#models" className="field-install-help">
              Origins, model setup & connection help <ArrowUpRight size={14} />
            </Link>
          </TabsContent>
          <TabsContent value="shape">
            <h3>Give her room to grow.</h3>
            <p>
              Set the name and personality in Identity. Choose which actions she
              can take. The default action permissions live in:
            </p>
            <CodeBlock
              label="lib/entity.ts · newEntity()"
              code={
                'permissions: {\n  move: true,\n  notes: true,\n  tasks: true,\n}'
              }
            />
            <p>
              Existing companions keep their saved settings. Change those in the
              Identity panel.
            </p>
          </TabsContent>
        </Tabs>
      </Reveal>
    </section>
  );
}

export function FieldColophon() {
  const ref = useRef<HTMLDivElement>(null);
  const quiet = useContext(QuietMotion);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end end'],
  });
  const spacing = useTransform(scrollYProgress, [0, 1], ['0.09em', '-0.06em']);
  return (
    <div className="field-colophon" ref={ref}>
      <p>A presence worth returning to.</p>
      <motion.div
        aria-hidden="true"
        style={{ letterSpacing: quiet ? '-0.06em' : spacing }}
      >
        FIELD
      </motion.div>
      <span>ONE COMPANION. AN OPEN HORIZON.</span>
    </div>
  );
}
