import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Idempotent Garage bootstrap over HTTP — the Railway predeploy equivalent of
 * localdev/garage/init.sh (which can't run on Railway: no docker socket to exec
 * the Garage CLI). Everything is check-then-create so re-running per deploy no-ops.
 *
 * Admin API (:3903, bearer token) drives layout/key/bucket/website.
 * S3 API (:3900, via @aws-sdk) sets CORS.
 */

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`missing required env var ${name}`);
  }
  return v;
}

const ADMIN_ENDPOINT = env("GARAGE_ADMIN_ENDPOINT").replace(/\/$/, "");
const ADMIN_TOKEN = env("GARAGE_ADMIN_TOKEN");
const S3_ENDPOINT = env("S3_ENDPOINT");
const S3_REGION = env("S3_REGION", "garage");
const ACCESS_KEY_ID = env("S3_ACCESS_KEY_ID");
const SECRET_ACCESS_KEY = env("S3_SECRET_ACCESS_KEY");
const BUCKET_PRIVATE = env("S3_BUCKET_PRIVATE");
const BUCKET_PUBLIC = env("S3_BUCKET_PUBLIC");

// Origins the browser is allowed to hit the S3 API from (presigned POST upload,
// signed GET). Trailing slash / path stripped so it matches the browser Origin header.
const ORIGINS = [
  env("APP_BASE_URL"),
  ...(process.env.CORS_EXTRA_ORIGINS ?? "").split(","),
]
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

const ADMIN_BASE = `${ADMIN_ENDPOINT}/v1`;

function log(msg: string): void {
  console.log(`[prepare-storage] ${msg}`);
}

async function admin<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T | undefined> {
  const res = await fetch(`${ADMIN_BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${ADMIN_TOKEN}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error(
      `garage admin ${method} ${path} -> ${res.status} ${await res.text()}`,
    );
  }
  const text = await res.text();
  return text ? JSON.parse(text) : undefined;
}

// Create the bucket if missing, then (idempotently) grant the app key full access.
async function ensureBucket(name: string): Promise<string> {
  const buckets = (await admin("GET", "/bucket?list")) as Array<{
    id: string;
    globalAliases?: string[];
  }>;
  let bucketId = buckets.find((b) => b.globalAliases?.includes(name))?.id;
  if (!bucketId) {
    const created: { id: string } | undefined = await admin("POST", "/bucket", {
      globalAlias: name,
    });
    bucketId = created!.id;
    log(`bucket ${name} created`);
  }
  await admin("POST", "/bucket/allow", {
    bucketId,
    accessKeyId: ACCESS_KEY_ID,
    permissions: { read: true, write: true, owner: true },
  });
  return bucketId;
}

// Public bucket is served anonymously over the web endpoint (:3902).
async function enableWebsite(bucketId: string): Promise<void> {
  await admin("PUT", `/bucket?id=${bucketId}`, {
    websiteAccess: { enabled: true, indexDocument: "index.html" },
  });
  log("website enabled on public bucket");
}

// CORS via the S3 API. One CORSRule per origin: Garage collapses multiple
// AllowedOrigins in a single rule into one invalid header that browsers reject.
async function setCors(buckets: string[]): Promise<void> {
  const s3 = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });
  const CORSRules = ORIGINS.map((origin) => ({
    AllowedOrigins: [origin],
    AllowedMethods: ["GET", "PUT", "POST"],
    AllowedHeaders: ["*"],
    ExposeHeaders: ["ETag"],
    MaxAgeSeconds: 3000,
  }));
  for (const bucket of buckets) {
    await s3.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: { CORSRules },
      }),
    );
  }
  log(`cors set on ${buckets.join(", ")} for ${ORIGINS.join(", ")}`);
}

async function main(): Promise<void> {
  log(`bootstrapping garage buckets at ${ADMIN_ENDPOINT}`);
  await ensureBucket(BUCKET_PRIVATE);
  const publicId = await ensureBucket(BUCKET_PUBLIC);
  await enableWebsite(publicId);
  await setCors([BUCKET_PRIVATE, BUCKET_PUBLIC]);
  log("asksynk buckets ready");
}

// Print the whole error chain: undici `fetch` throws a generic "fetch failed"
// and hides the real cause (ECONNREFUSED / DNS / TLS) in `err.cause`.
function formatError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  let out = err.stack ?? `${err.name}: ${err.message}`;
  let cause: unknown = (err as { cause?: unknown }).cause;
  while (cause instanceof Error) {
    out += `\ncaused by: ${cause.stack ?? `${cause.name}: ${cause.message}`}`;
    cause = (cause as { cause?: unknown }).cause;
  }
  if (cause !== undefined) out += `\ncaused by: ${String(cause)}`;
  return out;
}

main().catch((err: unknown) => {
  console.error(`prepare-storage failed:\n${formatError(err)}`);
  // Set exitCode instead of process.exit(1): on Railway stdout is an async
  // pipe, and an immediate exit() truncates the buffered log above before it
  // flushes. Letting the event loop drain naturally guarantees the log lands.
  process.exitCode = 1;
});
