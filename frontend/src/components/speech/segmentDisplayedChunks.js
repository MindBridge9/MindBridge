export function splitTextIntoSentences(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    const segments = [];
    for (const part of segmenter.segment(text)) {
      if (part.segment.length > 0) {
        segments.push(part.segment);
      }
    }
    if (segments.length > 0 && segments.join('') === text) {
      return segments;
    }
  }

  // Conservative fallback preserving every displayed character including trailing whitespace
  const matches = text.match(/[^.!?]+(?:[.!?]+(?=\s|$)\s*|\s*$)|[.!?]+\s*/g);
  if (matches && matches.join('') === text) {
    return matches;
  }
  return [text];
}

export function segmentDisplayedChunks({ pageId = 'page', chunks = [], displayByChunkId = {} } = {}) {
  const sentences = [];
  const byChunkId = {};

  for (const chunk of chunks) {
    const display = displayByChunkId?.[chunk.id];
    const level = display?.level || 'original';
    const text = typeof display?.text === 'string' ? display.text : chunk.text;
    const parts = splitTextIntoSentences(text);

    const chunkSentences = parts.map((segmentText, index) => ({
      id: `${pageId}:${chunk.id}:${level}:${index}`,
      chunkId: chunk.id,
      level,
      text: segmentText,
    }));

    byChunkId[chunk.id] = {
      level,
      text,
      sentences: chunkSentences,
    };
    sentences.push(...chunkSentences);
  }

  return { sentences, byChunkId };
}
