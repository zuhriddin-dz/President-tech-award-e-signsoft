/** Package entry — the server boots via main.ts; this exports the composition root for tests/tooling. */
export { AppModule } from './app.module.js';
export const PACKAGE_NAME = '@docflow/api' as const;
