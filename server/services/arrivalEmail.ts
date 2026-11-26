import { Prisma } from '@prisma/client';
import { Resend } from 'resend';
import { prisma } from '../lib/prisma.js';
import { normalizeRequestEmail } from '../lib/validation.js';

export const ARRIVAL_EMAIL_SUBJECT = 'Your requested product has arrived! 🎉';

export type ArrivalEmailStatus = 'PENDING' | 'SENT' | 'FAILED';
export type ArrivalEmailLanguage = 'en' | 'ru';

interface ResendConfig {
  apiKey: string;
  fromEmail: string;
}

export interface ArrivalEmailSnapshot {
  id: string;
  storeId: string;
  arrivalId: string;
  requestId: string;
  customerName: string;
  recipientEmail: string;
  emailLanguage: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  quantity: number;
  status: string;
  providerMessageId: string | null;
  error: string | null;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
  lastAttemptAt: Date | null;
}

export interface QueueArrivalEmailContext {
  storeId: string;
  arrivalId: string;
  arrivalItemId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  quantity: number;
}

export interface QueueArrivalEmailMatch {
  id: string;
  customerName: string;
  email: string | null;
  emailLanguage?: string | null;
}

function parseFromEmail(value: string): string | null {
  // Resend accepts both "name <address>" and a bare address.
  const candidate = value.match(/<([^>]+)>/)?.[1] ?? value;
  return normalizeRequestEmail(candidate);
}

function readConfig(): ResendConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !fromEmail) return null;
  // A malformed sender is treated as "not configured" so arrivals continue.
  if (!parseFromEmail(fromEmail)) return null;
  return { apiKey, fromEmail };
}

export function isResendConfigured(): boolean {
  return readConfig() !== null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function display(value: string): string {
  return escapeHtml(value.trim() || '—');
}

export function normalizeEmailLanguage(value: string | null | undefined): ArrivalEmailLanguage {
  return value?.trim().toLowerCase() === 'ru' ? 'ru' : 'en';
}

function detailRows(notification: ArrivalEmailSnapshot, ru: boolean) {
  const labels = ru
    ? { product: 'Товар', sku: 'Артикул', size: 'Размер', color: 'Цвет' }
    : { product: 'Product', sku: 'SKU', size: 'Size', color: 'Color' };
  return [
    [labels.product, display(notification.productName)],
    [labels.sku, display(notification.sku)],
    [labels.size, display(notification.size)],
    [labels.color, display(notification.color)],
  ]
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 0 6px 16px;color:#64748b;font-size:13px;">${label}</td>` +
        `<td style="padding:6px 0 6px 8px;color:#0f172a;font-size:13px;font-weight:600;">${value}</td></tr>`,
    )
    .join('');
}

/**
 * Deterministic, escaped EN/RU templates. Dynamic values are always escaped
 * before entering HTML; the subject is fixed and never contains user input.
 */
export function renderArrivalEmail(notification: ArrivalEmailSnapshot): {
  subject: string;
  html: string;
  text: string;
} {
  const language = normalizeEmailLanguage(notification.emailLanguage);
  const ru = language === 'ru';
  const name = display(notification.customerName);
  const intro = ru
    ? 'Отличная новость! Товар, который вы запрашивали, появился в наличии в нашем магазине.'
    : 'Great news! The product you requested has arrived at our store.';
  const greeting = ru ? `Здравствуйте, ${name}!` : `Hello ${name},`;
  const cta = ru
    ? 'Пожалуйста, свяжитесь с магазином, чтобы договориться о получении.'
    : 'Please contact the store to arrange collection.';
  const thanks = ru ? 'Спасибо, что выбираете WishStock!' : 'Thank you for choosing WishStock!';
  const detailsTitle = ru ? 'Детали товара' : 'Product details';
  const footer = ru
    ? 'Вы получили это письмо, потому что оставили запрос на товар в WishStock.'
    : 'You received this email because you requested a product through WishStock.';

  const html = `<!doctype html>
<html lang="${language}">
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(15,23,42,.08);">
          <tr><td style="background:#4f46e5;padding:24px 28px;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:.3px;">WishStock</td></tr>
          <tr><td style="padding:28px;">
            <p style="margin:0 0 16px;color:#0f172a;font-size:16px;line-height:1.5;">${greeting}</p>
            <p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">${intro}</p>
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px 12px;background:#f8fafc;">
              <p style="margin:0 0 8px;color:#0f172a;font-size:14px;font-weight:700;">${detailsTitle}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${detailRows(notification, ru)}</table>
            </div>
            <p style="margin:20px 0;color:#334155;font-size:15px;line-height:1.6;">${cta}</p>
            <p style="margin:0;color:#334155;font-size:15px;line-height:1.6;">${thanks}</p>
          </td></tr>
          <tr><td style="padding:18px 28px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.5;">WishStock · ${footer}</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    greeting,
    '',
    intro,
    '',
    `${ru ? 'Товар' : 'Product'}: ${notification.productName}`,
    `${ru ? 'Артикул' : 'SKU'}: ${notification.sku}`,
    `${ru ? 'Размер' : 'Size'}: ${notification.size}`,
    `${ru ? 'Цвет' : 'Color'}: ${notification.color}`,
    '',
    cta,
    '',
    thanks,
    '',
    footer,
  ].join('\n');

  return { subject: ARRIVAL_EMAIL_SUBJECT, html, text };
}

function safeError(error: unknown): string {
  let message: string;
  if (error && typeof error === 'object') {
    const candidate = error as { name?: unknown; message?: unknown; statusCode?: unknown };
    const parts = [candidate.name, candidate.message, candidate.statusCode].filter(
      (part): part is string | number => typeof part === 'string' || typeof part === 'number',
    );
    message = parts.join(': ') || 'Delivery failed';
  } else {
    message = typeof error === 'string' ? error : 'Delivery failed';
  }
  const secrets = [process.env.RESEND_API_KEY, readConfig()?.apiKey].filter(
    (value): value is string => Boolean(value),
  );
  for (const secret of secrets) message = message.split(secret).join('[redacted]');
  message = message
    .replace(/\bre_[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    .replace(/[\w.+-]+@[\w-]+\.[A-Za-z.]{2,}/g, '[email]')
    .replace(/\s+/g, ' ')
    .trim();
  return message.slice(0, 500) || 'Delivery failed';
}

/**
 * Queues one outbox row per eligible match. Called inside the existing arrival
 * transaction, so a failed queue write rolls back with the arrival; an email
 * delivery failure later never does. The unique (arrivalId, requestId) index
 * makes repeated events harmless.
 */
export async function queueArrivalEmailNotifications(
  tx: Prisma.TransactionClient,
  context: QueueArrivalEmailContext,
  matches: QueueArrivalEmailMatch[],
): Promise<string[]> {
  const data = matches.flatMap((match) => {
    const recipientEmail = normalizeRequestEmail(match.email);
    if (!recipientEmail) return [];
    return [
      {
        storeId: context.storeId,
        arrivalId: context.arrivalId,
        arrivalItemId: context.arrivalItemId,
        requestId: match.id,
        customerName: match.customerName,
        recipientEmail,
        emailLanguage: normalizeEmailLanguage(match.emailLanguage),
        productName: context.productName,
        sku: context.sku,
        size: context.size,
        color: context.color,
        quantity: context.quantity,
        status: 'PENDING' as const,
      },
    ];
  });
  if (data.length === 0) return [];
  // ON CONFLICT DO NOTHING: a repeated matching event cannot create a duplicate.
  await tx.arrivalEmailNotification.createMany({ data, skipDuplicates: true });
  const rows = await tx.arrivalEmailNotification.findMany({
    where: { arrivalId: context.arrivalId, requestId: { in: data.map((row) => row.requestId) } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

async function dispatchOne(id: string, allowedStatuses: ArrivalEmailStatus[]): Promise<ArrivalEmailSnapshot | null> {
  const config = readConfig();
  // Missing/invalid configuration is a no-op: rows stay PENDING for a later retry.
  if (!config) return null;

  const claimed = await prisma.arrivalEmailNotification.updateMany({
    where: { id, status: { in: allowedStatuses } },
    data: {
      status: 'PENDING',
      error: null,
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });
  if (claimed.count === 0) return null;

  const notification = await prisma.arrivalEmailNotification.findUnique({ where: { id } });
  if (!notification) return null;

  try {
    const resend = new Resend(config.apiKey);
    const template = renderArrivalEmail(notification as ArrivalEmailSnapshot);
    const result = await resend.emails.send(
      {
        from: config.fromEmail,
        to: notification.recipientEmail,
        subject: template.subject,
        html: template.html,
        text: template.text,
      },
      // Stable per outbox row: even a retry after a lost DB write cannot
      // duplicate delivery at Resend.
      { idempotencyKey: `wishstock-arrival-email-${notification.id}` },
    );

    if (result.error) {
      const updated = await prisma.arrivalEmailNotification.update({
        where: { id },
        data: { status: 'FAILED', error: safeError(result.error) },
      });
      return updated as ArrivalEmailSnapshot;
    }

    const updated = await prisma.arrivalEmailNotification.update({
      where: { id },
      data: {
        status: 'SENT',
        providerMessageId: result.data?.id ?? null,
        error: null,
        sentAt: new Date(),
      },
    });
    return updated as ArrivalEmailSnapshot;
  } catch (error) {
    const updated = await prisma.arrivalEmailNotification.update({
      where: { id },
      data: { status: 'FAILED', error: safeError(error) },
    });
    return updated as ArrivalEmailSnapshot;
  }
}

/**
 * Dispatches queued rows after the arrival transaction commits. All failures
 * are swallowed here and persisted on the outbox row; callers never need to
 * handle email errors and can never roll back a successful arrival.
 */
export async function dispatchArrivalEmails(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  for (const id of ids) {
    try {
      await dispatchOne(id, ['PENDING']);
    } catch (error) {
      console.error('[WishStock] arrival email dispatch failed', safeError(error));
    }
  }
}

export interface RetryResult {
  status: 'RETRIED' | 'NOT_FOUND' | 'TERMINAL';
  notification: ArrivalEmailSnapshot | null;
}

/**
 * Safe retry: only an existing row in this store that is not already SENT can
 * be retried. It never accepts an address, sender, or arbitrary payload.
 */
export async function retryArrivalEmailNotification(id: string, storeId: string): Promise<RetryResult> {
  const reset = await prisma.arrivalEmailNotification.updateMany({
    where: { id, storeId, status: { in: ['PENDING', 'FAILED'] } },
    data: { status: 'PENDING', error: null, lastAttemptAt: new Date() },
  });
  if (reset.count === 0) {
    const existing = await prisma.arrivalEmailNotification.findFirst({
      where: { id, storeId },
      select: { id: true },
    });
    return { status: existing ? 'TERMINAL' : 'NOT_FOUND', notification: null };
  }
  const notification = await dispatchOne(id, ['PENDING']);
  return { status: 'RETRIED', notification };
}

export async function listArrivalEmailNotifications(storeId: string) {
  return prisma.arrivalEmailNotification.findMany({
    where: { storeId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      requestId: true,
      customerName: true,
      recipientEmail: true,
      productName: true,
      sku: true,
      size: true,
      color: true,
      status: true,
      providerMessageId: true,
      error: true,
      attempts: true,
      createdAt: true,
      sentAt: true,
      lastAttemptAt: true,
    },
  });
}
