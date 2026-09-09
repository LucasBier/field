import { NIA } from '@/lib/companion-character';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { CodeBlock } from '@/components/code-block';
import { FieldBrand } from '@/components/field-brand';
import { SpatialPreview } from '@/components/spatial-preview';
import {
  FieldMotion,
  PortraitMotion,
  ContinuityStory,
  RuntimeArchitecture,
  SetupConsole,
  FieldColophon,
  Reveal,
} from '@/components/field-story';

export default function Home() {
  return (
    <FieldMotion>
      <main className="field-landing">
        <header className="field-site-nav">
          <Link href="/docs">Documentation</Link>
          <FieldBrand priority />
          <Link href="/space">
            Open space <ArrowUpRight size={16} />
          </Link>
        </header>
        <section className="field-entry">
          <div className="field-entry-copy">
            <p className="field-eyebrow">
              OUR VISION · PERSISTENT SPATIAL COMPANIONS
            </p>
            <h1 className="field-change-heading">
              <span>She remembers you.</span>
              <em>
                You still get
                <br />
                to change.
              </em>
            </h1>
            <p className="field-entry-description">
              Field is a home for a continuing relationship with Nia. She
              carries the memories, plans, and moments you choose to share. When
              life changes, you can change what she understands about you.
            </p>
            <p className="field-entry-description">
              Run <strong>locally</strong>, connect a{' '}
              <strong>frontier API</strong>, or bring both together. Her world
              stays with her. Your story stays open.
            </p>
            <div className="field-entry-actions">
              <a
                className="field-solid-link"
                href="/downloads/field-source.zip"
                download
              >
                <ArrowDown size={17} /> Get the source
              </a>
              <Link href="/space" className="field-text-link">
                Meet Nia <ArrowUpRight size={17} />
              </Link>
            </div>
            <div className="field-install">
              <p className="field-eyebrow">
                RUN FROM YOUR EXTRACTED SOURCE FOLDER
              </p>
              <CodeBlock
                label="Terminal · Node.js 22.13+"
                code={'npm ci\nnpm run db:setup\nnpm run dev -- --port 3001'}
              />
              <Link href="/docs" className="field-install-help">
                First time? Follow the setup guide <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
          <PortraitMotion>
            <div className="field-portrait-frame">
              <Image
                src={NIA.appearance.portrait}
                alt={NIA.appearance.alt}
                width={1254}
                height={1254}
                fetchPriority="high"
                unoptimized
              />
            </div>
            <figcaption>
              <span>NIA / A MIND OF HER OWN</span>
              <span>ATTENTIVE. WRY. OPEN TO CHANGE.</span>
            </figcaption>
          </PortraitMotion>
        </section>
        <nav className="field-chapter-nav" aria-label="Explore Field">
          <a href="#continuity">01 / The story</a>
          <a href="#presence">02 / The presence</a>
          <a href="#architecture">03 / The runtime</a>
          <a href="#setup">
            04 / Build yours <ArrowDown size={13} />
          </a>
        </nav>
        <ContinuityStory />
        <section className="field-presence-section" id="presence">
          <Reveal>
            <p className="field-eyebrow">A WORLD TO TAKE PART IN</p>
            <h2>
              The same Nia.
              <br />
              <em>A place beside you.</em>
            </h2>
            <p>
              Think together. Make things. Leave a thought in the room and
              return to it tomorrow. Give her the tools to take part in your
              life, with the freedom and boundaries you choose. Every shared
              experience becomes part of a continuing relationship.
            </p>
            <Link href="/space" className="field-text-link">
              Enter Nia’s space <ArrowUpRight size={17} />
            </Link>
          </Reveal>
          <SpatialPreview />
        </section>
        <RuntimeArchitecture />
        <SetupConsole />
        <section className="field-configuration-band">
          <p className="field-eyebrow">
            YOUR MACHINE. YOUR MODEL. YOUR SHARED HISTORY.
          </p>
          <h2>
            Give your companion
            <br />
            a place to begin.
          </h2>
          <Link className="field-solid-link" href="/docs">
            Read the field guide <ArrowUpRight size={17} />
          </Link>
        </section>
        <FieldColophon />
        <footer className="field-site-footer">
          <FieldBrand />
          <span>One companion. A continuing story.</span>
          <Link href="/docs">
            Read the guide <ArrowUpRight size={15} />
          </Link>
        </footer>
      </main>
    </FieldMotion>
  );
}
