'use client';

import { Suspense } from 'react';
import { PaymentMethods } from '../../../../src/views/PaymentMethods';
import { Splash } from '../../../splash';

export default function PaymentMethodsPage() {
  return (
    <Suspense fallback={<Splash />}>
      <PaymentMethods />
    </Suspense>
  );
}
