export const runtime = 'nodejs';
const json = (body: unknown, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return json({ error: 'Sync is not configured' }, 503);
  try {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    if (reader) for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 250000) { await reader.cancel(); return json({ error: 'Request too large' }, 413); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof body.cursor !== 'string' || !/^\d{1,18}$/.test(body.cursor) || !Array.isArray(body.operations) || body.operations.length > 100) return json({ error: 'Invalid request' }, 400);
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/money_sync`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: authorization },
      body: JSON.stringify({ p_cursor: body.cursor, p_operations: body.operations }),
    });
    if (!response.ok) {
      console.error('Supabase sync failed', { status: response.status });
      return json({ error: response.status === 401 || response.status === 403 ? 'Authentication required' : 'Sync unavailable' }, response.status === 401 || response.status === 403 ? 401 : 502);
    }
    return json(await response.json(), 200);
  } catch (error) {
    console.error('Sync request failed', { name: error instanceof Error ? error.name : 'UnknownError' });
    return json({ error: 'Sync unavailable' }, 503);
  }
}
