# Concept Brief: operator.promptmetrics.dev

> **Historical context:** This document captures early-phase thinking. Canonical decisions have evolved. See /Users/izzy/Documents/pm-operator/specs/SPEC_LOG.md and the latest specs (05-prd.md, 06-technical-spec.md, 07-ux-spec.md, 08-roadmap.md) for current decisions.

## Problem Statement

AI operators, founders, and teams with an AI mandate are working without a reliable peer network. They are scattered across Slack threads, Discord channels, and LinkedIn groups that are noisy, ephemeral, and hard to search. When they need practical answers about procurement, ROI measurement, governance, or safe deployment, they get either vendor pitches or advice they cannot verify.

The NodeBB placeholder cannot solve this. It is a forum engine, not a modern community platform, and it fights custom onboarding, clean profile APIs, and agent integration.

The core pain is isolation plus signal loss: good answers disappear into chat history, reputation is invisible, and community data cannot be reused by the tools these operators already use.

## Proposed Solution

`operator.promptmetrics.dev` is a purpose-built community backend and frontend where AI operators join topic-based circles, share builds and questions in a live, gamified feed, and earn reputation through contributions — all exposed through a unified REST API that both the Paper-v3 UI and Claude Code agents use as a first-class interface.

## Core Value Proposition

Unlike Slack, Discord, LinkedIn groups, or generic forums, this platform gives operators:

- **Persistent, searchable knowledge**: posts, accepted solutions, and builds stay findable, so the same question does not get answered twice.
- **Reputation you can trust**: leaderboards and badges surface people who actually solve problems, not just people who post often.
- **Intent-based circles**: content is organized around actions like "Show Your Build" and "Skill Registry," not just chronological chat rooms.
- **Agent-ready data**: the same API that powers the UI lets Claude Code summarize discussions, flag posts, and invite qualified users — making the community part of the operator workflow.
- **Controlled access**: public reading drives discovery; private circles protect paid cohorts and sensitive builds.

## Target Audience & ICP Fit

**Primary audience**

- AI operators: the people inside companies actually tasked with selecting, procuring, deploying, and governing AI tools.
- Founders and leadership teams with an explicit AI mandate who need peer benchmarks, not vendor collateral.
- Small operator cohorts (10–50 users at launch) who currently rely on fragmented chat and ad-hoc introductions.

**ICP fit**

These users are technical enough to value API access and agent integration, busy enough to need async structured discussion, and close enough to compliance and procurement questions that EU data residency and trustworthy reputation matter. They are not looking for another real-time chat app or a horizontal enterprise community suite.

## Key Assumptions

1. **The ICP prefers async, structured community over real-time chat.** If operators truly want Discord-speed conversation, a Skool-style feed will feel too slow.
2. **Gamification improves participation quality, not just volume.** Points and badges must attract helpful contributors; otherwise they become noise or gaming targets.
3. **Agent API access becomes a real differentiator.** The investment in `/api/v1` parity only pays off if Claude/agent interactions meaningfully reuse community data.
4. **Public-read with private circles is the right growth model.** Open discovery must convert enough signups to justify gating engagement behind login and private groups.
5. **Supabase Pro eu-west-1 + Vercel Pro fra1 host the production launch.** Upgrade triggers are defined, but early cost and scale limits must not block momentum.

## Product Principles

1. **Agent-native API parity.** Every human-facing feature should be reachable under `/api/v1/**` so the UI and agent loop share one backend and one source of truth.
2. **Reputation reflects usefulness, not activity.** Weight points toward accepted solutions, quality builds, and peer validation, not raw post count.
3. **Circles over channels.** Organize content by intent and outcome, not by time or general topic, so the feed stays high-signal.
4. **Public by default, private when valuable.** Optimize for discoverability and growth; use private groups only where access itself is the value.
5. **Ship fast, learn from real usage.** There is no production data to migrate, so the priority is replacing NodeBB quickly and letting operator behavior shape the next phase.

## Competitive Landscape

### Skool
The current home of PromptMetrics' Operator Stack. Skool offers a clean, distraction-free feed, built-in points/levels/leaderboards, flat $99/month for unlimited members, mobile apps, course/classroom integration, and paid memberships. It is weak on API access, custom brand embedding, EU data-residency control, and agent/MCP-style integration. Its single main feed can also become noisy. It serves creators, coaches, educators, and small paid communities well, but it is not a technical operator platform.

### Circle.so
Circle provides brandable spaces, courses, events, live rooms, paid memberships, workflows, and headless Member/Admin APIs on Business plans. Circle Plus adds AI agents, moderation, SSO, and product embedding for SaaS. Pricing escalates quickly ($89–$199/month base, custom for Plus), with per-admin/moderator add-ons. AI moderation and MCP are newer and less mature. It serves B2B SaaS customer communities and mid-market communities, but it is still a third-party platform with limited schema control.

### daily.dev
daily.dev offers a personalized developer feed, reputation/XP, reading streaks, leaderboards, public Squads, DevCard profiles, quests, and open-source AGPL-3.0 code. It is not brandable for a single consultancy; its feed is public/algorithmic rather than gated/private; admin tooling is limited; and it lacks circles/groups with paid tiers. It serves individual developers and public dev communities, not private operator cohorts.

### Discord
Discord delivers real-time chat, forum channels, AutoMod, a rich bot ecosystem, Stage events, server subscriptions, and strong retention among technical audiences. It is overwhelming for busy professionals, poor for long-form content discoverability, brand-hostile, limited on EU data control, and labor-intensive to moderate at scale. It serves gaming, crypto, creator, and some SaaS early-adopter communities.

### LinkedIn Groups
LinkedIn Groups offer a built-in professional audience, direct member messaging, public/private/unlisted group types, and member screening questions. Algorithmic burying, strict weekly post caps (15 per group, 60 total), basic analytics, no code formatting or structured support, and high spam/inactivity make it unsuitable for deep technical/operator communities.

### NodeBB / Discourse
NodeBB provides real-time WebSocket feeds, read/write REST APIs, built-in chat, plugins, ActivityPub, and headless capability. Discourse offers mature REST APIs, groups/category permissions, webhooks, SSO, API keys, and a new MCP server. Both shape APIs around server-rendered UI, require extra parsing and pagination for headless builds, retain forum-era theming/branding, and lack daily.dev/Skool-native feed UX. They serve open-source forum operators and technical communities that want self-hosted control.

## Whitespace & Differentiation

**EU data-resident, AI-operator community**

Skool, Circle, Discord, and LinkedIn cannot cleanly guarantee EU data residency and AI Act readiness. A Supabase EU project, RLS, and a no-training-on-client-data policy is a genuine differentiator for Berlin/EU operators.

**Agent-first community backend**

Circle Plus and Discourse MCP are nascent. PromptMetrics can own "the community that talks back to Claude Code / MCP tools" by exposing skills, runbooks, and peer knowledge as agent-readable resources.

**Operator workflow → community feed loop**

Most platforms separate community from the actual work. PromptMetrics can link feed posts to concrete AI adoption workflows, skills (markdown files), and cohort progress, turning discussion into documented outcomes.

**Gated private groups with public-read credibility**

Unlike Skool's fully private groups or Reddit's public chaos, a hybrid model — public read, private write/groups — lets non-members see expertise and trust the brand before joining.

## Key Risks

1. **Building another generic community platform.** The horizontal B2B community market is crowded (Circle, Mighty Networks, Bettermode, Hivebrite, Gainsight, Salesforce). Success requires vertical depth in AI adoption, not feature parity.
2. **Competing on feed algorithms with daily.dev/Reddit.** Personalization and ranking are deceptively expensive. PromptMetrics should avoid algorithmic "engagement maximization" and instead use simple, transparent sorts (new, top, solved, topic-based circles).
3. **North American enterprise sales motion.** Enterprise community buyers expect SSO, deep CRM/LMS integrations, and outcome-based ROI proof. The 10–50-user launch target makes this segment the wrong beachhead.
4. **Real-time chat as the primary interface.** Discord and Slack suffer from knowledge loss and overwhelm. A forum/feed-first model with optional async chat is healthier for operator audiences.
5. **Over-gamification and badge fatigue.** Points for every click destroy trust in professional communities. The point table must stay small, transparent, and tied to real contribution quality (for example, `solution_accepted` > `like_given`).
