# rss-newsfeed-summary

Copilot assisted build using major Tech and Political news RSS feeds

## Overview

A TypeScript/Node.js application that aggregates RSS feeds from major Tech and General News sources, categorises the top stories, and presents them in a clean single-page interface — no frontend frameworks required.

### News categories

| Badge | Category | Description |
|-------|----------|-------------|
| 🔴 **Must Know** | High-urgency news | Security breaches, crises, breaking news |
| 🟡 **Good to Know** | Worth reading | Product launches, research, updates |
| 🟢 **General BS** | Lighter reads | Opinion, guides, miscellaneous |

### RSS Feeds

**Tech**
- [The Hacker News](https://feeds.feedburner.com/TheHackersNews)
- [TechCrunch](https://techcrunch.com/feed/)
- [Hackaday](https://hackaday.com/blog/feed/)
- [O'Reilly Radar](https://feeds.feedburner.com/oreilly/radar/atom)

**General News**
- [BBC World](https://feeds.bbci.co.uk/news/world/rss.xml)
- [CNN Top Stories](https://rss.cnn.com/rss/cnn_topstories.rss)
- [Yle News](https://yle.fi/rss/news)
- [Helsinki Times](https://www.helsinkitimes.fi/?format=feed)
- [Daily Finland](https://dailyfinland.fi/feed/latest-rss.xml)

## Getting Started

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev       # development (ts-node)
# or
npm run build && npm start   # production
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech Stack

- **Backend:** Node.js + Express + TypeScript
- **RSS parsing:** `rss-parser`
- **Frontend:** Vanilla HTML + CSS + JavaScript (no frameworks)
