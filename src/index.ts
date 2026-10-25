import { app } from './app';
import { cleanupExpiredSessions } from './lib/session';

export default {
  async fetch(
    request: Request,
    env: Env,
    executionCtx: ExecutionContext,
  ): Promise<Response> {
    const response = await app.fetch(request, env, executionCtx);
    const headers = new Headers(response.headers);
    headers.set('x-content-type-options', 'nosniff');
    headers.set('x-frame-options', 'DENY');
    headers.set('referrer-policy', 'no-referrer');
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/api/') || pathname === '/healthz') {
      headers.set('cache-control', 'no-store');
    } else if (pathname.startsWith('/assets/')) {
      headers.set('cache-control', 'public, max-age=31536000, immutable');
    }
    if (headers.get('content-type')?.includes('text/html') === true) {
      headers.set(
        'content-security-policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
    }
    headers.set(
      'x-request-id',
      headers.get('x-request-id') ?? crypto.randomUUID(),
    );

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
  scheduled(
    _controller: ScheduledController,
    env: Env,
    executionCtx: ExecutionContext,
  ): void {
    executionCtx.waitUntil(
      cleanupExpiredSessions(env).catch((error: unknown) => {
        console.error(
          JSON.stringify({
            event: 'session_cleanup_failed',
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }),
    );
  },
} satisfies ExportedHandler<Env>;
