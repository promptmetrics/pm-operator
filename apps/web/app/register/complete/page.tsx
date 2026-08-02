import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { listRecommendedCircles } from '@/lib/services/groups';
import { OnboardingShell, Step1Focus, Step2Circles, Step3Primer } from './onboarding-form';

// T8.10 (spec §3.2/105-169): the 3-step onboarding wizard. The server page is
// the source of truth for the current step (read from preferences), so a reload
// resumes in place rather than restarting. Writes are only blocked until Step 1
// is done (requireOnboarding checks painful_tool_stack_task); steps 2-3 are
// activation nudges, not write-blockers. One profile query, plus one
// recommendations query on Step 2 — sequential, pool-safe.
export default async function CompleteRegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  const { returnUrl } = await searchParams;
  const target = returnUrl || '/feed';

  const { session } = await getSession();
  if (!session?.user?.id) {
    redirect(`/login?returnUrl=${encodeURIComponent('/register/complete')}`);
  }
  const userId = session.user.id;

  const db = createServiceDb();
  const profile = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { painfulToolStackTask: true, preferences: true, fullName: true },
  });

  const preferences = (profile?.preferences as Record<string, unknown> | null | undefined) ?? {};
  const onboardingComplete = preferences.onboardingComplete === true;
  // Legacy users finished the pre-wizard single-step onboarding (task set, no
  // step flag) — treat them as complete so they aren't forced back through 2-3.
  const legacyComplete =
    Boolean(profile?.painfulToolStackTask) && preferences.onboardingStep === undefined;
  if (onboardingComplete || legacyComplete) {
    redirect(target);
  }

  const step = (preferences.onboardingStep as number | undefined) ?? 1;
  const stackTags = (preferences.stackTags as string[] | undefined) ?? [];
  const joinedNames = (preferences.onboardingJoinedNames as string[] | undefined) ?? [];

  let content: React.ReactNode;
  if (step === 1) {
    content = (
      <Step1Focus
        userId={userId}
        fullName={profile?.fullName ?? ''}
        initialTask={profile?.painfulToolStackTask ?? ''}
        initialStackTags={stackTags}
      />
    );
  } else if (step === 2) {
    const circles = await listRecommendedCircles(db, stackTags);
    content = <Step2Circles userId={userId} circles={circles} />;
  } else {
    content = <Step3Primer userId={userId} joinedCircleNames={joinedNames} />;
  }

  return <OnboardingShell step={step}>{content}</OnboardingShell>;
}