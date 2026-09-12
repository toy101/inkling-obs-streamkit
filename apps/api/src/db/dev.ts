import { requireEnvironmentVariable } from "../env";

function readLocalListenAddress(): string {
  const value = requireEnvironmentVariable("TURSO_DATABASE_URL");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("TURSO_DATABASE_URL must be a valid URL.");
  }

  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.port === "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      "bun run db:dev requires TURSO_DATABASE_URL to be a local HTTP origin with an explicit port.",
    );
  }
  return url.host;
}

const sqldProcess = Bun.spawn(
  [
    "sqld",
    "--no-welcome",
    "--http-listen-addr",
    readLocalListenAddress(),
    "--db-path",
    ".data/turso",
  ],
  {
    cwd: `${import.meta.dir}/../..`,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
);

process.once("SIGINT", () => sqldProcess.kill("SIGINT"));
process.once("SIGTERM", () => sqldProcess.kill("SIGTERM"));

process.exitCode = await sqldProcess.exited;
