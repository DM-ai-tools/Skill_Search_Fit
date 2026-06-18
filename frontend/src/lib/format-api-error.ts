import { ApiError } from "@/lib/api";

type ValidationDetail = { field?: string; message?: string };

export function formatApiError(err: unknown, fallback = "Request failed"): string {
  if (!(err instanceof ApiError)) return fallback;

  const details = err.details as ValidationDetail[];
  if (details?.length) {
    return details
      .map((d) => (d.field ? `${d.field}: ${d.message}` : d.message))
      .filter(Boolean)
      .join(" · ");
  }

  return err.message || fallback;
}
