import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Fetching pages and feeds the user (or a job board) points at, without letting a link reach
 * Orbit's own network: http(s) only, public addresses only (checked on every redirect), a time
 * limit and a size limit.
 */

const MAX_BYTES = 3_000_000;
const UA = "Mozilla/5.0 (compatible; OrbitJobAssistant/1.0)";

export class FetchRefused extends Error {}

function privateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function privateV6(ip: string): boolean {
  const x = ip.toLowerCase();
  if (x === "::1" || x === "::") return true;
  if (x.startsWith("::ffff:")) return privateV4(x.slice(7));
  return (
    x.startsWith("fc") ||
    x.startsWith("fd") ||
    x.startsWith("fe8") ||
    x.startsWith("fe9") ||
    x.startsWith("fea") ||
    x.startsWith("feb")
  );
}

export function isPrivateAddress(ip: string): boolean {
  return isIP(ip) === 6 ? privateV6(ip) : privateV4(ip);
}

async function checkHost(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new FetchRefused("Only web links can be read.");
  if (url.username || url.password) throw new FetchRefused("Links with a login in them can't be read.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal"))
    throw new FetchRefused("That address isn't on the public web.");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address)))
    throw new FetchRefused("That address isn't on the public web.");
}

/** GET a public URL (following up to 3 redirects, each checked); returns the body as text. */
export async function safeFetchText(
  input: string,
  opts: { timeoutMs?: number; accept?: string } = {},
): Promise<{ url: string; status: number; contentType: string; text: string }> {
  let url = new URL(input);
  const deadline = AbortSignal.timeout(opts.timeoutMs ?? 10_000);
  for (let hop = 0; hop < 4; hop++) {
    await checkHost(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: deadline,
      headers: { "User-Agent": UA, Accept: opts.accept ?? "text/html,application/json;q=0.9,*/*;q=0.5" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new FetchRefused("That page is too large to read.");
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) {
          await reader.cancel().catch(() => {});
          throw new FetchRefused("That page is too large to read.");
        }
        chunks.push(value);
      }
    }
    const text = new TextDecoder().decode(Buffer.concat(chunks));
    return { url: url.toString(), status: res.status, contentType: res.headers.get("content-type") ?? "", text };
  }
  throw new FetchRefused("Too many redirects.");
}

export async function safeFetchJson<T>(input: string, opts: { timeoutMs?: number } = {}): Promise<T> {
  const r = await safeFetchText(input, { ...opts, accept: "application/json" });
  if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
  return JSON.parse(r.text) as T;
}
