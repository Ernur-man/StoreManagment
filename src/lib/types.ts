export type Role = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
export type RequestStatus = 'WAITING' | 'AVAILABLE' | 'CONTACTED' | 'RESERVED' | 'PURCHASED' | 'CANCELLED';
export type Availability = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  lastLoginAt?: string | null;
  store?: { id: string; name: string; code: string; currency: string };
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  status: 'ACTIVE' | 'VIP' | 'INACTIVE';
  createdAt: string;
  totalRequests?: number;
  lastRequestDate?: string | null;
  totalSpent?: number;
  purchases?: number;
  requestedProducts?: string[];
  requests?: CustomerRequest[];
  sales?: Sale[];
}

export interface Variant {
  id: string;
  productId: string;
  sku: string;
  size: string;
  color: string;
  price: number;
  imageUrl?: string | null;
  lowStockThreshold: number;
  quantity?: number;
  availability?: Availability;
  product?: { id: string; name: string; sku: string; category?: string };
  _count?: { requests: number; sales: number };
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  brand?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  variants: Variant[];
  _count?: { requests: number };
}

export interface CustomerRequest {
  id: string;
  requestNumber: string;
  customerId: string;
  productId?: string | null;
  variantId?: string | null;
  productName: string;
  sku: string;
  category?: string | null;
  size: string;
  color: string;
  source: string;
  notes?: string | null;
  email?: string | null;
  emailLanguage?: 'en' | 'ru' | string;
  status: RequestStatus;
  requestDate: string;
  availableAt?: string | null;
  contactedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  customer: Customer;
  employee?: { id: string; name: string } | null;
  contactEmployee?: { id: string; name: string } | null;
  product?: { id: string; name: string; sku: string } | null;
  variant?: { id: string; sku: string; size: string; color: string; price: number } | null;
  matches?: Array<{ id: string; createdAt: string; arrivalItem: { arrival: { id: string; arrivalNumber: string; arrivalDate: string } } }>;
}

export interface ArrivalItem {
  id: string;
  variantId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  quantity: number;
  unitCost?: number | null;
  variant?: Variant;
  matches?: Array<{ request: CustomerRequest }>;
}

export interface Arrival {
  id: string;
  arrivalNumber: string;
  supplier?: string | null;
  notes?: string | null;
  arrivalDate: string;
  createdAt: string;
  employee?: { id: string; name: string } | null;
  items: ArrivalItem[];
}

export interface ArrivalEmailNotification {
  id: string;
  requestId: string;
  customerName: string;
  recipientEmail: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | string;
  providerMessageId?: string | null;
  error?: string | null;
  attempts: number;
  createdAt: string;
  sentAt?: string | null;
  lastAttemptAt?: string | null;
}

export interface AppNotification {
  id: string;
  type: 'STOCK_MATCH' | 'SYSTEM';
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
  read: boolean;
  createdAt: string;
}

export interface Sale {
  id: string;
  variantId: string;
  customerId: string;
  quantity: number;
  amount: number;
  soldAt: string;
  variant?: Variant;
}

export interface NamedValue {
  name: string;
  value: number;
}

export interface DashboardData {
  stats: {
    totalProducts: number;
    totalVariants: number;
    inStock: number;
    lowStock: number;
    outOfStock: number;
    totalRequests: number;
    waiting: number;
    available: number;
    contacted: number;
    reserved: number;
    completedSales: number;
    cancelled: number;
    toContact: number;
    revenue: number;
    inventoryValue: number;
  };
  demandTrend: Array<{ date: string; requests: number }>;
  topProducts: NamedValue[];
  statusDistribution: NamedValue[];
  recentRequests: CustomerRequest[];
  recentArrivals: Arrival[];
  availableForContact: CustomerRequest[];
  recentlyAvailable: CustomerRequest[];
}

export interface AnalyticsData {
  summary: {
    totalRequests: number;
    waiting: number;
    available: number;
    contacted: number;
    reserved: number;
    purchased: number;
    cancelled: number;
    recoveredSales: number;
    revenue: number;
    conversionRate: number;
    lowStockVariants: number;
    outOfStockVariants: number;
    avgRequestsPerDay: number;
  };
  demandTrend: Array<{ date: string; requests: number }>;
  topProducts: NamedValue[];
  topSizes: NamedValue[];
  topColors: NamedValue[];
  frequentlyUnavailable: NamedValue[];
  statusDistribution: NamedValue[];
  sources: NamedValue[];
  uniqueCustomers: number;
}

export interface StoreSettings {
  id: string;
  name: string;
  code: string;
  currency: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  lowStockThreshold: number;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: string | null;
  createdAt: string;
  user?: { name: string } | null;
}

// ---- Subscriptions & billing -----------------------------------------------

export type SubscriptionStatus = 'inactive' | 'pending' | 'active' | 'past_due' | 'cancelled' | 'expired';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled';

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceKzt: number;
  currency: string;
  billingCycle: string;
  durationDays: number;
  features: string[];
}

export interface SubscriptionPayment {
  id: string;
  provider: string;
  amountKzt: number;
  currency: string;
  status: PaymentStatus;
  failureReason?: string | null;
  createdAt: string;
  completedAt?: string | null;
  /** True for test operations; these are never bank charges. */
  demo: boolean;
}

/** Safe demo metadata only — the PAN and CVV never reach the client. */
export interface DemoCard {
  id: string;
  brand: string;
  last4: string;
  holderName: string;
  expiryMonth: number;
  expiryYear: number;
  masked: string;
  createdAt: string;
  updatedAt: string;
}

export interface DemoCardInput {
  number: string;
  holderName: string;
  expiry: string;
  cvv: string;
}

export interface DemoCardResponse {
  card: DemoCard | null;
  demo: true;
}

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  storedStatus: string;
  hasAccess: boolean;
  startedAt: string | null;
  expiresAt: string | null;
  nextPaymentAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  provider: string | null;
}

export interface PaymentAvailability {
  available: boolean;
  provider: 'demo' | 'stripe' | 'unknown';
  demo: boolean;
  reasonCode: string | null;
  reasonKey: string | null;
}

export interface BillingPlanResponse {
  plan: SubscriptionPlan;
  paymentProvider: PaymentAvailability['provider'];
  demoMode: boolean;
  paymentsAvailable: boolean;
  paymentUnavailableReason: string | null;
  paymentUnavailableKey: string | null;
}

export interface BillingResponse {
  demo: boolean;
  paymentsAvailable: boolean;
  paymentProvider: PaymentAvailability['provider'];
  paymentUnavailableReason: string | null;
  paymentUnavailableKey: string | null;
  plan: SubscriptionPlan;
  subscription: Subscription | null;
  view: {
    status: SubscriptionStatus;
    storedStatus: string;
    hasAccess: boolean;
    startedAt: string | null;
    expiresAt: string | null;
    nextPaymentAt: string | null;
    cancelledAt: string | null;
  };
  payments: SubscriptionPayment[];
}

export interface CheckoutResponse {
  checkoutUrl: string;
  provider: string;
  transactionId: string;
  providerPaymentId: string | null;
  amountKzt: number;
  currency: string;
}

export interface BillingAdminSubscription extends Subscription {
  user: { id: string; name: string; email: string; role: Role };
  plan: { id: string; code: string; name: string; priceKzt: number; currency: string; durationDays: number };
  paymentTransactions?: SubscriptionPayment[];
}

export interface BillingAdminOverview {
  /** True when the deployment is explicitly configured for the labelled demo flow. */
  demo: boolean;
  stats: {
    totalSubscribers: number;
    active: number;
    expired: number;
    pending: number;
    pastDue: number;
    cancelled: number;
    inactive: number;
    monthlyRevenueKzt: number;
    successfulPayments: number;
  };
  subscriptions: BillingAdminSubscription[];
}
