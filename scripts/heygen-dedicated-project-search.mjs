import {createHash} from 'node:crypto';

const sha = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw Object.assign(Error(code), {code}); };

// Search the visible project list in an already owned dedicated Studio tab.
// A scoped zero result is not proof that the provider has no other draft and
// does not permit creation, playback, or reuse of a similarly named draft.
export async function searchDedicatedProjects(page, {job_id, request_id, revision} = {}) {
  if (!/^job_[a-f0-9-]{36}$/.test(job_id || '') || !/^acl_[a-f0-9]{64}$/.test(request_id || '') ||
      !Number.isSafeInteger(revision) || revision < 1) fail('DEDICATED_SEARCH_BINDING_INVALID');
  let url;
  try { url = new URL(page.url()); } catch { fail('DEDICATED_SEARCH_PAGE_INVALID'); }
  if (url.origin !== 'https://app.heygen.com' || url.pathname !== '/projects') fail('DEDICATED_SEARCH_PAGE_INVALID');
  const query = `本人声音缓存｜${job_id.slice(4,12)}｜v${revision}｜${request_id.slice(4,12)}`;
  // Navigation to projects completes before the React search controls render.
  // Wait for an observed control instead of treating a transient empty DOM as failure.
  try { await page.locator('button[aria-label="搜索"]:visible,input[placeholder="搜索 我的项目"]:visible').first().waitFor({state:'visible',timeout:20000}); }
  catch { fail('DEDICATED_SEARCH_CONTROL_UNAVAILABLE'); }
  const searchButton = page.locator('button[aria-label="搜索"]:visible');
  const visibleInputs = page.locator('input[placeholder="搜索 我的项目"]:visible');
  if (await visibleInputs.count() === 0) {
    if (await searchButton.count() !== 1) fail('DEDICATED_SEARCH_CONTROL_UNAVAILABLE');
    await searchButton.click({timeout:10000});
  }
  // HeyGen currently renders two inputs with this placeholder. The last one
  // is the expanded project search observed in the dedicated session.
  const input = page.locator('input[placeholder="搜索 我的项目"]').last();
  await input.waitFor({state:'visible',timeout:10000});
  if (!await input.isEditable()) fail('DEDICATED_SEARCH_CONTROL_UNAVAILABLE');
  await input.fill(query, {timeout:10000});
  await input.press('Enter', {timeout:10000});
  // Wait for an actual match or actual no-results UI, never infer a zero from
  // loading, timeout, missing DOM, or the input field itself.
  const result = await page.evaluate(async expected => {
    const visible = element => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'; };
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const matches = Array.from(document.querySelectorAll('a')).filter(a => visible(a) && a.innerText.trim() === expected).map(a => a.href);
      const empty = Array.from(document.querySelectorAll('p,span,div')).some(e => visible(e) && e.children.length === 0 && e.innerText?.includes('未找到与') && e.innerText?.includes(expected) && e.innerText?.includes('匹配的视频'));
      if (matches.length || empty) return {matches, empty, observedAt:new Date().toISOString()};
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return null;
  }, query);
  if (page.url() !== url.href || !result || !Array.isArray(result.matches) || typeof result.empty !== 'boolean') fail('DEDICATED_SEARCH_RESULT_UNKNOWN');
  if (result.empty && result.matches.length) fail('DEDICATED_SEARCH_RESULT_AMBIGUOUS');
  const identities = result.matches.map(value => { try { const u = new URL(value); return u.origin === 'https://app.heygen.com' && /^\/create-v4\/[a-f0-9]{32}$/.test(u.pathname) ? u.pathname.slice('/create-v4/'.length) : null; } catch { return null; } });
  if (identities.some(value => value === null) || new Set(identities).size !== identities.length) fail('DEDICATED_SEARCH_RESULT_AMBIGUOUS');
  return {schema:'heygen-dedicated-search-observation-v1',source:'playwright-cdp',job_id,request_id,revision,
    title_sha256:sha(query),scope:'visible-my-projects',observed_at:result.observedAt,
    observed_exact_match_ids:identities,no_results_visible:result.empty,
    // Workspace and provider-wide completeness have not been established.
    provider_wide_zero_proven:false,creation_authorized:false,play_authorized:false};
}
