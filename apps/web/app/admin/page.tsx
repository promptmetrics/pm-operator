import * as React from 'react';
import Link from 'next/link';
import { Flag, Circle, Eye, Award, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pm-operator/ui/components/Card';
import { Button } from '@pm-operator/ui/components/Button';

const CARDS = [
  {
    href: '/admin/moderation',
    title: 'Moderation queue',
    description: 'Review flagged posts and comments.',
    icon: Flag,
  },
  {
    href: '/admin/groups',
    title: 'Circles',
    description: 'Create and manage community circles.',
    icon: Circle,
  },
  {
    href: '/admin/watched-phrases',
    title: 'Watched phrases',
    description: 'Manage auto-flag patterns.',
    icon: Eye,
  },
  {
    href: '/admin/badges',
    title: 'Badges',
    description: 'Create badges and award them manually.',
    icon: Award,
  },
  {
    href: '/admin/users',
    title: 'Users',
    description: 'Search users and manage roles.',
    icon: Users,
  },
];

export default function AdminDashboardPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold">Admin dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map(({ href, title, description, icon: Icon }) => (
          <Card key={href} className="flex flex-col">
            <CardHeader className="flex flex-row items-center gap-3">
              <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
              <div>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="mt-auto">
              <Link href={href}>
                <Button variant="secondary" size="sm">Open</Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
