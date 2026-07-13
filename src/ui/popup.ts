import browser from 'webextension-polyfill';
import { estimateImageCount } from '@core';
import { localizeDom } from './i18n';
import { restoreFileFromDisk, saveFileToDisk } from './disk';

localizeDom();

const msg = (key: string, subs?: string | string[]) => browser.i18n.getMessage(key, subs);

const el = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found as T;
};

const saveFile = el<HTMLInputElement>('save-file');
const savePw = el<HTMLInputElement>('save-pw');
const saveBtn = el<HTMLButtonElement>('save-btn');
const saveStatus = el<HTMLParagraphElement>('save-status');
const estimate = el<HTMLSpanElement>('estimate');

const restoreFiles = el<HTMLInputElement>('restore-files');
const restorePw = el<HTMLInputElement>('restore-pw');
const restoreBtn = el<HTMLButtonElement>('restore-btn');
const restoreStatus = el<HTMLParagraphElement>('restore-status');

function setStatus(node: HTMLElement, text: string, error = false): void {
  node.textContent = text;
  node.classList.toggle('error', error);
}

saveFile.addEventListener('change', () => {
  const file = saveFile.files?.[0];
  estimate.textContent = file ? String(estimateImageCount(file.size)) : '—';
});

saveBtn.addEventListener('click', async () => {
  const file = saveFile.files?.[0];
  if (!file) return setStatus(saveStatus, msg('errNoFile'), true);
  if (!savePw.value) return setStatus(saveStatus, msg('errNoPassword'), true);

  saveBtn.disabled = true;
  setStatus(saveStatus, msg('statusSaving'));
  try {
    const { imageCount } = await saveFileToDisk(file, savePw.value);
    setStatus(saveStatus, msg('statusSaved', String(imageCount)));
  } catch (err) {
    setStatus(saveStatus, String(err instanceof Error ? err.message : err), true);
  } finally {
    saveBtn.disabled = false;
  }
});

restoreBtn.addEventListener('click', async () => {
  const files = restoreFiles.files ? Array.from(restoreFiles.files) : [];
  if (files.length === 0) return setStatus(restoreStatus, msg('errNoImages'), true);
  if (!restorePw.value) return setStatus(restoreStatus, msg('errNoPassword'), true);

  restoreBtn.disabled = true;
  setStatus(restoreStatus, msg('statusRestoring'));
  try {
    const { filename } = await restoreFileFromDisk(files, restorePw.value);
    setStatus(restoreStatus, msg('statusRestored', filename));
  } catch (err) {
    setStatus(restoreStatus, String(err instanceof Error ? err.message : err), true);
  } finally {
    restoreBtn.disabled = false;
  }
});
