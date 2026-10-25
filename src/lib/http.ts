import type { Context } from 'hono';
import type { z } from 'zod';
import type { AppEnv } from '../types';
import { ApiError } from './errors';

const encoder = new TextEncoder();

export async function readJson<T>(
  context: Context<AppEnv>,
  schema: z.ZodType<T>,
): Promise<T> {
  let body: string;
  try {
    body = await context.req.text();
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON.');
  }

  if (encoder.encode(body).byteLength > 64 * 1024) {
    throw new ApiError(
      413,
      'payload_too_large',
      'Request body exceeds 64 KiB.',
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON.');
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ApiError(
      422,
      'validation_error',
      'Request validation failed.',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  return result.data;
}

export function readQuery<T>(
  context: Context<AppEnv>,
  schema: z.ZodType<T>,
): T {
  const result = schema.safeParse(context.req.query());
  if (!result.success) {
    throw new ApiError(
      422,
      'validation_error',
      'Query validation failed.',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  return result.data;
}

export function enforceBodySize(context: Context<AppEnv>): void {
  if (!['POST', 'PUT', 'PATCH'].includes(context.req.method)) {
    return;
  }

  const rawLength = context.req.header('content-length');
  if (rawLength === undefined) {
    return;
  }

  const length = Number(rawLength);
  if (Number.isFinite(length) && length > 64 * 1024) {
    throw new ApiError(
      413,
      'payload_too_large',
      'Request body exceeds 64 KiB.',
    );
  }
}

export function requireBearerToken(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const match = /^Bearer ([^\s]+)$/iu.exec(value);
  return match?.[1] ?? null;
}

export function publicText(message: string, status: 404 | 410): Response {
  return new Response(`${message}\n`, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
      'x-content-type-options': 'nosniff',
    },
  });
}
