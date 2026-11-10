export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ publishableKey: process.env.CLERK_PUBLISHABLE_KEY || '', clerkDomain: process.env.CLERK_DOMAIN || '' }, { headers: { 'Cache-Control': 'no-store' } });
}
