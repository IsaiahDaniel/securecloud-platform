import { randomBytes } from "crypto";
import { mkdtemp, rm } from "fs/promises";
import { createServer } from "net";
import { tmpdir } from "os";
import path from "path";
import EmbeddedPostgres from "embedded-postgres";

export interface TestDatabase {
  url: string;
  stop: () => Promise<void>;
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const password = randomBytes(18).toString("hex");
  const databaseDir = await mkdtemp(path.join(tmpdir(), "securecloud-pg-"));
  const port = await freePort();
  const user = "postgres";
  const database = "securecloud_test";
  const postgres = new EmbeddedPostgres({
    databaseDir,
    user,
    password,
    port,
    persistent: false,
    onLog: () => undefined,
  });

  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase(database);

  return {
    url: `postgres://${user}:${password}@127.0.0.1:${port}/${database}`,
    stop: async () => {
      await postgres.stop();
      await rm(databaseDir, { recursive: true, force: true });
    },
  };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("failed to allocate a port"));
        return;
      }
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.on("error", reject);
  });
}
