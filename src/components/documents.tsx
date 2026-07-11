import type { Document } from '@prisma/client';
import { getStorage } from '@/lib/storage';
import { fmtDateTime } from '@/lib/dates';

/** Server component: renders a signed link to a private document. */
export async function DocumentLink({
  doc,
  label,
  className = '',
}: {
  doc: Pick<Document, 'storageKey' | 'filename'>;
  label?: string;
  className?: string;
}) {
  const url = await getStorage().getSignedUrl(doc.storageKey);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`font-medium text-brand-700 underline hover:text-brand-900 ${className}`}
    >
      {label ?? doc.filename}
    </a>
  );
}

/** Server component: list of documents with metadata and signed links. */
export async function DocumentList({ docs }: { docs: Document[] }) {
  if (docs.length === 0) {
    return <p className="text-sm text-gray-500">No documents.</p>;
  }
  return (
    <ul className="divide-y divide-gray-100">
      {docs.map((doc) => (
        <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <div>
            <DocumentLink doc={doc} />
            <p className="text-xs text-gray-500">
              {doc.category.replaceAll('_', ' ').toLowerCase()} · {Math.ceil(doc.sizeBytes / 1024)}{' '}
              KB · {fmtDateTime(doc.createdAt)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Server component: responsive photo/video grid with signed URLs. */
export async function MediaGrid({ docs }: { docs: Document[] }) {
  if (docs.length === 0) return <p className="text-sm text-gray-500">No photos.</p>;
  const items = await Promise.all(
    docs.map(async (doc) => ({ doc, url: await getStorage().getSignedUrl(doc.storageKey) })),
  );
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {items.map(({ doc, url }) => (
        <a
          key={doc.id}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="group overflow-hidden rounded-lg border border-gray-200 bg-gray-100"
        >
          {doc.contentType.startsWith('video/') ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={url} className="h-32 w-full object-cover" controls preload="metadata" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={doc.filename}
              className="h-32 w-full object-cover transition-transform group-hover:scale-105"
            />
          )}
        </a>
      ))}
    </div>
  );
}
