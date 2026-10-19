import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendError } from '../utils/response.js';
import prisma from '../db.js';

// Extend FastifyRequest to carry decoded JWT payload
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: string;
      email: string;
      roles: string[];
    };
  }
}

// ── Authentication middleware ──────────────────────────────────────────────
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const payload = await request.jwtVerify<{
      userId: string;
      email: string;
      roles: string[];
    }>();

    // Check session is not revoked
    const authHeader = request.headers.authorization ?? '';
    const rawToken = authHeader.replace(/^Bearer\s+/i, '');

    // We store tokenHash in the DB for revocation; compare by hashing
    const { createHash } = await import('crypto');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const session = await prisma.session.findUnique({
      where: { tokenHash },
      select: { isRevoked: true, expiresAt: true },
    });

    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      return sendError(reply, 'Session expired or revoked. Please log in again.', 401);
    }

    request.user = payload;
  } catch {
    return sendError(reply, 'Unauthorized — invalid or missing token.', 401);
  }
}

// ── Role-based access guard factory ───────────────────────────────────────
export function requireRole(...allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) return sendError(reply, 'Unauthorized', 401);
    const hasRole = request.user.roles.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      return sendError(
        reply,
        `Forbidden — required role: ${allowedRoles.join(' or ')}`,
        403
      );
    }
  };
}

// ── Register decorators on the Fastify instance ──────────────────────────
export function registerAuthDecorators(app: FastifyInstance) {
  app.decorate('authenticate', authenticate);
}
