/**
 * CORS behavior preserved from the original Express app. The UI is same-origin
 * on Vercel, so this mainly supports credentialed API clients that explicitly
 * configure CLIENT_ORIGIN.
 */
function allowedOrigins(): string[] {
  return (process.env.CLIENT_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function withCors(response: Response, request: Request): Response {
  const origin = request.headers.get('origin');
  if (!origin || !allowedOrigins().includes(origin)) return response;

  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (!headers.get('Vary')?.toLowerCase().includes('origin')) {
    headers.append('Vary', 'Origin');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function corsPreflight(request: Request): Response {
  return withCors(new Response(null, { status: 204 }), request);
}
