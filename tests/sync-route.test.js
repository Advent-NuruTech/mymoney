import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/sync/route.ts';

test('sync requires authentication', async () => {
  const response = await POST(new Request('http://localhost/api/sync', { method: 'POST' }));
  assert.equal(response.status, 401);
});

test('sync forwards the user token and bounded operations to Supabase', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable-test';
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://example.supabase.co/rest/v1/rpc/money_sync');
      assert.equal(options.headers.Authorization, 'Bearer session-token');
      assert.equal(options.headers.apikey, 'publishable-test');
      assert.deepEqual(JSON.parse(options.body), { p_cursor: '4', p_operations: [] });
      return Response.json({ results: [], changes: [] });
    };
    const response = await POST(new Request('http://localhost/api/sync', {method:'POST', headers:{Authorization:'Bearer session-token'}, body:JSON.stringify({cursor:'4', operations:[]})}));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {results:[], changes:[]});
    const invalid = await POST(new Request('http://localhost/api/sync', {method:'POST', headers:{Authorization:'Bearer session-token'}, body:JSON.stringify({cursor:'-1', operations:[]})}));
    assert.equal(invalid.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});
