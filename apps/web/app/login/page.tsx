import { Suspense } from 'react';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen flex-col items-center justify-center px-4 py-12" />}>
      <LoginForm />
    </Suspense>
  );
}
