import Image from 'next/image';
import Link from 'next/link';

export function FieldBrand({ priority = false }: { priority?: boolean }) {
  return (
    <Link href="/" className="field-wordmark" aria-label="Field home">
      <Image
        src="/brand/field-wordmark-v2.png"
        alt="Field"
        width={2172}
        height={724}
        priority={priority}
        sizes="(max-width: 650px) 192px, 252px"
      />
    </Link>
  );
}

export function FieldMark() {
  return (
    <svg
      className="field-mark"
      width="28"
      height="28"
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M12 11h43l1 17h-2c-3-11-9-14-20-14h-4v18h2c9 0 13-3 14-9h2v23h-2c-1-8-5-11-14-11h-2v13c0 5 2 6 9 7v2H12v-2c7-1 9-2 9-7V20c0-5-2-6-9-7z"
      />
    </svg>
  );
}
