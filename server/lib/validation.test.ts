import { describe, expect, it } from 'vitest';
import {
  customerPatchSchema,
  customerSchema,
  productPatchSchema,
  productSchema,
  requestPatchSchema,
  requestSchema,
  userPatchSchema,
  userSchema,
} from './validation';

describe('PATCH validation schemas', () => {
  it('does not apply create defaults when a product is patched partially', () => {
    const parsed = productPatchSchema.parse({ name: 'Renamed product' });
    expect(parsed).toEqual({ name: 'Renamed product' });
    expect('isActive' in parsed).toBe(false);
    expect('variants' in parsed).toBe(false);
  });

  it('does not apply variant defaults inside a partial product patch', () => {
    const parsed = productPatchSchema.parse({
      variants: [{ id: 'variant_1', lowStockThreshold: 9 }],
    });
    expect(parsed.variants).toEqual([{ id: 'variant_1', lowStockThreshold: 9 }]);
    expect('quantity' in parsed.variants![0]).toBe(false);
    expect('price' in parsed.variants![0]).toBe(false);
  });

  it('does not apply a customer status default to a partial patch', () => {
    const parsed = customerPatchSchema.parse({ name: 'Renamed customer' });
    expect(parsed).toEqual({ name: 'Renamed customer' });
    expect('status' in parsed).toBe(false);
  });

  it('does not apply role or active defaults to a partial user patch', () => {
    const parsed = userPatchSchema.parse({ name: 'Renamed user' });
    expect(parsed).toEqual({ name: 'Renamed user' });
    expect('role' in parsed).toBe(false);
    expect('active' in parsed).toBe(false);
  });

  it('does not apply source or language defaults to a partial request patch', () => {
    const parsed = requestPatchSchema.parse({ notes: 'Updated note' });
    expect(parsed).toEqual({ notes: 'Updated note' });
    expect('source' in parsed).toBe(false);
    expect('emailLanguage' in parsed).toBe(false);
  });
});

describe('create validation schemas', () => {
  it('still applies expected defaults on create', () => {
    expect(productSchema.parse({
      name: 'Product',
      sku: 'SKU-1',
      category: 'Shoes',
      variants: [{ sku: 'SKU-1-M', size: 'M', color: 'Blue', price: 10 }],
    })).toMatchObject({
      isActive: true,
      variants: [{ lowStockThreshold: 3, quantity: 0 }],
    });

    expect(customerSchema.parse({ name: 'Customer', phone: '+77000000000' }))
      .toMatchObject({ status: 'ACTIVE' });
    expect(userSchema.parse({ name: 'User', email: 'user@example.com' }))
      .toMatchObject({ role: 'EMPLOYEE', active: true });
    expect(requestSchema.parse({
      customerName: 'Customer',
      phone: '+77000000000',
      productName: 'Product',
      sku: 'SKU-1',
      size: 'M',
      color: 'Blue',
    })).toMatchObject({ source: 'IN_STORE', emailLanguage: 'en' });
  });
});
