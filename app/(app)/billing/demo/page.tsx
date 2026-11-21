'use client';

import { Suspense } from 'react';
import { DemoCheckout } from '../../../../src/views/DemoCheckout';
import { Splash } from '../../../splash';

export default function DemoCheckoutPage() {
  return (
    <Suspense fallback={<Splash />}>
      <DemoCheckout />
    </Suspense>
  );
}
