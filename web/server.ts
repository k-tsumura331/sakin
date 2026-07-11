import { serve } from "@hono/node-server";
import { resolveBindAddress, resolvePort } from "../config/env.js";
import { createApp } from "./app.js";

function main() {
  const app = createApp();
  const hostname = resolveBindAddress();
  const port = resolvePort();

  serve({ fetch: app.fetch, hostname, port }, (info) => {
    console.log(`sakin web listening on http://${info.address}:${info.port}`);
  });
}

main();
