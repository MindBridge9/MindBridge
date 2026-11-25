const MAX_CONTEXT_CHUNKS = 12;
const MAX_CONTEXT_CHARS = 12000;
const MAX_CONTEXT_TERMS = 24;

export function buildSourceContext(page, chunkIds, options = {}) {
  const { requireClear = true, includeAdjacent = false } = options;

  if (!page || typeof page !== 'object' || !Array.isArray(page.chunks) || !page.id) {
    throw new Error('A valid PageDoc is required to build SourceContext.');
  }

  const requestedIds = Array.isArray(chunkIds) ? chunkIds : [];
  if (requestedIds.length === 0) {
    throw new Error('Select at least one textbook chunk.');
  }

  const requestedSet = new Set(requestedIds);
  const chunkById = new Map(page.chunks.map((chunk, idx) => [chunk.id, { chunk, idx }]));

  for (const id of requestedSet) {
    const entry = chunkById.get(id);
    if (!entry) {
      throw new Error(`Chunk ${id} does not exist on this page.`);
    }
    if (requireClear && entry.chunk.quality !== 'clear') {
      throw new Error(`Chunk ${id} has uncertain text and cannot be used for AI explanations.`);
    }
  }

  const selectedIndices = new Set();
  for (const id of requestedSet) {
    selectedIndices.add(chunkById.get(id).idx);
  }

  // Optionally add immediate clear adjacent chunks without exceeding bounds
  const candidateIndices = new Set(selectedIndices);
  if (includeAdjacent) {
    for (const idx of selectedIndices) {
      for (const neighborIdx of [idx - 1, idx + 1]) {
        if (neighborIdx >= 0 && neighborIdx < page.chunks.length) {
          const neighbor = page.chunks[neighborIdx];
          if (!requireClear || neighbor.quality === 'clear') {
            candidateIndices.add(neighborIdx);
          }
        }
      }
    }
  }

  const orderedSelected = Array.from(selectedIndices).sort((a, b) => a - b);
  const chosenChunks = [];
  let charCount = 0;

  for (const idx of orderedSelected) {
    const chunk = page.chunks[idx];
    if (chosenChunks.length >= MAX_CONTEXT_CHUNKS) {
      throw new Error(`SourceContext cannot exceed ${MAX_CONTEXT_CHUNKS} chunks.`);
    }
    if (charCount + chunk.text.length > MAX_CONTEXT_CHARS) {
      throw new Error(`Selected text exceeds the ${MAX_CONTEXT_CHARS} character context limit.`);
    }
    chosenChunks.push({ ...chunk });
    charCount += chunk.text.length;
  }

  if (includeAdjacent) {
    const adjacentOnly = Array.from(candidateIndices)
      .filter((idx) => !selectedIndices.has(idx))
      .sort((a, b) => a - b);

    for (const idx of adjacentOnly) {
      if (chosenChunks.length >= MAX_CONTEXT_CHUNKS) break;
      const chunk = page.chunks[idx];
      if (charCount + chunk.text.length > MAX_CONTEXT_CHARS) continue;
      chosenChunks.push({ ...chunk });
      charCount += chunk.text.length;
    }

    // Re-sort to preserve reading order from PageDoc
    const indexMap = new Map(page.chunks.map((c, i) => [c.id, i]));
    chosenChunks.sort((a, b) => indexMap.get(a.id) - indexMap.get(b.id));
  }

  const includedIdSet = new Set(chosenChunks.map((chunk) => chunk.id));
  const keyTermsStatus = page.key_terms_status === 'available' ? 'available' : 'unavailable';

  let filteredTerms = [];
  if (keyTermsStatus === 'available' && Array.isArray(page.key_terms)) {
    filteredTerms = page.key_terms
      .map((entry) => {
        if (!entry || typeof entry.term !== 'string' || !Array.isArray(entry.chunk_ids)) {
          return null;
        }
        const overlappingIds = entry.chunk_ids.filter((id) => includedIdSet.has(id));
        if (overlappingIds.length === 0) return null;
        return {
          term: entry.term,
          chunk_ids: overlappingIds,
        };
      })
      .filter(Boolean)
      .slice(0, MAX_CONTEXT_TERMS);
  }

  return {
    page_id: page.id,
    chunks: chosenChunks,
    key_terms: filteredTerms,
    key_terms_status: keyTermsStatus,
  };
}
