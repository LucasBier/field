import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { CodeBlock } from '@/components/code-block';
import { ConnectionGuide } from '@/components/connection-guide';

export const metadata: Metadata = {
  title: 'Field — Setup & configuration',
  description:
    'Run Field locally, connect an AI model, customize Nia, and keep control of your workspace.',
};

export default function Docs() {
  return (
    <main className="field-docs">
      <header className="field-site-nav">
        <Link href="/">← Overview</Link>
        <Link href="/" className="field-wordmark">
          FIELD<span>DOCUMENTATION</span>
        </Link>
        <Link href="/space">
          Open space <ArrowUpRight size={16} />
        </Link>
      </header>
      <div className="field-guide-head">
        <p className="field-eyebrow">THE FIELD GUIDE / 01</p>
        <h1>A place to begin.</h1>
        <p>
          Give a persistent companion a place to live in your day.
          <br />
          Run Field. Connect a model. Begin a history you can keep.
        </p>
        <a
          className="field-solid-link"
          href="/downloads/field-source.zip"
          download
        >
          <ArrowDown size={16} /> Download source
        </a>
      </div>
      <nav className="field-guide-index" aria-label="Guide sections">
        <a href="#install">01 / Install</a>
        <a href="#models">02 / Connect</a>
        <a href="#customize">03 / Customize</a>
        <a href="#data">04 / Keep your history</a>
        <a href="#runtime">05 / Runtime</a>
        <a href="#troubleshooting">Help</a>
      </nav>
      <div className="field-guide-body">
        <section id="install" className="field-guide-section">
          <span className="field-guide-number">01</span>
          <div>
            <p className="field-eyebrow">INSTALL</p>
            <h2>Run Field locally.</h2>
            <p>
              Install{' '}
              <a
                href="https://nodejs.org/en/download"
                target="_blank"
                rel="noreferrer"
              >
                Node.js 22.13 or newer
              </a>
              . Download the source archive, extract it, and open a terminal in
              the <code>field</code> folder. npm comes with Node.js.
            </p>
            <CodeBlock
              label="Start Field · macOS / Linux / Windows"
              code={'npm ci\nnpm run db:setup\nnpm run dev -- --port 3001'}
            />
            <p>
              Open{' '}
              <a href="http://localhost:3001" target="_blank" rel="noreferrer">
                http://localhost:3001
              </a>
              , then enter your space. Keep the terminal running. The database
              step asks you to confirm the migration and creates your local
              workspace storage; it does not require a Cloudflare account. If
              PowerShell blocks npm, use <code>npm.cmd</code> instead.
            </p>
            <p className="guide-note">
              The source download contains application code and Nia’s character
              assets. It excludes saved workspaces, model keys, deployment
              credentials, and the hosted project binding.
            </p>
            <h3>Try a first interaction.</h3>
            <CodeBlock
              label="Messages to send in Field"
              code={
                'I’m home\nMove to the window\nRemember: I prefer quiet mornings\nTask: Plan a weekend walk'
              }
            />
            <p>
              Demo mode recognizes a limited set of commands. Connect a model
              for open-ended conversation. Tasks are saved to-dos; recording one
              does not execute work outside Field.
            </p>
          </div>
        </section>
        <section id="models" className="field-guide-section">
          <span className="field-guide-number">02</span>
          <div>
            <p className="field-eyebrow">CONNECT</p>
            <h2>Change the model. Keep the companion.</h2>
            <p>
              The model generates each response. Field carries the continuing
              context: identity, saved memories, relationships, notes, and
              plans. A new connection begins with that same saved state.
            </p>
            <h3>Run Nia on your computer.</h3>
            <p>
              Install{' '}
              <a
                href="https://ollama.com/download"
                target="_blank"
                rel="noreferrer"
              >
                Ollama
              </a>
              , then start the local model service. Qwen3.5 9B is the starting
              model for this setup; its download is about 6.6 GB. Keep the
              service running while you use Field.
            </p>
            <CodeBlock
              label="First terminal · local model service"
              code={'npm run model:serve'}
            />
            <CodeBlock
              label="Second terminal · download once"
              code={'npm run model:pull'}
            />
            <p>
              Copy <code>.dev.vars.example</code> to <code>.dev.vars</code>,
              preserve existing settings, and use the values below. Restart
              Field, then enter your space. The local connection is selected
              automatically; conversations and saved history stay on this
              computer. No API key is needed.
            </p>
            <CodeBlock
              label=".dev.vars · local inference"
              code={
                'FIELD_AI_ENABLED="true"\nFIELD_AI_PROVIDER="ollama"\nFIELD_AI_MODEL="qwen3.5:9b"\nFIELD_AI_CONCURRENCY="1"\nFIELD_AI_VISITOR_TURNS="100"'
              }
            />
            <p>
              This setup handles one response at a time. First use can take
              longer while the model loads. Local responses have no per-message
              API fee; the computer still provides the memory, power and
              compute. A published cloud site cannot reach this computer through
              localhost.
            </p>
            <h3>Connect another model.</h3>
            <ConnectionGuide />
            <h3>Let visitors begin without a key.</h3>
            <p>
              When the site owner enables Field’s shared connection, visitors
              can enter their space and start talking. Each browser keeps its
              own saved history. Field reads that history on the server and
              sends selected context to DeepSeek; replies appear as they arrive.
            </p>
            <p>
              For your own installation, copy <code>.dev.vars.example</code> to{' '}
              <code>.dev.vars</code>. Keep your existing local settings. Supply
              your key, a daily budget, and current provider rates there, then
              enable the service and restart Field. Never put a real key in
              frontend code or a source archive.
            </p>
            <CodeBlock
              label=".dev.vars · shared connection"
              code={
                'FIELD_AI_ENABLED="false"\nFIELD_AI_PROVIDER="deepseek"\nFIELD_AI_KEY=""\nFIELD_AI_MODEL="deepseek-v4-flash"\nFIELD_AI_DAILY_USD=""\nFIELD_AI_INPUT_USD_PER_MILLION=""\nFIELD_AI_OUTPUT_USD_PER_MILLION=""\nFIELD_AI_VISITOR_TURNS="20"\nFIELD_AI_SITE_TURNS="1000"\nFIELD_AI_CONCURRENCY="4"\nFIELD_AI_MAX_OUTPUT="1200"'
              }
            />
            <p>
              Fill both rates in USD per million tokens using the provider’s
              current standard prices. Allowances reset at midnight UTC. Failed
              or stopped attempts still use an allowance because the provider
              may have processed them. The server reserves an estimated maximum
              cost before each call; provider billing limits remain separate. An
              unconfigured installation stays in demo mode.
            </p>
          </div>
        </section>
        <section id="customize" className="field-guide-section">
          <span className="field-guide-number">03</span>
          <div>
            <p className="field-eyebrow">CUSTOMIZE</p>
            <h2>Shape her presence.</h2>
            <p>
              For an existing workspace, edit the name and personality in{' '}
              <strong>Identity</strong>. The same panel lets you control moving,
              notes, and tasks. These controls update saved settings directly.
            </p>
            <h3>Change defaults in code.</h3>
            <p>
              In <code>lib/field.ts</code>, the profile inside{' '}
              <code>initialWorkspace()</code> supplies defaults for new
              workspaces. Exact earlier built-in personality text upgrades to
              the current default; custom names and personalities remain yours.
            </p>
            <CodeBlock
              label="lib/field.ts · profile defaults"
              code={
                "profile: {\n  name: 'Nia',\n  purpose: COMPANION_PURPOSE,\n},"
              }
            />
            <p>
              Nia’s identity, temperament, portrait reference and palette live
              in <code>lib/companion-character.ts</code>. Her complete
              character, visual and voice specification is in{' '}
              <code>docs/nia.md</code>. The runtime combines that definition
              with the action contract in <code>lib/entity.ts</code>. Keep
              permissions and response validation intact when changing her
              manner.
            </p>
            <h3>Adjust the 3D appearance.</h3>
            <p>
              The current spatial character is authored in{' '}
              <code>lib/companion-avatar.ts</code>. The skin material applies to
              her face, neck, ears, hands, and legs.
            </p>
            <CodeBlock
              label="lib/companion-character.ts · skin palette"
              code={"skin: '#633b2c',\nskinDetail: '#40251d',"}
            />
            <p>
              The portrait is a separate image at{' '}
              <code>public/characters/nia-v1.png</code>. Editing a mesh color
              does not recolor the portrait.
            </p>
            <div className="guide-file-list">
              <div>
                <code>app/page.tsx</code>
                <span>Homepage content</span>
              </div>
              <div>
                <code>app/globals.css</code>
                <span>Colors and layout</span>
              </div>
              <div>
                <code>lib/inference.ts</code>
                <span>Model connections</span>
              </div>
              <div>
                <code>lib/entity.ts</code>
                <span>Companion instructions and actions</span>
              </div>
            </div>
          </div>
        </section>
        <section id="data" className="field-guide-section">
          <span className="field-guide-number">04</span>
          <div>
            <p className="field-eyebrow">CONTINUITY</p>
            <h2>Your history has a home.</h2>
            <p>
              Running the whole app locally keeps workspace data in the local D1
              emulator under <code>.wrangler/state</code>. On the hosted site,
              workspace data lives in its hosted D1 database—even if you use
              Ollama for responses.
            </p>
            <p>
              Use <strong>Export agent</strong> in Identity to download a
              portable snapshot. Importing replaces the receiving workspace
              after a preview and backup; model credentials are excluded and the
              connection resets.
            </p>
            <p>
              Keep a copy before changing machines. Avoid sharing exported agent
              files casually: they contain the memories and relationship details
              you chose to save.
            </p>
            <h3>Check your changes.</h3>
            <CodeBlock
              label="Validate and build"
              code={'npm run typecheck\nnpm run lint\nnpm test\nnpm run build'}
            />
            <p>
              The build also refreshes the clean source download. Each browser
              receives a separate guest workspace, with server-side access
              checks. Guest access uses a private cookie rather than an account.
              Clearing cookies or changing devices starts a new space; use an
              export to carry your history with you.
            </p>
            <p>
              Shared inference, visitor allowances, global budgets and
              concurrency limits are implemented. A public launch still needs a
              funded provider account, operational abuse controls and a
              deployment. Anonymous cookies do not provide cross-device account
              recovery. Demo mode makes no model calls.
            </p>
          </div>
        </section>
        <section id="runtime" className="field-guide-section">
          <span className="field-guide-number">05</span>
          <div>
            <p className="field-eyebrow">THE COMPANION RUNTIME</p>
            <h2>Follow every request.</h2>
            <p>
              In your space, open <strong>Memory</strong> to pin a priority or
              preview recall for a message. Open <strong>Runtime</strong> to
              inspect the last 40 requests, including incomplete, failed, and
              cancelled attempts.
            </p>
            <h3>Relevant memory, with a budget.</h3>
            <p>
              Field ranks saved memories with local BM25 keyword search. Pinned
              entries come first, then relevant matches. If nothing matches,
              recent memories provide a fallback. At most eight memories are
              included, with a 1,000-character excerpt limit per memory and
              6,000 text characters overall. These limits cover memory text, not
              the entire model prompt.
            </p>
            <p>
              The inspector records memory IDs, scores, selection reasons,
              excerpt lengths, and an approximate memory token count. Provider
              token counts, when available, are the actual full-request usage.
              The retrieval is lexical, not embedding-based semantic search.
              Saved memory text remains user-controlled.
            </p>
            <h3>She remembers you. You still get to change.</h3>
            <p>
              In Memory, choose <strong>Correct this understanding</strong> on a
              current statement. Write what fits now, preview the change, and
              review your open plans and room notes. Keep each item as it is,
              rewrite it, or remove it from the space. Confirming applies your
              correction and chosen edits together. Calculated findings retain
              their original evidence and cannot be rewritten this way.
            </p>
            <p>
              Earlier wording moves to <strong>History</strong> and is excluded
              from recall, even if pinned. Each correction links two versions;
              repeated corrections and exports preserve that chain. Deleting a
              newer record never reactivates its earlier version. Both versions
              count toward the 200-record memory limit.
            </p>
            <p>
              Context matches identify plans or notes created while that memory,
              or an earlier version, was available to a model. This records
              exposure, not causation. Unlinked items are also listed for your
              review. Field does not automatically rewrite a plan or cancel
              anything outside the space.
            </p>
            <p>
              A correction starts a fresh conversation context. Earlier messages
              and action receipts stay in your history but are excluded from
              future prompts. Identity, relationships, other current memories,
              and reviewed plans remain available. Local and hosted adapters use
              the same rule. This prevents old dialogue from being replayed; it
              does not guarantee that a model will never make an incorrect
              inference.
            </p>
            <h3>A response has a lifecycle.</h3>
            <CodeBlock
              label="Runtime flow"
              code={
                'Persist request + recall plan\n  → call the selected provider\n  → validate the structured response\n  → recheck current action permissions\n  → commit reply + actions + run result together'
              }
            />
            <p>
              A run uses a snapshot of context captured at its start. The
              response must still pass permissions against current state. A
              correction made during inference rejects the old response and its
              entire action batch; send the message again with current memory.
              Cancelled and rejected responses apply no model actions. A reply
              and its successful action batch become one workspace update,
              protected by the same revision check as other data.
            </p>
            <p>
              Shared responses are committed on the server. Reopening your space
              loads the saved outcome; expired unfinished shared requests are
              marked as failed. Field does not automatically retry inference.
              Use the save indicator’s <strong>Retry</strong> to reconcile an
              uncertain result. Your own model connections can leave an
              unfinished run if their tab closes before saving.
            </p>
            <h3>Inspect outcomes, without keeping secrets.</h3>
            <p>
              Runs retain provider and model names, start and finish times,
              status, categorized failures, token usage when reported, and IDs
              of committed receipts. They do not store keys, raw provider
              payloads, extra copies of memory text, or hidden model reasoning.
              Runtime text is resolved from current workspace records, so a
              deleted memory is not reconstructed from a trace.
            </p>
            <div className="guide-file-list">
              <div>
                <code>lib/memory-repair.ts</code>
                <span>
                  Versioned corrections, impact review, and atomic updates
                </span>
              </div>
              <div>
                <code>lib/memory.ts</code>
                <span>Deterministic BM25 retrieval and text budgets</span>
              </div>
              <div>
                <code>lib/runtime.ts</code>
                <span>Request lifecycle and atomic response application</span>
              </div>
              <div>
                <code>lib/runtime-schema.ts</code>
                <span>Validated traces and credential-safe serialization</span>
              </div>
              <div>
                <code>tests/runtime.test.ts</code>
                <span>
                  Recall, cancellation, permissions, retention, and export
                  checks
                </span>
              </div>
            </div>
            <p>
              <Link href="/space">Open your space →</Link>
            </p>
          </div>
        </section>
        <section id="troubleshooting" className="field-guide-section">
          <span className="field-guide-number">?</span>
          <div>
            <p className="field-eyebrow">TROUBLESHOOTING</p>
            <h2>If something gets in the way.</h2>
            <div className="guide-help-grid">
              <article>
                <h3>The workspace will not load</h3>
                <p>
                  Run the database setup step from the extracted source folder,
                  then restart the development server. Keep the same folder so
                  the local data path stays consistent.
                </p>
              </article>
              <article>
                <h3>Ollama is unreachable</h3>
                <p>
                  Check that Ollama is running, the exact Field origin is
                  allowed, and your browser permits local-network access. Run{' '}
                  <code>ollama list</code> to confirm a model is installed.
                </p>
              </article>
              <article>
                <h3>The model response is rejected</h3>
                <p>
                  Field requires structured JSON replies. Choose a model that
                  can follow this format. A failed reply leaves saved state
                  intact.
                </p>
              </article>
              <article>
                <h3>The connection disappeared</h3>
                <p>
                  Personal model connections live only in the current tab.
                  Reconnect after a reload. Field’s shared connection is
                  selected automatically when available. Your saved memories and
                  profile remain.
                </p>
              </article>
            </div>
          </div>
        </section>
      </div>
      <footer className="field-site-footer">
        <Link className="field-wordmark" href="/">
          FIELD
        </Link>
        <span>One companion. A continuing story.</span>
        <Link href="/space">
          Meet Nia <ArrowUpRight size={15} />
        </Link>
      </footer>
    </main>
  );
}
