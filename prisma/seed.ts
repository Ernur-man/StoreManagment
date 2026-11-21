import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed demo data in production');
}

const STORE_ID = 'store-demo-1';
const PLAN_ID = 'plan-wishstock-pro';
const daysAgo = (days: number, hours = 0) =>
  new Date(Date.now() - days * 86_400_000 - hours * 3_600_000);
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000);

// Features are stored as translation keys so the same record renders in EN/RU.
const proFeatureKeys = [
  'billing.feature.dashboard',
  'billing.feature.inventory',
  'billing.feature.matching',
  'billing.feature.customers',
  'billing.feature.team',
];

const productDefinitions = [
  {
    id: 'p-black-skirt',
    name: 'Black Skirt',
    sku: 'SK-1024',
    category: 'Skirts',
    brand: 'Luna',
    variants: [
      { id: 'v-skirt-m-blk', sku: 'SK-1024-M-BLK', size: 'M', color: 'Black', price: 49.9, quantity: 0 },
      { id: 'v-skirt-s-blk', sku: 'SK-1024-S-BLK', size: 'S', color: 'Black', price: 49.9, quantity: 6 },
      { id: 'v-skirt-l-blk', sku: 'SK-1024-L-BLK', size: 'L', color: 'Black', price: 49.9, quantity: 2 },
      { id: 'v-skirt-m-beg', sku: 'SK-1024-M-BEG', size: 'M', color: 'Beige', price: 49.9, quantity: 4 },
    ],
  },
  {
    id: 'p-white-shirt',
    name: 'White Shirt',
    sku: 'SK-1025',
    category: 'Tops',
    brand: 'Nord',
    variants: [
      { id: 'v-shirt-s-wht', sku: 'SK-1025-S-WHT', size: 'S', color: 'White', price: 39.9, quantity: 8 },
      { id: 'v-shirt-m-wht', sku: 'SK-1025-M-WHT', size: 'M', color: 'White', price: 39.9, quantity: 0 },
      { id: 'v-shirt-l-wht', sku: 'SK-1025-L-WHT', size: 'L', color: 'White', price: 39.9, quantity: 3 },
    ],
  },
  {
    id: 'p-blue-jeans',
    name: 'Blue Jeans',
    sku: 'SK-1026',
    category: 'Bottoms',
    brand: 'Denim Co',
    variants: [
      { id: 'v-jeans-28-blu', sku: 'SK-1026-28-BLU', size: '28', color: 'Blue', price: 69.9, quantity: 5 },
      { id: 'v-jeans-30-blu', sku: 'SK-1026-30-BLU', size: '30', color: 'Blue', price: 69.9, quantity: 1 },
      { id: 'v-jeans-32-blu', sku: 'SK-1026-32-BLU', size: '32', color: 'Blue', price: 69.9, quantity: 0 },
    ],
  },
  {
    id: 'p-beige-jacket',
    name: 'Beige Jacket',
    sku: 'SK-1027',
    category: 'Outerwear',
    brand: 'Aura',
    variants: [
      { id: 'v-jacket-m-beg', sku: 'SK-1027-M-BEG', size: 'M', color: 'Beige', price: 119, quantity: 2 },
      { id: 'v-jacket-l-beg', sku: 'SK-1027-L-BEG', size: 'L', color: 'Beige', price: 119, quantity: 0 },
    ],
  },
  {
    id: 'p-black-dress',
    name: 'Black Dress',
    sku: 'SK-1028',
    category: 'Dresses',
    brand: 'Luna',
    variants: [
      { id: 'v-dress-s-blk', sku: 'SK-1028-S-BLK', size: 'S', color: 'Black', price: 89, quantity: 0 },
      { id: 'v-dress-m-blk', sku: 'SK-1028-M-BLK', size: 'M', color: 'Black', price: 89, quantity: 4 },
    ],
  },
  {
    id: 'p-cotton-tshirt',
    name: 'Cotton T-Shirt',
    sku: 'SK-1029',
    category: 'Tops',
    brand: 'Nord',
    variants: [
      { id: 'v-tee-s-wht', sku: 'SK-1029-S-WHT', size: 'S', color: 'White', price: 24, quantity: 12 },
      { id: 'v-tee-m-blk', sku: 'SK-1029-M-BLK', size: 'M', color: 'Black', price: 24, quantity: 7 },
    ],
  },
  {
    id: 'p-wool-coat',
    name: 'Wool Coat',
    sku: 'SK-1030',
    category: 'Outerwear',
    brand: 'Aura',
    variants: [
      { id: 'v-coat-l-gry', sku: 'SK-1030-L-GRY', size: 'L', color: 'Grey', price: 159, quantity: 1 },
    ],
  },
];

const customers = [
  { id: 'c-anna', name: 'Anna Ivanova', phone: '+7 700 555 01 01' },
  { id: 'c-maria', name: 'Maria Petrova', phone: '+7 700 555 02 02' },
  { id: 'c-dana', name: 'Dana Kim', phone: '+7 700 555 03 03' },
  { id: 'c-amina', name: 'Amina Yilmaz', phone: '+7 700 555 04 04' },
  { id: 'c-sofia', name: 'Sofia Rossi', phone: '+7 700 555 05 05' },
  { id: 'c-elena', name: 'Elena Volkova', phone: '+7 700 555 06 06' },
  { id: 'c-olga', name: 'Olga Nova', phone: '+7 700 555 07 07' },
  { id: 'c-aruzhan', name: 'Aruzhan Bek', phone: '+7 700 555 08 08' },
];

type DemoRequest = {
  id: string;
  customerId: string;
  productId: string;
  variantId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  source: string;
  status: string;
  days: number;
  notes?: string;
};

const requests: DemoRequest[] = [
  { id: 'req-1001', customerId: 'c-anna', productId: 'p-black-skirt', variantId: 'v-skirt-m-blk', productName: 'Black Skirt', sku: 'SK-1024', size: 'M', color: 'Black', source: 'IN_STORE', status: 'WAITING', days: 2, notes: 'Preferred fitted cut' },
  { id: 'req-1002', customerId: 'c-maria', productId: 'p-black-skirt', variantId: 'v-skirt-m-blk', productName: 'Black Skirt', sku: 'SK-1024', size: 'M', color: 'Black', source: 'WHATSAPP', status: 'WAITING', days: 1 },
  { id: 'req-1003', customerId: 'c-dana', productId: 'p-black-skirt', variantId: 'v-skirt-m-blk', productName: 'Black Skirt', sku: 'SK-1024', size: 'M', color: 'Black', source: 'INSTAGRAM', status: 'WAITING', days: 0, notes: 'Call after 18:00' },
  { id: 'req-1004', customerId: 'c-amina', productId: 'p-white-shirt', variantId: 'v-shirt-m-wht', productName: 'White Shirt', sku: 'SK-1025', size: 'M', color: 'White', source: 'IN_STORE', status: 'AVAILABLE', days: 5 },
  { id: 'req-1005', customerId: 'c-sofia', productId: 'p-white-shirt', variantId: 'v-shirt-m-wht', productName: 'White Shirt', sku: 'SK-1025', size: 'M', color: 'White', source: 'PHONE', status: 'AVAILABLE', days: 4 },
  { id: 'req-1006', customerId: 'c-elena', productId: 'p-blue-jeans', variantId: 'v-jeans-32-blu', productName: 'Blue Jeans', sku: 'SK-1026', size: '32', color: 'Blue', source: 'INSTAGRAM', status: 'AVAILABLE', days: 6 },
  { id: 'req-1007', customerId: 'c-olga', productId: 'p-beige-jacket', variantId: 'v-jacket-l-beg', productName: 'Beige Jacket', sku: 'SK-1027', size: 'L', color: 'Beige', source: 'IN_STORE', status: 'CONTACTED', days: 8 },
  { id: 'req-1008', customerId: 'c-aruzhan', productId: 'p-black-dress', variantId: 'v-dress-s-blk', productName: 'Black Dress', sku: 'SK-1028', size: 'S', color: 'Black', source: 'WHATSAPP', status: 'RESERVED', days: 9 },
  { id: 'req-1009', customerId: 'c-anna', productId: 'p-cotton-tshirt', variantId: 'v-tee-m-blk', productName: 'Cotton T-Shirt', sku: 'SK-1029', size: 'M', color: 'Black', source: 'IN_STORE', status: 'PURCHASED', days: 12 },
  { id: 'req-1010', customerId: 'c-maria', productId: 'p-blue-jeans', variantId: 'v-jeans-28-blu', productName: 'Blue Jeans', sku: 'SK-1026', size: '28', color: 'Blue', source: 'PHONE', status: 'PURCHASED', days: 14 },
  { id: 'req-1011', customerId: 'c-dana', productId: 'p-wool-coat', variantId: 'v-coat-l-gry', productName: 'Wool Coat', sku: 'SK-1030', size: 'L', color: 'Grey', source: 'OTHER', status: 'CANCELLED', days: 16 },
  { id: 'req-1012', customerId: 'c-sofia', productId: 'p-black-skirt', variantId: 'v-skirt-l-blk', productName: 'Black Skirt', sku: 'SK-1024', size: 'L', color: 'Black', source: 'INSTAGRAM', status: 'WAITING', days: 3 },
  { id: 'req-1013', customerId: 'c-elena', productId: 'p-beige-jacket', variantId: 'v-jacket-m-beg', productName: 'Beige Jacket', sku: 'SK-1027', size: 'M', color: 'Beige', source: 'IN_STORE', status: 'CONTACTED', days: 7 },
  { id: 'req-1014', customerId: 'c-olga', productId: 'p-black-dress', variantId: 'v-dress-m-blk', productName: 'Black Dress', sku: 'SK-1028', size: 'M', color: 'Black', source: 'WHATSAPP', status: 'PURCHASED', days: 20 },
  { id: 'req-1015', customerId: 'c-aruzhan', productId: 'p-white-shirt', variantId: 'v-shirt-s-wht', productName: 'White Shirt', sku: 'SK-1025', size: 'S', color: 'White', source: 'INSTAGRAM', status: 'AVAILABLE', days: 1 },
  { id: 'req-1016', customerId: 'c-anna', productId: 'p-blue-jeans', variantId: 'v-jeans-30-blu', productName: 'Blue Jeans', sku: 'SK-1026', size: '30', color: 'Blue', source: 'PHONE', status: 'WAITING', days: 5 },
];

const arrivalDefinitions = [
  { id: 'arr-1', number: 'ARR-2001', sku: 'SK-1025', productName: 'White Shirt', variantId: 'v-shirt-m-wht', size: 'M', color: 'White', quantity: 12, days: 4, supplier: 'Nord Supply', matched: ['req-1004', 'req-1005'] },
  { id: 'arr-2', number: 'ARR-2002', sku: 'SK-1027', productName: 'Beige Jacket', variantId: 'v-jacket-l-beg', size: 'L', color: 'Beige', quantity: 3, days: 7, supplier: 'Aura Wholesale', matched: ['req-1007'] },
  { id: 'arr-3', number: 'ARR-2003', sku: 'SK-1028', productName: 'Black Dress', variantId: 'v-dress-s-blk', size: 'S', color: 'Black', quantity: 5, days: 8, supplier: null, matched: ['req-1008'] },
  { id: 'arr-4', number: 'ARR-2004', sku: 'SK-1029', productName: 'Cotton T-Shirt', variantId: 'v-tee-m-blk', size: 'M', color: 'Black', quantity: 10, days: 11, supplier: 'Nord Supply', matched: ['req-1009'] },
  { id: 'arr-5', number: 'ARR-2005', sku: 'SK-1026', productName: 'Blue Jeans', variantId: 'v-jeans-28-blu', size: '28', color: 'Blue', quantity: 6, days: 13, supplier: 'Denim Co', matched: ['req-1010'] },
  { id: 'arr-6', number: 'ARR-2006', sku: 'SK-1028', productName: 'Black Dress', variantId: 'v-dress-m-blk', size: 'M', color: 'Black', quantity: 8, days: 19, supplier: 'Luna Studio', matched: ['req-1014'] },
  { id: 'arr-7', number: 'ARR-2007', sku: 'SK-1025', productName: 'White Shirt', variantId: 'v-shirt-s-wht', size: 'S', color: 'White', quantity: 10, days: 1, supplier: 'Nord Supply', matched: ['req-1015'] },
];

async function main() {
  console.log('Seeding WishStock demo data…');

  // Exactly one plan. It is global (not store-scoped) and kept in sync on reseed.
  await prisma.subscriptionPlan.upsert({
    where: { code: 'wishstock-pro' },
    create: {
      id: PLAN_ID,
      code: 'wishstock-pro',
      name: 'WishStock Pro',
      description: 'Full WishStock access for 30 days.',
      priceKzt: 7_990,
      currency: 'KZT',
      billingCycle: 'MONTH',
      durationDays: 30,
      features: JSON.stringify(proFeatureKeys),
      isActive: true,
    },
    update: {
      name: 'WishStock Pro',
      description: 'Full WishStock access for 30 days.',
      priceKzt: 7_990,
      currency: 'KZT',
      billingCycle: 'MONTH',
      durationDays: 30,
      features: JSON.stringify(proFeatureKeys),
      isActive: true,
    },
  });

  await prisma.store.deleteMany({ where: { code: 'WS-DEMO-01' } });

  const passwordHash = await bcrypt.hash('Demo1234!', 12);
  await prisma.store.create({
    data: {
      id: STORE_ID,
      name: 'WishStock Central Store',
      code: 'WS-DEMO-01',
      currency: 'USD',
      address: '12 Market Street, Almaty',
      phone: '+7 727 000 12 34',
      email: 'store@wishstock.demo',
      lowStockThreshold: 3,
    },
  });

  await prisma.user.createMany({
    data: [
      { id: 'user-admin', storeId: STORE_ID, name: 'Aigerim Admin', email: 'admin@wishstock.app', passwordHash, role: 'ADMIN' },
      { id: 'user-manager', storeId: STORE_ID, name: 'Dias Manager', email: 'manager@wishstock.app', passwordHash, role: 'MANAGER' },
      { id: 'user-employee', storeId: STORE_ID, name: 'Tom Employee', email: 'employee@wishstock.app', passwordHash, role: 'EMPLOYEE' },
    ],
  });

  // Demo subscription states: admin is active, manager cancelled but still
  // inside the paid period (access preserved), employee has no subscription so
  // the Pro-gated pages redirect to the subscription page.
  await prisma.subscription.createMany({
    data: [
      {
        id: 'sub-seed-admin',
        storeId: STORE_ID,
        userId: 'user-admin',
        planId: PLAN_ID,
        status: 'active',
        provider: 'demo',
        startedAt: daysAgo(10),
        expiresAt: daysFromNow(20),
        nextPaymentAt: daysFromNow(20),
        lastPaymentAt: daysAgo(10),
      },
      {
        id: 'sub-seed-manager',
        storeId: STORE_ID,
        userId: 'user-manager',
        planId: PLAN_ID,
        status: 'cancelled',
        provider: 'demo',
        startedAt: daysAgo(25),
        expiresAt: daysFromNow(5),
        cancelledAt: daysAgo(2),
        lastPaymentAt: daysAgo(5),
      },
      {
        id: 'sub-seed-employee',
        storeId: STORE_ID,
        userId: 'user-employee',
        planId: PLAN_ID,
        status: 'inactive',
      },
    ],
  });

  await prisma.paymentTransaction.createMany({
    data: [
      {
        storeId: STORE_ID,
        userId: 'user-admin',
        planId: PLAN_ID,
        subscriptionId: 'sub-seed-admin',
        provider: 'demo',
        providerPaymentId: 'demo_seed_admin_1',
        idempotencyKey: 'seed-admin-payment-1',
        amountKzt: 7_990,
        currency: 'KZT',
        status: 'succeeded',
        createdAt: daysAgo(10),
        completedAt: daysAgo(10),
      },
      {
        storeId: STORE_ID,
        userId: 'user-manager',
        planId: PLAN_ID,
        subscriptionId: 'sub-seed-manager',
        provider: 'demo',
        providerPaymentId: 'demo_seed_manager_1',
        idempotencyKey: 'seed-manager-payment-1',
        amountKzt: 7_990,
        currency: 'KZT',
        status: 'succeeded',
        createdAt: daysAgo(5),
        completedAt: daysAgo(5),
      },
    ],
  });

  for (const product of productDefinitions) {
    await prisma.product.create({
      data: {
        id: product.id,
        storeId: STORE_ID,
        name: product.name,
        sku: product.sku,
        category: product.category,
        brand: product.brand,
        createdAt: daysAgo(30),
      },
    });
    for (const variant of product.variants) {
      await prisma.productVariant.create({
        data: {
          id: variant.id,
          storeId: STORE_ID,
          productId: product.id,
          sku: variant.sku,
          size: variant.size,
          color: variant.color,
          price: variant.price,
          lowStockThreshold: 3,
          createdAt: daysAgo(30),
        },
      });
      await prisma.inventory.create({
        data: { storeId: STORE_ID, variantId: variant.id, quantity: variant.quantity },
      });
    }
  }

  await prisma.customer.createMany({
    data: customers.map((customer, index) => ({
      ...customer,
      storeId: STORE_ID,
      status: index === 1 || index === 4 ? 'VIP' : 'ACTIVE',
      createdAt: daysAgo(35 - index),
    })),
  });

  for (const request of requests) {
    await prisma.customerRequest.create({
      data: {
        id: request.id,
        storeId: STORE_ID,
        requestNumber: `REQ-${request.id.slice(-4)}`,
        customerId: request.customerId,
        productId: request.productId,
        variantId: request.variantId,
        productName: request.productName,
        sku: request.sku,
        category: productDefinitions.find((p) => p.id === request.productId)?.category,
        size: request.size,
        color: request.color,
        source: request.source,
        notes: request.notes ?? null,
        status: request.status,
        requestDate: daysAgo(request.days, 3),
        employeeId: request.days % 2 === 0 ? 'user-employee' : 'user-manager',
        availableAt: ['AVAILABLE', 'CONTACTED', 'RESERVED', 'PURCHASED'].includes(request.status)
          ? daysAgo(Math.max(0, request.days - 1))
          : null,
        contactedAt: ['CONTACTED', 'RESERVED', 'PURCHASED'].includes(request.status)
          ? daysAgo(Math.max(0, request.days - 2))
          : null,
        completedAt: request.status === 'PURCHASED' ? daysAgo(Math.max(0, request.days - 3)) : null,
        createdAt: daysAgo(request.days, 3),
      },
    });
  }

  for (const arrival of arrivalDefinitions) {
    await prisma.stockArrival.create({
      data: {
        id: arrival.id,
        storeId: STORE_ID,
        arrivalNumber: arrival.number,
        supplier: arrival.supplier,
        notes: 'Fictional demo arrival',
        arrivalDate: daysAgo(arrival.days),
        employeeId: 'user-employee',
        createdAt: daysAgo(arrival.days),
        items: {
          create: {
            variantId: arrival.variantId,
            productName: arrival.productName,
            sku: arrival.sku,
            size: arrival.size,
            color: arrival.color,
            quantity: arrival.quantity,
            unitCost: 0,
          },
        },
      },
    });
    const item = await prisma.stockArrivalItem.findFirstOrThrow({ where: { arrivalId: arrival.id } });
    for (const requestId of arrival.matched) {
      await prisma.arrivalMatch.create({ data: { arrivalItemId: item.id, requestId } });
    }
  }

  await prisma.sale.createMany({
    data: [
      { storeId: STORE_ID, variantId: 'v-tee-m-blk', customerId: 'c-anna', requestId: 'req-1009', employeeId: 'user-employee', quantity: 1, amount: 24, soldAt: daysAgo(9) },
      { storeId: STORE_ID, variantId: 'v-jeans-28-blu', customerId: 'c-maria', requestId: 'req-1010', employeeId: 'user-manager', quantity: 1, amount: 69.9, soldAt: daysAgo(11) },
      { storeId: STORE_ID, variantId: 'v-dress-m-blk', customerId: 'c-olga', requestId: 'req-1014', employeeId: 'user-employee', quantity: 1, amount: 89, soldAt: daysAgo(17) },
    ],
  });

  const notificationData = [
    { productName: 'White Shirt', size: 'M', color: 'White', count: 2, days: 4 },
    { productName: 'Beige Jacket', size: 'L', color: 'Beige', count: 1, days: 7 },
    { productName: 'Black Dress', size: 'M', color: 'Black', count: 1, days: 19 },
    { productName: 'White Shirt', size: 'S', color: 'White', count: 1, days: 1 },
  ];
  for (const [index, item] of notificationData.entries()) {
    await prisma.notification.create({
      data: {
        storeId: STORE_ID,
        type: 'STOCK_MATCH',
        title: 'notification.stockMatch.title',
        body: JSON.stringify(item),
        entityType: 'PRODUCT_VARIANT',
        entityId: arrivalDefinitions[index].variantId,
        read: index > 1,
        createdAt: daysAgo(item.days),
      },
    });
  }
  await prisma.notification.create({
    data: {
      storeId: STORE_ID,
      type: 'SYSTEM',
      title: 'notification.demoReady.title',
      body: JSON.stringify({}),
      read: false,
      createdAt: daysAgo(0, 1),
    },
  });

  await prisma.auditLog.createMany({
    data: [
      { storeId: STORE_ID, userId: 'user-employee', action: 'REQUEST_CREATED', entityType: 'CUSTOMER_REQUEST', entityId: 'req-1001', createdAt: daysAgo(2) },
      { storeId: STORE_ID, userId: 'user-employee', action: 'STOCK_ARRIVAL_CREATED', entityType: 'STOCK_ARRIVAL', entityId: 'arr-7', details: JSON.stringify({ matched: 1 }), createdAt: daysAgo(1) },
      { storeId: STORE_ID, userId: 'user-manager', action: 'REQUEST_STATUS_CHANGED', entityType: 'CUSTOMER_REQUEST', entityId: 'req-1007', details: JSON.stringify({ from: 'AVAILABLE', to: 'CONTACTED' }), createdAt: daysAgo(6) },
    ],
  });

  console.log('Demo data ready. Login with admin@wishstock.app / Demo1234!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
