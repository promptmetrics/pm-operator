import type { PostDetail } from '@pm-operator/api';
import { WWW_ORGANIZATION_ID } from './site-jsonld';

/**
 * DiscussionForumPosting markup for a community post.
 *
 * Why this exists: community posts shipped with zero structured data, so Google
 * had no signal they were discussions rather than thin pages, and they were
 * ineligible for the Discussions and Forums treatment. Per Google's forum
 * guidance the required properties are `author`, `author.name`, `datePublished`,
 * and at least one of `text` / `image` / `video`.
 *
 * Deliberate omission — `image`: post cover images used to be signed Supabase
 * URLs that expire hourly. They are now stable /api/img/ proxy URLs, so this
 * could be added; `text` satisfies the one-of requirement on its own for now.
 *
 * `author.url` points at the /u/ profile page, which is crawlable (robots.ts
 * no longer disallows /u/) — the E-E-A-T link Google's forum guidance wants.
 *
 * `publisher` references the Organization node OWNED by www.promptmetrics.dev
 * (see site-jsonld.ts) so both subdomains merge into one entity graph.
 *
 * `commentCount` comes from the denormalized column, which counts published
 * comments — the same set an anonymous crawler sees in the server-rendered
 * thread. Do not swap it for a viewer-specific total.
 */
export interface PostJsonLd {
  '@context': 'https://schema.org';
  '@type': 'DiscussionForumPosting';
  '@id': string;
  headline: string;
  text: string;
  url: string;
  datePublished: string;
  dateModified: string;
  author: { '@type': 'Person'; name: string; url?: string };
  isPartOf: { '@type': 'WebPage'; '@id': string };
  commentCount: number;
  interactionStatistic: {
    '@type': 'InteractionCounter';
    interactionType: 'https://schema.org/LikeAction' | 'https://schema.org/CommentAction';
    userInteractionCount: number;
  }[];
  publisher: { '@id': string };
}

/**
 * Returns null when there is nothing honest to describe — a redacted post
 * (contentPlain blanked by redactForViewer) or a missing title. Emitting schema
 * for a moderator placeholder claims content the page does not have.
 */
export function buildPostJsonLd(post: PostDetail, canonical: string): PostJsonLd | null {
  const text = post.contentPlain?.trim();
  const headline = post.title?.trim();
  if (!text || !headline) return null;

  const origin = new URL(canonical).origin;
  const userslug = post.author.userslug?.trim();

  return {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    '@id': `${canonical}#post`,
    headline,
    text,
    url: canonical,
    datePublished: post.createdAt,
    dateModified: post.updatedAt,
    author: {
      '@type': 'Person',
      name: post.author.fullName?.trim() || post.author.username,
      ...(userslug ? { url: `${origin}/u/${userslug}` } : {}),
    },
    isPartOf: { '@type': 'WebPage', '@id': `${origin}/g/${post.group.slug}` },
    commentCount: post.commentCount,
    interactionStatistic: [
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/LikeAction',
        userInteractionCount: post.upvotes,
      },
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/CommentAction',
        userInteractionCount: post.commentCount,
      },
    ],
    publisher: { '@id': WWW_ORGANIZATION_ID },
  };
}

/**
 * Serialize for injection into a <script type="application/ld+json"> body.
 *
 * `<` is escaped so a post body containing `</script>` cannot close the tag and
 * turn its own content into markup. JSON.stringify alone does not do this.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
