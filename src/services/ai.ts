import { z } from 'zod';
import { errorMessage } from '../lib/errors';
import { randomCode } from '../lib/crypto';
import { isReservedCode, isValidCode } from '../lib/url';

const rawSuggestionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional().default(''),
  tags: z.array(z.string().trim().min(1).max(32)).optional().default([]),
  codes: z.array(z.string()).optional().default([]),
});

export interface LinkSuggestion {
  title: string;
  description: string;
  tags: string[];
  codes: string[];
}

function stripJsonFence(value: string): string {
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return '';
  }
  return value.slice(start, end + 1);
}

function sanitizeCodes(values: string[]): string[] {
  const codes = values
    .map((value) => value.trim().toLowerCase())
    .filter((value) => isValidCode(value) && !isReservedCode(value));

  return [...new Set(codes)].slice(0, 5);
}

export function parseAiSuggestion(responseText: string): LinkSuggestion | null {
  const json = stripJsonFence(responseText);
  if (json.length === 0) {
    return null;
  }

  try {
    const parsed = rawSuggestionSchema.safeParse(JSON.parse(json));
    if (!parsed.success) {
      return null;
    }

    const codes = sanitizeCodes(parsed.data.codes);
    if (codes.length === 0) {
      return null;
    }

    return {
      title: parsed.data.title,
      description: parsed.data.description,
      tags: [...new Set(parsed.data.tags)].slice(0, 10),
      codes,
    };
  } catch {
    return null;
  }
}

export function fallbackSuggestion(urlValue: string): LinkSuggestion {
  const url = new URL(urlValue);
  let decodedPath = url.pathname;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    // Keep the raw path when it contains malformed percent escapes.
  }
  const path = decodedPath.split('/').filter(Boolean).slice(-2).join(' ');
  const title = (path || url.hostname).slice(0, 200);

  return {
    title,
    description: '',
    tags: [],
    codes: Array.from({ length: 3 }, () => randomCode(8)),
  };
}

export async function suggestLink(
  env: Env,
  url: string,
): Promise<{ suggestion: LinkSuggestion; source: 'ai' | 'fallback' }> {
  try {
    const result = await env.AI.run(env.AI_MODEL, {
      messages: [
        {
          role: 'system',
          content:
            'You create concise metadata for shortened URLs. Return JSON only, with keys title, description, tags, codes. Do not invent page content that cannot be inferred from the URL. codes must contain 3-5 lowercase URL slugs using only letters, numbers, hyphens, or underscores, each 3-64 characters.',
        },
        {
          role: 'user',
          content: `Create title, description, tags, and short-code suggestions for this URL:\n${url}`,
        },
      ],
      max_tokens: 350,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const responseText = result.response;
    const suggestion =
      typeof responseText === 'string' ? parseAiSuggestion(responseText) : null;

    if (suggestion !== null) {
      return { suggestion, source: 'ai' };
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'ai_suggestion_failed',
        message: errorMessage(error),
      }),
    );
  }

  return {
    suggestion: fallbackSuggestion(url),
    source: 'fallback',
  };
}
