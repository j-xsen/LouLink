// ---------------------------------------------------------------------------
// Analytics dashboard — /analytics (RequireProfile guarded)
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth-context";
import { useSeo } from "../lib/seo";

type Period = "7d" | "30d" | "90d" | "all";

type AnalyticsData = {
  summary: {
    total_views: number;
    unique_visitors: number;
    total_clicks: number;
    avg_duration_ms: number | null;
    top_country: string | null;
    top_visit_kind: string | null;
  };
  views_over_time: { day: string; views: number }[];
  clicks_over_time: { day: string; clicks: number }[];
  by_country: Record<string, number>;
  by_city: Record<string, number>;
  by_browser: Record<string, number>;
  by_os: Record<string, number>;
  by_device: Record<string, number>;
  by_visit_kind: Record<string, number>;
  by_referrer: Record<string, number>;
  links: { id: string; title: string; url: string; total_clicks: number }[];
};

// ---------------------------------------------------------------------------
// Chart helpers
// ---------------------------------------------------------------------------

function BarChart({ data, color = "#6b7280" }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const barW = 10;
  const gap = 3;
  const H = 72;
  const W = data.length * (barW + gap);
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
        {data.map((d, i) => {
          const h = Math.max(2, (d.value / max) * H);
          return (
            <g key={i}>
              <rect
                x={i * (barW + gap)}
                y={H - h}
                width={barW}
                height={h}
                fill={color}
                rx={2}
                opacity={0.85}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function HBar({ label, value, max, color = "#6b7280" }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem" }}>
      <span style={{ width: 90, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.75 }}>{label}</span>
      <div style={{ flex: 1, height: 10, background: "#f3f4f6", borderRadius: 5, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 5 }} />
      </div>
      <span style={{ width: 36, textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.7 }}>{value}</span>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 14,
      padding: "1rem 1.25rem",
      display: "flex",
      flexDirection: "column",
      gap: "0.15rem",
    }}>
      <span style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.45, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: "1.6rem", fontWeight: 700, letterSpacing: "-0.02em" }}>{value}</span>
      {sub && <span style={{ fontSize: "0.75rem", opacity: 0.5 }}>{sub}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fmtDuration(ms: number | null): string {
  if (ms == null || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function fmtVisitKind(k: string | null): string {
  if (!k) return "—";
  return k.charAt(0).toUpperCase() + k.slice(1);
}

function topEntries(obj: Record<string, number>, n = 10): [string, number][] {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function fmtReferrer(ref: string): string {
  try { return new URL(ref).hostname.replace(/^www\./, ""); } catch { return ref; }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Analytics() {
  const { session } = useAuth();
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useSeo({ title: "Analytics | LouLink" });

  // Reset loading/error whenever the fetch inputs change — done during render
  // (not in the effect) so the spinner shows on the very same pass.
  const fetchKey = session?.token ? `${period}:${session.token}` : null;
  const [prevFetchKey, setPrevFetchKey] = useState<string | null>(null);
  if (fetchKey !== prevFetchKey) {
    setPrevFetchKey(fetchKey);
    if (fetchKey) {
      setLoading(true);
      setError(false);
    }
  }

  useEffect(() => {
    if (!session?.token) return;
    fetch(`/api/me/analytics?period=${period}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((d) => { setData(d as AnalyticsData); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [period, session?.token]);

  const accent = "#6b7280";

  const PERIODS: { value: Period; label: string }[] = [
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
    { value: "90d", label: "90 days" },
    { value: "all", label: "All time" },
  ];

  return (
    <div style={{ paddingBottom: "4rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <Link to="/" style={{ fontSize: "0.82rem", opacity: 0.5, textDecoration: "none", color: "inherit" }}>← Home</Link>
        <span style={{ opacity: 0.2 }}>|</span>
        <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Analytics</h1>
      </div>

      {/* Period selector */}
      <div style={{ display: "flex", gap: "0.35rem", marginBottom: "1.5rem" }}>
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPeriod(p.value)}
            style={{
              padding: "0.35rem 0.85rem",
              borderRadius: 20,
              border: `1.5px solid ${period === p.value ? "#111" : "#e5e7eb"}`,
              background: period === p.value ? "#111" : "#fff",
              color: period === p.value ? "#fff" : "inherit",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && <p style={{ opacity: 0.4 }}>Loading…</p>}
      {error && <p style={{ opacity: 0.5 }}>Could not load analytics.</p>}

      {!loading && !error && data && (
        <>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.65rem", marginBottom: "1.5rem" }}>
            <StatCard label="Page views" value={data.summary.total_views.toLocaleString()} />
            <StatCard label="Unique visitors" value={data.summary.unique_visitors.toLocaleString()} />
            <StatCard label="Link clicks" value={data.summary.total_clicks.toLocaleString()} />
            <StatCard
              label="Avg. visit duration"
              value={fmtDuration(data.summary.avg_duration_ms)}
            />
            <StatCard
              label="Top source"
              value={fmtVisitKind(data.summary.top_visit_kind)}
              sub={data.summary.top_country ?? undefined}
            />
          </div>

          {/* Views over time */}
          {data.views_over_time.length > 0 && (
            <Section title="Views over time">
              <BarChart
                data={data.views_over_time.map((d) => ({ label: d.day, value: d.views }))}
                color={accent}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", opacity: 0.4, marginTop: "0.25rem" }}>
                <span>{data.views_over_time[0]?.day}</span>
                <span>{data.views_over_time[data.views_over_time.length - 1]?.day}</span>
              </div>
            </Section>
          )}

          {/* Link clicks over time */}
          {data.clicks_over_time.length > 0 && (
            <Section title="Link clicks over time">
              <BarChart
                data={data.clicks_over_time.map((d) => ({ label: d.day, value: d.clicks }))}
                color="#10b981"
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", opacity: 0.4, marginTop: "0.25rem" }}>
                <span>{data.clicks_over_time[0]?.day}</span>
                <span>{data.clicks_over_time[data.clicks_over_time.length - 1]?.day}</span>
              </div>
            </Section>
          )}

          {/* Top links */}
          {data.links.length > 0 && (
            <Section title="Link performance">
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {data.links.slice().sort((a, b) => b.total_clicks - a.total_clicks).map((link) => {
                  const maxClicks = Math.max(...data.links.map((l) => l.total_clicks), 1);
                  return (
                    <div key={link.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.title}</div>
                        <div style={{ fontSize: "0.72rem", opacity: 0.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.url}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
                        <div style={{ width: 60, height: 6, background: "#f3f4f6", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${(link.total_clicks / maxClicks) * 100}%`, height: "100%", background: "#10b981", borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: "0.82rem", fontWeight: 600, minWidth: 24, textAlign: "right" }}>{link.total_clicks}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Traffic sources */}
          {Object.keys(data.by_visit_kind).length > 0 && (
            <Section title="Traffic sources">
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                {topEntries(data.by_visit_kind).map(([k, v]) => (
                  <HBar
                    key={k}
                    label={fmtVisitKind(k)}
                    value={v}
                    max={Math.max(...Object.values(data.by_visit_kind))}
                    color={k === "social" ? "#8b5cf6" : k === "search" ? "#3b82f6" : k === "referral" ? "#f59e0b" : "#6b7280"}
                  />
                ))}
              </div>
            </Section>
          )}

          {/* Geography */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.65rem" }}>
            {Object.keys(data.by_country).length > 0 && (
              <Section title="Countries">
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {topEntries(data.by_country, 8).map(([k, v]) => (
                    <HBar key={k} label={k} value={v} max={Math.max(...Object.values(data.by_country))} color={accent} />
                  ))}
                </div>
              </Section>
            )}
            {Object.keys(data.by_city).length > 0 && (
              <Section title="Cities">
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {topEntries(data.by_city, 8).map(([k, v]) => (
                    <HBar key={k} label={k} value={v} max={Math.max(...Object.values(data.by_city))} color={accent} />
                  ))}
                </div>
              </Section>
            )}
          </div>

          {/* Audience */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.65rem" }}>
            {Object.keys(data.by_browser).length > 0 && (
              <Section title="Browser">
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {topEntries(data.by_browser, 5).map(([k, v]) => (
                    <HBar key={k} label={k} value={v} max={Math.max(...Object.values(data.by_browser))} color={accent} />
                  ))}
                </div>
              </Section>
            )}
            {Object.keys(data.by_os).length > 0 && (
              <Section title="OS">
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {topEntries(data.by_os, 5).map(([k, v]) => (
                    <HBar key={k} label={k} value={v} max={Math.max(...Object.values(data.by_os))} color={accent} />
                  ))}
                </div>
              </Section>
            )}
            {Object.keys(data.by_device).length > 0 && (
              <Section title="Device">
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {topEntries(data.by_device, 3).map(([k, v]) => (
                    <HBar key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} value={v} max={Math.max(...Object.values(data.by_device))} color={accent} />
                  ))}
                </div>
              </Section>
            )}
          </div>

          {/* Top referrers */}
          {Object.keys(data.by_referrer).length > 0 && (
            <Section title="Top referrers">
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {topEntries(data.by_referrer, 10).map(([k, v]) => (
                  <HBar key={k} label={fmtReferrer(k)} value={v} max={Math.max(...Object.values(data.by_referrer))} color={accent} />
                ))}
              </div>
            </Section>
          )}

          {data.summary.total_views === 0 && data.summary.total_clicks === 0 && (
            <p style={{ textAlign: "center", opacity: 0.4, marginTop: "2rem" }}>
              No data yet for this period. Analytics appear once visitors start viewing your page.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 14,
      padding: "1rem 1.25rem",
      marginBottom: "0.65rem",
    }}>
      <h2 style={{ margin: "0 0 0.75rem", fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.4 }}>
        {title}
      </h2>
      {children}
    </div>
  );
}
