/**
 * Standalone Google Photos restore page. It runs in its own tab (opened from
 * the popup) so it stays alive while the user interacts with the Photos picker
 * in another tab — the popup would be dismissed the moment focus moves away.
 */

import { localizeDom } from './i18n';
import { el, friendlyError, msg, setStatus } from './dom';
import { restoreFromPhotos } from './google-photos';

localizeDom();

const keyInput = el<HTMLInputElement>('photos-key');
const pw = el<HTMLInputElement>('photos-pw');
const btn = el<HTMLButtonElement>('photos-restore-btn');
const status = el('photos-status');

btn.addEventListener('click', async () => {
  if (!pw.value) return setStatus(status, msg('errNoPassword'), true);
  btn.disabled = true;
  setStatus(status, msg('statusPickerOpen'));
  try {
    const keyFile = keyInput.files?.[0];
    const keyBlock = keyFile ? new Uint8Array(await keyFile.arrayBuffer()) : undefined;
    const { filename } = await restoreFromPhotos(pw.value, keyBlock, (url) => {
      window.open(url, '_blank', 'noopener');
    });
    setStatus(status, msg('statusRestored', filename));
  } catch (err) {
    setStatus(status, friendlyError(err), true);
  } finally {
    btn.disabled = false;
  }
});
