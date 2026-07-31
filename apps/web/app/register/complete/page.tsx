import { redirect } from 'next/navigation';
import { createAuthServerClient } from '@/lib/auth/server';
import { OnboardingForm } from './onboarding-form';

export default async function CompleteRegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  const { returnUrl } = await searchParams;
  const target = returnUrl || '/feed';

  const supabase = await createAuthServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect(`/login?returnUrl=${encodeURIComponent('/register/complete')}`);
  }

  const { data: profile } = await supabase
    .from('users')
    .select('painful_tool_stack_task, preferences, full_name')
    .eq('id', user.id)
    .single();

  if (profile?.painful_tool_stack_task) {
    redirect(target);
  }

  return (
    <OnboardingForm
      userId={user.id}
      email={user.email || ''}
      fullName={(profile?.full_name as string) || (user.user_metadata?.full_name as string) || ''}
      returnUrl={target}
    />
  );
}
