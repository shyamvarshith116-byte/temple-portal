import {
  PrismaClient,
  UserStatus,
  PrasadamStatus,
  MediaAssetType,
  ContainerLayout,
  PaymentGateway,
  BookingStatus,
  PaymentStatus,
  QrStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting development-only database seeding...');

  // 1. Roles
  console.log('Creating system roles...');
  const roles = [
    { name: 'DEVOTEE', description: 'General devotee account for browsing and booking prasadam' },
    { name: 'COUNTER_STAFF', description: 'On-site counter staff for scanning QR tokens and distributing prasadam' },
    { name: 'TEMPLE_ADMIN', description: 'Temple management staff managing inventory, counters, and slots' },
    { name: 'MAIN_ADMIN', description: 'Global super-admin with portal-wide governance and approvals' },
    { name: 'AUDITOR', description: 'Financial and compliance auditor with read-only reporting access' },
  ];

  const roleMap: Record<string, string> = {};
  for (const r of roles) {
    const roleRecord = await prisma.role.upsert({
      where: { name: r.name },
      update: {},
      create: {
        name: r.name,
        description: r.description,
        permissions: ['*'],
      },
    });
    roleMap[r.name] = roleRecord.id;
  }

  // 2. Dev Users (All passwords hashed or mocked for local dev testing)
  console.log('Creating development users...');
  const mainAdmin = await prisma.user.upsert({
    where: { email: 'admin@dev.smarttemple.org' },
    update: {},
    create: {
      email: 'admin@dev.smarttemple.org',
      fullName: 'Chief Temple Administrator [DEV]',
      phoneNumber: '+919999000001',
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
      isPhoneVerified: true,
    },
  });

  const templeAdmin = await prisma.user.upsert({
    where: { email: 'admin.tirupati@dev.smarttemple.org' },
    update: {},
    create: {
      email: 'admin.tirupati@dev.smarttemple.org',
      fullName: 'Tirupati Executive Officer [DEV]',
      phoneNumber: '+919999000002',
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
      isPhoneVerified: true,
    },
  });

  const counterStaff = await prisma.user.upsert({
    where: { email: 'staff.counter1@dev.smarttemple.org' },
    update: {},
    create: {
      email: 'staff.counter1@dev.smarttemple.org',
      fullName: 'Counter Staff Raman [DEV]',
      phoneNumber: '+919999000003',
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
      isPhoneVerified: true,
    },
  });

  const devoteeUser = await prisma.user.upsert({
    where: { email: 'devotee.sharma@dev.smarttemple.org' },
    update: {},
    create: {
      email: 'devotee.sharma@dev.smarttemple.org',
      fullName: 'Aditya Sharma [DEV DEVOTEE]',
      phoneNumber: '+919876543210',
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
      isPhoneVerified: true,
    },
  });

  // Assign Devotee role (global, no temple scope — upsert with null composite key not supported by Prisma)
  const devoteeRoleExists = await prisma.userRole.findFirst({
    where: { userId: devoteeUser.id, roleId: roleMap['DEVOTEE'], templeId: null },
  });
  if (!devoteeRoleExists) {
    await prisma.userRole.create({
      data: { userId: devoteeUser.id, roleId: roleMap['DEVOTEE'], assignedById: mainAdmin.id },
    });
  }

  // Assign Main Admin global role
  const mainAdminRoleExists = await prisma.userRole.findFirst({
    where: { userId: mainAdmin.id, roleId: roleMap['MAIN_ADMIN'], templeId: null },
  });
  if (!mainAdminRoleExists) {
    await prisma.userRole.create({
      data: { userId: mainAdmin.id, roleId: roleMap['MAIN_ADMIN'], assignedById: mainAdmin.id },
    });
  }

  // 3. Temples
  console.log('Creating sample temples...');
  const tirupati = await prisma.temple.upsert({
    where: { slug: 'tirupati-balaji' },
    update: {},
    create: {
      slug: 'tirupati-balaji',
      name: 'Sri Venkateswara Swamy Temple',
      deity: 'Lord Sri Venkateswara (Balaji)',
      description: 'One of the most revered pilgrimage shrines in the world, situated atop the Seven Hills of Tirumala.',
      contactEmail: 'support@tirumala.dev',
      contactPhone: '+918772277777',
      addressLine1: 'S Mada St, Tirumala',
      city: 'Tirupati',
      state: 'Andhra Pradesh',
      postalCode: '517504',
      latitude: 13.6833,
      longitude: 79.3472,
      isActive: true,
    },
  });

  const meenakshi = await prisma.temple.upsert({
    where: { slug: 'madurai-meenakshi' },
    update: {},
    create: {
      slug: 'madurai-meenakshi',
      name: 'Arulmigu Meenakshi Sundareswarar Temple',
      deity: 'Goddess Meenakshi & Lord Sundareswarar',
      description: 'A historic Hindu temple located on the southern bank of the Vaigai River in the temple city of Madurai.',
      contactEmail: 'contact@meenakshi.dev',
      contactPhone: '+914522344360',
      addressLine1: 'Madurai Main',
      city: 'Madurai',
      state: 'Tamil Nadu',
      postalCode: '625001',
      latitude: 9.9195,
      longitude: 78.1193,
      isActive: true,
    },
  });

  // Assign Scoped Roles
  await prisma.userRole.upsert({
    where: {
      userId_roleId_templeId: {
        userId: templeAdmin.id,
        roleId: roleMap['TEMPLE_ADMIN'],
        templeId: tirupati.id,
      },
    },
    update: {},
    create: {
      userId: templeAdmin.id,
      roleId: roleMap['TEMPLE_ADMIN'],
      templeId: tirupati.id,
      assignedById: mainAdmin.id,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId_templeId: {
        userId: counterStaff.id,
        roleId: roleMap['COUNTER_STAFF'],
        templeId: tirupati.id,
      },
    },
    update: {},
    create: {
      userId: counterStaff.id,
      roleId: roleMap['COUNTER_STAFF'],
      templeId: tirupati.id,
      assignedById: templeAdmin.id,
    },
  });

  // 4. Media Assets
  console.log('Creating media assets...');
  const ladduMedia = await prisma.mediaAsset.create({
    data: {
      templeId: tirupati.id,
      fileName: 'tirupati-special-laddu.webp',
      fileUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80',
      mimeType: 'image/webp',
      fileSizeBytes: 245000,
      altText: 'World-renowned Tirupati Laddu Prasadam',
      assetType: MediaAssetType.ITEM_THUMBNAIL,
    },
  });

  // 5. Prasadam Items
  console.log('Creating prasadam offerings...');
  const ladduItem = await prisma.prasadamItem.upsert({
    where: {
      templeId_slug: {
        templeId: tirupati.id,
        slug: 'special-tirupati-laddu',
      },
    },
    update: {},
    create: {
      templeId: tirupati.id,
      slug: 'special-tirupati-laddu',
      name: 'Special Srivari Laddu Prasadam',
      description: 'Divine laddu prepared with pure cow ghee, gram flour, sugar, cashews, cardamom, and raisins.',
      price: 50.0,
      ingredients: 'Gram flour, Pure Cow Ghee, Sugar, Cashews, Cardamom, Raisins, Edible Camphor',
      allergens: 'Contains Tree Nuts (Cashews), Dairy (Ghee)',
      shelfLifeHours: 120,
      isPerishable: true,
      maxQuantityPerDevotee: 4,
      preparationTimeMinutes: 30,
      thumbnailMediaId: ladduMedia.id,
      status: PrasadamStatus.AVAILABLE,
    },
  });

  const pulihoraItem = await prisma.prasadamItem.upsert({
    where: {
      templeId_slug: {
        templeId: tirupati.id,
        slug: 'srivari-pulihora',
      },
    },
    update: {},
    create: {
      templeId: tirupati.id,
      slug: 'srivari-pulihora',
      name: 'Traditional Srivari Pulihora (Tamarind Rice)',
      description: 'Authentic temple tamarind rice seasoned with mustard seeds, curry leaves, and green chillies.',
      price: 35.0,
      ingredients: 'Rice, Tamarind pulp, Turmeric, Peanuts, Mustard seeds, Curry leaves, Asafoetida',
      allergens: 'Contains Peanuts',
      shelfLifeHours: 24,
      isPerishable: true,
      maxQuantityPerDevotee: 5,
      preparationTimeMinutes: 15,
      status: PrasadamStatus.AVAILABLE,
    },
  });

  // 6. Containers and Layout
  console.log('Creating containers...');
  const dailyContainer = await prisma.container.upsert({
    where: {
      templeId_slug: {
        templeId: tirupati.id,
        slug: 'daily-divine-offerings',
      },
    },
    update: {},
    create: {
      templeId: tirupati.id,
      slug: 'daily-divine-offerings',
      title: 'Daily Divine Prasadam Offerings',
      description: 'Freshly prepared morning and evening offerings available for scheduled devotee pickup.',
      layoutType: ContainerLayout.GRID,
      displayOrder: 1,
      isPublished: true,
    },
  });

  // Link items to container
  await prisma.containerItem.upsert({
    where: {
      containerId_prasadamItemId: {
        containerId: dailyContainer.id,
        prasadamItemId: ladduItem.id,
      },
    },
    update: {},
    create: {
      containerId: dailyContainer.id,
      prasadamItemId: ladduItem.id,
      displayOrder: 1,
      isHighlighted: true,
    },
  });

  await prisma.containerItem.upsert({
    where: {
      containerId_prasadamItemId: {
        containerId: dailyContainer.id,
        prasadamItemId: pulihoraItem.id,
      },
    },
    update: {},
    create: {
      containerId: dailyContainer.id,
      prasadamItemId: pulihoraItem.id,
      displayOrder: 2,
      isHighlighted: false,
    },
  });

  // 7. Inventory Setup
  console.log('Setting up real-time inventory...');
  await prisma.inventory.upsert({
    where: { prasadamItemId: ladduItem.id },
    update: {},
    create: {
      prasadamItemId: ladduItem.id,
      templeId: tirupati.id,
      quantityAvailable: 500,
      quantityReserved: 0,
      lowStockThreshold: 50,
      safetyBuffer: 20,
      isUnlimited: false,
    },
  });

  await prisma.inventory.upsert({
    where: { prasadamItemId: pulihoraItem.id },
    update: {},
    create: {
      prasadamItemId: pulihoraItem.id,
      templeId: tirupati.id,
      quantityAvailable: 250,
      quantityReserved: 0,
      lowStockThreshold: 25,
      safetyBuffer: 10,
      isUnlimited: false,
    },
  });

  // 8. Pickup Counters and Slots
  console.log('Creating pickup counters and slots...');
  const counterA = await prisma.pickupCounter.upsert({
    where: {
      templeId_counterNumber: {
        templeId: tirupati.id,
        counterNumber: 'CTR-01',
      },
    },
    update: {},
    create: {
      templeId: tirupati.id,
      counterNumber: 'CTR-01',
      name: 'North Gate Fast-Track Pickup Counter A',
      locationDescription: 'Beside North Gopuram near devotee verification queue',
      isActive: true,
    },
  });

  // Create slot for today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const slotStart = new Date(today);
  slotStart.setHours(9, 0, 0, 0);

  const slotEnd = new Date(today);
  slotEnd.setHours(10, 0, 0, 0);

  await prisma.pickupSlot.upsert({
    where: {
      counterId_slotDate_startTime_endTime: {
        counterId: counterA.id,
        slotDate: today,
        startTime: slotStart,
        endTime: slotEnd,
      },
    },
    update: {},
    create: {
      templeId: tirupati.id,
      counterId: counterA.id,
      slotDate: today,
      startTime: slotStart,
      endTime: slotEnd,
      capacity: 100,
      bookedCount: 0,
      isActive: true,
    },
  });

  // 9. System Settings
  console.log('Creating default system settings...');
  await prisma.systemSetting.upsert({
    where: { key: 'portal.booking_cutoff_hours' },
    update: {},
    create: {
      key: 'portal.booking_cutoff_hours',
      value: { cutoffHours: 2, message: 'Bookings close 2 hours prior to slot start time' },
      description: 'Minimum advance hours required before slot starts',
      isPublic: true,
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'portal.inventory_reservation_ttl_minutes' },
    update: {},
    create: {
      key: 'portal.inventory_reservation_ttl_minutes',
      value: { ttlMinutes: 10 },
      description: 'Checkout reservation lock expiration duration',
      isPublic: false,
    },
  });

  console.log('✅ Seed completed successfully with strictly labelled [DEV] sample data.');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
