/**
 * Typed API client for TraceVector.
 *
 * Handles:
 * - Base URL from env (defaults to same-origin for nginx deployment)
 * - JSON fetch with envelope normalization
 * - Streaming download (export)
 * - Typed error surface
 */

const BASE = (import.meta.env.VITE_API_BASE ?? "") + "/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  method: string,
  path: string,
  opts?: {
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined | null>;
    signal?: AbortSignal;
  },
): Promise<T> {
  const url = new URL(BASE + path, window.location.href);
  if (opts?.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v != null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const headers: Record<string, string> = {};
  let reqBody: BodyInit | undefined;
  if (opts?.body !== undefined) {
    headers["Content-Type"] = "application/json";
    reqBody = JSON.stringify(opts.body);
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: reqBody,
    signal: opts?.signal,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail ?? detail;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, detail);
  }

  return res.json() as Promise<T>;
}

// Convenience verbs
export const get = <T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  signal?: AbortSignal,
) => request<T>("GET", path, { params, signal });

export const post = <T>(path: string, body?: unknown) =>
  request<T>("POST", path, { body });

export const del = <T>(path: string) => request<T>("DELETE", path);

/** POST with multipart form data (for file upload). */
export async function postForm<T>(path: string, form: FormData): Promise<T> {
  const url = BASE + path;
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail ?? detail;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

/** Trigger a streaming download. Returns a Blob. */
export async function fetchBlob(path: string, body: unknown): Promise<Blob> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail ?? detail;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, detail);
  }
  return res.blob();
}
