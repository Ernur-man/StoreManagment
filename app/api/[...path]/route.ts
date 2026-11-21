import { corsPreflight, handleApiRequest } from '../../../server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function dispatch(request: Request) {
  return handleApiRequest(request);
}

export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
export const PUT = dispatch;
export const DELETE = dispatch;

export function OPTIONS(request: Request) {
  return corsPreflight(request);
}
