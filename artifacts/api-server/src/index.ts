import app from "./app";
import { logger } from "./lib/logger";
import { initializeStudioDatabase } from "./lib/studio-database";
import { scheduleSourceRefresh } from "./lib/content-sync";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await initializeStudioDatabase();
scheduleSourceRefresh(error => logger.error({ errorName: error instanceof Error ? error.name : "Error" }, "Scheduled source refresh failed"));
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
