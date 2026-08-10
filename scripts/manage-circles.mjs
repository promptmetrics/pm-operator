/**
 * Script to replace existing circles with the 5 new named circles.
 * Uses the project's own postgres client (same as the app).
 *
 * Usage: DATABASE_URL="postgresql://..." node scripts/manage-circles.mjs
 */

import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const postgres = require('postgres');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required');
  console.error('Usage: DATABASE_URL="postgresql://..." node scripts/manage-circles.mjs');
  process.exit(1);
}

const CIRCLES = [
  {
    slug: 'where-do-i-start',
    name: 'Where do I start?',
    description: 'The mandate circle — "I just got told to figure this out, where do I even begin?"',
    color: '#3b82f6',
    visibility: 'public',
  },
  {
    slug: 'fix-this-workflow',
    name: 'Fix this workflow',
    description: 'Bring your specific broken workflow, get feedback, share patterns',
    color: '#f59e0b',
    visibility: 'public',
  },
  {
    slug: 'make-it-stick',
    name: 'Make it stick',
    description: 'Adoption, governance, human gate, month-three prevention',
    color: '#10b981',
    visibility: 'public',
  },
  {
    slug: 'whats-in-your-stack',
    name: "What's in your stack?",
    description: 'Tools, MCP servers, integrations, "what works with what"',
    color: '#8b5cf6',
    visibility: 'public',
  },
  {
    slug: 'the-watercooler',
    name: 'The Watercooler',
    description: 'Intros, off-topic, founder stories, community glue',
    color: '#ec4899',
    visibility: 'public',
  },
];

async function main() {
  const sql = postgres(DATABASE_URL, {
    max: 1,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
  });

  try {
    // 1. List existing groups
    const existing = await sql`SELECT id, slug, name FROM "groups" ORDER BY name`;
    console.log(`\nFound ${existing.length} existing circle(s):`);
    for (const g of existing) {
      console.log(`  - ${g.name} (${g.slug}) [${g.id}]`);
    }

    // 2. Delete existing groups
    if (existing.length > 0) {
      const ids = existing.map((g) => g.id);
      console.log(`\nDeleting ${ids.length} existing circle(s)...`);
      await sql`DELETE FROM "group_memberships" WHERE "group_id" = ANY(${ids}::uuid[])`;
      await sql`DELETE FROM "group_invites" WHERE "group_id" = ANY(${ids}::uuid[])`;
      const deleted = await sql`DELETE FROM "groups" WHERE id = ANY(${ids}::uuid[]) RETURNING name`;
      console.log(`  Deleted: ${deleted.map((g) => g.name).join(', ')}`);
    }

    // 3. Create the 5 new circles
    console.log(`\nCreating ${CIRCLES.length} new circles...`);
    for (const circle of CIRCLES) {
      const [created] = await sql`
        INSERT INTO "groups" (id, slug, name, description, color, visibility, member_count, created_by)
        VALUES (${randomUUID()}, ${circle.slug}, ${circle.name}, ${circle.description}, ${circle.color}, ${circle.visibility}, 0, NULL)
        RETURNING id, slug, name
      `;
      console.log(`  ✓ ${created.name} (${created.slug})`);
    }

    console.log('\n✅ All circles created successfully!');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
