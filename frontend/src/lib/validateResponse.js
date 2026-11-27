import schemas from './responseSchemas.json';

// Reviewed response-only projection of the approved 1.0 contract. No private
// filesystem dependency at build or test time; no coercion or wire remapping.
export function matchesSchema(value, schema) {
  if (schema.$ref) return matchesSchema(value, schemas[schema.$ref.split('/').at(-1)]);
  if (schema.anyOf && !schema.anyOf.some((s) => matchesSchema(value, s))) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === 'null') return value === null;
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (schema.required?.some((key) => !Object.hasOwn(value, key))) return false;
    if (schema.additionalProperties === false && Object.keys(value).some((key) => !Object.hasOwn(schema.properties || {}, key))) return false;
    return Object.entries(schema.properties || {}).every(([key, s]) => !Object.hasOwn(value, key) || matchesSchema(value[key], s));
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < (schema.minItems || 0) || value.length > (schema.maxItems ?? Infinity)) return false;
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) return false;
    return value.every((v) => matchesSchema(v, schema.items));
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string' || !value.trim() || [...value].length < (schema.minLength || 0) || [...value].length > (schema.maxLength ?? Infinity)) return false;
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) return false;
    if (schema.format === 'uuid' && !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value)) return false;
    if (schema.format === 'date-time' && (!/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value)))) return false;
  }
  if (schema.type === 'boolean' && typeof value !== 'boolean') return false;
  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value))) return false;
    if (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) return false;
  }
  return true;
}

function invalid() {
  throw { origin: 'server', code: 'AI_INVALID_RESPONSE', message: 'The server response did not match this request. Your work is preserved; please try again.', retryable: true };
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const unique = (xs) => new Set(xs).size === xs.length;
const sameQuestion = (a, b) => a?.id === b?.id && a?.text === b?.text && equal(a?.criterion_ids, b?.criterion_ids);
function evidence(refs, source) {
  return Array.isArray(refs) && refs.length > 0 && refs.every((ref) => source.chunks.some((c) => c.id === ref.chunk_id && c.quality === 'clear' && c.text.includes(ref.quote)));
}
function validatePlan(plan, request) {
  const criteria = plan.objective.criteria;
  return plan.page_id === request.source.page_id && plan.chunk_id === request.chunk_id &&
    unique(criteria.map((c) => c.id)) && criteria.every((c) => evidence(c.source_refs, request.source)) &&
    plan.initial_question.criterion_ids.every((id) => criteria.some((c) => c.id === id));
}

export function validateResponse(kind, data, request) {
  if (!matchesSchema(data, schemas[kind])) invalid();
  if (kind === 'ReadResult') {
    const p = data.page;
    if (data.readability === 'unreadable') {
      if (p !== null || !data.retake_reasons.length) invalid();
    } else {
      if (!p || !unique(p.chunks.map((c) => c.id)) || !p.chunks.some((c) => c.quality === 'clear' && c.kind !== 'heading')) invalid();
      if (data.readability === 'readable' && (data.retake_reasons.length || p.extraction_warnings.length || p.chunks.some((c) => c.quality !== 'clear'))) invalid();
      if (data.readability === 'partial' && !data.retake_reasons.length && !p.extraction_warnings.length) invalid();
      const source = { chunks: p.chunks };
      if (p.summary && !evidence(p.summary.source_refs, source)) invalid();
      if (p.glossary.some((g) => !evidence(g.source_refs, source))) invalid();
      if (p.title_origin === 'source' && !p.chunks.some((c) => c.kind === 'heading' && c.text.includes(p.title))) invalid();
      if (p.key_terms_status === 'unavailable' && p.key_terms.length) invalid();
      if (p.key_terms.some((t) => !t.chunk_ids.every((id) => p.chunks.some((c) => c.id === id && c.quality === 'clear' && c.text.toLowerCase().includes(t.term.toLowerCase()))))) invalid();
      if (p.extraction_warnings.some((w) => !w.chunk_ids.every((id) => p.chunks.some((c) => c.id === id)))) invalid();
    }
  }
  if (kind === 'SimplificationResult') {
    if (data.page_id !== request.source.page_id || data.level !== request.level || !equal(data.items.map((i) => i.chunk_id), request.chunk_ids)) invalid();
    for (const item of data.items) {
      const chunk = request.source.chunks.find((c) => c.id === item.chunk_id);
      if (!chunk || !evidence(item.source_refs, request.source) || item.source_refs.some((r) => r.chunk_id !== item.chunk_id)) invalid();
      if (item.terminology_check_status !== (request.source.key_terms_status === 'available' ? 'checked' : 'unavailable')) invalid();
      if (item.preserved_terms.some((term) => !item.text.toLowerCase().includes(term.toLowerCase()) || !request.source.key_terms.some((t) => t.term === term && t.chunk_ids.includes(item.chunk_id)))) invalid();
      if (item.warnings.some((w) => w.chunk_id !== item.chunk_id || !chunk.text.includes(w.source_value) || (w.generated_value !== null && !item.text.includes(w.generated_value)))) invalid();
    }
  }
  if (kind === 'GlossaryEntry' && request) {
    if (data.phrase.toLowerCase() !== request.phrase.toLowerCase() || data.language !== (request.language || 'en') || !evidence(data.source_refs, request.source)) invalid();
  }
  if (kind === 'ConceptExplanation') {
    if (data.page_id !== request.source.page_id || data.concept !== request.concept || data.language !== (request.language || 'en') || !evidence(data.source_refs, request.source)) invalid();
  }
  if (kind === 'LearningPlan' && !validatePlan(data, request)) invalid();
  if (kind === 'EvaluationResult') {
    const a = data.attempt, f = a.feedback, p = request.plan, previous = request.previous_attempt;
    if (a.id !== request.attempt_id || a.plan_id !== p.id || a.answer !== request.answer || !sameQuestion(a.question, request.question) || (a.assistance.used !== request.assistance.used || !equal(a.assistance.kinds, request.assistance.kinds))) invalid();
    if (a.assistance.used !== Boolean(a.assistance.kinds.length) || !unique(a.assistance.kinds)) invalid();
    const ids = p.objective.criteria.map((c) => c.id);
    if (f.assessments.length !== ids.length || !unique(f.assessments.map((c) => c.criterion_id))) invalid();
    for (const assessment of f.assessments) {
      const criterion = p.objective.criteria.find((c) => c.id === assessment.criterion_id);
      const tested = a.question.criterion_ids.includes(assessment.criterion_id);
      if (!criterion || !evidence(assessment.source_refs, request.source) || assessment.source_refs.some((r) => !criterion.source_refs.some((cr) => cr.chunk_id === r.chunk_id && cr.quote === r.quote))) invalid();
      if (tested === (assessment.status === 'not_tested') || (assessment.student_quote !== null && !a.answer.includes(assessment.student_quote))) invalid();
    }
    if (f.targeted_explanation && !evidence(f.targeted_explanation.source_refs, request.source)) invalid();
    if (f.status === 'uncertain') {
      if (!f.uncertainty || f.follow_up_question || f.targeted_explanation || f.hint || f.further_practice_useful !== null || data.retry_result || !['clarify_answer','review_source','seek_help'].includes(f.recommendation)) invalid();
      if (f.assessments.some((c) => !['unclear','not_tested'].includes(c.status))) invalid();
    } else if (!previous) {
      const q = f.follow_up_question;
      if (f.uncertainty || data.retry_result || !q || q.id === a.question.id || q.text.trim().toLowerCase() === a.question.text.trim().toLowerCase() || q.criterion_ids.some((id) => !ids.includes(id)) || f.recommendation !== 'try_retry') invalid();
    } else {
      const r = data.retry_result;
      if (f.uncertainty || f.follow_up_question || !r || r.previous_attempt_id !== previous.id || r.current_attempt_id !== a.id || r.independent_in_app !== !a.assistance.used) invalid();
      const groups = { newly_demonstrated_ids: [], retained_demonstrated_ids: [], still_needs_practice_ids: [], not_retested_ids: [] };
      for (const id of ids) {
        const now = f.assessments.find((c) => c.criterion_id === id).status;
        const before = previous.feedback.assessments.find((c) => c.criterion_id === id)?.status;
        if (now === 'not_tested') groups.not_retested_ids.push(id);
        else if (now !== 'demonstrated') groups.still_needs_practice_ids.push(id);
        else if (before === 'demonstrated') groups.retained_demonstrated_ids.push(id);
        else if (before !== 'not_tested') groups.newly_demonstrated_ids.push(id);
      }
      if (Object.entries(groups).some(([key, value]) => !equal(value, r[key]))) invalid();
    }
  }
  return data;
}
