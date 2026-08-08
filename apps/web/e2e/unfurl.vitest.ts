// SSRF test matrix for lib/services/unfurl.ts (track 2A).
// dns.lookup and fetch are mocked — no network, no DB.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

import { lookup } from 'node:dns/promises';
import { unfurlUrl, extractFirstUrl, buildLinkPreview } from '../lib/services/unfurl';

const lookupMock = vi.mocked(lookup) as unknown as ReturnType<typeof vi.fn>;
const fetchMock = vi.fn();

const PUBLIC_IP = [{ address: '93.184.216.34', family: 4 }];

function htmlResponse(html: string, init?: { status?: number; contentType?: string }): Response {
  return new Response(html, {
    status: init?.status ?? 200,
    headers: { 'content-type': init?.contentType ?? 'text/html; charset=utf-8' },
  });
}

function redirectResponse(location: string, status = 301): Response {
  return new Response(null, { status, headers: { location } });
}

beforeEach(() => {
  lookupMock.mockReset();
  lookupMock.mockResolvedValue(PUBLIC_IP);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('SSRF guard: literal private IPs are rejected before any fetch', () => {
  const blocked = [
    'http://10.0.0.1/',
    'http://172.16.5.5/',
    'http://172.31.255.255/',
    'http://192.168.1.1/',
    'http://127.0.0.1/',
    'http://0.0.0.0/',
    'http://169.254.1.1/',
    'http://169.254.169.254/latest/meta-data/', // cloud metadata IP
    'http://[::1]/',
    'http://[::]/',
    'http://[fc00::1]/',
    'http://[fd12:3456::1]/',
    'http://[fe80::1]/',
    'http://[::ffff:10.0.0.1]/', // IPv4-mapped IPv6
  ];

  for (const url of blocked) {
    test(`rejects ${url}`, async () => {
      await expect(unfurlUrl(url)).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }
});

describe('SSRF guard: scheme and port restrictions', () => {
  test('rejects non-http(s) schemes', async () => {
    await expect(unfurlUrl('ftp://example.com/file')).resolves.toBeNull();
    await expect(unfurlUrl('file:///etc/hosts')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('rejects non-standard ports', async () => {
    await expect(unfurlUrl('http://example.com:8080/')).resolves.toBeNull();
    await expect(unfurlUrl('https://example.com:8443/')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('rejects URLs with embedded credentials', async () => {
    await expect(unfurlUrl('http://user:pass@example.com/')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('SSRF guard: DNS resolution', () => {
  test('rejects a hostname resolving to a private IP', async () => {
    lookupMock.mockResolvedValue([{ address: '10.9.8.7', family: 4 }]);
    await expect(unfurlUrl('http://internal.example.test/')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('rejects a hostname resolving to the metadata IP', async () => {
    lookupMock.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    await expect(unfurlUrl('http://metadata.example.test/')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('rejects when ANY resolved address is private (multi-A rebinding)', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '192.168.0.10', family: 4 },
    ]);
    await expect(unfurlUrl('http://mixed.example.test/')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('rejects when DNS resolution fails', async () => {
    lookupMock.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(unfurlUrl('http://nxdomain.example.test/')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('SSRF guard: redirects', () => {
  test('rejects a redirect hop to a private-resolving host', async () => {
    lookupMock.mockImplementation(async (host: string) =>
      host === 'internal.example.test' ? [{ address: '192.168.0.1', family: 4 }] : PUBLIC_IP
    );
    fetchMock.mockResolvedValueOnce(redirectResponse('http://internal.example.test/'));

    await expect(unfurlUrl('http://example.com/')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('rejects a redirect hop to a literal private IP', async () => {
    fetchMock.mockResolvedValueOnce(redirectResponse('http://169.254.169.254/latest/'));
    await expect(unfurlUrl('http://example.com/')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('follows up to 3 hops then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(redirectResponse('http://example.com/a'))
      .mockResolvedValueOnce(redirectResponse('http://example.com/b'))
      .mockResolvedValueOnce(redirectResponse('http://example.com/c'))
      .mockResolvedValueOnce(
        htmlResponse('<html><head><title>Landed</title></head><body></body></html>')
      );

    const result = await unfurlUrl('http://example.com/');
    expect(result).toMatchObject({ title: 'Landed', domain: 'example.com', url: 'http://example.com/c' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  test('gives up after more than 3 hops', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      redirectResponse(`${String(url).split('?')[0]}?next`)
    );
    await expect(unfurlUrl('http://example.com/')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4); // initial + 3 hops, then stop
  });
});

describe('response handling', () => {
  test('rejects non-HTML content types', async () => {
    fetchMock.mockResolvedValueOnce(
      htmlResponse('{"title":"nope"}', { contentType: 'application/json' })
    );
    await expect(unfurlUrl('http://example.com/data.json')).resolves.toBeNull();
  });

  test('rejects non-2xx responses', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse('<title>gone</title>', { status: 404 }));
    await expect(unfurlUrl('http://example.com/missing')).resolves.toBeNull();
  });

  test('caps streamed bodies at 512 KB and parses the head it did read', async () => {
    const head = '<html><head><title>Big page</title></head><body>';
    const filler = 'x'.repeat(64 * 1024);
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) {
          controller.enqueue(new TextEncoder().encode(head));
        } else {
          controller.enqueue(new TextEncoder().encode(filler));
        }
        // Never closes on its own: only the 512 KB cap stops the read.
      },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(stream, { status: 200, headers: { 'content-type': 'text/html' } })
    );

    const result = await unfurlUrl('http://example.com/big');
    expect(result).toMatchObject({ title: 'Big page' });
    // 512 KB / 64 KB chunks => the reader must stop pulling around the cap.
    expect(pulls).toBeLessThanOrEqual(10);
  });

  test('returns null on timeout (3s AbortController)', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          );
        })
    );

    const pending = unfurlUrl('http://example.com/slow');
    await vi.advanceTimersByTimeAsync(3_100);
    await expect(pending).resolves.toBeNull();
  });

  test('malformed HTML never throws — returns null when no title is recoverable', async () => {
    fetchMock.mockResolvedValueOnce(
      htmlResponse('<html><head><meta content="<<<>>>" <title>Broken')
    );
    await expect(unfurlUrl('http://example.com/broken')).resolves.toBeNull();
  });

  test('rejects overlong input URLs', async () => {
    await expect(unfurlUrl(`http://example.com/${'a'.repeat(2100)}`)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('happy path parsing', () => {
  test('prefers og:title/og:description and strips tags', async () => {
    fetchMock.mockResolvedValueOnce(
      htmlResponse(`
        <html><head>
          <title>Fallback title</title>
          <meta property="og:title" content="OG &amp; Title" />
          <meta property="og:description" content="An &lt;b&gt;escaped&lt;/b&gt; description" />
          <meta name="description" content="Meta description" />
        </head><body></body></html>
      `)
    );

    const result = await unfurlUrl('https://example.com/article');
    expect(result).toEqual({
      url: 'https://example.com/article',
      domain: 'example.com',
      title: 'OG & Title',
      desc: 'An escaped description',
    });
  });

  test('falls back to <title> and meta description', async () => {
    fetchMock.mockResolvedValueOnce(
      htmlResponse(
        '<html><head><title> Plain  Title </title><meta name="description" content="Plain desc"></head></html>'
      )
    );

    const result = await unfurlUrl('https://example.com/');
    expect(result).toMatchObject({ title: 'Plain Title', desc: 'Plain desc' });
  });

  test('clamps title and desc to contract lengths', async () => {
    fetchMock.mockResolvedValueOnce(
      htmlResponse(
        `<html><head><meta property="og:title" content="${'t'.repeat(400)}"><meta property="og:description" content="${'d'.repeat(500)}"></head></html>`
      )
    );

    const result = await unfurlUrl('https://example.com/long');
    expect(result?.title).toHaveLength(200);
    expect(result?.desc).toHaveLength(300);
  });

  test('missing description yields desc: null', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse('<title>Only title</title>'));
    const result = await unfurlUrl('https://example.com/');
    expect(result).toMatchObject({ title: 'Only title', desc: null });
  });
});

describe('write-path helpers', () => {
  test('extractFirstUrl prefers the first <a href> in the HTML', () => {
    expect(
      extractFirstUrl('<p>see <a href="https://example.com/a">this</a> and https://example.com/b</p>')
    ).toBe('https://example.com/a');
    expect(extractFirstUrl('<p>no links here</p>', 'plain https://example.com/c tail')).toBe(
      'https://example.com/c'
    );
    expect(extractFirstUrl('<p>nothing</p>', 'nothing')).toBeNull();
  });

  test('buildLinkPreview returns null when the body has no URL (fetch untouched)', async () => {
    await expect(buildLinkPreview('<p>hello</p>', 'hello')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('buildLinkPreview never throws when the unfurl fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(
      buildLinkPreview('<a href="https://example.com/x">x</a>')
    ).resolves.toBeNull();
  });
});
