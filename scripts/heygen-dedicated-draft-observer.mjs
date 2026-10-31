import {createHash} from 'node:crypto';

// Read-only stage for the dedicated browser. This is not a CUA event, an
// authorization to play audio, or an audio result. The caller must supply an
// already-owned page from the one dedicated browser; it is never created or
// transferred by this module.
const sha = value => createHash('sha256').update(value).digest('hex');
const error = code => Object.assign(new Error(code), {code});

export async function observeDedicatedStudioDraft(page, {draft_id, title, narration, voice_name} = {}) {
  if (!/^[a-f0-9]{32}$/.test(draft_id || '') || typeof title !== 'string' || !title ||
      typeof narration !== 'string' || !narration || typeof voice_name !== 'string' || !voice_name ||
      typeof page?.url !== 'function' || typeof page?.evaluate !== 'function') {
    throw error('DEDICATED_DRAFT_INPUT_INVALID');
  }
  const expected = `https://app.heygen.com/create-v4/${draft_id}`;
  const actual = page.url();
  let url;
  try { url = new URL(actual); } catch { throw error('DEDICATED_DRAFT_IDENTITY_INVALID'); }
  if (url.origin + url.pathname !== expected) throw error('DEDICATED_DRAFT_IDENTITY_INVALID');
  const facts = await page.evaluate(() => {
    const titleNode = document.querySelector('input[placeholder="未命名 视频"]') || document.querySelector('input[placeholder="未命名视频"]');
    const body = Array.from(document.querySelectorAll('.node-segment'));
    const footer = document.querySelector('.node-sceneFooter');
    const audio = Array.from(document.querySelectorAll('audio'));
    return {title: titleNode?.value ?? null, text: body.map(node => node.innerText).join('\n'),
      readable: body.length > 0 && body.every(node => typeof node.innerText === 'string'),
      footer: footer?.innerText ?? null,
      audio: audio.map(node => ({hasSource: !!(node.currentSrc || node.src || node.querySelector('source')?.src), readyState: node.readyState}))};
  });
  // A navigation during the read invalidates the snapshot.
  if (page.url() !== actual || !facts || facts.readable !== true || typeof facts.footer !== 'string' ||
      !Array.isArray(facts.audio)) throw error('DEDICATED_DRAFT_READ_INCOMPLETE');
  if (facts.title !== title || facts.text !== narration || !facts.footer.includes(voice_name)) {
    throw error('DEDICATED_DRAFT_BINDING_MISMATCH');
  }
  return {schema:'heygen-dedicated-draft-observation-v1', source:'playwright-cdp', draft_id,
    title_sha256:sha(facts.title), narration_sha256:sha(facts.text), voice_name_sha256:sha(voice_name),
    audio_element_count:facts.audio.length, audio_source_observed:facts.audio.some(a => a?.hasSource === true),
    voice_selection_verified:false,
    // A read-only snapshot cannot prove the absence of cached audio or grant a Play.
    audio_absence_verified:false, play_authorized:false, audio_ready:false};
}
