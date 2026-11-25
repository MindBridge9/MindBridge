"""Bounded, single-process AI admission; no accounts or persistent identifiers."""
import asyncio
import hashlib
import math
import os
import time
from collections import OrderedDict, deque
from ipaddress import ip_address, ip_network
from .errors import error_response

AI_PATHS = frozenset('/api/' + op for op in (
    'read', 'simplify', 'define', 'explain', 'prepare-understanding', 'check-understanding'))


class RequestLimits:
    def __init__(self, app, settings, clock=time.monotonic):
        self.app, self.settings, self.clock = app, settings, clock
        self.active = 0
        self.minute, self.day, self.clients = deque(), deque(), OrderedDict()
        self.salt = os.urandom(16)
        self.trusted = tuple(ip_network(c, strict=False) for c in settings.trusted_proxy_cidrs)

    def client_key(self, scope):
        peer = (scope.get('client') or ('unknown',))[0]
        try:
            peer_ip = ip_address(peer)
            if any(peer_ip in net for net in self.trusted):
                raw = next((v for k,v in scope.get('headers', []) if k.lower() == b'x-forwarded-for'), b'')
                if 0 < len(raw) <= 1024:
                    chain = [ip_address(v.strip()) for v in raw.decode('ascii').split(',')]
                    if len(chain) <= 16:
                        for address in reversed(chain):
                            if not any(address in net for net in self.trusted):
                                peer = str(address)
                                break
        except (ValueError, UnicodeDecodeError):
            pass  # Malformed/untrusted forwarding headers do not alter peer identity.
        return hashlib.blake2b(peer.encode(), key=self.salt, digest_size=16).digest()

    def admit(self, key):
        now = self.clock()
        for events, seconds in ((self.minute, 60), (self.day, 86400)):
            while events and events[0] <= now-seconds: events.popleft()
        while self.clients and next(iter(self.clients.values()))[-1] <= now-60:
            self.clients.popitem(last=False)
        for events, limit, seconds in ((self.minute, self.settings.global_requests_per_minute, 60),
                                      (self.day, self.settings.global_requests_per_day, 86400)):
            if len(events) >= limit:
                return 'RATE_LIMITED', max(1, math.ceil(events[0]+seconds-now))
        events = self.clients.get(key)
        if events is None:
            if len(self.clients) >= self.settings.max_rate_limit_clients:
                oldest = next(iter(self.clients.values()))[-1]
                return 'SERVER_BUSY', max(1, math.ceil(oldest+60-now))
            events = self.clients[key] = deque()
        while events and events[0] <= now-60: events.popleft()
        if len(events) >= self.settings.client_requests_per_minute:
            return 'RATE_LIMITED', max(1, math.ceil(events[0]+60-now))
        events.append(now)
        self.clients.move_to_end(key)
        self.minute.append(now)
        self.day.append(now)
        return None, None

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope.get('method') != 'POST' or scope.get('path') not in AI_PATHS:
            return await self.app(scope, receive, send)
        from starlette.requests import Request
        request = Request(scope)
        if not self.settings.ai_enabled:
            return await error_response(request, 501, 'FEATURE_UNAVAILABLE', 'AI operations are temporarily disabled.')(scope, receive, send)
        if self.active >= self.settings.max_concurrent_ai_calls:
            return await error_response(request, 503, 'SERVER_BUSY', 'The server is busy. Keep your input and retry later.', retryable=True)(scope, receive, send)
        code, delay = self.admit(self.client_key(scope))
        if code:
            status = 429 if code == 'RATE_LIMITED' else 503
            return await error_response(request, status, code, 'Request limit reached. Keep your input and try later.',
                                        retryable=True, retry_after_seconds=delay)(scope, receive, send)
        self.active += 1
        try:
            # Include body reception and decoding: a stalled upload must not
            # occupy an admission slot indefinitely before the route runs.
            deadline = (self.settings.read_deadline_seconds if scope['path'] == '/api/read'
                        else self.settings.text_deadline_seconds)
            async with asyncio.timeout(deadline):
                await self.app(scope, receive, send)
        except TimeoutError:
            await error_response(request, 504, 'AI_TIMEOUT',
                                 'The request timed out. Keep your input and retry.', retryable=True)(scope, receive, send)
        finally:
            self.active -= 1
