import { promises as fs } from 'fs';
import path from 'path';
import type { StorageService } from './index';
import { signFileToken } from './index';

const STORAGE_ROOT = path.join(process.cwd(), '.storage');

/**
 * Local-disk implementation used in development and when no S3 credentials
 * are configured. Files live under ./.storage and are served through
 * /api/files/[...key] with an HMAC-signed, expiring token.
 */
export class LocalStorageService implements StorageService {
  private resolve(key: string): string {
    const full = path.join(STORAGE_ROOT, key);
    const normalized = path.normalize(full);
    if (!normalized.startsWith(STORAGE_ROOT)) {
      throw new Error('Invalid storage key');
    }
    return normalized;
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<void> {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async getSignedUrl(key: string, expiresInSeconds = 900): Promise<string> {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const token = signFileToken(key, expiresAt);
    const base = process.env.APP_URL || '';
    const params = new URLSearchParams({ expires: String(expiresAt), token });
    return `${base}/api/files/${encodeURI(key)}?${params.toString()}`;
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }
}
