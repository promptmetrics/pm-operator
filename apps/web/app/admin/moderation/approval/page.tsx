'use client';

import * as React from 'react';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import { useToast } from '@pm-operator/ui/components/Toast';
import { LoadingState } from '@/components/admin/LoadingState';
import { EmptyState } from '@/components/admin/EmptyState';
import { ErrorState } from '@/components/admin/ErrorState';
import { Check, X, Clock, FileText } from 'lucide-react';

interface ApprovalPost {
  id: string;
  title: string;
  content: string;
  contentPlain: string;
  type: string;
  status: string;
  author: { id: string; username: string; userslug: string };
  group: { id: string; slug: string; name: string };
  slug: string;
  createdAt: string;
}

export default function ApprovalPage() {
  const [posts, setPosts] = React.useState<ApprovalPost[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [acting, setActing] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<Record<string, string>>({});
  const { toast } = useToast();

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/admin/moderation/approval');
      if (!res.ok) throw new Error('Failed to load approval queue');
      const json = await res.json();
      setPosts(json.data?.posts ?? []);
    } catch (err: any) {
      setError(err.message || 'Failed to load approval queue');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleAction = async (postId: string, action: 'approve' | 'decline') => {
    setActing(postId);
    try {
      const res = await fetch('/api/v1/admin/moderation/approval', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          postId,
          action,
          feedback: feedback[postId] || undefined,
        }),
      });
      if (!res.ok) throw new Error(`Failed to ${action} post`);
      toast({
        title: action === 'approve' ? 'Post approved' : 'Post declined',
        variant: 'success',
      });
      setFeedback((f) => {
        const next = { ...f };
        delete next[postId];
        return next;
      });
      await load();
    } catch (err: any) {
      toast({ title: err.message || `Failed to ${action} post`, variant: 'error' });
    } finally {
      setActing(null);
    }
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (posts.length === 0) return <EmptyState message="No posts pending approval" />;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Post approval queue</h1>
        <Button variant="secondary" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        {posts.map((post) => (
          <Card key={post.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[var(--pm-muted)]" />
                    <h3 className="font-medium truncate">{post.title}</h3>
                  </div>
                  <p className="text-sm text-[var(--pm-muted)]">
                    by {post.author.username} in {post.group.name}
                    {' · '}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(post.createdAt).toLocaleDateString()}
                    </span>
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600">
                  {post.status}
                </span>
              </div>

              {/* Content preview */}
              <div
                className="rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-3 text-sm line-clamp-4"
                dangerouslySetInnerHTML={{ __html: post.content }}
              />

              {/* Feedback input for decline */}
              <div className="flex flex-col gap-2">
                <Input
                  label="Feedback (optional)"
                  value={feedback[post.id] ?? ''}
                  onChange={(e) =>
                    setFeedback((f) => ({ ...f, [post.id]: e.target.value }))
                  }
                  placeholder="Reason for declining..."
                />
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleAction(post.id, 'approve')}
                    disabled={acting === post.id}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleAction(post.id, 'decline')}
                    disabled={acting === post.id}
                  >
                    <X className="mr-1 h-4 w-4" />
                    Decline
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
