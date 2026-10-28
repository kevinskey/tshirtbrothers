// AI-referral attribution.
//
// Purpose: customers have told Doc that ChatGPT recommended the shop,
// but nothing in the analytics stack could show how often that happens.
// GA4 lumps chatgpt.com in with every other referral host, Umami shows
// the raw hostname with no grouping, and neither survives the visitor
// browsing three pages before requesting a quote.
//
// This module does three things:
//
//   1. Classifies the referrer (and any utm_source) into a named
//      discovery channel, so "chat.openai.com", "chatgpt.com" and
//      "?utm_source=chatgpt.com" all land in one bucket.
//   2. Stores FIRST-TOUCH attribution for the browser. A visitor who
//      arrives from Perplexity, reads three service pages and then
//      submits a quote must still be credited to Perplexity — on the
//      quote submission the referrer is our own domain.
//   3. Logs one `discovery_source` event per session into the existing
//      activity_events pipeline, and mirrors it to GA4 and Umami when
//      they're present.
//
// It is additive: no existing analytics call is modified, and every
// path is wrapped so tracking can never break a page.
//
// ── An honest limitation, stated up front ─────────────────────────────
// This under-counts AI referrals and always will.
//   · Google AI Overviews and Gemini grounding send a plain google.com
//     referrer, indistinguishable from an ordinary organic click.
//   · ChatGPT and Copilot answers frequently cause a DIRECT visit —
//     the person reads the answer, then types the domain or searches
//     the business name separately. That lands in `direct` or
//     `organic_search`.
//   · Some assistants strip the referrer entirely.
// So treat these numbers as a FLOOR on AI-driven discovery, never a
// total. The "How did you hear about us?" field on the quote form
// exists precisely to catch what this cannot see; the two together are
// the measurement, not either alone.

export type DiscoveryChannel =
  | 'chatgpt'
  | 'perplexity'
  | 'gemini'
  | 'copilot'
  | 'claude'
  | 'other_ai'
  | 'organic_search'
  | 'social'
  | 'referral'
  | 'direct';

export type Attribution = {
  channel: DiscoveryChannel;
  /** Raw referrer hostname, or '' for a direct visit. */
  source: string;
  /** Landing path of the first page seen this visit. */
  landingPath: string;
  /** ISO timestamp of first touch. */
  at: string;
};

const STORE_KEY = 'tsb_attribution';

/**
 * Referrer hostname → channel.
 *
 * Matched as a suffix against the hostname so subdomains work
 * ("www.perplexity.ai", "chat.openai.com"). Order matters only in that
 * the first match wins, so keep the specific entries above the generic
 * search engines.
 */
const HOST_RULES: [string, DiscoveryChannel][] = [
  // ── AI assistants with identifiable referrers ──
  ['chatgpt.com', 'chatgpt'],
  ['chat.openai.com', 'chatgpt'],
  ['openai.com', 'chatgpt'],
  ['perplexity.ai', 'perplexity'],
  ['gemini.google.com', 'gemini'],
  ['bard.google.com', 'gemini'],
  ['aistudio.google.com', 'gemini'],
  ['copilot.microsoft.com', 'copilot'],
  ['m365.cloud.microsoft', 'copilot'],
  ['claude.ai', 'claude'],
  ['you.com', 'other_ai'],
  ['poe.com', 'other_ai'],
  ['grok.com', 'other_ai'],
  ['x.ai', 'other_ai'],
  ['mistral.ai', 'other_ai'],
  ['deepseek.com', 'other_ai'],
  ['phind.com', 'other_ai'],
  ['andisearch.com', 'other_ai'],

  // ── Conventional search ──
  // NOTE: a google.com referrer may well BE an AI Overview click. There
  // is no way to tell from the referrer, so it is counted as organic
  // search rather than guessed at.
  ['google.com', 'organic_search'],
  ['google.co', 'organic_search'],
  ['bing.com', 'organic_search'],
  ['duckduckgo.com', 'organic_search'],
  ['search.yahoo.com', 'organic_search'],
  ['ecosia.org', 'organic_search'],
  ['brave.com', 'organic_search'],
  ['search.marginalia.nu', 'organic_search'],

  // ── Social ──
  ['facebook.com', 'social'],
  ['fb.com', 'social'],
  ['instagram.com', 'social'],
  ['l.instagram.com', 'social'],
  ['tiktok.com', 'social'],
  ['pinterest.com', 'social'],
  ['linkedin.com', 'social'],
  ['lnkd.in', 'social'],
  ['t.co', 'social'],
  ['x.com', 'social'],
  ['twitter.com', 'social'],
  ['reddit.com', 'social'],
  ['nextdoor.com', 'social'],
  ['youtube.com', 'social'],
];

/** utm_source values that identify an AI channel. */
const UTM_RULES: [string, DiscoveryChannel][] = [
  ['chatgpt', 'chatgpt'],
  ['openai', 'chatgpt'],
  ['perplexity', 'perplexity'],
  ['gemini', 'gemini'],
  ['copilot', 'copilot'],
  ['claude', 'claude'],
];

export function classifyReferrer(referrer: string, utmSource?: string | null): {
  channel: DiscoveryChannel;
  source: string;
} {
  // An explicit utm_source wins: assistants that tag their outbound
  // links are telling us directly, and it survives referrer stripping.
  if (utmSource) {
    const u = utmSource.toLowerCase();
    for (const [needle, channel] of UTM_RULES) {
      if (u.includes(needle)) return { channel, source: u };
    }
  }

  if (!referrer) return { channel: 'direct', source: '' };

  let host: string;
  try {
    const parsed = new URL(referrer);
    // Guard the non-http schemes. `new URL('javascript:alert(1)')`
    // parses happily and yields an EMPTY hostname, which then matched
    // no rule and fell through to 'referral' — inventing a referral
    // channel with no source out of a malformed string.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { channel: 'direct', source: '' };
    }
    host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return { channel: 'direct', source: '' };
  }

  if (!host) return { channel: 'direct', source: '' };

  // Our own domains are not a discovery channel — internal navigation.
  if (/(^|\.)tshirtbrothers\.com$/.test(host)) return { channel: 'direct', source: '' };

  for (const [suffix, channel] of HOST_RULES) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return { channel, source: host };
  }

  // Google country domains: google.co.uk, google.de, google.com.au and
  // the other ~190. Suffix rules can't enumerate these ("google.co.uk"
  // neither equals nor ends with ".google.co"), so they were being
  // counted as generic referrals — quietly understating organic search
  // for every non-US searcher. Checked AFTER the host rules so
  // gemini.google.com still wins its more specific match.
  if (/(^|\.)google\.(com?\.)?[a-z]{2,}$/.test(host)) {
    return { channel: 'organic_search', source: host };
  }

  return { channel: 'referral', source: host };
}

/** Channels that represent discovery through an AI answer engine. */
export const AI_CHANNELS: DiscoveryChannel[] = [
  'chatgpt', 'perplexity', 'gemini', 'copilot', 'claude', 'other_ai',
];

export function isAiChannel(channel: DiscoveryChannel): boolean {
  return AI_CHANNELS.includes(channel);
}

/**
 * First-touch attribution for this browser, if we've recorded one.
 * Read this when submitting a form so the lead carries its origin.
 */
export function getAttribution(): Attribution | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Attribution;
    return parsed?.channel ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Record first-touch attribution and log it once per session.
 *
 * First-touch (not last-touch) is deliberate: the question Doc is
 * trying to answer is "what made this person aware of us", and that is
 * the first visit, not whichever tab they happened to come back from.
 * An existing stored attribution is never overwritten — except when it
 * was `direct` and we now have something better, which happens when a
 * returning visitor arrives from a real source for the first time.
 */
export function initAttribution(): Attribution | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const { channel, source } = classifyReferrer(
      document.referrer || '',
      params.get('utm_source'),
    );

    const existing = getAttribution();
    const shouldWrite = !existing || (existing.channel === 'direct' && channel !== 'direct');

    const attribution: Attribution = shouldWrite
      ? {
          channel,
          source,
          landingPath: window.location.pathname,
          at: new Date().toISOString(),
        }
      : existing!;

    if (shouldWrite) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(attribution)); } catch { /* private mode */ }
    }

    // One event per session, describing THIS visit's entry channel
    // (not the stored first touch) so a session arriving from
    // Perplexity is visible even if first touch was ChatGPT.
    logOncePerSession(channel, source);

    return attribution;
  } catch {
    return null;
  }
}

function logOncePerSession(channel: DiscoveryChannel, source: string): void {
  try {
    if (sessionStorage.getItem('tsb_discovery_logged')) return;
    sessionStorage.setItem('tsb_discovery_logged', '1');
  } catch {
    // sessionStorage unavailable (private mode) — fall through and log.
  }

  const payload = {
    channel,
    source: source || '(none)',
    is_ai: isAiChannel(channel),
    landing_path: window.location.pathname,
  };

  // 1. First-party: lands in activity_events, queryable in the admin DB
  // alongside quotes and orders. This is the one that can be joined to
  // revenue, which is the whole point.
  //
  // Imported lazily to keep this module usable from anywhere without a
  // circular import through lib/activity.
  import('./activity')
    .then((m) => m.logActivity('discovery_source', payload))
    .catch(() => { /* best-effort */ });

  // 2. GA4 — a custom event so it can be a dimension in reports without
  // fighting GA's default channel grouping, which buckets AI assistants
  // under generic "Referral".
  try {
    const w = window as unknown as { gtag?: (...args: unknown[]) => void };
    w.gtag?.('event', 'discovery_source', payload);
  } catch { /* best-effort */ }

  // 3. Umami — same event, so it shows up in the self-hosted dashboard
  // without needing DB access.
  try {
    const w = window as unknown as {
      umami?: { track: (name: string, data?: Record<string, unknown>) => void };
    };
    w.umami?.track('discovery_source', payload);
  } catch { /* best-effort */ }
}
