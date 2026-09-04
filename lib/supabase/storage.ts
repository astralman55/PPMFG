import { getSupabaseAdmin, supabaseConfigured } from "./admin";

/**
 * Uploads/reads the private compliance-document buckets created by
 * supabase/migrations/0002_storage_buckets.sql (mtr, resin-certs, certs,
 * invoices, resale-certs). Server-only, service-role - same
 * configured-or-memory-fallback pattern as the rest of /lib, so the ops
 * console is still usable for local development before Supabase is wired up.
 */

const memoryFiles = new Map<string, Buffer>();
let warnedAboutMemoryStore = false;
function warnOnce(): void {
  if (warnedAboutMemoryStore) return;
  warnedAboutMemoryStore = true;
  console.warn(
    "[supabase/storage] Supabase is not configured - uploaded files are being kept in memory for local " +
      "development only. They will not survive a server restart. Add Supabase credentials to .env.local " +
      "before certifying a real order (see CLAUDE_CODE_BRIEF.md §13)."
  );
}

function key(bucket: string, path: string): string {
  return `${bucket}/${path}`;
}

export async function uploadPrivateFile(
  bucket: string,
  path: string,
  data: Buffer,
  contentType: string,
  options?: { upsert?: boolean }
): Promise<void> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { error } = await sb.storage.from(bucket).upload(path, data, { contentType, upsert: options?.upsert ?? false });
    if (error) throw new Error(`Failed to upload to ${bucket}/${path}: ${error.message}`);
    return;
  }
  warnOnce();
  memoryFiles.set(key(bucket, path), data);
}

export async function downloadPrivateFile(bucket: string, path: string): Promise<Buffer> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.storage.from(bucket).download(path);
    if (error) throw new Error(`Failed to download ${bucket}/${path}: ${error.message}`);
    return Buffer.from(await data.arrayBuffer());
  }
  warnOnce();
  const found = memoryFiles.get(key(bucket, path));
  if (!found) throw new Error(`No file at ${bucket}/${path} in the local in-memory file store.`);
  return found;
}

/** A short-lived link the browser can use to view/download a private file directly. */
export async function getSignedUrl(bucket: string, path: string, expiresInSeconds = 3600): Promise<string> {
  if (supabaseConfigured()) {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
    if (error) throw new Error(`Failed to sign a URL for ${bucket}/${path}: ${error.message}`);
    return data.signedUrl;
  }
  warnOnce();
  if (!memoryFiles.has(key(bucket, path))) throw new Error(`No file at ${bucket}/${path} in the local in-memory file store.`);
  return `memory://${bucket}/${path}`;
}
