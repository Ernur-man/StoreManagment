/**
 * One-time, data-preserving SQLite -> PostgreSQL transfer.
 *
 * Run locally before the first Vercel/Neon deploy:
 *   DATABASE_URL="<Neon pooled URL>" node scripts/transfer-sqlite-to-postgres.mjs
 *
 * Optional:
 *   SQLITE_PATH=./prisma/dev.db
 *   TRANSFER_DATABASE_URL=<override target>
 *
 * The script preserves every primary key, foreign key and timestamp. It uses
 * createMany({ skipDuplicates: true }) so it is safe to retry. It does not
 * delete, reset or seed any data.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

if (process.env.TRANSFER_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TRANSFER_DATABASE_URL;
}
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL (Neon pooled URL) is required');

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

const sqlitePath = path.resolve(process.cwd(), process.env.SQLITE_PATH ?? 'prisma/dev.db');
const source = new DatabaseSync(sqlitePath);

const MODELS = [
  { name: 'Store', dates: ['createdAt', 'updatedAt'], booleans: [] },
  { name: 'User', dates: ['createdAt', 'updatedAt', 'lastLoginAt'], booleans: ['active'] },
  { name: 'SubscriptionPlan', dates: ['createdAt', 'updatedAt'], booleans: ['isActive'] },
  { name: 'Product', dates: ['createdAt', 'updatedAt'], booleans: ['isActive'] },
  { name: 'Customer', dates: ['createdAt', 'updatedAt'], booleans: [] },
  {
    name: 'ProductVariant',
    dates: ['createdAt', 'updatedAt'],
    booleans: [],
  },
  { name: 'Inventory', dates: ['updatedAt'], booleans: [] },
  {
    name: 'CustomerRequest',
    dates: ['requestDate', 'availableAt', 'contactedAt', 'completedAt', 'createdAt', 'updatedAt'],
    booleans: [],
  },
  { name: 'StockArrival', dates: ['arrivalDate', 'createdAt'], booleans: [] },
  {
    name: 'Subscription',
    dates: ['startedAt', 'expiresAt', 'nextPaymentAt', 'cancelledAt', 'lastPaymentAt', 'createdAt', 'updatedAt'],
    booleans: [],
  },
  { name: 'StockArrivalItem', dates: ['createdAt'], booleans: [] },
  { name: 'PaymentTransaction', dates: ['createdAt', 'updatedAt', 'completedAt'], booleans: [] },
  { name: 'ArrivalMatch', dates: ['createdAt'], booleans: [] },
  { name: 'Sale', dates: ['soldAt', 'createdAt'], booleans: [] },
  { name: 'Notification', dates: ['createdAt'], booleans: ['read'] },
  { name: 'AuditLog', dates: ['createdAt'], booleans: [] },
  { name: 'PaymentEvent', dates: ['processedAt'], booleans: [] },
];

function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim()))) {
    return new Date(Number(value));
  }
  const text = String(value);
  const iso = text.includes(' ') ? text.replace(' ', 'T') : text;
  const withZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(iso) ? iso : `${iso}Z`;
  return new Date(withZone);
}

function convertRow(row, model) {
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      result[key] = null;
    } else if (model.dates.includes(key)) {
      result[key] = toDate(value);
    } else if (model.booleans.includes(key)) {
      result[key] = Boolean(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function transferModel(model) {
  const columns = source.prepare(`PRAGMA table_info("${model.name}")`).all().map((column) => column.name);
  if (columns.length === 0) throw new Error(`SQLite table ${model.name} was not found`);

  const columnList = columns.map((column) => `"${column}"`).join(', ');
  const rows = source.prepare(`SELECT ${columnList} FROM "${model.name}"`).all();
  const data = rows.map((row) => convertRow(row, model));
  const delegate = prisma[model.name.charAt(0).toLowerCase() + model.name.slice(1)];

  for (let index = 0; index < data.length; index += 250) {
    await delegate.createMany({
      data: data.slice(index, index + 250),
      skipDuplicates: true,
    });
  }

  const targetCount = await delegate.count();
  if (targetCount < data.length) {
    throw new Error(`Row count mismatch for ${model.name}: source=${data.length}, target=${targetCount}`);
  }
  console.log(`${model.name.padEnd(20)} ${String(data.length).padStart(5)} rows`);
}

try {
  console.log(`Transferring from ${sqlitePath}`);
  for (const model of MODELS) await transferModel(model);
  console.log('SQLite -> PostgreSQL transfer completed without deleting or reseeding data.');
} finally {
  source.close();
  await prisma.$disconnect();
}
