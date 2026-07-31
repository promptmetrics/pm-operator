import { eq, sql, count } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type {
  PatchMeRequest,
  UserPublicProfile,
  PublicUserProfile,
  OnboardingRequest,
} from '@pm-operator/api';
import { toUserPublicProfile, toPublicUserProfile, toISO } from './shared';

export async function getUserProfile(
  db: DrizzleClient,
  slug: string
): Promise<PublicUserProfile | null> {
  const [user, acceptedSolutions] = await Promise.all([
    db.query.users.findFirst({
      where: eq(sql`lower(${schema.users.userslug})`, slug.toLowerCase()),
    }),
    db
      .select({ value: count() })
      .from(schema.comments)
      .innerJoin(schema.posts, eq(schema.posts.acceptedCommentId, schema.comments.id))
      .innerJoin(schema.users, eq(schema.users.userslug, slug))
      .where(eq(schema.comments.authorId, schema.users.id))
      .then((rows) => Number(rows[0]?.value ?? 0)),
  ]);

  if (!user) return null;

  return toPublicUserProfile({
    ...user,
    acceptedSolutions,
  });
}

export async function updateUserProfile(
  db: DrizzleClient,
  userId: string,
  input: PatchMeRequest
): Promise<UserPublicProfile> {
  const { fullName, aboutMe, pictureUrl, preferences } = input;

  const update: Partial<typeof schema.users.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (fullName !== undefined) update.fullName = fullName;
  if (aboutMe !== undefined) update.aboutMe = aboutMe;
  // pictureUrl is stored as a relative storage path from the client upload.
  if (pictureUrl !== undefined) update.pictureUrl = pictureUrl;
  if (preferences !== undefined) {
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
      columns: { preferences: true },
    });
    update.preferences = {
      ...(existing?.preferences ?? {}),
      ...preferences,
    };
  }

  const [updated] = await db
    .update(schema.users)
    .set(update)
    .where(eq(schema.users.id, userId))
    .returning();

  if (!updated) throw new Error('User not found');

  return toUserPublicProfile(updated);
}

export async function completeOnboarding(
  db: DrizzleClient,
  userId: string,
  input: OnboardingRequest
): Promise<UserPublicProfile> {
  const [updated] = await db
    .update(schema.users)
    .set({
      painfulToolStackTask: input.painfulToolStackTask,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId))
    .returning();

  if (!updated) throw new Error('User not found');

  return toUserPublicProfile(updated);
}
