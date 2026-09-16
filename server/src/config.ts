import path from 'node:path';
import fs from 'node:fs';

const cwd = process.cwd();

export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? '0.0.0.0',
  dataDir: path.resolve(process.env.DATA_DIR ?? path.join(cwd, 'data')),
  webDist: path.resolve(process.env.WEB_DIST ?? path.join(cwd, 'web/dist')),
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 14),
  maxPdfBytes: Number(process.env.MAX_PDF_MB ?? 50) * 1024 * 1024,
  maxPages: Number(process.env.MAX_PAGES ?? 300),
};

export const pdfDir = path.join(config.dataDir, 'pdfs');
fs.mkdirSync(pdfDir, { recursive: true });

export function pdfPath(sessionId: string): string {
  return path.join(pdfDir, `${sessionId}.pdf`);
}
