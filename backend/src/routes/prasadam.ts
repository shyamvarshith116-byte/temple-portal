import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import prisma from '../db.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../utils/response.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { PrasadamStatus } from '@prisma/client';

export default async function prasadamRoutes(app: FastifyInstance) {

  // GET /api/prasadam — list items (optionally filtered by temple)
  app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const { page, limit, skip } = parsePagination(req);
    const q = req.query as Record<string, string>;

    const where = {
      ...(q.templeId && { templeId: q.templeId }),
      ...(q.status
        ? { status: q.status as PrasadamStatus }
        : { status: PrasadamStatus.AVAILABLE }),
      ...(q.search && {
        OR: [
          { name: { contains: q.search, mode: 'insensitive' as const } },
          { description: { contains: q.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.prasadamItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          id: true, templeId: true, slug: true, name: true, description: true,
          price: true, ingredients: true, allergens: true, shelfLifeHours: true,
          isPerishable: true, maxQuantityPerDevotee: true,
          preparationTimeMinutes: true, status: true, createdAt: true,
          temple: { select: { id: true, name: true, slug: true } },
          thumbnailMedia: { select: { fileUrl: true, altText: true } },
          inventory: {
            select: { quantityAvailable: true, quantityReserved: true, reorderLevel: true },
          },
        },
      }),
      prisma.prasadamItem.count({ where }),
    ]);

    return sendSuccess(reply, items, 200, buildPaginationMeta(total, page, limit));
  });

  // GET /api/prasadam/:id — single item detail
  app.get('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    const item = await prisma.prasadamItem.findUnique({
      where: { id },
      include: {
        temple: { select: { id: true, name: true, slug: true, city: true } },
        thumbnailMedia: { select: { fileUrl: true, altText: true } },
        inventory: {
          select: { quantityAvailable: true, quantityReserved: true },
        },
        containers: {
          select: { container: { select: { id: true, title: true, layout: true } } },
        },
      },
    });

    if (!item) return sendError(reply, 'Prasadam item not found', 404);
    return sendSuccess(reply, item);
  });

  // POST /api/prasadam — create item (TEMPLE_ADMIN / MAIN_ADMIN)
  app.post(
    '/',
    { preHandler: [authenticate, requireRole('MAIN_ADMIN', 'TEMPLE_ADMIN')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const Schema = z.object({
        templeId: z.string().uuid(),
        slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
        name: z.string().min(2).max(200),
        description: z.string().min(10),
        price: z.number().positive().max(100000),
        ingredients: z.string().optional(),
        allergens: z.string().optional(),
        shelfLifeHours: z.number().int().positive().optional(),
        isPerishable: z.boolean().default(false),
        maxQuantityPerDevotee: z.number().int().positive().max(100).default(5),
        preparationTimeMinutes: z.number().int().nonnegative().optional(),
        thumbnailMediaId: z.string().uuid().optional(),
        initialStock: z.number().int().nonnegative().default(0),
        reorderLevel: z.number().int().nonnegative().default(10),
      });

      const body = Schema.safeParse(req.body);
      if (!body.success) return sendError(reply, 'Validation failed', 400, body.error.issues);

      const temple = await prisma.temple.findUnique({ where: { id: body.data.templeId } });
      if (!temple) return sendError(reply, 'Temple not found', 404);

      // TEMPLE_ADMIN scope check
      if (!req.user!.roles.includes('MAIN_ADMIN')) {
        const hasAccess = await prisma.userRole.findFirst({
          where: {
            userId: req.user!.userId,
            templeId: body.data.templeId,
            role: { name: 'TEMPLE_ADMIN' },
          },
        });
        if (!hasAccess) return sendError(reply, 'Forbidden — not your temple', 403);
      }

      const { initialStock, reorderLevel, ...itemData } = body.data;

      const item = await prisma.$transaction(async (tx) => {
        const created = await tx.prasadamItem.create({
          data: { ...itemData, status: PrasadamStatus.AVAILABLE },
        });

        // Create inventory record
        await tx.inventory.create({
          data: {
            templeId: body.data.templeId,
            itemId: created.id,
            quantityAvailable: initialStock,
            quantityReserved: 0,
            reorderLevel,
            lastRestockedAt: initialStock > 0 ? new Date() : null,
          },
        });

        if (initialStock > 0) {
          await tx.inventoryMovement.create({
            data: {
              templeId: body.data.templeId,
              itemId: created.id,
              movementType: 'RESTOCK',
              quantityDelta: initialStock,
              quantityBefore: 0,
              quantityAfter: initialStock,
              reason: 'Initial stock',
              initiatedById: req.user!.userId,
            },
          });
        }

        return created;
      });

      return sendSuccess(reply, item, 201);
    }
  );

  // PATCH /api/prasadam/:id — update item
  app.patch(
    '/:id',
    { preHandler: [authenticate, requireRole('MAIN_ADMIN', 'TEMPLE_ADMIN')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const Schema = z.object({
        name: z.string().min(2).max(200).optional(),
        description: z.string().min(10).optional(),
        price: z.number().positive().max(100000).optional(),
        status: z.nativeEnum(PrasadamStatus).optional(),
        maxQuantityPerDevotee: z.number().int().positive().max(100).optional(),
        ingredients: z.string().optional(),
        allergens: z.string().optional(),
      });

      const body = Schema.safeParse(req.body);
      if (!body.success) return sendError(reply, 'Validation failed', 400, body.error.issues);

      const item = await prisma.prasadamItem.findUnique({ where: { id } });
      if (!item) return sendError(reply, 'Item not found', 404);

      if (!req.user!.roles.includes('MAIN_ADMIN')) {
        const hasAccess = await prisma.userRole.findFirst({
          where: {
            userId: req.user!.userId,
            templeId: item.templeId,
            role: { name: 'TEMPLE_ADMIN' },
          },
        });
        if (!hasAccess) return sendError(reply, 'Forbidden — not your temple', 403);
      }

      const updated = await prisma.prasadamItem.update({ where: { id }, data: body.data });
      return sendSuccess(reply, updated);
    }
  );

  // POST /api/prasadam/:id/restock — restock inventory
  app.post(
    '/:id/restock',
    { preHandler: [authenticate, requireRole('MAIN_ADMIN', 'TEMPLE_ADMIN')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const Schema = z.object({
        quantity: z.number().int().positive().max(10000),
        reason: z.string().max(255).optional(),
      });

      const body = Schema.safeParse(req.body);
      if (!body.success) return sendError(reply, 'Validation failed', 400, body.error.issues);

      const item = await prisma.prasadamItem.findUnique({
        where: { id },
        include: { inventory: true },
      });
      if (!item) return sendError(reply, 'Item not found', 404);
      if (!item.inventory) return sendError(reply, 'No inventory record for this item', 400);

      const before = item.inventory.quantityAvailable;
      const after = before + body.data.quantity;

      await prisma.$transaction([
        prisma.inventory.update({
          where: { itemId: id },
          data: { quantityAvailable: after, lastRestockedAt: new Date() },
        }),
        prisma.inventoryMovement.create({
          data: {
            templeId: item.templeId,
            itemId: id,
            movementType: 'RESTOCK',
            quantityDelta: body.data.quantity,
            quantityBefore: before,
            quantityAfter: after,
            reason: body.data.reason ?? 'Manual restock',
            initiatedById: req.user!.userId,
          },
        }),
      ]);

      return sendSuccess(reply, { itemId: id, before, after, delta: body.data.quantity });
    }
  );
}
