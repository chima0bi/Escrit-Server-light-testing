import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { startAutoReleaseJob } from './services/autoRelease.js';

async function main() {
  await connectDB();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[server] listening on :${env.port} (${env.nodeEnv})`);
  });

  startAutoReleaseJob();
}

main().catch((err) => {
  console.error('[server] fatal startup error', err);
  process.exit(1);
});
