# UX Specification: operator.promptmetrics.dev

## 1. Design Principles and Voice

### Principles

1. **Agent-native parity, human-first polish.** Every feature must be callable via `/api/v1` and, where appropriate, via `/api/mcp`. The UI is the primary experience; the API is not an afterthought.
2. **Reputation reflects usefulness, not volume.** Points, badges, and leaderboard rank reward accepted solutions, quality builds, and peer validation — not raw post count.
3. **Circles over channels.** Content is grouped by intent and outcome (e.g., "MCP Servers," "Show Your Build," "Incident Help"), not by chronological chat room.
4. **Public by default, private when valuable.** Public circles and posts drive discovery and SEO; private circles protect paid cohorts, client builds, and sensitive threads.
5. **EU-resident, trustworthy infrastructure.** Visual copy, consent flows, and data-residency hints reinforce that the platform is hosted in Frankfurt and built for operators with compliance concerns.
6. **Fast, transparent, low-noise.** The feed prioritizes unanswered questions, solved threads, and builds from circles the user follows. Hidden algorithms are avoided.
7. **Low-stakes first contribution.** New members are guided to a first post or comment with clear expectations and immediate positive feedback.

### Voice and tone

- Direct, operator-to-operator: "Share your build," "Mark the solution," "Ask the author."
- No hype or creator-community language. Avoid "crush it," "mastermind," or "tribe."
- Explain technical constraints honestly: "This circle is invite-only," "MCP read tools ship first."
- Use sentence case for labels and buttons. Avoid all-caps except for acronyms.
- Error messages say what happened and the exact next step, never just "Something went wrong."

## 2. Information Architecture / Site Map

```
/
  ├── /login                          OAuth + email/password entry
  ├── /register/complete              Mandatory onboarding gate (painful_tool_stack_task)
  ├── /feed                           Personalized feed (authenticated)
  │     └── ?filter=my-circles|show-your-build|solutions|unanswered|all
  ├── /g/:slug                        Circle landing page
  │     ├── /lessons                  Pinned canonical posts / resources
  │     ├── /leaderboard              Group-scoped leaderboard
  │     └── /invite                   Invite modal (members/admins only)
  ├── /p/:id                          Post detail page
  ├── /u/:slug                        Public profile + reputation
  │     └── /devcard                  Shareable Operator DevCard
  ├── /search?q=...                   Community search results
  ├── /leaderboards                   Global leaderboards
  ├── /notifications                  Notification inbox
  ├── /settings                       Profile, auth, circles, notifications
  ├── /moderation                     Flag queue (moderators/admins)
  ├── /api/v1/*                       REST API
  └── /api/mcp                        MCP over Streamable HTTP
```

### Navigation structure

**Persistent top navigation (authenticated)**

```
[Logo: operator]  [Feed] [Circles ▼] [Leaderboards] [Search ░░░]  [🔔 N] [Avatar ▼]
```

- **Logo** links to `/feed` when logged in, `/` when anonymous.
- **Circles dropdown** lists followed circles with member count and a "new" dot. Includes "Browse circles" and "Create circle" (admins only).
- **Search** is an expandable input. Submitting opens `/search?q=`.
- **Notification bell** shows unread count badge. Click opens a dropdown; "Mark all read" and "View all" links to `/notifications`.
- **Avatar dropdown** links to profile, settings, DevCard, and logout.

**Anonymous navigation**

```
[Logo: operator]  [Circles] [Leaderboards] [Search ░░░]  [Log in]
```

- Public `/g/:slug` and `/p/:id` are readable. Engagement actions surface a value-prop login modal.

## 3. Key Screens and Page Descriptions

### 3.1 Login (`/login`)

**Layout**

```
+--------------------------------------------------+
|  operator.promptmetrics.dev                      |
|  A community for AI operators, founders, and       |
|  teams building with AI.                         |
+--------------------------------------------------+
|                                                  |
|  [Continue with GitHub]  ← primary               |
|  [Continue with Google]                          |
|  [Continue with LinkedIn]                        |
|                                                  |
|  ─────────── or email ───────────                |
|  [Email                         ]                |
|  [Password                      ]  [Show]          |
|  [Sign in]                                       |
|                                                  |
|  [Create an account]  ·  Forgot password?        |
|                                                  |
+--------------------------------------------------+
|  EU-hosted · Public knowledge · Agent-ready API  |
+--------------------------------------------------+
```

**Behavior**
- OAuth buttons use full sentences: "Continue with GitHub," not "GitHub."
- Scope copy below each OAuth button: "We only read your public profile and email."
- Inline validation on blur. Errors appear below the field with `aria-describedby` linkage.
- Post-auth, users missing `painful_tool_stack_task` are redirected to `/register/complete`.
- "Create an account" uses the same OAuth options plus email/password signup. No separate registration page.

### 3.2 Onboarding (`/register/complete`)

**Layout**

```
+--------------------------------------------------+
|  Welcome, {name}                                 |
|  One question places you in the right circles.   |
+--------------------------------------------------+
|                                                  |
|  What is the most painful tool-stack or agent    |
|  problem you are working on right now?             |
|  [                                             ]   |
|  [                                             ]   |
|  Example: "I can't get MCP servers to authenticate |
|  consistently in our Next.js app."                 |
|                                                  |
|  [Continue]                                      |
|                                                  |
|  Step 1 of 3 — tell us your focus                |
+--------------------------------------------------+
```

**Step 2: Circle recommendations**

```
+--------------------------------------------------+
|  Circles that match your stack                   |
|  Based on: MCP, Next.js, authentication          |
+--------------------------------------------------+
|                                                  |
|  [☑] MCP Servers          48 members · public    |
|  [☑] Vercel AI SDK        31 members · public    |
|  [ ] Multi-agent orchestration  19 members · inv.  |
|  [☑] Incident Help        22 members · public    |
|                                                  |
|  [Join selected circles]                         |
|                                                  |
|  Step 2 of 3 — follow at least 2                 |
+--------------------------------------------------+
```

**Step 3: Reputation primer**

```
+--------------------------------------------------+
|  How reputation works                            |
|                                                  |
|  • Ask questions and mark accepted solutions      |
|  • Share builds with repo links and stack tags    |
|  • Helpful comments earn more than likes          |
|                                                  |
|  [Start exploring]  [Write your first post]      |
|                                                  |
|  Step 3 of 3 — you're in                          |
+--------------------------------------------------+
```

**Behavior**
- Onboarding is mandatory. All write endpoints block until `painful_tool_stack_task` is non-null.
- The free-text answer is analyzed for stack keywords (MCP, evals, Vercel, LangChain, governance, etc.) to rank circle suggestions.
- Users must join at least two circles to continue.
- Progress indicator uses a three-step visual with current step labeled.
- Skipping is not allowed. Closing the browser and returning resumes at the current step.
- On completion, the user lands on `/feed` with a success toast: "You're now following MCP Servers, Vercel AI SDK, and Incident Help."

### 3.3 Feed (`/feed`)

**Layout**

```
+--------------------------------------------------+
|  [Logo]  [Feed] [Circles ▼] [Leaderboards] [Search] [🔔] [Avatar]  |
+--------------------------------------------------+
|                                                  |
|  Top operators this week                         |
|  1. Alex Ríos  2. Priya Nair  3. Jordan Lee ...  |
|                                                  |
|  [My circles] [Show Your Build] [Solutions] [Unanswered] [All]  |
|                                                  |
|  +----------------------------------------------+|
|  | [MCP Servers] · public                       ||
|  | How do you validate tool descriptions?         ||
|  | Alex Ríos · 124 pts · 12 solutions · 2h    ||
|  | 8 comments · 14 likes · 3 min read            ||
|  | [Like] [Comment] [Share] [Ask author]||
|  +----------------------------------------------+|
|  | [Show Your Build] · Vercel AI SDK            ||
|  | Open-source eval runner for Next.js          ||
|  | github.com/alex/evals · TypeScript · Vercel   ||
|  | Priya Nair · 98 pts · 5 solutions · 1d      ||
|  | 12 comments · 31 likes                        ||
|  +----------------------------------------------+|
|                                                  |
|  [Load more]                                     |
+--------------------------------------------------+
```

**Behavior**
- Default filter is "My circles." Tabs update URL query param `?filter=`.
- Cards are `<article>` elements inside a region with `role="feed"`.
- Each card shows circle tag, title, author avatar + reputation + accepted-solution count, engagement counts, and action bar.
- Saving posts is deferred to post-MVP; the feed card action bar does not include a Save action.
- "Solutions" filter boosts posts with `accepted_comment_id`. "Unanswered" shows posts with zero comments or no accepted solution.
- Leaderboard strip shows top five global operators for the current week, with explicit time window label.
- Realtime new posts prepend at the top with a subtle highlight that fades after 5 seconds. They do not steal focus.
- Empty state per filter has custom copy (see Section 9).

### 3.4 Circle page (`/g/:slug`)

**Layout**

```
+--------------------------------------------------+
|  [Logo]  [Feed] [Circles ▼] [Leaderboards] [Search] [🔑] [Avatar]  |
+--------------------------------------------------+
|                                                  |
|  MCP Servers                                     |
|  Tool descriptions, auth patterns, and server    |
|  discovery for Model Context Protocol.           |
|  Public · 48 members · created 3 weeks ago       |
|  [Join circle]  [Invite member]  [Manage]        |
|                                                  |
|  ───── Pinned resources ─────                   |
|  1. MCP auth patterns checklist                  |
|  2. Official MCP spec changelog                  |
|  3. Server discovery thread                      |
|                                                  |
|  [Lessons] [Discussion] [Leaderboard]            |
|                                                  |
|  Filter: [Questions] [Builds] [Solved] [Unanswered] [All]  |
|                                                  |
|  [+ New post in MCP Servers]                     |
|                                                  |
|  [Feed cards identical to /feed, scoped to circle]  |
|                                                  |
|  +------------------------+                      |
|  | This week's top        |                      |
|  | 1. Alex Ríos   320 pts |                      |
|  | 2. Priya Nair  215 pts |                      |
|  | ...                    |                      |
|  +------------------------+                      |
+--------------------------------------------------+
```

**Behavior**
- Header visibility badge: public (globe icon), invite_only (lock icon), paid (crown icon).
- Join button for public circles becomes "Leave circle" for members.
- Invite-only and paid circles show "Membership required" with an invite-code field or tier-upgrade CTA (tier UI hidden at launch if no active tiers).
- "Invite member" and "Manage" are visible only to admins/moderators.
- Pinned resources section always appears above the discussion tab.
- Group-scoped leaderboard is shown in the right sidebar on desktop, inline below pinned resources on mobile.
- Tabs update URL: `/g/:slug/lessons`, `/g/:slug` (discussion), `/g/:slug/leaderboard`.

### 3.5 Post detail (`/p/:id`)

**Layout**

```
+--------------------------------------------------+
|  [Logo]  [Feed] [Circles ▼] [Leaderboards] [Search] [🔔] [Avatar]  |
+--------------------------------------------------+
|  [MCP Servers] · Public                          |
|                                                  |
|  How do you validate tool descriptions?          |
|                                                  |
|  We are shipping an MCP server that wraps our    |
|  internal API. The model frequently ignores the    |
|  `description` field. Has anyone found a reliable   |
|  pattern for forcing the model to respect it?     |
|                                                  |
|  Tags: #mcp #tool-description #validation       |
|                                                  |
|  Alex Ríos · 124 pts · 12 solutions · 2h ago  |
|  [Like 14] [Comment] [Flag]                      |
|                                                  |
|  ───── 8 comments ─────                          |
|                                                  |
|  Priya Nair · 98 pts · 5 solutions · 1h ago     |
|  We added a one-sentence use-case prefix to each   |
|  tool name and saw a 40% drop in bad calls.        |
|  [Like 5] [Reply] [Accept solution]               |
|                                                  |
|  Jordan Lee · 12 pts · 0 solutions · 45m ago    |
|  Can you share an example?                       |
|    └─ Alex Ríos · 124 pts · 20m ago            |
|       Yes — here is a sanitized snippet.          |
|                                                  |
|  [Write a comment...]                            |
|  [Preview] [Post comment]                        |
+--------------------------------------------------+
```

**Behavior**
- Author reputation is clickable and links to `/u/:slug`.
- "Accept solution" appears only on the post author's own question posts and only for top-level comments.
- Accepted solution is visually distinguished with a green checkmark badge, border accent, and "Accepted solution" label. It sorts to the top of comments.
- Like button toggles with optimistic count update. Error reverts both icon and count.
- Comment input uses the rich-text toolbar (TipTap) with bold, code block, link, and mention support. Preview tab shows rendered output.
- Replies are nested one level deep. Deep nesting is flattened with "View thread" links.
- Realtime comments append below existing comments; a polite `aria-live` announces "New comment by Priya Nair."
- Post actions: edit/delete for author/admins, flag for all authenticated users.
- The MVP post action bar is limited to Like, Comment, and Flag. Share and Ask author are deferred to post-MVP; sharing will use the native browser share API, and asking the author will be handled via @-mention in comments.

### 3.6 Profile (`/u/:slug`)

**Layout**

```
+--------------------------------------------------+
|  [Logo]  [Feed] [Circles ▼] [Leaderboards] [Search] [🔔] [Avatar]  |
+--------------------------------------------------+
|                                                  |
|  [Avatar]  Alex Ríos                             |
|  AI operator · Berlin · joined 3 weeks ago       |
|  Reputation: 124 · Accepted solutions: 12      |
|  Top circles: MCP Servers, Vercel AI SDK, Evals  |
|  [Share DevCard]  [Edit profile] (if owner)       |
|                                                  |
|  Bio                                             |
|  Building agent stacks for EU startups.          |
|  Open source: github.com/alexrios                 |
|                                                  |
|  [Posts] [Comments] [Solutions] [Badges]         |
|                                                  |
|  Post list identical to feed cards               |
|                                                  |
+--------------------------------------------------+
```

**Behavior**
- Public profile fields: name, avatar, role, location, bio, reputation score, accepted-solution count, top circles, badges.
- Tabs filter the user's content by posts, comments, accepted solutions, and badges.
- "Edit profile" is visible only to the owner.
- DevCard is a generated shareable image/card with reputation, top circles, and accepted-solution count.

### 3.7 DevCard (`/u/:slug/devcard`)

**Layout**

```
+--------------------------------------------------+
|                                                  |
|  Operator DevCard                                |
|                                                  |
|  ┌─────────────────────────────┐                |
|  │  [Avatar]  Alex Ríos          │                |
|  │  124 reputation             │                |
|  │  12 accepted solutions        │                |
|  │  Top circles: MCP, Vercel AI  │                |
|  │  operator.promptmetrics.dev   │                |
|  └─────────────────────────────┘                |
|                                                  |
|  [Copy image URL]  [Download PNG]  [Share on X]  |
|                                                  |
+--------------------------------------------------+
```

**Behavior**
- DevCard is public-read and has OpenGraph meta tags for social sharing.
- Background uses Paper-v3 brand tokens.
- Generated as an SVG/PNG via a server route; not rendered client-side.

### 3.8 Notifications (`/notifications`)

**Layout**

```
+--------------------------------------------------+
|  Notifications                                   |
|  [Mark all read]  [Settings]                     |
|                                                  |
|  Today                                             |
|  [Avatar] Priya Nair commented on your post        |
|         "How do you validate tool descriptions?"  |
|         2h ago · [View]                          |
|                                                  |
|  [Avatar] Jordan Lee accepted your solution      |
|         5h ago · [View]                          |
|                                                  |
|  Yesterday                                         |
|  [Avatar] Alex Ríos invited you to Design Partners |
|         1d ago · [Accept invite]                 |
|                                                  |
+--------------------------------------------------+
```

**Behavior**
- Notifications grouped by date. Unread rows have a left accent border.
- Clicking a notification marks it read and navigates to the relevant post/circle/profile.
- "Mark all read" clears the unread badge in the top navigation.
- Realtime push adds a new row and updates the badge without full reload.

### 3.9 Moderation queue (`/moderation`)

**Layout**

```
+--------------------------------------------------+
|  Moderation queue                                |
|  [Open 12] [Resolved 48] [All]                   |
|                                                  |
|  Filter: [Watched phrase] [User report] [Spam] [All]  |
|                                                  |
|  ┌────────────────────────────────────────────┐ |
|  │ Flagged post in MCP Servers · 10m ago       │ |
|  │ Reason: Watched phrase "guaranteed ROI"    │ |
|  │ [View post] [Dismiss] [Hide post] [Escalate]  │ |
|  └────────────────────────────────────────────┘ |
|                                                  |
|  [Resolve selected]  [Hide selected]              |
+--------------------------------------------------+
```

**Behavior**
- Visible to moderators and admins only.
- Default view is open flags. Bulk actions use checkboxes with shift-click range selection.
- "Hide post" sets `posts.status = 'hidden'`. Hidden posts and comments remain visible to the author, moderators, and admins; everyone else sees a "Removed by moderator" placeholder. "Dismiss" marks the flag resolved with no action.
- All actions log resolver and timestamp.
- Watched-phrase flags are auto-created; user reports are created via the "Flag" action on posts/comments.

## 4. Component Library Requirements (Paper-v3 reuse, not shadcn)

The frontend is built on the existing **Paper-v3** design system in `packages/ui`. No shadcn/ui components are introduced.

### Required Paper-v3 components

| Component | Purpose | Customization for operator |
|---|---|---|
| `Button` | Primary/secondary/ghost actions | Add `size="xs"` for card action bars |
| `IconButton` | Like, share, flag on cards | Add pressed and count states |
| `Avatar` | User avatars in feed, comments, nav | Add reputation badge overlay |
| `Badge` | Circle tags, visibility, reputation | Add paid/invite/public variants |
| `Card` | Feed cards, notification rows, flag cards | Add hover/focus elevation |
| `Tabs` | Feed filters, circle tabs, profile tabs | Add URL-sync variant |
| `Dialog` | Login prompt, invite modal, flag reason | Add focus trap and return-focus |
| `DropdownMenu` | Circles nav, user nav, moderation bulk | Add keyboard navigation |
| `Toast` | Success/error/undo feedback | Add `role="status"` |
| `TextField` / `TextArea` | Search, comment input, onboarding | Add character counter and error linkage |
| `Tooltip` | Action labels, reputation explanation | Never hide critical info in tooltip |
| `Skeleton` | Feed and comment loading states | Match card heights exactly |
| `ProgressBar` | Badge progress, leaderboard threshold | Add label and percentage |

### New components to add in `packages/ui`

1. **`FeedCard`** — composite component combining Card, Avatar, Badge, IconButton, and action bar.
2. **`CommentThread`** — nested comment rendering with depth limit, reply input, and accept-solution button.
3. **`ReputationBadge`** — small reputation score + accepted-solution count next to author name.
4. **`VisibilityBadge`** — public / invite-only / paid variants with icon and label.
5. **`InviteModal`** — code generation, copy-to-clipboard, role selector, pending invites list.
6. **`RichTextToolbar`** — bold, italic, code, link, mention buttons for the TipTap editor.
7. **`DevCardFrame`** — frame for the generated shareable card.

### Tokens to define or verify

- **Color**: primary (PromptMetrics brand), success (accepted solution), warning (flagged/unread), danger (ban/remove), muted (secondary text).
- **Spacing**: 8px base grid; feed gap 16px; card internal padding 16px.
- **Typography**: sans-serif stack; post title `text-lg font-semibold`; body `text-base`; metadata `text-sm`.
- **Motion**: point animations and leaderboard updates respect `prefers-reduced-motion`.

## 5. Interaction Patterns

### 5.1 Feed

- **Initial load**: Server Component fetches first page; `Skeleton` cards match final card height to prevent layout shift.
- **Pagination**: "Load more" appends next page. Infinite scroll is deferred to avoid jumpy behavior on mobile.
- **Filter change**: Tab click updates URL, re-fetches via `router.push` with `scroll: false`, preserves scroll position.
- **Sorting**: Default sort is "New." "Top" sorts by `upvotes` within the selected time window. "Solved" filters to posts with accepted comments.
- **Realtime new post**: A client subscription to `group:<slug>:posts` inserts the new card at the top with a 5-second background highlight. Duplicates are dropped by `post.id`.

### 5.2 Post creation

- **Entry points**: "+ New post" on circle page, "Write your first post" in onboarding, "New post" button in feed for members of at least one circle.
- **Modal layout**:
  ```
  Title      [░░░░░░░░░░░░░░░░░░░░]
  Circle     [MCP Servers ▼]
  Type       [Question ○] [Show your build ○] [Discussion ○]
  Body       [Rich-text editor (TipTap) with preview tab]
  Tags       [#mcp #tool-description]
  Repo link  (only for Show Your Build)
  [Cancel]  [Post]
  ```
- **Validation**: title 10–200 chars; body non-empty; circle must be selected and writable; tags max five.
- **Optimistic UI**: On submit, the modal closes and a pending card appears at the top of the relevant feed with a subtle spinner.
- **Storage**: Posts store sanitized HTML in `content` and a plain-text extraction in `content_plain`.
- **Error handling**: If the post fails, the pending card is replaced by an inline error with a "Retry" button and a preserved draft.

### 5.3 Comments

- **Input**: Fixed at bottom of post detail. One-level nesting via "Reply." Comments use the same rich-text toolbar (TipTap) as posts and store both `content` (sanitized HTML) and `content_plain`.
- **Mentions**: Typing `@` triggers a user search dropdown. Selected mention renders as a link to `/u/:slug`.
- **Accept solution**: Only the post author sees the button. Clicking opens a confirmation: "Mark this as the accepted solution? The author will receive reputation points." Accepting updates UI immediately and shows a success toast.
- **Realtime**: New comments append at the bottom (or under parent for replies). `aria-live="polite"` announces "New comment by {name}."
- **Edit/delete**: Authors can edit for 15 minutes after posting; moderators can edit/delete anytime. Deleting a comment with replies keeps the subtree with a "[deleted]" placeholder.

### 5.4 Reactions

- **Like is the only reaction at launch.** Upvote/downvote is intentionally not implemented to keep the signal simple.
- **Interaction**: Click toggles like. Count animates briefly unless `prefers-reduced-motion`.
- **Daily cap**: UI does not block likes, but `user_daily_stats` caps `like_given` points at launch. If cap is reached, the user sees a tooltip: "Daily like points earned. Keep liking — it still helps."
- **Optimistic update**: Heart icon fills and count increments immediately; server revert on error.

### 5.5 Invites

- **Invite modal** accessible from circle page for members/admins.
- **Code generation**:
  ```
  Role: [Member ▼] [Moderator]
  Max uses: [1 ▼] [5] [Unlimited]
  Expires: [7 days ▼] [24h] [Never]
  [Generate invite link]
  
  https://operator.promptmetrics.dev/invite/abc123
  [Copy] [Revoke]
  ```
- **Join flow**: User visits `/invite/:code`. If logged in and eligible, they join the circle. If not logged in, they log in and are redirected back to the invite.
- **Invite-only circles**: Non-members see a lock icon, short description, and an "Enter invite code" field.
- **Paid circles**: If `membership_tiers.is_active = true`, show tier name and "Upgrade to join" CTA. At launch, no tiers are active, so this UI is feature-flagged off.

### 5.6 Moderation

- **Flag action** on posts/comments opens a dialog:
  ```
  Why are you flagging this?
  [○ Spam] [○ Harassment] [○ Off-topic] [○ Misinformation] [○ Watched phrase]
  Details [optional]
  [Cancel] [Submit flag]
  ```
- **Watched phrases**: On insert, content is scanned against a moderator-defined phrase list. If matched, a flag is auto-created with reason "Watched phrase." Content remains live until a human resolves it.
- **New-user limits**: Users with reputation under 50 cannot create more than 3 posts per day. The 3-posts-per-day limit is enforced server-side, not only in the UI. UI shows remaining posts in the post-creation modal.

### 5.7 Search

- **Search bar**: Persistent in top navigation. Typing and pressing Enter navigates to `/search?q=`.
- **Results page**:
  ```
  14 results for "MCP auth"
  [Posts] [Circles] [People]
  
  [MCP Servers] How do you validate tool descriptions?
  Alex Ríos · 124 pts · Solved ✓ · 2h ago
  ...snippet with highlighted terms...
  ```
- **Ranking**: Postgres full-text search on `content_plain` with accepted-solution boost and exact tag match. No typo-tolerance at launch.
- **Filters**: by circle, by post type, by has-solution. Faceted UI appears only if result count exceeds 20.
- **Empty state**: "No results for 'MCP auth'. Try a broader term or browse MCP Servers."

### 5.8 Notifications

- **Types generated**: `comment`, `reaction`, `solution`, `invite`, `flag`, `flag_resolved`, `mention`.
- Both `flag` (new flag on the user's content) and `flag_resolved` (moderator resolved the flag) are valid notification types.
- **Delivery**: A row is inserted into `notifications`; Realtime broadcasts on `user:<id>:notifications`.
- **Bell dropdown**: Shows last 5 unread. "View all" links to full page.
- **Read state**: Clicking a notification marks it read. "Mark all read" updates all unread rows.
- **Offline rehydration**: On reconnect, the client refetches unread count and last 50 notifications.

## 6. Responsive Behavior

### Breakpoints

- **Mobile**: < 640px
- **Tablet**: 640px–1024px
- **Desktop**: > 1024px

### Mobile adaptations

- **Navigation**: Top bar collapses into a hamburger menu. Circles and search move into the drawer.
- **Feed**: Cards use full width with 12px horizontal padding. Action bar stays horizontal; labels hidden, icons only.
- **Circle page**: Pinned resources become a horizontal swipeable strip. Leaderboard moves below the discussion tab.
- **Post detail**: Comments use full-width avatars stacked above content. Reply input is fixed to the viewport bottom.
- **Modals**: Full-screen sheets instead of center dialogs for create-post and invite modals.
- **Leaderboard strip**: Horizontal scroll instead of top-5 row.

### Tablet adaptations

- **Feed**: Two-column layout with feed on left (65%) and a sticky leaderboard on right (35%).
- **Circle page**: Right-sidebar leaderboard is visible.

### Desktop adaptations

- **Feed**: Max-width 1200px centered. Leaderboard strip above feed; optional right sidebar for "Trending circles."
- **Post detail**: Main content max-width 760px centered for readability.
- **Moderation queue**: Three-pane layout: filters left, flag list center, detail preview right.

### Touch targets

- All interactive elements are at least 44×44 CSS pixels on touch devices.
- Icon buttons have visible touch areas and feedback states.

## 7. Accessibility Requirements (WCAG 2.1 AA)

### Keyboard navigation

- Full signup → onboarding → create post → accept-solution flow must be completable with keyboard only.
- Visible focus indicators on all interactive elements; focus color contrasts at least 3:1 against background.
- Tab order follows visual order. Modals trap focus and return focus to the trigger on close.
- Skip link "Skip to feed" is the first focusable element on `/feed` and `/g/:slug`.

### Screen readers

- Feed uses `role="feed"` with each card as `<article>` and a heading level hierarchy (`h1` page title, `h2` for card titles).
- Author info is announced as a single accessible description: "Post by Alex Ríos, 124 points, 12 accepted solutions."
- Notification bell announces unread count: "Notifications, 3 unread."
- Form labels are visible and associated via `htmlFor`. Error messages use `aria-describedby` and `aria-invalid="true"`.
- OAuth buttons: "Continue with GitHub," not icon-only.
- Realtime inserts use `aria-live="polite"` with batched announcements. Multiple simultaneous inserts are grouped: "3 new posts in MCP Servers."

### Visual design

- Minimum contrast ratio 4.5:1 for body text and UI labels. 3:1 for large text and graphical objects.
- Badges, tags, and progress bars do not rely on color alone. Invite-only badge uses a lock icon plus text.
- Reduced-motion preference disables point animations, leaderboard count-up, and realtime insert highlights.
- Touch targets meet minimum size; touch-action is not disabled.

### Forms

- Required fields are marked with an asterisk and a visual label. Optional fields are explicitly labeled "Optional."
- Character counters are announced when approaching limit.
- Onboarding text area has a visible, persistent hint, not placeholder-only instructions.

### Focus management

- After a realtime post insert, focus remains on the currently focused element (or the document body). Focus is never stolen.
- After closing a modal, focus returns to the element that opened it.
- Route changes move focus to the page `h1` via a visually hidden focus target.

## 8. Gamification UX (points, leaderboards, badges, streaks)

### Point events

| Event | Points | Idempotency | Cap |
|---|---|---|---|
| daily_visit | 0.5 | One per user per day | 1/day |
| topic_created | 5 | One per post | unlimited |
| comment_created | 3 | One per comment | unlimited |
| like_given | 1 | One per target | 10/day |
| like_received | 2 | One per target | unlimited |
| solution_accepted | 8 | One per post to comment author | unlimited |
| invite_accepted | 5 | One per invite | unlimited |
| posts_read | 0.5 | One per post per day | 20/day |

### Point UX

- Points are awarded silently in the background. A small toast appears only for milestone events: first post, first accepted solution, badge earned, daily-visit cap reached.
- Daily caps are communicated via tooltip, not blocking UI.
- Score updates in the user dropdown and profile header animate once per session, not on every event.

### Leaderboards

- **Global weekly**: `/leaderboards?period=week`
- **Global all-time**: `/leaderboards?period=all_time`
- **Circle-scoped**: `/g/:slug/leaderboard`
- Each leaderboard lists rank, avatar, name, reputation score, accepted-solution count, and a "View profile" link.
- Time window is explicit: "Top operators this week (Mon–Sun UTC)."
- Ties use `dense_rank()`; equal scores share the same rank.

### Badges

| Badge | Criteria | Visual |
|---|---|---|
| First Contribution | Created first post or comment | Circle badge |
| Problem Solver | 1 accepted solution | Shield badge |
| Verified Operator | 10 accepted solutions | Checkmark badge |
| Build Sharer | 3 "Show Your Build" posts with repo links | Code bracket badge |
| Helpful Liker | Gave 50 likes | Heart badge |
| Circle Regular | Visited 7 days in a row | Flame badge |

### Badge UX

- Badge criteria are public and visible on hover/focus: "Earned by receiving 10 accepted solutions."
- A progress bar in the user dropdown shows progress toward the next unearned badge.
- Badges appear on profile, DevCard, and next to the author name on posts/comments.

### Streaks

- Streaks are derived only from `daily_visit` events recorded in `user_daily_stats`; other activity does not extend or start a streak.
- Streak count appears in the user dropdown and on DevCard.
- Losing a streak shows a soft message: "Your 12-day streak ended. Start a new one today."
- Streaks do not award extra points; they are a visibility signal only.

## 9. Empty States and Onboarding Flow

### Onboarding empty states

**Before joining circles**

```
+--------------------------------------------------+
|  Your feed is quiet                              |
|  Follow at least two circles to see posts here.  |
|  [Browse circles]                                |
+--------------------------------------------------+
```

### Feed empty states

**"My circles" filter with no posts**

```
+--------------------------------------------------+
|  No posts from your circles yet                  |
|  Be the first to ask a question or share a build.  |
|  [Write a post]  [Browse more circles]           |
+--------------------------------------------------+
```

**"Unanswered" filter empty**

```
+--------------------------------------------------+
|  All caught up                                   |
|  Every question in your circles has a response.  |
|  [Ask a new question]                            |
+--------------------------------------------------+
```

**"Show Your Build" empty**

```
+--------------------------------------------------+
|  No builds shared yet                              |
|  Operators learn from real shipped work.          |
|  [Share your build]                              |
+--------------------------------------------------+
```

### Circle page empty states

**New circle with no posts**

```
+--------------------------------------------------+
|  MCP Servers is brand new                         |
|  Start the first discussion or pin a resource.     |
|  [New post]  [Pin a resource] (admin)              |
+--------------------------------------------------+
```

### Post detail empty states

**No comments yet**

```
+--------------------------------------------------+
|  No replies yet                                  |
|  Be the first to help. A thoughtful answer earns   |
|  reputation if the author marks it as the solution.|
|  [Write a comment]                               |
+--------------------------------------------------+
```

### Search empty state

```
+--------------------------------------------------+
|  No results for "MCP auth"                       |
|  Try:                                            |
|  • Browsing MCP Servers                          |
|  • Searching for "tool description"              |
|  • Asking a new question                         |
+--------------------------------------------------+
```

### Notifications empty state

```
+--------------------------------------------------+
|  No notifications                                |
|  Reactions, comments, and invites appear here.    |
+--------------------------------------------------+
```

### Moderation queue empty state

```
+--------------------------------------------------+
|  Queue is clear                                  |
|  Watched-phrase flags and user reports will       |
|  appear here.                                   |
+--------------------------------------------------+
```

### Onboarding flow summary

1. **OAuth/email signup** → `/login`.
2. **Mandatory onboarding** → `/register/complete`.
   - Step 1: `painful_tool_stack_task` free-text answer.
   - Step 2: circle recommendations ranked by extracted stack keywords.
   - Step 3: reputation primer and first-action CTA.
3. **First landing** → `/feed` with a welcome toast and prompt to write first post.
4. **First contribution nudge**: After 24 hours of lurking, a non-blocking banner appears: "Have a question or build to share? Operators in MCP Servers are active today."

## 10. Realtime UX (live inserts, notifications, deduplication, focus management)

### Realtime channels

| Channel | Event | Payload |
|---|---|---|
| `group:<slug>:posts` | `INSERT` on `posts` | full post row |
| `post:<id>:comments` | `INSERT` on `comments` | full comment row |
| `user:<id>:notifications` | `INSERT` on `notifications` | notification row |

### Client behavior

- **Feed**: RSC fetches first page. A client component subscribes to the user's followed circle channels. On `INSERT`, the new post is prepended if it matches the active filter.
- **Post detail**: RSC renders post and comments. Client subscribes to `post:<id>:comments`. New comments append; accepted-solution status is refetched if a solution was just marked.
- **Notification bell**: Unread count is fetched on app load, then updated via `user:<id>:notifications` subscription.

### Deduplication

- Every realtime payload includes the row `id`. The client maintains a Set of rendered IDs for the current session.
- If an `id` already exists, the event is ignored.
- On reconnect, the client rehydrates from the source tables (`posts`, `comments`, `notifications`) since Realtime is at-least-once, not exactly-once.

### Focus management

- Realtime inserts never move focus. Focus stays on the currently focused element.
- `aria-live="polite"` regions announce inserts. Batch announcements within a 500ms window to avoid flooding screen-reader users.
- A single insert: "New post in MCP Servers: How do you validate tool descriptions?"
- Multiple inserts: "3 new posts in MCP Servers."
- New comment insert on post detail: "New comment by Priya Nair."

### Offline and reconnect

- If the Realtime connection drops, a subtle connectivity indicator appears in the top navigation: "Reconnecting..."
- On reconnect, the client refetches the last N items and merges by ID.
- Pending optimistic actions (likes, comments) are queued and retried on reconnect.

### Performance

- Unsubscribe from channels when the component unmounts or the user navigates away.
- Limit live updates to the currently visible feed/circle. Do not subscribe to all followed circles simultaneously on mobile; use the active circle only.

## 11. Error States and Messaging

### Global error boundary

- A lightweight error boundary wraps each route segment. On crash, it shows:
  ```
  Something broke on this page.
  [Reload page]  [Go to feed]
  ```
- Stack traces are never exposed to users. Error IDs are logged for support.

### Network errors

- **Feed load failure**: "We couldn't load the feed. [Retry]"
- **Comment post failure**: The pending comment is preserved in the input with the error below it: "Comment failed to post. [Retry] [Edit]"
- **Like failure**: The optimistic like is reverted. Toast: "Like couldn't be saved. Please try again."

### Auth errors

- **Session expired**: A modal prompts re-login without losing the current page state.
- **Missing onboarding**: Any write attempt redirects to `/register/complete` with a return URL.
- **Insufficient permissions**: "You don't have access to this circle. Request an invite or browse public circles."

### Validation errors

- **Post title too short**: "Title must be at least 10 characters."
- **Post body empty**: "Add details to your post."
- **No circle selected**: "Choose a circle for this post."
- **Too many tags**: "Use up to 5 tags."
- **Daily post limit**: "New contributors can post up to 3 times per day. Earn reputation to increase your limit."

### Moderation errors

- **Flag submission failure**: "Flag couldn't be submitted. Please try again or contact a moderator."
- **Hide post failure**: "Post couldn't be hidden. Refresh and try again."

### Realtime errors

- **Subscription failure**: Silent retry with exponential backoff. After three failures, show a subtle indicator: "Live updates paused. [Reconnect]"

### MCP errors

- **Rate limited**: "Too many agent requests. Slow down and retry in {seconds}."
- **Tool timeout**: "This query took too long. Try a narrower search or summarize a specific post."
- **Scope denied**: "This API key does not have permission to {action}. Request access in settings."

## 12. UX Success Metrics

### Engagement metrics

| Metric | Launch target | Measurement |
|---|---|---|
| Signup-to-first-contribution within 7 days | 35% | `point_events` where `event_type` in (`topic_created`, `comment_created`) within 7 days of `users.created_at` |
| Onboarding completion rate | 70% | Users who reach step 3 and land on `/feed` |
| First accepted solution within 14 days of first post | 30% | Posts with `accepted_comment_id` within 14 days of author's first post |
| Posts with accepted solutions | 25% of answered posts | `posts.accepted_comment_id is not null / posts with comments` |
| Average time to first helpful reply | under 6 hours | Time from post creation to first comment or accepted solution |
| Feed sessions per week (median active user) | 4+ | Sessions with `/feed` page view, 30+ min apart |
| DAU/MAU ratio | 0.25+ for core contributors | Users with `daily_visit` event in last 24h / last 30d |
| 6-month retention of first contributors | 40% | Users with a first-week post who have any event in month 6 |

### Quality metrics

| Metric | Launch target | Measurement |
|---|---|---|
| Repeat search rate | > 40% of searches lead to a click | Search events with subsequent click on result within 30s |
| Like-to-view ratio | 8%+ | Likes / feed card impressions |
| False-positive flag rate | under 10% | Flags dismissed without action / total flags |
| Moderation queue resolution time | under 24 hours | `flags.resolved_at - flags.created_at` median |
| Private group monthly activity | 80% | Members with at least one post/comment in private circles per month |

### API and agent metrics

| Metric | Target | Measurement |
|---|---|---|
| MCP/REST API usage | 100+ calls/week by month 2 | `/api/v1/*` and `/api/mcp` requests from non-UI clients |
| MCP tool P95 latency | under 2 s | Server-side instrumentation per tool |
| Agent-mediated attribution accuracy | 100% | Every MCP write has `client_id` (MCP client) and `user_id` (acting user) in `agent_actions` |

### Accessibility metrics

| Metric | Target | Measurement |
|---|---|---|
| WCAG 2.1 AA audit | zero critical/serious issues | Automated scan + keyboard-only manual test |
| Keyboard-only task completion | 100% | Signup → onboarding → create post → accept solution |
| Screen-reader announcement accuracy | 100% | Realtime inserts and notifications announced correctly |

### Sentiment metrics

| Metric | Target | Measurement |
|---|---|---|
| Active-member NPS | > 40 | In-app micro-survey after 3rd weekly visit |
| Support ticket deflection | -20% relevant tickets within 90 days | Tickets tagged `community-answerable` trend |
| Product insights captured | ≥ 10/month | Tagged feature requests, case studies, bugs extracted from posts |
