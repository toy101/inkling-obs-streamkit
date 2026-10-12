declare module "cloudflare:workers" {
  export const env: {
    DB: import("./db/worker-client").D1Binding;
    CATALOG_URL: string;
    CORS_ALLOWED_ORIGINS: string;
    IKACLO_API_ORIGIN: string;
  };
}
