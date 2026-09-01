"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/utils";

export type AnalysisDto = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  takeaways: unknown;
  chapters: unknown;
  chaptersMeta: unknown;
  error: string | null;
  costCents: number | null;
  highlightSetHash: string;
  createdAt: string;
  completedAt: string | null;
};

const FAST_INTERVAL = 2000;
const SLOW_INTERVAL = 5000;
const SLOW_AFTER = 60_000;
const GIVE_UP_AFTER = 300_000;

export type AnalysisState = {
  analysis: AnalysisDto | null;
  stale: boolean;
  pending: boolean;
  inFlight: boolean;
  elapsedMs: number;
  error: string | null;
  timedOut: boolean;
  cachedHit: boolean;
  generate: (force?: boolean) => void;
};

/**
 * Owns the job lifecycle: kick off `POST /api/books/:id/analysis`, then poll
 * `GET /api/analyses/:id` every 2s, backing off to 5s after a minute and
 * giving up at five (SPEC 10).
 */
export function useAnalysis(
  bookId: string,
  initialAnalysis: AnalysisDto | null,
  currentHighlightSetHash: string,
  initialStale: boolean,
): AnalysisState {
  const [analysis, setAnalysis] = useState<AnalysisDto | null>(initialAnalysis);
  const [stale, setStale] = useState(initialStale);
  const [inFlight, setInFlight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [cachedHit, setCachedHit] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAt = useRef<number | null>(null);

  const pending = analysis?.status === "queued" || analysis?.status === "running";

  const generate = useCallback(
    (force = false) => {
      setError(null);
      setTimedOut(false);
      setCachedHit(false);
      setInFlight(true);
      startedAt.current = Date.now();
      setElapsedMs(0);

      void (async () => {
        try {
          const res = await fetch(
            `/api/books/${bookId}/analysis${force ? "?force=1" : ""}`,
            { method: "POST" },
          );
          const json = await res.json();
          if (!res.ok) {
            setError(json.error ?? "Could not start the analysis.");
            startedAt.current = null;
            return;
          }

          setCachedHit(Boolean(json.cached));
          const detail = await fetch(`/api/analyses/${json.analysisId}`).then((r) => r.json());
          setAnalysis(detail);
          if (detail.status === "succeeded" || detail.status === "failed") startedAt.current = null;
        } catch {
          setError("Could not reach the server.");
          startedAt.current = null;
        } finally {
          setInFlight(false);
        }
      })();
    },
    [bookId],
  );

  // Poll while the job is live.
  useEffect(() => {
    if (!analysis || !pending || timedOut) return;
    if (startedAt.current === null) startedAt.current = Date.now();

    let cancelled = false;
    let timer: number;

    const tick = async () => {
      const elapsed = Date.now() - (startedAt.current ?? Date.now());
      setElapsedMs(elapsed);

      if (elapsed > GIVE_UP_AFTER) {
        setTimedOut(true);
        return;
      }

      try {
        const res = await fetch(`/api/analyses/${analysis.id}`, { cache: "no-store" });
        if (res.ok) {
          const next: AnalysisDto = await res.json();
          if (cancelled) return;
          setAnalysis(next);
          if (next.status === "succeeded") {
            setStale(next.highlightSetHash !== currentHighlightSetHash);
            startedAt.current = null;
            return;
          }
          if (next.status === "failed") {
            startedAt.current = null;
            return;
          }
        }
      } catch {
        // Transient network failure: keep polling until the give-up window.
      }

      if (!cancelled) {
        timer = window.setTimeout(tick, elapsed > SLOW_AFTER ? SLOW_INTERVAL : FAST_INTERVAL);
      }
    };

    timer = window.setTimeout(tick, FAST_INTERVAL);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [analysis, pending, timedOut, currentHighlightSetHash]);

  return { analysis, stale, pending, inFlight, elapsedMs, error, timedOut, cachedHit, generate };
}

function elapsedLabel(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function AnalysisControls({
  state,
  highlightCount,
}: {
  state: AnalysisState;
  highlightCount: number;
}) {
  const { analysis, stale, pending, inFlight, elapsedMs, error, timedOut, cachedHit, generate } =
    state;

  const hasResult = analysis?.status === "succeeded";
  const disabled = highlightCount === 0 || pending || inFlight;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => generate(false)} disabled={disabled}>
          {inFlight
            ? "Starting…"
            : pending
              ? "Working…"
              : hasResult
                ? "Regenerate"
                : "Generate analysis"}
        </Button>

        {hasResult ? (
          <Button variant="ghost" size="sm" onClick={() => generate(true)} disabled={disabled}>
            Force a new run
          </Button>
        ) : null}

        {stale && hasResult ? <Badge tone="warn">Stale</Badge> : null}
        {cachedHit ? <Badge tone="muted">Cached — no new generation</Badge> : null}
        {analysis?.costCents !== null && analysis?.costCents !== undefined ? (
          <Badge tone="muted">{formatCents(analysis.costCents)}</Badge>
        ) : null}
      </div>

      {highlightCount === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Import some highlights first — takeaways are built only from what you highlighted.
        </p>
      ) : null}

      {stale && hasResult ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Your highlights changed since this analysis ran. Regenerate to bring it up to date.
        </p>
      ) : null}

      {pending && !timedOut ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          {analysis?.status === "queued" ? "Queued" : "Analyzing your highlights"} —{" "}
          {elapsedLabel(elapsedMs)} elapsed. You can leave this page; the job keeps running.
        </p>
      ) : null}

      {timedOut ? (
        <p className="text-sm text-[var(--danger)]">
          This is taking unusually long. Reload the page to check on it, or start another run.
        </p>
      ) : null}

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      {analysis?.status === "failed" ? (
        <p className="text-sm text-[var(--danger)]">
          The last run failed: {analysis.error ?? "unknown error"}
        </p>
      ) : null}
    </div>
  );
}
