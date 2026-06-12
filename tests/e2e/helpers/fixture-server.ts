/**
 * One-shot HTTP fixture server for the stubbed E2E pipeline.
 *
 * The Edge Function's `/callback` fetches the "model output" URL and uploads the
 * bytes as the result object (the browser then decodes them). This server hands
 * those bytes back. It binds `0.0.0.0` so the Edge Function — running inside the
 * Supabase edge-runtime container — can reach it, and advertises a
 * container-reachable host (`host.docker.internal`, or the docker bridge gateway
 * on Linux CI) in the returned URL. The advertised `origin` is what must be set
 * as `E2E_ALLOWED_OUTPUT_ORIGIN` in the function's serve env, so the SSRF gate
 * lets this fetch through (see `isAllowedOutputUrl`).
 *
 * Node-only. Default port 8787 is fixed because `E2E_ALLOWED_OUTPUT_ORIGIN` is
 * read at `functions serve` STARTUP — the origin can't change per-test, so the
 * server and the serve env must agree on host:port up front.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

export interface FixtureServer {
  /** Full URL to put in the callback payload's `output` (advertised host:port). */
  url: string;
  /** `protocol//host:port` — set this as the function's E2E_ALLOWED_OUTPUT_ORIGIN. */
  origin: string;
  /** Stop the server (idempotent). */
  close: () => Promise<void>;
}

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = "host.docker.internal";
const DEFAULT_ROUTE = "/output.jpg";

/**
 * Serve `filePath`'s bytes on every request (single fixture, any path). Resolves
 * once the socket is listening.
 */
export async function serveFixture(opts: {
  filePath: string;
  /** Advertised host the Edge Function fetches from. Default `host.docker.internal`. */
  host?: string;
  /** Bind + advertised port. Default 8787 (must match E2E_ALLOWED_OUTPUT_ORIGIN). */
  port?: number;
  contentType?: string;
  routePath?: string;
}): Promise<FixtureServer> {
  const bytes = readFileSync(opts.filePath);
  const contentType = opts.contentType ?? "image/jpeg";
  const host = opts.host ?? DEFAULT_HOST;
  const port = opts.port ?? DEFAULT_PORT;
  const routePath = opts.routePath ?? DEFAULT_ROUTE;

  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": contentType, "Content-Length": bytes.byteLength });
    res.end(bytes);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const origin = `http://${host}:${port}`;
  return {
    url: `${origin}${routePath}`,
    origin,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}
