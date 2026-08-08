import type { PublicUserProfile, UserPublicProfile } from '@pm-operator/api';
import { levelForScore } from '@pm-operator/api';
import { getAvatarReadUrl } from '../storage';

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(n) ? n : 0;
}

export function toISO(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  return new Date(value).toISOString();
}

const EXCERPT_LENGTH = 200;

export function toExcerpt(contentPlain: string | null | undefined): string | undefined {
  const text = (contentPlain ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  if (text.length <= EXCERPT_LENGTH) return text;
  const cut = text.slice(0, EXCERPT_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export type UserRow = {
  id: string;
  email: string;
  username: string;
  userslug: string;
  fullName: string | null;
  pictureUrl: string | null;
  aboutMe: string | null;
  role: string;
  reputationScore: string | number;
  streakDays: number;
  painfulToolStackTask: string | null;
  acceptedSolutions?: number | string;
};

export async function toPublicUserProfile(row: UserRow): Promise<PublicUserProfile> {
  return {
    id: row.id,
    username: row.username,
    userslug: row.userslug,
    fullName: row.fullName,
    pictureUrl: await getAvatarReadUrl(row.pictureUrl),
    role: row.role as PublicUserProfile['role'],
    reputationScore: toNumber(row.reputationScore),
    streakDays: row.streakDays,
    acceptedSolutions: toNumber(row.acceptedSolutions ?? 0),
    level: levelForScore(toNumber(row.reputationScore)).level,
  };
}

export async function toUserPublicProfile(row: UserRow): Promise<UserPublicProfile> {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    userslug: row.userslug,
    fullName: row.fullName,
    pictureUrl: await getAvatarReadUrl(row.pictureUrl),
    role: row.role as UserPublicProfile['role'],
    reputationScore: toNumber(row.reputationScore),
    streakDays: row.streakDays,
    level: levelForScore(toNumber(row.reputationScore)).level,
    painfulToolStackTask: row.painfulToolStackTask ?? '',
    onboardingComplete: Boolean(row.painfulToolStackTask && row.painfulToolStackTask.length > 0),
  };
}

export function isAdminOrModerator(role: string): boolean {
  return role === 'admin' || role === 'moderator';
}
