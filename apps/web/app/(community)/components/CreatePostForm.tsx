'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { type Editor } from '@pm-operator/ui/editor/RichTextEditor';
import { Button } from '@pm-operator/ui/components/Button';
import { Input } from '@pm-operator/ui/components/Input';
import { Badge } from '@pm-operator/ui/components/Badge';
import { RichTextEditor } from '@pm-operator/ui/editor/RichTextEditor';
import { trackEvent } from '@/lib/analytics';
import { apiErrorMessage } from '@/lib/api/client-errors';
import type { Group, PostType, CreatePostRequest, PostDetail } from '@pm-operator/api';

interface CreatePostFormProps {
  groups: Group[];
  defaultGroupSlug?: string;
  defaultType?: PostType;
  backHref?: string;
}

export function CreatePostForm({
  groups,
  defaultGroupSlug,
  defaultType,
  backHref,
}: CreatePostFormProps) {
  const router = useRouter();
  const [title, setTitle] = React.useState('');
  const [groupSlug, setGroupSlug] = React.useState(defaultGroupSlug || groups[0]?.slug || '');
  const [type, setType] = React.useState<PostType>(defaultType || 'question');
  const [body, setBody] = React.useState('');
  const [plainText, setPlainText] = React.useState('');
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState('');
  const [repoUrl, setRepoUrl] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const addTag = () => {
    const raw = tagInput.trim().replace(/^#/, '');
    if (!raw || tags.includes(raw)) return;
    if (tags.length >= 5) return;
    setTags((t) => [...t, raw]);
    setTagInput('');
  };

  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

  const uploadImage = async (file: File, editor: Editor) => {
    setUploadingImage(true);
    try {
      const res = await fetch('/api/v1/uploads/post-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
      });
      if (!res.ok) {
        const errJson = (await res.json()) as { error?: { message?: string } };
        throw new Error(errJson.error?.message || 'Failed to start upload');
      }
      const { uploadUrl, path } = (await res.json()) as { uploadUrl: string; path: string };
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error('Failed to upload image');
      editor.chain().focus().setImage({ src: path, alt: file.name }).run();
    } catch (err: any) {
      setError(err.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (title.trim().length < 10) {
      setError('Title must be at least 10 characters.');
      return;
    }
    if (!body.trim() && !plainText.trim()) {
      setError('Add details to your post.');
      return;
    }
    if (!groupSlug) {
      setError('Choose a circle for this post.');
      return;
    }

    let content = body;
    if (type === 'build' && repoUrl.trim()) {
      let url: URL;
      try {
        url = new URL(repoUrl.trim());
      } catch {
        setError('Repo link must be a valid URL.');
        return;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        setError('Repo link must use http or https.');
        return;
      }
      const safeUrl = escapeHtml(url.href);
      const safeLabel = escapeHtml(url.href);
      content += `<p><a href="${safeUrl}">${safeLabel}</a></p>`;
    }

    const payload: CreatePostRequest = {
      groupSlug,
      title: title.trim(),
      content,
      type,
      tags,
    };

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await apiErrorMessage(res, 'Failed to create post'));
      }
      const json = (await res.json()) as { data?: PostDetail };
      const post = json.data;
      if (!post) throw new Error('Failed to load created post');
      trackEvent('first_post', { groupSlug, type });
      router.push(`/g/${post.group.slug}/${post.slug}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create post');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-2xl flex-col">
      <div className="mb-6 flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={handleCancel} className="gap-1">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Button>
        <h1 className="font-serif text-xl font-semibold text-[var(--pm-ink)]">New post</h1>
      </div>

      <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4">
        <Input
          label="Title"
          placeholder="What are you building or asking?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={error && title.trim().length < 10 ? error : undefined}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="circle-select" className="text-sm font-medium text-[var(--pm-ink)]">
            Circle
          </label>
          <select
            id="circle-select"
            value={groupSlug}
            onChange={(e) => setGroupSlug(e.target.value)}
            className="h-10 rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3 text-[var(--pm-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pm-coral)]"
          >
            {groups.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-[var(--pm-ink)]">Type</legend>
          <div className="flex flex-wrap gap-2">
            {(['question', 'build', 'discussion'] as PostType[]).map((t) => (
              <label
                key={t}
                className={`flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-sm ${
                  type === t ? 'border-[var(--pm-coral)] bg-[var(--pm-coral-tint-10)]' : 'border-[var(--pm-line)]'
                }`}
              >
                <input
                  type="radio"
                  name="post-type"
                  value={t}
                  checked={type === t}
                  onChange={() => setType(t)}
                  className="sr-only"
                />
                {t === 'question' ? 'Question' : t === 'build' ? 'Show your build' : 'Discussion'}
              </label>
            ))}
          </div>
        </fieldset>

        {type === 'build' ? (
          <Input
            label="Repo link"
            placeholder="https://github.com/..."
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
          />
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--pm-ink)]">Tags</label>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-2 py-1">
            {tags.map((t) => (
              <Badge key={t} variant="default" className="gap-1">
                #{t}
                <button
                  type="button"
                  aria-label={`Remove tag ${t}`}
                  onClick={() => removeTag(t)}
                  className="text-xs"
                >
                  ×
                </button>
              </Badge>
            ))}
            <input
              type="text"
              placeholder={tags.length >= 5 ? 'Max 5 tags' : 'Add tag...'}
              value={tagInput}
              disabled={tags.length >= 5}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              className="flex-1 bg-transparent px-2 py-1 text-sm outline-none"
            />
          </div>
          {tags.length >= 5 ? <p className="text-xs text-[var(--pm-danger)]">Use up to 5 tags.</p> : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--pm-ink)]">
            Body
            {uploadingImage ? <span className="ml-2 text-xs text-[var(--pm-muted)]">Uploading image…</span> : null}
          </label>
          <RichTextEditor
            value={body}
            onChange={(html, text) => {
              setBody(html);
              setPlainText(text);
            }}
            onImageUpload={uploadImage}
            placeholder="Add details... (drag/paste images, or use toolbar for headings, lists, links, and YouTube)"
            className="flex min-h-0 flex-1 flex-col"
            contentClassName="min-h-[200px] flex-1 overflow-y-auto"
          />
          {error && body.trim().length === 0 ? (
            <p className="text-sm text-[var(--pm-danger)]">{error}</p>
          ) : null}
        </div>

        {error && !error.includes('Title') && !error.includes('body') && !error.includes('Circle') ? (
          <p className="text-sm text-[var(--pm-danger)]" role="alert">
            {error}
          </p>
        ) : null}

        <div className="sticky bottom-0 -mx-4 mt-auto flex justify-end gap-2 border-t border-[var(--pm-line)] bg-[var(--pm-paper)] px-4 py-3">
          <Button type="button" variant="secondary" disabled={submitting} onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !groupSlug || uploadingImage}>
            {submitting ? 'Posting...' : 'Post'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
