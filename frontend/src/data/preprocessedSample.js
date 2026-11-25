// Visibly labelled synthetic preprocessed sample for reading, settings, and speech evaluation.
// Does not import from src/mocks and disables live AI actions unless a real scanned page is used.
export const PREPROCESSED_SAMPLE_PAGE = Object.freeze({
  schema_version: '1.0',
  id: '2b9fa570-b8dd-4e74-a827-3c50a8174e91',
  created_at: '2026-11-24T12:00:00Z',
  language: 'en',
  title: 'Photosynthesis',
  title_origin: 'source',
  chunks: [
    {
      id: 'c0001',
      kind: 'heading',
      text: 'Photosynthesis',
      quality: 'clear',
    },
    {
      id: 'c0002',
      kind: 'paragraph',
      text: 'Green plants use light energy from sunlight to make glucose from carbon dioxide and water during photosynthesis.',
      quality: 'clear',
    },
    {
      id: 'c0003',
      kind: 'paragraph',
      text: 'Chlorophyll inside leaf cells absorbs light energy, which drives the reaction that stores chemical energy in glucose molecules and releases oxygen.',
      quality: 'clear',
    },
  ],
  extraction_warnings: [],
  summary: {
    text: 'Plants use light energy absorbed by chlorophyll to make glucose from carbon dioxide and water.',
    source_refs: [
      {
        chunk_id: 'c0002',
        quote:
          'Green plants use light energy from sunlight to make glucose from carbon dioxide and water during photosynthesis.',
      },
    ],
  },
  key_terms: [
    { term: 'light energy', chunk_ids: ['c0002', 'c0003'] },
    { term: 'glucose', chunk_ids: ['c0002', 'c0003'] },
    { term: 'carbon dioxide', chunk_ids: ['c0002'] },
    { term: 'water', chunk_ids: ['c0002'] },
    { term: 'photosynthesis', chunk_ids: ['c0002'] },
    { term: 'chlorophyll', chunk_ids: ['c0003'] },
  ],
  key_terms_status: 'available',
  glossary: [
    {
      phrase: 'glucose',
      language: 'en',
      definition: 'A simple sugar that living cells use as an energy source.',
      contextual_meaning: 'The sugar plants make from carbon dioxide and water during photosynthesis.',
      example: null,
      source_refs: [
        {
          chunk_id: 'c0002',
          quote: 'make glucose from carbon dioxide and water',
        },
      ],
    },
    {
      phrase: 'chlorophyll',
      language: 'en',
      definition: 'The green pigment in plant leaves that captures light.',
      contextual_meaning: 'The substance in leaf cells that absorbs light energy for photosynthesis.',
      example: null,
      source_refs: [
        {
          chunk_id: 'c0003',
          quote: 'Chlorophyll inside leaf cells absorbs light energy',
        },
      ],
    },
  ],
  enrichment_status: 'complete',
});
