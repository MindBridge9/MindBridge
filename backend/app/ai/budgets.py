"""Provider budgets. Token estimates are approximate, never quota guarantees."""
import json
import math


def groq_budget(operation, data, instruction, schema, *, image=False):
    ceilings = dict(read=8192, simplify=4096, prepare=2048, check=4096, define=768, explain=1024)
    if operation not in ceilings:
        raise ValueError('Unknown AI operation.')
    # Include schema/instruction/JSON framing and documented Qwen image cost.
    # UTF-8 / 3 intentionally leaves headroom for typical English textbook JSON.
    size = len(json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode())
    overhead = len(instruction.encode()) + len(json.dumps(schema, separators=(',', ':')).encode())
    estimated_input = math.ceil((size + overhead) / 3) + 128 + (2048 if image else 0)
    source = data.get('source')
    chunks = source.get('chunks', []) if isinstance(source, dict) else []
    source_chars = sum(len(c.get('text', '')) for c in chunks if isinstance(c, dict))
    desired = dict(read=3072, simplify=min(4096, max(768, math.ceil(source_chars * 2 / 3) + 384)),
                   prepare=1536, check=4096, define=768, explain=1024)[operation]
    # Preserve capacity for longer output, while avoiding reserving 8K tokens
    # for every small OCR. If this request cannot fit 8K TPM, fail explicitly
    # rather than silently shrink it into unusable/truncated output.
    room = max(0, 8000 - estimated_input - 256)
    return min(desired, room), min(ceilings[operation], room), estimated_input
