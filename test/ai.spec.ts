import { describe, expect, it } from 'vitest';
import { fallbackSuggestion, parseAiSuggestion } from '../src/services/ai';

describe('AI suggestion parsing', () => {
  it('parses fenced JSON and removes invalid or reserved codes', () => {
    const suggestion = parseAiSuggestion(`
\`\`\`json
{
  "title": "Spring launch",
  "description": "Campaign landing page",
  "tags": ["spring", "launch"],
  "codes": ["spring-launch", "api", "INVALID SPACE", "spring-launch"]
}
\`\`\`
`);

    expect(suggestion).toEqual({
      title: 'Spring launch',
      description: 'Campaign landing page',
      tags: ['spring', 'launch'],
      codes: ['spring-launch'],
    });
  });

  it('returns null for malformed output', () => {
    expect(parseAiSuggestion('not json')).toBeNull();
    expect(
      parseAiSuggestion('{"title":"Only a title","codes":["api"]}'),
    ).toBeNull();
  });

  it('builds a deterministic URL-based fallback', () => {
    const suggestion = fallbackSuggestion(
      'https://example.com/blog/spring-launch',
    );
    expect(suggestion).toMatchObject({
      title: 'blog spring-launch',
      description: '',
      tags: [],
    });
    expect(suggestion.codes.every((code) => /^[a-z0-9]{8}$/u.test(code))).toBe(
      true,
    );
  });
});
