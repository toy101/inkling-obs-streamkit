import { createApp } from "./create-app";
import { adminDataSource, dataSource } from "./data-source";
import { parseOriginList, readOriginListEnvironmentVariable } from "./env";

const webOrigins = readOriginListEnvironmentVariable("CORS_ALLOWED_ORIGINS");

export const app = createApp({
  dataSource,
  webOrigins,
  admin: {
    dataSource: adminDataSource,
    token: process.env.ADMIN_API_TOKEN?.trim() ?? "",
    origins: parseOriginList(
      process.env.ADMIN_ALLOWED_ORIGINS ?? "http://localhost:5174,http://127.0.0.1:5174",
      "ADMIN_ALLOWED_ORIGINS",
    ),
    environment: "production",
  },
});
