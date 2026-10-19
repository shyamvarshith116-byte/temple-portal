import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import prisma from '../db.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { authenticate } from '../middleware/auth.js';
import { UserStatus } from '@prisma/client';

// ── Schemas ────────────────────────────────────────────────────────────────
const RegisterSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  fullName: z.string().min(2).max(128),
  phoneNumber: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

// ── Helpers ────────────────────────────────────────────────────────────────
function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

async function buildJwt(app: FastifyInstance, userId: string, email: string, roles: string[]) {
  return app.jwt.sign({ userId, email, roles }, { expiresIn: '7d' });
}

async function getUserRoles(userId: string): Promise<string[]> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    select: { role: { select: { name: true } } },
  });
  return userRoles.map((ur) => ur.role.name);
}

// ── Routes ────────────────────────────────────────────────────────────────
export default async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/register
  app.post('/register', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = RegisterSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 'Validation failed', 400, body.error.issues);

    const { email, password, fullName, phoneNumber } = body.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return sendError(reply, 'Email already registered', 409);

    const passwordHash = await bcrypt.hash(password, 12);

    // Find or create DEVOTEE role
    const devoteeRole = await prisma.role.findFirst({ where: { name: 'DEVOTEE' } });
    if (!devoteeRole) return sendError(reply, 'Server configuration error', 500);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName,
          phoneNumber: phoneNumber ?? null,
          status: UserStatus.ACTIVE,
        },
        select: { id: true, email: true, fullName: true, createdAt: true },
      });

      await tx.userRole.create({
        data: { userId: newUser.id, roleId: devoteeRole.id },
      });

      return newUser;
    });

    const roles = await getUserRoles(user.id);
    const token = await buildJwt(app, user.id, user.email, roles);
    const tokenHash = hashToken(token);

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        userAgent: req.headers['user-agent'] ?? null,
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return sendSuccess(reply, { user, token, roles }, 201);
  });

  // POST /api/auth/login
  app.post('/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = LoginSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 'Validation failed', 400, body.error.issues);

    const { email, password } = body.data;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true, email: true, fullName: true, avatarUrl: true,
        passwordHash: true, status: true, isEmailVerified: true,
      },
    });

    if (!user || !user.passwordHash) return sendError(reply, 'Invalid credentials', 401);
    if (user.status !== UserStatus.ACTIVE) return sendError(reply, 'Account suspended or deleted', 403);

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return sendError(reply, 'Invalid credentials', 401);

    const roles = await getUserRoles(user.id);
    const token = await buildJwt(app, user.id, user.email, roles);
    const tokenHash = hashToken(token);

    // Expire old sessions older than 30 days
    await prisma.session.updateMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
      data: { isRevoked: true },
    });

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        userAgent: req.headers['user-agent'] ?? null,
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const { passwordHash: _pw, ...safeUser } = user;
    return sendSuccess(reply, { user: safeUser, token, roles });
  });

  // POST /api/auth/logout — revoke current session
  app.post('/logout', { preHandler: authenticate }, async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization ?? '';
    const rawToken = authHeader.replace(/^Bearer\s+/i, '');
    const tokenHash = hashToken(rawToken);

    await prisma.session.updateMany({
      where: { tokenHash },
      data: { isRevoked: true },
    });

    return sendSuccess(reply, { message: 'Logged out successfully' });
  });

  // GET /api/auth/me — get current user profile
  app.get('/me', { preHandler: authenticate }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true, email: true, fullName: true, avatarUrl: true,
        phoneNumber: true, status: true, isEmailVerified: true,
        isPhoneVerified: true, createdAt: true,
        userRoles: {
          select: {
            role: { select: { name: true } },
            temple: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    if (!user) return sendError(reply, 'User not found', 404);
    return sendSuccess(reply, user);
  });

  // PATCH /api/auth/me — update profile
  app.patch('/me', { preHandler: authenticate }, async (req: FastifyRequest, reply: FastifyReply) => {
    const UpdateSchema = z.object({
      fullName: z.string().min(2).max(128).optional(),
      phoneNumber: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(),
      avatarUrl: z.string().url().max(512).optional(),
    });

    const body = UpdateSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 'Validation failed', 400, body.error.issues);

    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data: body.data,
      select: {
        id: true, email: true, fullName: true, avatarUrl: true,
        phoneNumber: true, isEmailVerified: true, isPhoneVerified: true,
      },
    });

    return sendSuccess(reply, updated);
  });

  // POST /api/auth/change-password
  app.post('/change-password', { preHandler: authenticate }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = ChangePasswordSchema.safeParse(req.body);
    if (!body.success) return sendError(reply, 'Validation failed', 400, body.error.issues);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { passwordHash: true },
    });

    if (!user?.passwordHash) return sendError(reply, 'Password not set for this account', 400);

    const valid = await bcrypt.compare(body.data.currentPassword, user.passwordHash);
    if (!valid) return sendError(reply, 'Current password is incorrect', 401);

    const newHash = await bcrypt.hash(body.data.newPassword, 12);
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { passwordHash: newHash },
    });

    // Revoke all existing sessions to force re-login everywhere
    await prisma.session.updateMany({
      where: { userId: req.user!.userId },
      data: { isRevoked: true },
    });

    return sendSuccess(reply, { message: 'Password changed. Please log in again.' });
  });
}
