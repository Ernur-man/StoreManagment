'use client';

import { Suspense } from 'react';
import { Billing } from '../../../src/views/Billing';
import { Splash } from '../../splash';

export default function BillingPage() {
  return (
    <Suspense fallback={<Splash />}>
      <Billing />
    </Suspense>
  );
}
