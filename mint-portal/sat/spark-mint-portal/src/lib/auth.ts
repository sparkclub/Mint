import { NextRequest } from 'next/server';

export function requireAuth(req: NextRequest): string | null {
  const token = process.env.BASIC_AUTH_TOKEN || '';
  if (!token) return null; 
  const auth = req.headers.get('authorization') || '';
  return auth === `Bearer ${token}` ? null : 'Unauthorized';
}
