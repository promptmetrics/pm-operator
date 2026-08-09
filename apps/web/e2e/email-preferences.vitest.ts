// Preference gate matrix for lib/email.ts sendTransactional.
//
// The redesigned Settings screen dropped the `emailNotifications` switch and
// replaced it with five per-event switches, so `emailSolutions` now has to gate
// solution mail for the opt-out to work at all. Every gate is OPT-OUT: only an
// explicit `false` suppresses, so users who never touched a switch — and users
// who opted out under the OLD UI — both keep their existing behaviour.
//
// The Loops sender (global fetch) and the recipient lookup (db.query.users
// .findFirst) are mocked: no network, no DB, no server.
import { beforeAll, beforeEach, afterAll, describe, expect, test, vi } from 'vitest';

import type { DrizzleClient } from '@pm-operator/db';

const fetchMock = vi.fn();

// email.ts reads LOOPS_API_KEY and the template ids at module scope and no-ops
// when either is missing, so the env has to be set BEFORE the import — hence
// the dynamic import rather than a top-level one.
let sendTransactional: (typeof import('../lib/email'))['sendTransactional'];

const ORIGINAL_ENV = {
  key: process.env.LOOPS_API_KEY,
  queue: process.env.LOOPS_TRANSACTIONAL_QUEUE_ID,
};

beforeAll(async () => {
  process.env.LOOPS_API_KEY = 'test-loops-key';
  process.env.LOOPS_TRANSACTIONAL_QUEUE_ID = 'tpl_test_queue';
  ({ sendTransactional } = await import('../lib/email'));
});

afterAll(() => {
  process.env.LOOPS_API_KEY = ORIGINAL_ENV.key;
  process.env.LOOPS_TRANSACTIONAL_QUEUE_ID = ORIGINAL_ENV.queue;
  vi.unstubAllGlobals();
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

/** Recipient lookup stand-in — the only DB call sendTransactional makes. */
function dbWithPreferences(
  preferences: Record<string, unknown> | null,
  overrides: { email?: string | null } = {}
): DrizzleClient {
  return {
    query: {
      users: {
        findFirst: async () => ({
          email: overrides.email === undefined ? 'operator@example.com' : overrides.email,
          username: 'operator',
          fullName: 'Ops Operator',
          preferences,
        }),
      },
    },
  } as unknown as DrizzleClient;
}

async function send(
  event: 'solution_accepted' | 'invite_accepted',
  prefs: Record<string, unknown> | null
) {
  await sendTransactional(event, {
    db: dbWithPreferences(prefs),
    userId: '00000000-0000-4000-8000-000000000001',
    dataVariables: { postTitle: 'Routing leads without a human' },
  });
}

/** True when Loops was actually POSTed to. */
function sent(): boolean {
  return fetchMock.mock.calls.length > 0;
}

describe('never-touched-it users keep receiving mail (undefined means send)', () => {
  test('no preferences at all → both events send', async () => {
    await send('solution_accepted', null);
    expect(sent()).toBe(true);

    fetchMock.mockClear();
    await send('invite_accepted', null);
    expect(sent()).toBe(true);
  });

  test('empty preferences object → both events send', async () => {
    await send('solution_accepted', {});
    expect(sent()).toBe(true);

    fetchMock.mockClear();
    await send('invite_accepted', {});
    expect(sent()).toBe(true);
  });

  test('unrelated switches off → solution still sends (only the mapped key gates)', async () => {
    await send('solution_accepted', {
      emailReplies: false,
      emailMentions: false,
      emailFollows: false,
      weeklyDigest: false,
      reducedMotion: true,
    });
    expect(sent()).toBe(true);
  });
});

describe('emailNotifications master kill-switch (opt-outs stored by the OLD UI)', () => {
  test('emailNotifications:false suppresses solution_accepted', async () => {
    await send('solution_accepted', { emailNotifications: false });
    expect(sent()).toBe(false);
  });

  test('emailNotifications:false suppresses invite_accepted', async () => {
    await send('invite_accepted', { emailNotifications: false });
    expect(sent()).toBe(false);
  });

  test('the master wins even when the per-event switch is on', async () => {
    await send('solution_accepted', { emailNotifications: false, emailSolutions: true });
    expect(sent()).toBe(false);
  });

  test('emailNotifications:true does not force a send past a per-event opt-out', async () => {
    await send('solution_accepted', { emailNotifications: true, emailSolutions: false });
    expect(sent()).toBe(false);
  });
});

describe('emailSolutions gates solution_accepted only', () => {
  test('emailSolutions:false suppresses the solution email', async () => {
    await send('solution_accepted', { emailSolutions: false });
    expect(sent()).toBe(false);
  });

  test('emailSolutions:false leaves invite_accepted sending', async () => {
    await send('invite_accepted', { emailSolutions: false });
    expect(sent()).toBe(true);
  });

  test('emailSolutions:true sends', async () => {
    await send('solution_accepted', { emailSolutions: true });
    expect(sent()).toBe(true);
  });
});

describe('invite_accepted has no designed switch of its own', () => {
  // Every switch on the Settings screen EXCEPT the master, set to false: the
  // invite mail must still go out, because none of them maps to this event.
  test('no Settings switch suppresses it', async () => {
    await send('invite_accepted', {
      emailReplies: false,
      emailSolutions: false,
      emailMentions: false,
      emailFollows: false,
      weeklyDigest: false,
    });
    expect(sent()).toBe(true);
  });
});

describe('send mechanics are unchanged', () => {
  test('a permitted send POSTs the event template and recipient to Loops', async () => {
    await send('solution_accepted', {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://app.loops.so/api/v1/transactional');
    const body = JSON.parse(String(init.body)) as {
      email: string;
      transactionalId: string;
      dataVariables: Record<string, string>;
    };
    expect(body.email).toBe('operator@example.com');
    expect(body.transactionalId).toBe('tpl_test_queue');
    expect(body.dataVariables).toMatchObject({
      name: 'Ops Operator',
      postTitle: 'Routing leads without a human',
    });
  });

  test('a recipient without an email never reaches Loops', async () => {
    await sendTransactional('solution_accepted', {
      db: dbWithPreferences({}, { email: null }),
      userId: '00000000-0000-4000-8000-000000000001',
      dataVariables: {},
    });
    expect(sent()).toBe(false);
  });

  test('a Loops failure never throws into the accept-solution flow', async () => {
    fetchMock.mockRejectedValue(new Error('loops down'));
    await expect(send('solution_accepted', {})).resolves.toBeUndefined();
  });
});
