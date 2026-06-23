export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export const REPLICATE_REQUEST_TIMEOUT_MS = 15_000;

export async function fetchReplicateJson(
  url: string,
  token: string,
  label: string,
  fetchImpl: FetchLike = fetch,
  timeoutMs = REPLICATE_REQUEST_TIMEOUT_MS,
): Promise<unknown> {
  try {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Replicate ${label} fetch failed: ${String(response.status)} ${await response.text()}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error(`Replicate ${label} fetch timed out after ${String(timeoutMs)}ms.`, { cause: error });
    }
    throw error;
  }
}
