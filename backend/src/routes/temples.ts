import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import prisma from '../db.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../utils/response.js';
import { authenticate, requireRole } from '../middleware/auth.js';

// ── Routes ────────────────────────────────────────────────────────────────
export default async function templeRoutes(app: FastifyInstance) {

  // GET /api/temples — public list of active temples
  app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const { page, limit, skip } = parsePagination(req);
    const query = req.query as Record<string, string>;
    const search = query.search?.trim();
    const state = query.state?.trim();

    const where = {
      isActive: true,
      isArchived: false,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { city: { contains: search, mode: 'insensitive' as const } },
          { deity: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
      ...(state && { state: { equals: state, mode: 'insensitive' as const } }),
    };

    const [temples, total] = await Promise.all([
      prisma.temple.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          id: true, slug: true, name: true, deity: true, description: true,
          city: true, state: true, latitude: true, longitude: true,
          isActive: true, createdAt: true,
        },
      }),
      prisma.temple.count({ where }),
    ]);

    return sendSuccess(reply, temples, 200, buildPaginationMeta(total, page, limit));
  });

  // GET /api/temples/:slug — public single temple detail
  app.get('/:slug', async (req: FastifyRequest, reply: FastifyReply) => {
    const { slug } = req.params as { slug: string };

    const temple = await prisma.temple.findUnique({
      where: { slug },
      include: {
        prasadamItems: {
          where: { status: 'AVAILABLE' },
          orderBy: { name: 'asc' },
          select: {
            id: true, slug: true, name: true, description: true, price: true,
            allergens: true, ingredients: true, maxQuantityPerDevotee: true,
            shelfLifeHours: true, isPerishable: true, status: true,
            thumbnailMedia: { select: { fileUrl: true, altText: true } },
          },
        },
        mediaAssets: {
          where: { assetType: 'BANNER' },
          select: { fileUrl: true, altText: true },
          take: 5,
        },
        pickupCounters: {
          where: { isActive: true },
          select: { id: true, name: true, location: true },
        },
      },
    });

    if (!temple) return sendError(reply, 'Temple not found', 404);
    return sendSuccess(reply, temple);
  });

  // ── Admin-only routes ────────────────────────────────────────────────────

  // POST /api/temples — create temple (MAIN_ADMIN only)
  app.post(
    '/',
    { preHandler: [authenticate, requireRole('MAIN_ADMIN')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const CreateTempleSchema = z.object({
        slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
        name: z.string().min(2).max(200),
        deity: z.string().min(2).max(128),
        description: z.string().min(10),
        contactEmail: z.string().email().max(255),
        contactPhone: z.string().max(32),
        addressLine1: z.string().max(255),
        city: z.string().max(100),
        state: z.string().max(100),
        postalCode: z.string().max(20),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      });

      const body = CreateTempleSchema.safeParse(req.body);
      if (!body.success) return sendError(reply, 'Validation failed', 400, body.error.issues);

      const existing = await prisma.temple.findUnique({ where: { slug: body.data.slug } });
      if (existing) return sendError(reply, 'Temple slug already exists', 409);

      const temple = await prisma.temple.create({ data: body.data });
      return sendSuccess(reply, temple, 201);
    }
  );

  // PATCH /api/temples/:id — update temple (MAIN_ADMIN or TEMPLE_ADMIN of that temple)
  app.patch(
    '/:id',
    { preHandler: [authenticate, requireRole('MAIN_ADMIN', 'TEMPLE_ADMIN')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };

      const UpdateTempleSchema = z.object({
        name: z.string().min(2).max(200).optional(),
        deity: z.string().min(2).max(128).optional(),
        description: z.string().min(10).optional(),
        contactEmail: z.string().email().max(255).optional(),
        contactPhone: z.string().max(32).optional(),
        addressLine1: z.string().max(255).optional(),
        city: z.string().max(100).optional(),
        state: z.string().max(100).optional(),
        postalCode: z.string().max(20).optional(),
        isActive: z.boolean().optional(),
      });

      const body = UpdateTempleSchema.safeParse(req.body);
      if (!body.success) return sendError(reply, 'Validation failed', 400, body.error.issues);

      const temple = await prisma.temple.findUnique({ where: { id } });
      if (!temple) return sendError(reply, 'Temple not found', 404);

      // TEMPLE_ADMIN can only update their own temple
      if (req.user!.roles.includes('TEMPLE_ADMIN') && !req.user!.roles.includes('MAIN_ADMIN')) {
        const hasAccess = await prisma.userRole.findFirst({
          where: { userId: req.user!.userId, templeId: id, role: { name: 'TEMPLE_ADMIN' } },
        });
        if (!hasAccess) return sendError(reply, 'Forbidden — not your temple', 403);
      }

      const updated = await prisma.temple.update({ where: { id }, data: body.data });
      return sendSuccess(reply, updated);
    }
  );
}
