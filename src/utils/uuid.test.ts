import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomUUID } from './uuid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUUID', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('returns a v4 UUID', () => {
        expect(randomUUID()).toMatch(UUID_V4);
    });

    it('falls back to getRandomValues when randomUUID is unavailable (insecure context)', () => {
        vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
        const a = randomUUID();
        const b = randomUUID();
        expect(a).toMatch(UUID_V4);
        expect(a).not.toBe(b);
    });
});
