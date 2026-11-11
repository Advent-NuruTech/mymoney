import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('serves the app, exposes Clerk configuration, and protects synchronization', async () => {
  const port = 3199;
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {env:{...process.env, CLERK_DOMAIN:'example.clerk.accounts.dev', CLERK_PUBLISHABLE_KEY:'pk_test_example'}});
  try {
    await new Promise((resolve, reject) => {
      let output = '';
      server.stdout.on('data', chunk => { output += chunk; if (output.includes('Ready')) resolve(); });
      server.once('error', reject);
      server.once('exit', code => reject(new Error(`Next.js exited before starting (${code})`)));
      setTimeout(() => reject(new Error('Next.js did not start in time')), 30000).unref();
    });
    for (const path of ['/', '/activity', '/app.js', '/manifest.webmanifest', '/sw.js']) {
      const response = await fetch(`http://localhost:${port}${path}`);
      assert.equal(response.status, 200, path);
    }
    const config = await (await fetch(`http://localhost:${port}/api/config`)).json();
    assert.equal(config.clerkDomain, 'example.clerk.accounts.dev');
    assert.equal(config.publishableKey, 'pk_test_example');
    const response = await fetch(`http://localhost:${port}/api/sync`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entries:[]})});
    assert.equal(response.status, 401);
  } finally { server.kill(); }
});
