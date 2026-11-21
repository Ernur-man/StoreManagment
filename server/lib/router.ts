/**
 * Minimal Express-compatible router used by Next.js Route Handlers.
 *
 * The original business logic was written as Express middleware. Instead of
 * rewriting every route body, this adapter gives those handlers the small
 * subset of the Express Request/Response API they actually use and runs them
 * on Web Standard Request/Response objects inside Vercel Functions.
 */
import type { AuthUser } from './auth.js';

export interface HttpRequest {
  method: string;
  path: string;
  url: string;
  params: Record<string, string>;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  cookies: Record<string, string>;
  authUser?: AuthUser;
}

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: boolean | 'lax' | 'strict' | 'none';
  maxAge?: number;
  path?: string;
  expires?: Date;
  domain?: string;
}

type ResponseBody =
  | { kind: 'json'; value: unknown }
  | { kind: 'text'; value: string }
  | { kind: 'empty' };

export interface HttpResponse {
  statusCode: number;
  headers: Headers;
  finished: boolean;
  status(code: number): HttpResponse;
  json(value: unknown): HttpResponse;
  send(value: unknown): HttpResponse;
  sendStatus(code: number): HttpResponse;
  setHeader(name: string, value: string | string[]): HttpResponse;
  getHeader(name: string): string | string[] | undefined;
  cookie(name: string, value: string, options?: CookieOptions): HttpResponse;
  clearCookie(name: string, options?: Pick<CookieOptions, 'path' | 'domain'>): HttpResponse;
  toResponse(): Response;
}

export type NextFunction = (error?: unknown) => void;
export type RequestHandler = (
  req: HttpRequest,
  res: HttpResponse,
  next: NextFunction,
) => unknown | Promise<unknown>;

interface RouteDefinition {
  method: string;
  path: string;
  handlers: RequestHandler[];
}

interface MountDefinition {
  path: string;
  router: Router;
  middlewares: RequestHandler[];
}

function normalizePath(path: string): string {
  if (!path) return '/';
  const withSlash = path.startsWith('/') ? path : `/${path}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
}

function splitPath(path: string): string[] {
  return normalizePath(path).split('/').filter(Boolean);
}

function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const expected = splitPath(pattern);
  const actual = splitPath(pathname);
  if (expected.length !== actual.length) return null;

  const params: Record<string, string> = {};
  for (let index = 0; index < expected.length; index += 1) {
    const segment = expected[index]!;
    if (segment.startsWith(':')) {
      try {
        params[segment.slice(1)] = decodeURIComponent(actual[index]!);
      } catch {
        return null;
      }
      continue;
    }
    if (segment !== actual[index]) return null;
  }
  return params;
}

function parseCookies(header: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) continue;
    try {
      result[name] = decodeURIComponent(value);
    } catch {
      result[name] = value;
    }
  }
  return result;
}

function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${value}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  } else if (options.maxAge !== undefined) {
    parts.push(`Expires=${new Date(Date.now() + options.maxAge).toUTCString()}`);
  }
  if (options.domain) parts.push(`Domain=${options.domain}`);
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) {
    const sameSite = options.sameSite === true ? 'Strict' : options.sameSite[0].toUpperCase() + options.sameSite.slice(1);
    parts.push(`SameSite=${sameSite}`);
  }
  return parts.join('; ');
}

export class Router {
  private readonly middlewares: RequestHandler[] = [];
  private readonly routes: RouteDefinition[] = [];
  private readonly mounts: MountDefinition[] = [];

  use(handler: RequestHandler): void;
  use(path: string, handler: RequestHandler): void;
  use(pathOrHandler: string | RequestHandler, maybeHandler?: RequestHandler): void {
    if (typeof pathOrHandler === 'string' && maybeHandler) {
      this.middlewares.push((req, res, next) => {
        const local = normalizePath(pathOrHandler);
        if (local !== '/' && req.path !== local && !req.path.startsWith(`${local}/`)) {
          next();
          return;
        }
        const previous = req.path;
        req.path = normalizePath(req.path.slice(local.length));
        Promise.resolve(maybeHandler(req, res, next)).finally(() => {
          req.path = previous;
        });
      });
      return;
    }
    this.middlewares.push(pathOrHandler as RequestHandler);
  }

  mount(path: string, router: Router): void {
    this.mounts.push({ path: normalizePath(path), router, middlewares: [...this.middlewares] });
  }

  get(path: string, ...handlers: RequestHandler[]): void {
    this.add('GET', path, handlers);
  }

  post(path: string, ...handlers: RequestHandler[]): void {
    this.add('POST', path, handlers);
  }

  patch(path: string, ...handlers: RequestHandler[]): void {
    this.add('PATCH', path, handlers);
  }

  put(path: string, ...handlers: RequestHandler[]): void {
    this.add('PUT', path, handlers);
  }

  delete(path: string, ...handlers: RequestHandler[]): void {
    this.add('DELETE', path, handlers);
  }

  private add(method: string, path: string, handlers: RequestHandler[]): void {
    this.routes.push({ method, path: normalizePath(path), handlers: [...this.middlewares, ...handlers] });
  }

  /** Flatten mounted routers so a single Route Handler can dispatch the whole API. */
  flatten(prefix = ''): RouteDefinition[] {
    const base = normalizePath(prefix);
    const own = this.routes.map((route) => ({
      ...route,
      path: joinPaths(base, route.path),
    }));
    const mounted = this.mounts.flatMap((mount) =>
      mount.router.flatten(joinPaths(base, mount.path)).map((route) => ({
        ...route,
        handlers: [...mount.middlewares, ...route.handlers],
      })),
    );
    return [...own, ...mounted];
  }
}

function joinPaths(base: string, path: string): string {
  if (base === '/' || base === '') return path;
  if (path === '/' || path === '') return base;
  return normalizePath(`${base}${path}`);
}

function createResponse(): HttpResponse {
  const headers = new Headers();
  let statusCode = 200;
  let body: ResponseBody = { kind: 'empty' };

  const response: HttpResponse = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(value: number) {
      statusCode = value;
    },
    headers,
    get finished() {
      return body.kind !== 'empty';
    },
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(value: unknown) {
      body = { kind: 'json', value };
      headers.set('Content-Type', 'application/json; charset=utf-8');
      return response;
    },
    send(value: unknown) {
      if (typeof value === 'string') {
        body = { kind: 'text', value };
        headers.set('Content-Type', 'text/plain; charset=utf-8');
      } else if (value === undefined || value === null) {
        body = { kind: 'empty' };
      } else {
        body = { kind: 'json', value };
        headers.set('Content-Type', 'application/json; charset=utf-8');
      }
      return response;
    },
    sendStatus(code: number) {
      statusCode = code;
      body = { kind: 'text', value: code === 204 ? '' : `${code}` };
      return response;
    },
    setHeader(name: string, value: string | string[]) {
      if (Array.isArray(value)) {
        headers.delete(name);
        value.forEach((item) => headers.append(name, item));
      } else {
        headers.set(name, value);
      }
      return response;
    },
    getHeader(name: string) {
      const value = headers.get(name);
      if (value === null) return undefined;
      return value;
    },
    cookie(name: string, value: string, options: CookieOptions = {}) {
      headers.append('Set-Cookie', serializeCookie(name, value, options));
      return response;
    },
    clearCookie(name: string, options: Pick<CookieOptions, 'path' | 'domain'> = {}) {
      headers.append(
        'Set-Cookie',
        serializeCookie(name, '', {
          ...options,
          maxAge: 0,
          expires: new Date(0),
        }),
      );
      return response;
    },
    toResponse() {
      if (body.kind === 'json') {
        return new Response(JSON.stringify(body.value), { status: statusCode, headers });
      }
      if (body.kind === 'text') {
        return new Response(body.value, { status: statusCode, headers });
      }
      return new Response(null, { status: statusCode, headers });
    },
  };

  return response;
}

export interface HandleOptions {
  /** Base path stripped from the incoming URL before route matching. */
  basePath?: string;
  /** Route paths that must receive the exact raw request body (webhooks). */
  rawBodyPaths?: (string | RegExp)[];
  /** Extra route definitions prepended by the root API router. */
  extraRoutes?: RouteDefinition[];
}

function isRawBodyRequest(method: string, pathname: string, patterns: (string | RegExp)[]): boolean {
  if (method !== 'POST') return false;
  return patterns.some((pattern) =>
    typeof pattern === 'string' ? normalizePath(pattern) === pathname : pattern.test(pathname),
  );
}

export async function handleRequest(
  router: Router,
  request: Request,
  options: HandleOptions = {},
): Promise<Response> {
  const url = new URL(request.url);
  const basePath = normalizePath(options.basePath ?? '/api');
  const pathname = basePath === '/'
    ? normalizePath(url.pathname)
    : normalizePath(url.pathname.slice(basePath.length) || '/');

  const raw = isRawBodyRequest(request.method, pathname, options.rawBodyPaths ?? []);
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  const limit = raw ? 1024 * 1024 : 2 * 1024 * 1024;
  if (contentLength > limit) {
    return new Response(JSON.stringify({ error: 'PAYLOAD_TOO_LARGE', message: 'errors.payloadTooLarge' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    if (raw) {
      body = Buffer.from(await request.text(), 'utf8');
    } else if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const text = await request.text();
      body = text ? JSON.parse(text) : undefined;
    }
  } catch {
    return new Response(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'errors.invalidJson' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const headers: Record<string, string | string[]> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const req: HttpRequest = {
    method: request.method,
    path: pathname,
    url: request.url,
    params: {},
    query: Object.fromEntries(url.searchParams.entries()),
    body,
    headers,
    cookies: parseCookies(request.headers.get('cookie')),
  };

  const res = createResponse();
  const routes = [...(options.extraRoutes ?? []), ...router.flatten()];
  const route = routes.find((candidate) => {
    if (candidate.method !== request.method) return false;
    const params = matchPath(candidate.path, pathname);
    if (!params) return false;
    req.params = params;
    return true;
  });

  if (!route) {
    return new Response(JSON.stringify({ error: 'NOT_FOUND', message: 'errors.notFound' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let error: unknown;
  let nextCalled = false;

  for (const handler of route.handlers) {
    nextCalled = false;
    const next: NextFunction = (thrown?: unknown) => {
      if (thrown !== undefined) error = thrown;
      nextCalled = true;
    };
    try {
      await handler(req, res, next);
    } catch (thrown) {
      error = thrown;
    }
    if (error !== undefined || res.finished || !nextCalled) break;
  }

  if (error !== undefined) {
    const { errorHandler } = await import('./http.js');
    errorHandler(error, req, res, () => {});
  }

  return res.toResponse();
}
