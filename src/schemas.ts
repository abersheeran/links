import { z } from 'zod';
import { parseIsoToMs } from './lib/time';
import {
  isReservedCode,
  isValidCode,
  normalizeHostname,
  normalizeHttpUrl,
} from './lib/url';

const nameSchema = z.string().trim().min(1).max(80);
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Enter a valid email address.'));
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters.')
  .max(128);
const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(40)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u,
    'Use lowercase letters, numbers, and internal hyphens.',
  );

export const hostnameSchema = z
  .string()
  .trim()
  .transform((value, context) => {
    const hostname = normalizeHostname(value);
    if (hostname === null) {
      context.addIssue({
        code: 'custom',
        message: 'Enter a hostname without a path, port, or wildcard.',
      });
      return z.NEVER;
    }
    return hostname;
  });

export const targetUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .transform((value, context) => {
    const url = normalizeHttpUrl(value);
    if (url === null) {
      context.addIssue({
        code: 'custom',
        message:
          'Target URL must be an absolute HTTP(S) URL without credentials.',
      });
      return z.NEVER;
    }
    return url;
  });

export const codeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(64)
  .refine(isValidCode, {
    message: 'Use 3-64 lowercase letters, numbers, underscores, or hyphens.',
  })
  .refine((value) => !isReservedCode(value), {
    message: 'This short code is reserved.',
  });

const expiresAtSchema = z
  .string()
  .trim()
  .transform((value, context) => {
    const timestamp = parseIsoToMs(value);
    if (timestamp === null) {
      context.addIssue({
        code: 'custom',
        message: 'Use an ISO 8601 timestamp.',
      });
      return z.NEVER;
    }
    return timestamp;
  });

const tagsSchema = z
  .array(z.string().trim().min(1).max(32))
  .max(10)
  .transform((tags) => [...new Set(tags)]);

export const createTenantSchema = z.object({
  name: nameSchema,
  slug: slugSchema,
  hostname: hostnameSchema,
  apiKeyName: nameSchema.default('Default key'),
  owner: z
    .object({
      name: nameSchema,
      email: emailSchema,
      password: passwordSchema,
    })
    .optional(),
});

export const createLinkSchema = z.object({
  targetUrl: targetUrlSchema,
  code: codeSchema.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(1000).optional(),
  tags: tagsSchema.default([]),
  expiresAt: expiresAtSchema.optional(),
});

export const updateLinkSchema = z
  .object({
    targetUrl: targetUrlSchema.optional(),
    title: z.string().trim().max(200).nullable().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    tags: tagsSchema.optional(),
    status: z.enum(['active', 'disabled']).optional(),
    expiresAt: expiresAtSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const listLinksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().trim().min(1).max(500).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  q: z.string().trim().min(1).max(100).optional(),
});

export const createApiKeySchema = z.object({
  name: nameSchema,
});

export const aiSuggestionInputSchema = z.object({
  url: targetUrlSchema,
});

export const aiSuggestionOutputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).default(''),
  tags: z.array(z.string().trim().min(1).max(32)).max(10).default([]),
  codes: z.array(codeSchema).max(5).default([]),
});

export const analyticsQuerySchema = z.object({
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  linkId: z.uuid().optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['editor', 'viewer']),
});

export const createPlatformUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['owner', 'editor', 'viewer']),
});

export const updateUserSchema = z
  .object({
    role: z.enum(['editor', 'viewer']).optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const resetUserPasswordSchema = z.object({
  newPassword: passwordSchema,
});
