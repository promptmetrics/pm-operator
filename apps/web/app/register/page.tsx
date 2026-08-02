import { Suspense } from 'react';
import { LoginForm } from '../login/LoginForm';

export default function RegisterPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen flex-col items-center justify-center px-4 py-12" />}>
      <LoginForm initialMode="sign-up" />
    </Suspense>
  );
}