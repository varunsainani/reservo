import { createApp } from "./app";
import { env } from "./lib/env";

const app = createApp();

const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Reservo backend listening on :${env.PORT} (${env.NODE_ENV})`);
});

function shutdown(signal: string): void {
  // eslint-disable-next-line no-console
  console.log(`\n${signal} received — shutting down.`);
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
