import { db } from './store';
import { ProductionError } from './production-contract';
import { readBrowserAccounts, readBrowserPublishingMaterials } from './publishing-browser';

export async function readServicePublishingPackage(owner: string, id: string) {
  if (!/^pbw_[a-f0-9]{64}$/.test(id)) throw new ProductionError('发布任务不存在', 404);
  const row = await db().prepare('SELECT value FROM app_state WHERE key=?')
    .bind(`publishing_browser_work_v2:${id}`)
    .first() as unknown as { value: string } | null;
  if (!row) throw new ProductionError('发布任务不存在', 404);

  let work: Record<string, any>;
  try {
    work = JSON.parse(row.value);
  } catch {
    throw new ProductionError('发布任务记录无效', 409);
  }
  if (!work || typeof work !== 'object' || work.id !== id || work.owner_id !== owner || work.kind !== 'publish') {
    throw new ProductionError('发布任务不存在', 404);
  }
  if (work.state !== 'queued') throw new ProductionError('发布任务当前不可读取', 409);

  const account = (await readBrowserAccounts(owner)).find(item => item.platform === work.platform);
  if (!account?.connected || !account.can_publish || account.account_id !== work.input?.account_id) {
    throw new ProductionError('对应平台账号当前未就绪', 409);
  }

  const materials = await readBrowserPublishingMaterials(owner, { work_id: id });
  return {
    task_id: id,
    job_id: work.input.job_id,
    platform: work.platform,
    release_package_id: work.input.release_id,
    video_sha256: work.input.binding?.video_sha256,
    materials,
  };
}
