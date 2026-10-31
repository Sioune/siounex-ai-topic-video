import { createHash } from 'node:crypto';
import { SaveContentResultBody } from '@workspace/api-zod';
import { studioDatabase as db } from './studio-database';

const PREFIX = 'display_result_v1:';
export class ContentError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
type Input = ReturnType<typeof SaveContentResultBody.parse>;
export type CatalogResult = Input & { id: string; visible: boolean; updated_at: string };
type StoredResult = CatalogResult & { owner_id: string; payload_hash: string };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

// These URLs are rendered as links, never fetched by the server. Do not expose
// private storage keys, authenticated URLs, local-network links or javascript.
export function displayUrl(value: string) {
  if (!value) return '';
  let url: URL;
  try { url = new URL(value); } catch { throw new ContentError('请填写有效的公开 HTTPS 链接。'); }
  if (url.protocol !== 'https:' || url.username || url.password ||
      url.hostname === 'localhost' || url.hostname.endsWith('.local') ||
      /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) {
    throw new ContentError('仅接受无账号凭据的公开 HTTPS 域名链接。');
  }
  if ([...url.searchParams.keys()].some(key => /token|signature|credential|authorization|x-goog|x-amz/i.test(key))) {
    throw new ContentError('不能公开含访问凭据或临时签名的链接。请使用可公开访问的成果链接。');
  }
  return url.href;
}

function project(row: StoredResult): CatalogResult {
  const { id, external_id, revision, kind, title, summary, body, source_url, content_url, cover_url, visible, updated_at } = row;
  return { id, external_id, revision, kind, title, summary, body, source_url, content_url, cover_url, visible, updated_at };
}
function decode(raw: string): StoredResult {
  try { return JSON.parse(raw) as StoredResult; }
  catch { throw new ContentError('成果记录损坏，请联系管理员检查；未以空结果替代。', 503); }
}
async function stored(id: string, owner: string) {
  if (!/^result_[a-f0-9]{32}$/.test(id)) throw new ContentError('成果不存在。', 404);
  const row = await db.prepare('SELECT value FROM app_state WHERE key=?').bind(PREFIX + id).first() as Record<string, unknown> | null;
  if (!row) throw new ContentError('成果不存在。', 404);
  const result = decode(String(row.value));
  if (result.owner_id !== owner) throw new ContentError('成果不存在。', 404);
  return result;
}
export async function catalogResults(owner: string, publicOnly: boolean) {
  const { results } = await db.prepare('SELECT value FROM app_state WHERE key LIKE ?').bind(PREFIX + '%').all();
  return results.map(row => decode(String(row.value)))
    .filter(row => row.owner_id === owner && (!publicOnly || row.visible))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map(project);
}
export async function catalogResult(id: string, owner: string, publicOnly = true) {
  const result = await stored(id, owner);
  if (publicOnly && !result.visible) throw new ContentError('成果不存在。', 404);
  return project(result);
}
export async function saveCatalogResult(raw: unknown, owner: string) {
  const parsed = SaveContentResultBody.strict().safeParse(raw);
  if (!parsed.success) throw new ContentError('成果格式无效；请核对必填字段、版本号及长度，不能夹带可见性或制作指令。');
  const input: Input = { ...parsed.data, external_id: parsed.data.external_id.trim(), title: parsed.data.title.trim() };
  if (!input.external_id || !input.title) throw new ContentError('成果编号和标题不能为空。');
  input.source_url = displayUrl(input.source_url);
  input.content_url = displayUrl(input.content_url);
  input.cover_url = displayUrl(input.cover_url);
  if (input.kind !== 'article' && !input.content_url) throw new ContentError('视频或链接成果必须提供成果链接。');
  if (input.kind === 'article' && !input.body.trim() && !input.content_url) throw new ContentError('文章需要正文或成果链接。');
  const id = 'result_' + digest(owner + '\0' + input.external_id).slice(0, 32);
  const payloadHash = digest(JSON.stringify(input));
  const previousRow = await db.prepare('SELECT value FROM app_state WHERE key=?').bind(PREFIX + id).first() as Record<string, unknown> | null;
  if (previousRow) {
    const previous = decode(String(previousRow.value));
    if (previous.owner_id !== owner) throw new ContentError('成果归属冲突。', 409);
    if (input.revision === previous.revision && payloadHash === previous.payload_hash) return project(previous);
    if (input.revision <= previous.revision) throw new ContentError('成果已更新。同版本不可覆盖不同内容，请读取现有成果并增加版本号。', 409);
  } else {
    const count = await db.prepare('SELECT count(*) AS n FROM app_state WHERE key LIKE ?').bind(PREFIX + '%').first() as Record<string, unknown> | null;
    if (Number(count?.n) >= 1000) throw new ContentError('当前展示目录已达 1000 条，请先归档整理。', 409);
  }
  const result: StoredResult = { ...input, id, owner_id: owner, payload_hash: payloadHash, visible: false, updated_at: new Date().toISOString() };
  await db.prepare('INSERT INTO app_state(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .bind(PREFIX + id, JSON.stringify(result)).run();
  return project(result);
}
export async function setCatalogVisibility(id: string, owner: string, visible: boolean, revision: number) {
  const result = await stored(id, owner);
  if (result.revision !== revision) throw new ContentError('成果版本已变化，请重新读取并审核。', 409);
  result.visible = visible;
  result.updated_at = new Date().toISOString();
  await db.prepare('UPDATE app_state SET value=? WHERE key=?').bind(JSON.stringify(result), PREFIX + id).run();
  return project(result);
}
export async function removeCatalogResult(id: string, owner: string) {
  await stored(id, owner);
  await db.prepare('DELETE FROM app_state WHERE key=?').bind(PREFIX + id).run();
}
