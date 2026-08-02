'use server';

import { redirect } from 'next/navigation';
import { eq, and, inArray } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { getSession } from '@/lib/auth/server';
import { getDb } from '@/lib/api/server';
import { joinGroup } from '@/lib/services/groups';

type UserPreferences = Record<string, unknown>;

async function requireMatchingSession(userId: string): Promise<boolean> {
  const { session } = await getSession();
  return Boolean(session?.user?.id && session.user.id === userId);
}

async function readPreferences(db: ReturnType<typeof getDb>, userId: string): Promise<UserPreferences> {
  const row = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { preferences: true },
  });
  return (row?.preferences as UserPreferences | null | undefined) ?? {};
}

// Step 1: save the painful-tool-stack task + stack tags, then advance to step 2.
// Two sequential queries (read preferences, then one update writing both the task
// and the merged preferences) — pool-safe.
export async function saveOnboardingStep1(input: {
  userId: string;
  painfulToolStackTask: string;
  stackTags: string[];
}) {
  if (!(await requireMatchingSession(input.userId))) {
    return { error: 'You must be signed in to complete onboarding.' };
  }
  const task = input.painfulToolStackTask.trim();
  if (!task) {
    return { error: 'Describe the problem you are working on.' };
  }

  const db = getDb();
  const preferences = {
    ...(await readPreferences(db, input.userId)),
    stackTags: input.stackTags,
    onboardingStep: 2,
  };
  await db
    .update(schema.users)
    .set({ painfulToolStackTask: task, preferences, updatedAt: new Date() })
    .where(eq(schema.users.id, input.userId));

  redirect('/register/complete');
}

// Step 2: join the selected public circles, then advance to step 3. Joins run
// sequentially (NOT Promise.all) — each joinGroup is its own findFirst +
// transaction, and fanning out would starve the small DB pool (see
// pool-starvation gotcha). "Already a member" is treated as joined so a reload
// resumes cleanly instead of erroring.
export async function joinOnboardingCircles(input: { userId: string; slugs: string[] }) {
  if (!(await requireMatchingSession(input.userId))) {
    return { error: 'You must be signed in to complete onboarding.' };
  }
  const slugs = input.slugs.filter(Boolean);
  if (slugs.length < 2) {
    return { error: 'Join at least two circles to continue.' };
  }

  const db = getDb();
  // Resolve names for the success toast and restrict joins to public circles
  // (the only ones onboarding can join without an invite). One bounded query.
  const rows = await db.query.groups.findMany({
    where: and(eq(schema.groups.visibility, 'public'), inArray(schema.groups.slug, slugs)),
    columns: { slug: true, name: true },
  });
  const nameBySlug = new Map(rows.map((r) => [r.slug, r.name]));
  const joinable = slugs.filter((s) => nameBySlug.has(s));
  if (joinable.length < 2) {
    return { error: 'Those circles are no longer available. Go back and pick others.' };
  }

  const joinedNames: string[] = [];
  for (const slug of joinable) {
    try {
      await joinGroup(db, slug, input.userId, {});
      joinedNames.push(nameBySlug.get(slug)!);
    } catch (err) {
      if (err instanceof Error && err.message === 'Already a member of this group') {
        joinedNames.push(nameBySlug.get(slug)!);
      }
      // A circle that became invite_only/paid mid-flight is skipped silently;
      // the user still joins the rest and can retry the rest from the circle page.
    }
  }

  if (joinedNames.length === 0) {
    return { error: "We couldn't join those circles. Please try again." };
  }

  const preferences = {
    ...(await readPreferences(db, input.userId)),
    onboardingStep: 3,
    onboardingJoinedNames: joinedNames,
  };
  await db
    .update(schema.users)
    .set({ preferences, updatedAt: new Date() })
    .where(eq(schema.users.id, input.userId));

  redirect('/register/complete');
}

// Step 3: mark onboarding complete and land on the feed with a welcome toast
// (and the composer open when the user chose "Write your first post").
export async function finishOnboarding(input: { userId: string; mode: 'explore' | 'post' }) {
  if (!(await requireMatchingSession(input.userId))) {
    return { error: 'You must be signed in to complete onboarding.' };
  }

  const db = getDb();
  const preferences = {
    ...(await readPreferences(db, input.userId)),
    onboardingComplete: true,
  };
  await db
    .update(schema.users)
    .set({ preferences, updatedAt: new Date() })
    .where(eq(schema.users.id, input.userId));

  redirect(input.mode === 'post' ? '/feed?welcome=1&compose=1' : '/feed?welcome=1');
}