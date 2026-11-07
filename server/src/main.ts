import 'dotenv/config';
import { start } from './start';

// `npm start` passes --production rather than NODE_ENV=production in the script: that syntax fails in cmd and
// PowerShell. Either way, the built web app in dist/web is served.
if (process.argv.includes('--production')) process.env.NODE_ENV = 'production';

async function main(): Promise<void> {
  const server = await start(process.env);

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
