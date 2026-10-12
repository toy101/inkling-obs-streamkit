export function requireEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `${name} must be set. Copy apps/api/.env.example to apps/api/.env.local.`,
    );
  }
  return value.trim();
}

export function readPortEnvironmentVariable(name: string): number {
  const value = requireEnvironmentVariable(name);
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return port;
}

export function readOriginListEnvironmentVariable(name: string): string[] {
  return parseOriginList(requireEnvironmentVariable(name), name);
}

export function parseOriginList(value: string, name: string): string[] {
  const origins = value
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "")
    .map((value) => {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new Error(`${name} contains an invalid URL: ${value}`);
      }

      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.username !== "" ||
        url.password !== "" ||
        url.pathname !== "/" ||
        url.search !== "" ||
        url.hash !== ""
      ) {
        throw new Error(`${name} must contain HTTP(S) origins only: ${value}`);
      }
      return url.origin;
    });

  if (origins.length === 0) {
    throw new Error(`${name} must contain at least one HTTP(S) origin.`);
  }
  return [...new Set(origins)];
}

export function readHttpsOriginEnvironmentVariable(name: string): string {
  return parseHttpsOrigin(requireEnvironmentVariable(name), name);
}

export function parseHttpsOrigin(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS origin.`);
  }

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(`${name} must be a valid HTTPS origin.`);
  }
  return url.origin;
}
