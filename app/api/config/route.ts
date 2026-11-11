export const dynamic = 'force-dynamic';

export function GET() {
  // Read at runtime so Docker deployments can supply either key name after build.
  const readEnv = (name: string) => process.env[name];
  return Response.json({ publishableKey: readEnv('CLERK_PUBLISHABLE_KEY') || readEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY') || '', clerkDomain: readEnv('CLERK_DOMAIN') || '' }, { headers: { 'Cache-Control': 'no-store' } });
}
