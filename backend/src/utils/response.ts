import { FastifyReply, FastifyRequest } from 'fastify';

// ── Standard API response helpers ─────────────────────────────────────────
export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  statusCode = 200,
  meta?: Record<string, unknown>
) {
  return reply.code(statusCode).send({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  });
}

export function sendError(
  reply: FastifyReply,
  message: string,
  statusCode = 400,
  details?: unknown
) {
  return reply.code(statusCode).send({
    success: false,
    error: { message, ...(details ? { details } : {}) },
  });
}

// ── Pagination helper ──────────────────────────────────────────────────────
export function parsePagination(request: FastifyRequest) {
  const query = request.query as Record<string, string>;
  const page = Math.max(1, parseInt(query.page ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function buildPaginationMeta(total: number, page: number, limit: number) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
  };
}

// ── UUID validation ────────────────────────────────────────────────────────
export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// ── Async error wrapper ────────────────────────────────────────────────────
export function asyncHandler<T>(
  fn: (req: FastifyRequest, reply: FastifyReply) => Promise<T>
) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      return await fn(req, reply);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return sendError(reply, message, 500);
    }
  };
}
