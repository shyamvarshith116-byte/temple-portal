import {
  PrismaClient,
  Prisma,
  UserStatus,
  ApprovalStatus,
  BookingStatus,
  PaymentStatus,
  PaymentGateway,
  MovementType,
  ReservationStatus,
  QrStatus,
  NotificationChannel,
  NotificationType,
  TicketStatus,
  AiMessageRole,
} from '@prisma/client';
import { prisma } from './db.js';

console.log('Testing Prisma Client and Enum typings...');

// Verify enums are available at runtime
const enums = {
  UserStatus,
  ApprovalStatus,
  BookingStatus,
  PaymentStatus,
  PaymentGateway,
  MovementType,
  ReservationStatus,
  QrStatus,
  NotificationChannel,
  NotificationType,
  TicketStatus,
  AiMessageRole,
};

console.log('Available runtime enums count:', Object.keys(enums).length);
console.log('Prisma client models count:', Object.keys(Prisma.ModelName).length);
console.log('Models defined in schema:', Object.values(Prisma.ModelName).join(', '));
console.log('Database client singleton instantiated successfully.');
