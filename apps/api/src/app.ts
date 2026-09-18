import { createApp } from "./create-app";
import { dataSource } from "./data-source";
import { readOriginListEnvironmentVariable } from "./env";

const webOrigins = readOriginListEnvironmentVariable("CORS_ALLOWED_ORIGINS");

export const app = createApp({ dataSource, webOrigins });

export type App = typeof app;
