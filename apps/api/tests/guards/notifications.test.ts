/**
 * Story 6.9 — customer email addresses are PII. One module sends mail, and nothing logs or
 * records an address. If this fails, route the change through src/services/customer-notifications.ts.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { sourceFiles } from '../helpers/source-files.js';

const SRC = path.resolve(__dirname, '../../src');
const MAILER = path.join(SRC, 'lib', 'mailer.ts');

const rel = (file: string) => path.relative(SRC, file);

describe('customer email', () => {
  it('only src/lib/mailer.ts talks to a mail transport', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => file !== MAILER)
      .filter((file) => /nodemailer|api\.brevo\.com/.test(readFileSync(file, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
    expect(readFileSync(MAILER, 'utf8')).toMatch(/createTransport\(/);
  });

  it('no logger call or ticket event takes an email', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return (
          /logger\.\w+\(\s*\{[^}]*\bemail\b/.test(source) ||
          /recordTicketEvent\([^)]*\bemail\b/.test(source) ||
          /insertEvent\([^)]*\bemail\b/.test(source)
        );
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
