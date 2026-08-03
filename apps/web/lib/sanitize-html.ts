import xss from 'xss';

// xss ships with a typed interface that does not include iframe. The runtime
// whitelist accepts arbitrary tag names, so we cast to keep TypeScript happy.
const whiteList = {
  p: [],
  br: [],
  strong: [],
  b: [],
  em: [],
  i: [],
  u: [],
  s: [],
  strike: [],
  a: ['href', 'target', 'rel', 'class'],
  h1: [],
  h2: [],
  h3: [],
  ul: [],
  ol: [],
  li: [],
  blockquote: [],
  pre: [],
  code: [],
  img: ['src', 'alt', 'title', 'width', 'height', 'class'],
  div: ['class', 'data-youtube-video'],
  span: [],
  iframe: ['src', 'width', 'height', 'frameborder', 'allowfullscreen', 'allow', 'class'],
} as XSS.IWhiteList & Record<string, string[]>;

export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';

  return xss(html, {
    whiteList,
    stripIgnoreTag: true,
    allowCommentTag: false,
  });
}
