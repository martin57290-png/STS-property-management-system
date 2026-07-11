import { createHmac } from 'crypto';
import { LocalStorageService } from './local';
import { S3StorageService } from './s3';

/**
 * Storage abstraction. All uploads are private; access is only via
 * time-limited signed URLs. Swap providers with STORAGE_DRIVER=local|s3.
 */
export interface StorageService {
  /** Store a file under the given key. */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Read a file's bytes (server-side use, e.g. PDF re-serving/merging). */
  get(key: string): Promise<Buffer>;
  /** A time-limited URL a browser can use to fetch the private file. */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

let instance: StorageService | null = null;

export function getStorage(): StorageService {
  if (!instance) {
    instance =
      process.env.STORAGE_DRIVER === 's3' ? new S3StorageService() : new LocalStorageService();
  }
  return instance;
}

/** Build a namespaced storage key: e.g. applications/<id>/<uuid>-<filename> */
export function buildStorageKey(prefix: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
  const rand = crypto.randomUUID();
  return `${prefix}/${rand}-${safe}`;
}

// ── HMAC signing for locally-served files (used by LocalStorageService and
//    the /api/files route) ──────────────────────────────────────────────────

function signingSecret(): string {
  return process.env.FILE_SIGNING_SECRET || 'dev-file-signing-secret';
}

export function signFileToken(key: string, expiresAtMs: number): string {
  return createHmac('sha256', signingSecret()).update(`${key}:${expiresAtMs}`).digest('hex');
}

export function verifyFileToken(key: string, expiresAtMs: number, token: string): boolean {
  if (Date.now() > expiresAtMs) return false;
  const expected = signFileToken(key, expiresAtMs);
  return token.length === expected.length && token === expected;
}
