import Image from 'next/image';
import Link from 'next/link';

export function FieldBrand({ priority = false }: { priority?: boolean }) {
  return (
    <Link href="/" className="field-wordmark" aria-label="Field home">
      <Image
        src="/brand/field-primary-v1.png"
        alt="Field"
        width={2172}
        height={724}
        priority={priority}
        sizes="(max-width: 650px) 192px, 252px"
      />
    </Link>
  );
}
