import express, { Request, Response } from 'express';
import Parser from 'rss-parser';
import path from 'path';

const app = express();
const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'RSS-News-Summary/1.0' },
});

const PORT = process.env.PORT || 3000;

// ── RSS Feed URLs ────────────────────────────────────────────────────────────

const TECH_FEEDS: string[] = [
  'https://feeds.feedburner.com/TheHackersNews',
  'https://techcrunch.com/feed/',
  'https://hackaday.com/blog/feed/',
  'https://feeds.feedburner.com/oreilly/radar/atom',
];

const GENERAL_FEEDS: string[] = [
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://rss.cnn.com/rss/cnn_topstories.rss',
  'https://yle.fi/rss/news',
  'https://www.helsinkitimes.fi/?format=feed',
  'https://dailyfinland.fi/feed/latest-rss.xml',
];

// ── Types ────────────────────────────────────────────────────────────────────

export type NewsCategory = 'must-know' | 'good-to-know' | 'general-bs';

export interface NewsItem {
  title: string;
  summary: string;
  link: string;
  pubDate: string;
  source: string;
  category: NewsCategory;
}

export interface ApiResponse {
  success: boolean;
  items?: NewsItem[];
  error?: string;
}

// ── Keyword classification ───────────────────────────────────────────────────

const MUST_KNOW_KEYWORDS: string[] = [
  'security', 'breach', 'hack', 'hacked', 'attack', 'exploit', 'critical',
  'warning', 'alert', 'vulnerability', 'zero-day', 'malware', 'ransomware',
  'crisis', 'emergency', 'breaking', 'urgent', 'war', 'disaster', 'recall',
  'ban', 'sanction', 'threat', 'danger', 'risk', 'flaw', 'leak', 'exposed',
  'espionage', 'spy', 'nuclear', 'election', 'fraud', 'arrested', 'indicted',
];

const GOOD_TO_KNOW_KEYWORDS: string[] = [
  'launch', 'release', 'update', 'new', 'feature', 'announce', 'introduce',
  'improve', 'open-source', 'opensource', 'research', 'study', 'discover',
  'innovation', 'ai', 'startup', 'funding', 'invest', 'partnership', 'deal',
  'acquire', 'report', 'analysis', 'trend', 'growth', 'expand', 'upgrade',
  'version', 'available', 'unveiled', 'reveal', 'interview', 'survey',
];

function extractContentText(item: Parser.Item): string {
  return `${item.title ?? ''} ${item.contentSnippet ?? ''} ${(item as Record<string, unknown>)['summary'] ?? ''}`.toLowerCase();
}

function scoreItem(item: Parser.Item): { mustKnow: number; goodToKnow: number } {
  const searchableText = extractContentText(item);
  const mustKnow = MUST_KNOW_KEYWORDS.filter((kw) => searchableText.includes(kw)).length;
  const goodToKnow = GOOD_TO_KNOW_KEYWORDS.filter((kw) => searchableText.includes(kw)).length;
  return { mustKnow, goodToKnow };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')   // &amp; last to avoid double-unescaping
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function makeTldr(text: string, maxLength = 220): string {
  const clean = stripHtml(text);
  if (!clean) return '';
  if (clean.length <= maxLength) return clean;
  const truncated = clean.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated) + '…';
}

function extractSourceName(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace('www.', '').replace('feeds.', '');
    const parts = hostname.split('.');
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  } catch {
    return 'Unknown';
  }
}

// ── Feed Fetching ────────────────────────────────────────────────────────────

async function fetchFeedItems(feedUrls: string[]): Promise<Array<{ item: Parser.Item; source: string }>> {
  const results = await Promise.allSettled(
    feedUrls.map(async (url) => {
      const feed = await parser.parseURL(url);
      const source = feed.title ?? extractSourceName(url);
      return feed.items.slice(0, 10).map((item) => ({ item, source }));
    })
  );

  const combined: Array<{ item: Parser.Item; source: string }> = [];
  let failures = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') {
      combined.push(...result.value);
    } else {
      failures++;
    }
  }

  if (failures === results.length) {
    throw new Error('All RSS feeds failed to load. Check network connectivity.');
  }

  return combined.sort((a, b) => {
    const dateA = new Date((a.item.pubDate ?? a.item.isoDate) ?? 0).getTime();
    const dateB = new Date((b.item.pubDate ?? b.item.isoDate) ?? 0).getTime();
    return dateB - dateA;
  });
}

// ── Categorisation ───────────────────────────────────────────────────────────

function categorizeItems(entries: Array<{ item: Parser.Item; source: string }>): NewsItem[] {
  const scored = entries.map((entry) => ({
    ...entry,
    scores: scoreItem(entry.item),
  }));

  // Pick the single best match for each bucket (no duplicates)
  const used = new Set<number>();

  function pickBest(
    predicate: (s: typeof scored[0]) => boolean,
    fallbackIndex: number
  ): (typeof scored)[0] | undefined {
    const candidates = scored
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => !used.has(i) && predicate(s))
      .sort((a, b) => {
        // Sort by descending must-know score, then good-to-know, then date
        const diff =
          b.s.scores.mustKnow - a.s.scores.mustKnow ||
          b.s.scores.goodToKnow - a.s.scores.goodToKnow;
        return diff;
      });

    if (candidates.length > 0) {
      const { s, i } = candidates[0];
      used.add(i);
      return s;
    }
    // Fallback: use position-based
    for (let i = fallbackIndex; i < scored.length; i++) {
      if (!used.has(i)) {
        used.add(i);
        return scored[i];
      }
    }
    return undefined;
  }

  const mustKnowEntry = pickBest((s) => s.scores.mustKnow > 0, 0);
  const goodToKnowEntry = pickBest((s) => s.scores.goodToKnow > 0, 1);
  const generalBsEntry = pickBest(() => true, 2);

  function toNewsItem(entry: (typeof scored)[0] | undefined, category: NewsCategory): NewsItem | null {
    if (!entry) return null;
    const { item, source } = entry;
    const rawSummary = (item.contentSnippet ?? (item as Record<string, unknown>)['summary'] as string | undefined ?? item.title) ?? '';
    return {
      title: item.title ?? 'Untitled',
      summary: makeTldr(rawSummary),
      link: item.link ?? '#',
      pubDate: item.pubDate ?? item.isoDate ?? '',
      source,
      category,
    };
  }

  return [
    toNewsItem(mustKnowEntry, 'must-know'),
    toNewsItem(goodToKnowEntry, 'good-to-know'),
    toNewsItem(generalBsEntry, 'general-bs'),
  ].filter((item): item is NewsItem => item !== null);
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/news/:type', async (req: Request, res: Response) => {
  const { type } = req.params;
  if (type !== 'tech' && type !== 'general') {
    res.status(400).json({ success: false, error: 'Invalid news type. Use "tech" or "general".' });
    return;
  }

  const feeds = type === 'tech' ? TECH_FEEDS : GENERAL_FEEDS;

  try {
    const entries = await fetchFeedItems(feeds);
    const items = categorizeItems(entries);
    const response: ApiResponse = { success: true, items };
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const response: ApiResponse = { success: false, error: `Failed to fetch news: ${message}` };
    res.status(500).json(response);
  }
});

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`RSS News Feed Summary running at http://localhost:${PORT}`);
});

export { app };
