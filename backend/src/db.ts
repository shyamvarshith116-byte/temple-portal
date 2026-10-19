import { PrismaClient } from '@prisma/client';
import { config } from './config.js';

// Singleton Prisma client — reused across all route handlers
const prisma = new PrismaClient({
  log: config.isDev ? ['warn', 'error'] : ['error'],
});

export default prisma;
