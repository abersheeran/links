import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from './types';
import { ApiError, errorMessage, errorPayload } from './lib/errors';
import { enforceBodySize, publicText } from './lib/http';
import { adminRoutes } from './routes/admin';
import { linkRoutes } from './routes/links';
import { apiKeyRoutes } from './routes/apiKeys';
import { meRoutes } from './routes/me';
import { aiRoutes } from './routes/ai';
import { analyticsRoutes } from './routes/analytics';
import { redirectRoutes } from './routes/redirect';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';

export const app = new Hono<AppEnv>();

app.use('*', async (context, next) => {
  const incomingRequestId =
    context.req.header('cf-ray') ?? context.req.header('x-request-id');
  const requestId =
    incomingRequestId !== undefined &&
    incomingRequestId.length > 0 &&
    incomingRequestId.length <= 128
      ? incomingRequestId
      : crypto.randomUUID();
  context.set('requestId', requestId);
  context.set('startedAt', Date.now());

  try {
    await next();
  } finally {
    context.header('x-request-id', requestId);
    console.log(
      JSON.stringify({
        event: 'request',
        requestId,
        method: context.req.method,
        path: context.req.path,
        status: context.res.status,
        durationMs: Date.now() - context.get('startedAt'),
        tenantId: context.get('auth')?.tenantId ?? null,
      }),
    );
  }
});

app.use('/api/*', async (context, next) => {
  enforceBodySize(context);
  await next();
});

app.get('/healthz', (context) =>
  context.json({
    data: {
      ok: true,
      service: 'links',
      time: new Date().toISOString(),
    },
  }),
);

app.get(
  '/robots.txt',
  () =>
    new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    }),
);

app.get('/favicon.ico', (context) => context.body(null, 204));

async function serveAsset(context: Context<AppEnv>): Promise<Response> {
  const assets = context.env.ASSETS;
  if (assets === undefined) {
    return publicText('Not found.', 404);
  }
  return assets.fetch(context.req.raw);
}

app.get('/', serveAsset);
app.get('/login', serveAsset);
app.all('/app', serveAsset);
app.all('/app/*', serveAsset);
app.all('/assets/*', serveAsset);
app.get('/favicon.svg', serveAsset);

app.route('/', adminRoutes);
app.route('/', authRoutes);
app.route('/', userRoutes);
app.route('/', linkRoutes);
app.route('/', apiKeyRoutes);
app.route('/', meRoutes);
app.route('/', aiRoutes);
app.route('/', analyticsRoutes);
app.route('/', redirectRoutes);

app.notFound(async (context) => {
  if (context.req.path.startsWith('/api/')) {
    return context.json(
      {
        error: {
          code: 'not_found',
          message: 'Route not found.',
        },
      },
      404,
    );
  }
  if (context.req.method === 'GET' || context.req.method === 'HEAD') {
    return serveAsset(context);
  }
  return publicText('Not found.', 404);
});

app.onError((error, context) => {
  const requestId = context.get('requestId');
  if (requestId !== undefined) {
    context.header('x-request-id', requestId);
  }

  if (error instanceof ApiError) {
    return context.json(errorPayload(error), error.status);
  }

  console.error(
    JSON.stringify({
      event: 'unhandled_error',
      requestId: requestId ?? null,
      path: context.req.path,
      message: errorMessage(error),
      stack: error instanceof Error ? error.stack : null,
    }),
  );

  return context.json(
    {
      error: {
        code: 'internal_error',
        message: 'An unexpected error occurred.',
      },
    },
    500,
  );
});
