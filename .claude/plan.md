# Plan: Convert create-post modal to a page and fix long-form editing

## Problem
The current create-post experience is a Radix Dialog (`CreatePostModal.tsx`) centered on screen with no max-height or internal scrolling. When the body grows (long posts, images, lists), the modal extends past the viewport and the **Post** button becomes unreachable. The user also wants the composer on its own page instead of in a modal, and wants to paste formatted text with links.

## Current state
- `apps/web/app/(community)/components/CreatePostModal.tsx` — the full form (title, circle, type, tags, rich body, repo link, submit).
- `apps/web/app/(community)/components/FeedPage.tsx` — opens the modal via `createOpen` state and three `openComposer()` triggers:
  1. Mobile/tablet **New post** button on group pages.
  2. Composer strip text box and **Question** / **Show a build** buttons.
  3. Onboarding auto-open (`/feed?compose=1`).
- `apps/web/app/(community)/feed/page.tsx` and `apps/web/app/(community)/g/[groupSlug]/page.tsx` — pass `writableGroups` and `groupSlug` to `FeedPage`.
- `packages/ui/src/editor/RichTextEditor.tsx` — TipTap-based editor with `Link` extension (`autolink: true`). HTML paste falls through to TipTap default behavior.

## Goal
1. Make long posts editable without losing the submit button.
2. Move the composer from a modal to its own page.
3. Keep/verify formatted paste with links.

## Proposed approach

### 1. Add a dedicated `/post/new` page
Create `apps/web/app/(community)/post/new/page.tsx` (server component) that:
- Loads the current session and `getWritableGroups()`.
- Reads `?group=` and `?type=` query params to pre-select circle/post type (replaces the modal's `defaultGroupSlug` / `defaultType`).
- Renders a new client component `CreatePostForm` with the groups list.
- If the user has no writable groups, redirect to `/feed` with a toast or show an empty state.

**Route choice:** `/post/new` keeps the URL short, mirrors common patterns, and avoids colliding with existing `/g/...` and `/p/...` routes. `/p/new` would be shorter but `/p/[id]` already exists; `/post/new` is unambiguous.

### 2. Extract a reusable `CreatePostForm` client component
- Move the form logic out of `CreatePostModal.tsx` into `apps/web/app/(community)/components/CreatePostForm.tsx`.
- Keep the same fields, validation, image upload, and `onCreated` callback.
- Make the layout a normal page layout:
  - Full-width page container (`max-w-2xl mx-auto`) inside the existing community layout.
  - Sticky action bar at the bottom with **Cancel** / **Post** so the submit button is always reachable.
  - Body editor area gets `min-h-[40vh] max-h-[60vh] overflow-y-auto` (or similar) so long content scrolls independently.
- On success, call `onCreated()` (which will `router.push('/feed')` or `router.push('/g/<slug>')`).
- On cancel, navigate back (`router.back()` or to `/feed`).

### 3. Update triggers to navigate instead of opening the modal
In `FeedPage.tsx`:
- Replace the three `openComposer()` calls with `router.push('/post/new?group=<slug>&type=<type>')`.
- Remove `CreatePostModal` import and the modal state (`createOpen`, `composerType`).
- Remove `onCreated={() => router.refresh()}` — the new page will navigate after create.
- Keep the composer strip visible logic unchanged.

For onboarding (`/feed?compose=1`):
- In `FeedRoute`, detect `params.compose === '1'` and return a server-side redirect to `/post/new` (or pre-open the composer). A redirect is cleaner because the composer is now a page.
- Alternatively, keep `autoOpenComposer` and have `FeedPage` redirect client-side. Server-side redirect is preferred.

### 4. Remove or repurpose `CreatePostModal.tsx`
- Delete `CreatePostModal.tsx`.
- If any other code imports it, update those imports.

### 5. Fix the immediate modal scrolling (transition safety)
Since the modal will be deleted, the scrolling fix comes for free with the page layout. If we want a minimal interim fix before the full page conversion, we could add `max-h-[90vh] overflow-y-auto` to `Dialog.Content`, but that is throwaway work. Better to ship the page directly.

### 6. Paste formatted text with links
`RichTextEditor` already uses TipTap with `Link.configure({ autolink: true })`. TipTap's default paste handler accepts HTML from the clipboard, so formatted text and links from Google Docs, Notion, etc. should already work. The current `handlePaste` only intercepts image files and returns `false` for everything else, leaving HTML paste to TipTap.

To be safe, I will:
- Verify by reading the editor config (already done) and confirm no `clipboardTextSerializer` or paste handler is blocking HTML.
- If testing reveals gaps, add `Markdown` paste handling or the `Link` extension's `linkOnPaste: true` option, but that is likely unnecessary. We will not change the editor unless testing proves a gap.

## Files to change
1. **Create:** `apps/web/app/(community)/post/new/page.tsx`
2. **Create:** `apps/web/app/(community)/components/CreatePostForm.tsx`
3. **Delete:** `apps/web/app/(community)/components/CreatePostModal.tsx`
4. **Edit:** `apps/web/app/(community)/components/FeedPage.tsx` — remove modal, change triggers to `router.push`.
5. **Edit:** `apps/web/app/(community)/feed/page.tsx` — handle `compose=1` via redirect.
6. **Edit:** `apps/web/app/(community)/g/[groupSlug]/page.tsx` — no changes needed (it already passes `writableGroups` and `groupSlug` to `FeedPage`), but verify `FeedPage` prop usage stays intact.
7. **Optional:** `packages/ui/src/editor/RichTextEditor.tsx` — only if paste testing shows a gap.

## Testing plan
1. Run the dev server and open `/post/new` directly.
2. Paste a long block of formatted text (with headings, lists, and a hyperlink) into the body.
3. Confirm the editor scrolls and the **Post** button remains visible/sticky.
4. Create a post and confirm redirect to `/feed` or `/g/<slug>`.
5. From `/feed`, click the composer strip buttons and confirm navigation to `/post/new` with correct `group`/`type` params.
6. From a group page, click **New post** and confirm pre-selected group.
7. Verify pasted links are preserved and clickable.

## Open question for approval
- Should the new page live at `/post/new`, `/feed/new`, `/compose`, or somewhere else? **Recommendation:** `/post/new` (short, unambiguous, consistent with `/g/...` and `/p/...`).
- After posting, should we redirect to the new post detail page or back to the feed/circle? **Recommendation:** redirect to the created post (`/g/<groupSlug>/<postSlug>`) so the user sees their post immediately.
