#!/usr/bin/env node
/*
 * Token-sync check: the @theme semantic alias lists in
 * packages/ui/src/styles/tokens.css and apps/web/app/globals.css must be
 * identical (REDESIGN-PLAN Phase 0 — the two files must never diverge).
 */
import { readFileSync } from 'node:fs';

const files = [
  'packages/ui/src/styles/tokens.css',
  'apps/web/app/globals.css',
];

const aliasRe = /^\s*(--color-[a-z0-9-]+)\s*:\s*var\((--pm-[a-z0-9-]+)\)\s*;/gim;

const aliasSets = files.map((file) => {
  const css = readFileSync(file, 'utf8');
  const aliases = new Map();
  for (const match of css.matchAll(aliasRe)) {
    aliases.set(match[1], match[2]);
  }
  return aliases;
});

const [a, b] = aliasSets;
let failed = false;

for (const [name, target] of a) {
  if (!b.has(name)) {
    console.error(`missing in ${files[1]}: ${name}`);
    failed = true;
  } else if (b.get(name) !== target) {
    console.error(`target mismatch for ${name}: ${target} vs ${b.get(name)}`);
    failed = true;
  }
}
for (const name of b.keys()) {
  if (!a.has(name)) {
    console.error(`missing in ${files[0]}: ${name}`);
    failed = true;
  }
}

if (failed) {
  console.error('\nToken alias lists diverged — sync both @theme blocks.');
  process.exit(1);
}
console.log(`Token aliases in sync (${a.size} aliases).`);
