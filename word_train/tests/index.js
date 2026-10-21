// Directory entry point for the contract's `node --test tests/` command:
// loads every tests/*.test.js, so new test files are picked up automatically.
import { readdirSync } from 'node:fs';

const dir = new URL('./', import.meta.url);
for (const name of readdirSync(dir).filter(n => n.endsWith('.test.js')).sort()) {
  await import(new URL(name, dir));
}
