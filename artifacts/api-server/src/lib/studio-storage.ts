import { Storage } from '@google-cloud/storage';

const endpoint = 'http://127.0.0.1:1106';
const storage = new Storage({
  projectId: '',
  credentials: {
    audience: 'replit', subject_token_type: 'access_token',
    token_url: `${endpoint}/token`, type: 'external_account',
    credential_source: { url: `${endpoint}/credential`, format: { type: 'json', subject_token_field_name: 'access_token' } },
    universe_domain: 'googleapis.com',
  },
});

export function privateFile(key: string) {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new Error('Private App Storage is not configured');
  const [bucket, ...prefix] = dir.replace(/^\/+/, '').split('/');
  const environment = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  return storage.bucket(bucket).file([...prefix, 'studio', environment, key].join('/'));
}

// Preserve the existing archive contract, using private App Storage instead of R2.
export const archiveBucket = {
  async put(key: string, body: any, options?: any) {
    const bytes = body instanceof ReadableStream ? Buffer.from(await new Response(body).arrayBuffer()) : Buffer.from(body);
    try {
      await privateFile(`archives/${key}`).save(bytes, { resumable: false,
        ...(options?.onlyIf?.get('If-None-Match') === '*' ? { preconditionOpts: { ifGenerationMatch: 0 } } : {}),
        metadata: { contentType: options?.httpMetadata?.contentType, metadata: options?.customMetadata } });
    } catch (error: any) {
      if (error.code === 412 && options?.onlyIf?.get('If-None-Match') === '*') return null;
      throw error;
    }
    return { key, size: bytes.length };
  },
  async get(key: string, options?: any) {
    const file = privateFile(`archives/${key}`);
    try {
      const [metadata] = await file.getMetadata();
      const range = options?.range;
      const [bytes] = await file.download(range ? { start: range.offset, end: range.offset + range.length - 1 } : {});
      return { key, size: Number(metadata.size), body: new Response(bytes).body, text: async () => bytes.toString('utf8'), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), httpMetadata: { contentType: metadata.contentType }, customMetadata: metadata.metadata ?? {} };
    } catch (error: any) { if (error.code === 404) return null; throw error; }
  },
  async head(key: string) {
    try { const [m] = await privateFile(`archives/${key}`).getMetadata(); return { key, size: Number(m.size), customMetadata: m.metadata ?? {}, httpMetadata: { contentType: m.contentType } }; }
    catch (error: any) { if (error.code === 404) return null; throw error; }
  },
  async delete(key: string) { await privateFile(`archives/${key}`).delete({ ignoreNotFound: true }); },
};
