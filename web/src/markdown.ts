import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';

marked.setOptions({ gfm: true, breaks: true });

const SENTINEL = 'QQMATHTOKEN';

/**
 * Render Markdown with inline ($...$) and display ($$...$$) LaTeX.
 * Math is lifted out before Markdown runs so underscores and backslashes survive,
 * then rendered with KaTeX and put back after sanitisation.
 */
export function renderMarkdown(src: string, mentionNames: string[] = []): string {
  const math: string[] = [];
  const lifted = src
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) => {
      math.push(katexSafe(tex, true));
      return `${SENTINEL}${math.length - 1}X`;
    })
    .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_, pre: string, tex: string) => {
      math.push(katexSafe(tex, false));
      return `${pre}${SENTINEL}${math.length - 1}X`;
    });

  let html = marked.parse(lifted, { async: false }) as string;
  html = DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
  html = html.replace(new RegExp(`${SENTINEL}(\\d+)X`, 'g'), (_, i: string) => math[Number(i)] ?? '');
  if (mentionNames.length) {
    const escaped = mentionNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length);
    html = html.replace(new RegExp(`(^|[\\s>(])@(${escaped.join('|')})(?=$|[\\s.,;:!?)<])`, 'g'), '$1<span class="mention">@$2</span>');
  }
  return html;
}

function katexSafe(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'html' });
  } catch {
    return `<code>${tex.replace(/</g, '&lt;')}</code>`;
  }
}
