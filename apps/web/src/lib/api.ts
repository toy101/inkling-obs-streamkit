import { treaty } from "@elysia/eden";

import type { App } from "../../../api/src";

export const api = treaty<App>("http://localhost:3000");
