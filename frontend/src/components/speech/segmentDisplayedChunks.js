export function splitTextIntoSentences(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }

  // Conservative English boundaries: never split decimals, initials or common abbreviations.
  const parts = []; let start = 0;
  const abbreviations = /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Fig|Figs|Eq|Eqs|No|Nos|vs|approx|vol|wt)|e\.g|i\.e)\.$/i;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (!'.!?'.includes(char)) continue;
    if (char === '.' && (/\d/.test(text[index-1] || '') && /\d/.test(text[index+1] || '') || abbreviations.test(text.slice(start,index+1)) || /\b[A-Z]\.$/.test(text.slice(start,index+1)))) continue;
    let end = index + 1;
    while (end < text.length && /[.!?"'”’)]/.test(text[end])) end += 1;
    if (end < text.length && !/\s/.test(text[end])) continue;
    while (end < text.length && /\s/.test(text[end])) end += 1;
    parts.push(text.slice(start,end)); start = end; index = end - 1;
  }
  if (start < text.length) parts.push(text.slice(start));
  return parts.length ? parts : [text];
}

export function segmentDisplayedChunks({ pageId = 'page', chunks = [], displayByChunkId = {} } = {}) {
  const sentences = [];
  const byChunkId = {};

  for (const chunk of chunks) {
    const display = displayByChunkId?.[chunk.id];
    const level = display?.level || 'original';
    const text = typeof display?.text === 'string' ? display.text : chunk.text;
    const paragraphs = text.split(/(?<=\n)(?=\n)/);
    const parts = paragraphs.flatMap((paragraph, paragraphIndex) => splitTextIntoSentences(paragraph).map(text => ({text,paragraphIndex})));
    let offset = 0;

    const chunkSentences = parts.map((part, index) => {
      const startOffset = offset; offset += part.text.length;
      return { id: `${pageId}:${chunk.id}:${level}:${index}`, chunkId: chunk.id, level, text:part.text,
        paragraphIndex:part.paragraphIndex, startOffset, endOffset:offset };
    });

    byChunkId[chunk.id] = {
      level,
      text,
      sentences: chunkSentences,
    };
    sentences.push(...chunkSentences);
  }

  return { sentences, byChunkId };
}
