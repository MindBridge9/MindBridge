import { describe, expect, it } from 'vitest';
import {
  clearAllSavedData,
  deleteSavedPage,
  getSavedPage,
  listSavedPages,
  loadSavedPageImage,
  saveLearningSessionLocal,
  savePageLocal,
} from '../lib/indexedDb';
import readSuccess from '../test-data/read.success.json';

describe('IndexedDB local persistence safe fallback', () => {
  it('degrades gracefully without throwing when IndexedDB is unavailable in jsdom', async () => {
    const saveRes = await savePageLocal({ page: readSuccess.page });
    expect(saveRes.ok).toBe(false);

    const getRes = await getSavedPage(readSuccess.page.id);
    expect(getRes).toEqual({ ok: false, item: null });

    const listRes = await listSavedPages();
    expect(listRes).toEqual({ ok: false, items: [] });

    const img = await loadSavedPageImage('img_1');
    expect(img).toBeNull();

    const sessRes = await saveLearningSessionLocal({ page_id: readSuccess.page.id });
    expect(sessRes.ok).toBe(false);

    const delRes = await deleteSavedPage(readSuccess.page.id);
    expect(delRes.ok).toBe(false);

    const clearRes = await clearAllSavedData();
    expect(clearRes.ok).toBe(false);
  });
});
