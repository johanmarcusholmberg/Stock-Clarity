// DB-level helpers for news_cache. Used by both the pre-load worker (bulk
// ingest of the active-stocks universe) and the /events route (cold-cache
// fallback + cache-first read).
//
// Why this lives in lib/: the route imported url_hash from the worker in PR 1,
// which created a lib→routes↔lib cycle waiting to happen. Centralising the DB
// access here keeps the dependency graph routes → lib only.
import { createHash } from "node:crypto";
import { execute, query } from "../db";
import type { NewsItem } from "./newsSources";
import { scoreImpact, type NewsSource } from "./newsImpact";

export type { NewsSource } from "./newsImpact";

// Google News RSS URLs are opaque redirects that don't dedup the underlying
// story. For Google items we hash publisher+title instead. For everything
// else we hash the lowercased host+path (strip query string) so trivial
// tracking-param differences don't cause duplicates.
export function urlHash(item: NewsItem, source: NewsSource): string {
  let key: string;
  if (source === "google_rss" || !item.url || item.url.includes("news.google.com")) {
    key = `${item.publisher}|${item.title}`.toLowerCase();
  } else {
    try {
      const u = new URL(item.url);
      key = `${u.host.toLowerCase()}${u.pathname}`;
    } catch {
      key = `${item.publisher}|${item.title}`.toLowerCase();
    }
  }
  return createHash("sha1").update(key).digest("hex");
}

// Single-item upsert. Returns true if the row was inserted, false on UNIQUE
// conflict. Scores eagerly so the cold-cache fallback path in /events
// doesn't depend on the worker having run.
export async function upsertNewsItem(
  symbol: string,
  item: NewsItem,
  source: NewsSource,
): Promise<boolean> {
  const hash = urlHash(item, source);
  const score = scoreImpact({
    title: item.title,
    publisher: item.publisher,
    source,
    publishedAtMs: item.timestampMs,
  });
  const rows = await query(
    `INSERT INTO news_cache (symbol, url_hash, url, title, publisher, published_at, source, impact_score)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (symbol, url_hash) DO NOTHING
     RETURNING id`,
    [symbol, hash, item.url, item.title, item.publisher, new Date(item.timestampMs).toISOString(), source, score],
  );
  return rows.length > 0;
}

export interface CachedNewsRow {
  id: number;
  symbol: string;
  url: string;
  title: string;
  publisher: string;
  // node-postgres returns `timestamptz` columns as Date objects by default;
  // callers must normalise before using string methods on it.
  published_at: Date | string;
  source: NewsSource;
  impact_score: number | null;
}

// Cache-first read for /events/:symbol. Orders by impact DESC (NULLS last)
// then published_at DESC, which matches the mobile card's implicit
// "importance first, then recency" priority.
export async function readCachedNews(
  symbol: string,
  cutoffMs: number,
  limit: number,
): Promise<CachedNewsRow[]> {
  return query<CachedNewsRow>(
    `SELECT id, symbol, url, title, publisher, published_at, source, impact_score
       FROM news_cache
      WHERE symbol = $1
        AND published_at >= $2
      ORDER BY impact_score DESC NULLS LAST, published_at DESC
      LIMIT $3`,
    [symbol, new Date(cutoffMs).toISOString(), limit],
  );
}

// Called from the worker's phase 2. Bounded to the last 48h to avoid
// rescoring historical data on every tick.
export async function scoreUnscored(nowMs: number = Date.now()): Promise<number> {
  const rows = await query<{
    id: number;
    title: string;
    publisher: string;
    source: NewsSource;
    published_at: Date | string;
  }>(
    `SELECT id, title, publisher, source, published_at
       FROM news_cache
      WHERE impact_score IS NULL
        AND fetched_at > NOW() - INTERVAL '48 hours'`,
  );
  if (rows.length === 0) return 0;
  for (const r of rows) {
    const publishedAtMs = r.published_at instanceof Date
      ? r.published_at.getTime()
      : new Date(r.published_at).getTime();
    const score = scoreImpact(
      { title: r.title, publisher: r.publisher, source: r.source, publishedAtMs },
      nowMs,
    );
    await execute(`UPDATE news_cache SET impact_score = $1 WHERE id = $2`, [score, r.id]);
  }
  return rows.length;
}
