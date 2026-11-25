"""One logical generation's deadline/attempt budget, shared across adapters."""
from contextvars import ContextVar
from dataclasses import dataclass


@dataclass
class AttemptBudget:
    deadline: float
    remaining: int = 2

    def consume(self):
        if self.remaining <= 0:
            raise RuntimeError('Provider attempt budget exhausted.')
        self.remaining -= 1


active_budget: ContextVar[AttemptBudget | None] = ContextVar('mindbridge_attempt_budget', default=None)
