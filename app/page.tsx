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
          <nav className="field-site-nav-actions" aria-label="Field links">
            <a
              className="field-social-link"
              href="https://x.com/ourfieldlive"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Field on X"
              title="Field on X"
            >
              <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true">
                <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />
              </svg>
            </a>
            <a
              className="field-social-link"
              href="https://github.com/OurFieldLabs/field"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Field on GitHub"
              title="Field on GitHub"
            >
              <svg viewBox="0 0 16 16" width="22" height="22" fill="currentColor" aria-hidden="true">
                <path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" />
              </svg>
            </a>
            <Link href="/space" className="field-open-space-link">
              Open space <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </nav>
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
