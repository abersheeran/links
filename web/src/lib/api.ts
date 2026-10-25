let csrfToken: string | null = null;

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  if (mutatingMethods.has(method) && csrfToken !== null) {
    headers.set('x-csrf-token', csrfToken);
  }

  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    method,
    headers,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    let code = 'request_failed';
    let message = `Request failed with status ${response.status}.`;
    let details: unknown;
    if (
      payload !== null &&
      typeof payload === 'object' &&
      'error' in payload &&
      payload.error !== null &&
      typeof payload.error === 'object'
    ) {
      const error = payload.error as {
        code?: unknown;
        message?: unknown;
        details?: unknown;
      };
      code = typeof error.code === 'string' ? error.code : code;
      message = typeof error.message === 'string' ? error.message : message;
      details = error.details;
    }

    if (response.status === 401 && !path.startsWith('/api/v1/auth/')) {
      window.dispatchEvent(new Event('links:unauthorized'));
    }
    throw new ApiRequestError(response.status, code, message, details);
  }

  return payload as T;
}

export function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

const friendlyErrorMessages: Record<string, string> = {
  invalid_credentials: '邮箱或密码不正确。',
  tenant_not_found: '当前域名未绑定租户，请从租户域名登录。',
  login_locked: '尝试次数过多，请稍后再试。',
  user_disabled: '该账号已停用，请联系租户所有者。',
  tenant_suspended: '当前租户已被暂停。',
  origin_invalid: '登录来源无效，请刷新页面后重试。',
  csrf_invalid: '安全校验失败，请刷新页面后重试。',
  permission_denied: '当前角色没有此操作权限。',
  analytics_not_configured: '分析查询尚未配置。',
  analytics_unavailable: '分析服务暂时不可用。',
  link_not_found: '短链接不存在或已删除。',
  code_conflict: '这个短码已经被占用。',
  email_conflict: '该邮箱已经在当前租户中使用。',
  owner_immutable: '所有者账号只能由平台运营者调整。',
  last_api_key: '请先创建另一把有效 API Key，再撤销最后一把。',
  validation_error: '提交内容不符合要求，请检查后重试。',
  payload_too_large: '提交内容过大。',
  invalid_json: '请求内容格式不正确。',
};

export function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) {
    return friendlyErrorMessages[error.code] ?? error.message ?? fallback;
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return fallback;
}
