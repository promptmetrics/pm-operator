// SSRF test matrix for lib/og-image.ts.
//
// This module is reachable by ANY anonymous visitor: post pages are public, and
// generateMetadata calls resolvePostShareImage with a URL lifted straight out
// of member-authored post HTML. It previously ran `fetch(url, { redirect:
// 'follow' })` with no destination check, so these tests exist to keep the
// guard wired in.
//
// dns.lookup and fetch are mocked — no network, no DB.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

import { lookup } from 'node:dns/promises';
import { fetchOgImage, firstExternalLink, resolvePostShareImage } from '../lib/og-image';

const lookupMock = vi.mocked(lookup) as unknown as ReturnType<typeof vi.fn>;
const fetchMock = vi.fn();

const PUBLIC_IP = [{ address: '93.184.216.34', family: 4 }];

function htmlResponse(html: string, init?: { status?: number; contentType?: string }): Response {
  return new Response(html, {
    status: init?.status ?? 200,
    headers: { 'content-type': init?.contentType ?? 'text/html; charset=utf-8' },
  });
}

function redirectResponse(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

// fetchOgImage memoizes per URL for 5 minutes, so every test needs a distinct
// host or it reads a previous test's cached answer.
let hostCounter = 0;
function freshUrl(path = '/article'): string {
  hostCounter += 1;
  return `https://example-${hostCounter}.com${path}`;
}

beforeEach(() => {
  lookupMock.mockReset();
  lookupMock.mockResolvedValue(PUBLIC_IP);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('literal private IPs are rejected before any fetch', () => {
  const blocked = [
    'http://10.0.0.1/',
    'http://172.16.5.5/',
    'http://192.168.1.1/',
    'http://127.0.0.1/',
    'http://0.0.0.0/',
    'http://169.254.169.254/latest/meta-data/', // cloud metadata IP
    'http://[::1]/',
    'http://[fc00::1]/',
    'http://[fe80::1]/',
    'http://[::ffff:10.0.0.1]/', // IPv4-mapped IPv6
  ];

  for (const url of blocked) {
    test(`rejects ${url}`, async () => {
      await expect(fetchOgImage(url)).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }
});

describe('scheme, port, and credential restrictions', () => {
  test('rejects non-http(s) schemes', async () => {
    await expect(fetchOgImage('file:///etc/hosts')).resolves.toBeNull();
    await expect(fetchOgImage('ftp://example.com/x')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('rejects non-80/443 ports', async () => {
    await expect(fetchOgImage('http://example.com:8080/')).resolves.toBeNull();
    await expect(fetchOgImage('http://example.com:22/')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('rejects embedded credentials', async () => {
    await expect(fetchOgImage('http://user:pass@example.com/')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('DNS-resolved private addresses are rejected', () => {
  test('rejects a public hostname that resolves into a private range', async () => {
    lookupMock.mockResolvedValue([{ address: '10.1.2.3', family: 4 }]);
    await expect(fetchOgImage(freshUrl())).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('rejects when ANY resolved address is private', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(fetchOgImage(freshUrl())).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('rejects when DNS resolution fails', async () => {
    lookupMock.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(fetchOgImage(freshUrl())).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('redirects are re-checked on every hop', () => {
  test('rejects a public URL that redirects to the cloud metadata IP', async () => {
    const url = freshUrl('/innocent');
    fetchMock.mockResolvedValueOnce(redirectResponse('http://169.254.169.254/latest/meta-data/'));

    await expect(fetchOgImage(url)).resolves.toBeNull();
    // The first hop is fetched; the redirect target is never contacted.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('rejects a redirect into a private range resolved by DNS', async () => {
    const url = freshUrl('/innocent');
    fetchMock.mockResolvedValueOnce(redirectResponse('https://internal.example.org/admin'));
    lookupMock
      .mockResolvedValueOnce(PUBLIC_IP)
      .mockResolvedValueOnce([{ address: '192.168.0.9', family: 4 }]);

    await expect(fetchOgImage(url)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('follows a safe redirect and resolves the image against the final URL', async () => {
    const url = freshUrl('/old');
    fetchMock
      .mockResolvedValueOnce(redirectResponse('https://cdn.example.net/new'))
      .mockResolvedValueOnce(
        htmlResponse('<meta property="og:image" content="/img/cover.png">')
      );

    await expect(fetchOgImage(url)).resolves.toBe('https://cdn.example.net/img/cover.png');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('response handling', () => {
  test('returns the og:image URL for a normal page', async () => {
    const url = freshUrl();
    fetchMock.mockResolvedValueOnce(
      htmlResponse('<meta property="og:image" content="https://img.example.net/a.png">')
    );
    await expect(fetchOgImage(url)).resolves.toBe('https://img.example.net/a.png');
  });

  test('prefers og:image over twitter:image', async () => {
    const url = freshUrl();
    fetchMock.mockResolvedValueOnce(
      htmlResponse(
        '<meta name="twitter:image" content="https://img.example.net/t.png">' +
          '<meta property="og:image" content="https://img.example.net/og.png">'
      )
    );
    await expect(fetchOgImage(url)).resolves.toBe('https://img.example.net/og.png');
  });

  test('returns null for non-HTML content', async () => {
    const url = freshUrl('/file.pdf');
    fetchMock.mockResolvedValueOnce(
      htmlResponse('%PDF-1.4', { contentType: 'application/pdf' })
    );
    await expect(fetchOgImage(url)).resolves.toBeNull();
  });

  test('returns null on a non-OK status', async () => {
    const url = freshUrl('/missing');
    fetchMock.mockResolvedValueOnce(htmlResponse('nope', { status: 404 }));
    await expect(fetchOgImage(url)).resolves.toBeNull();
  });

  test('returns null when the page has no image meta', async () => {
    const url = freshUrl();
    fetchMock.mockResolvedValueOnce(htmlResponse('<title>Just a page</title>'));
    await expect(fetchOgImage(url)).resolves.toBeNull();
  });

  test('returns null when the network throws', async () => {
    const url = freshUrl();
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(fetchOgImage(url)).resolves.toBeNull();
  });
});

describe('firstExternalLink', () => {
  test('picks the first http(s) anchor href', () => {
    const html = '<p>hi</p><a href="https://example.com/a">a</a><a href="https://other.com/b">b</a>';
    expect(firstExternalLink(html)).toBe('https://example.com/a');
  });

  test('returns null when there is no anchor', () => {
    expect(firstExternalLink('<p>no links here</p>')).toBeNull();
  });

  test('ignores non-http schemes', () => {
    expect(firstExternalLink('<a href="mailto:hi@example.com">mail</a>')).toBeNull();
  });
});

describe('resolvePostShareImage', () => {
  test('an uploaded cover image wins and skips the network entirely', async () => {
    const html = '<a href="http://169.254.169.254/latest/meta-data/">x</a>';
    await expect(resolvePostShareImage('/post-images/cover.png', html)).resolves.toBe(
      '/post-images/cover.png'
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  test('a post whose only link targets an internal address yields no image', async () => {
    const html = '<a href="http://169.254.169.254/latest/meta-data/">free money</a>';
    await expect(resolvePostShareImage(null, html)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a post with no links yields no image and no fetch', async () => {
    await expect(resolvePostShareImage(null, '<p>plain text post</p>')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
