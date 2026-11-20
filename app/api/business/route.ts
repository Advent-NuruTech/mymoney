export const runtime = 'nodejs';

const actions = new Set(['list', 'create', 'join', 'invite', 'record', 'sales', 'record_transaction', 'transactions']);
const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in to use business accounts.' }, 401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return json({ error: 'Business accounts are unavailable.' }, 503);

  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Invalid business request.' }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 128000) {
        await reader.cancel();
        return json({ error: 'Request too large.' }, 413);
      }
      chunks.push(value);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return json({ error: 'Invalid business request.' }, 400);
    }
    if (!actions.has(body?.action) || !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
      return json({ error: 'Invalid business request.' }, 400);
    }
    const result = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/money_business`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: authorization },
      body: JSON.stringify({ p_action: body.action, p_data: body.data }),
    });
    if (result.ok) return json(await result.json(), 200);
    const failure = await result.json().catch(() => null);
    console.error('Supabase business request failed', { status: result.status, code: failure?.code });
    if (failure?.code === 'PGRST202') {
      return json({ error: 'Business accounts need a database update. Contact support.' }, 503);
    }
    if (result.status === 401 && failure?.code === '42501') {
      return json({ error: 'Business sign-in needs a server configuration update. Contact support.' }, 503);
    }
    if (result.status === 401) {
      return json({ error: 'Business accounts could not verify your sign-in. Try again, or contact support if it continues.' }, 401);
    }
    if (result.status === 403) return json({ error: 'You do not have access to this action.' }, 403);
    if (result.status === 400) return json({ error: 'Check the information you entered and try again.' }, 400);
    return json({ error: 'Business accounts are unavailable. Try again shortly.' }, 503);
  } catch {
    return json({ error: 'Could not reach business accounts. Try again shortly.' }, 503);
  }
}
