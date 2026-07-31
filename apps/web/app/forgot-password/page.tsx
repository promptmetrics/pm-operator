import { Suspense } from 'react';
import { ForgotPasswordForm } from './ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen flex-col items-center justify-center px-4 py-12" />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
