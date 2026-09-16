import { useMemo } from 'react';
import { renderMarkdown } from '../markdown.ts';
import { useStore } from '../store.ts';

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const roster = useStore((s) => s.roster);
  const html = useMemo(() => renderMarkdown(text, roster.map((r) => r.name)), [text, roster]);
  return <div className={`md text-sm leading-relaxed break-words ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
