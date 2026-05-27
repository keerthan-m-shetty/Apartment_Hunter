# 🏠 Apartment Hunter - Hamburg Bergedorf

Automated apartment search system for finding affordable rentals in Hamburg-Bergedorf. Scrapes multiple German housing platforms, deduplicates listings, and sends Telegram notifications when new apartments appear.

Built for a couple looking for apartments under €850/month in the Bergedorf area.

## Features

- **Multi-source scraping**: ImmoScout24, Immowelt, Kleinanzeigen, WG-Gesucht, SAGA Hamburg
- **Telegram alerts**: Instant notifications when new listings appear (multiple times per day)
- **Smart filtering**: Automatically excludes swap apartments, short-term sublets, senior housing, furnished short-stays, and attic apartments
- **Date-range detection**: Regex-based filtering catches "vom X bis Y" and "DD.MM-DD.MM" patterns in titles
- **Deduplication**: Apify Key-Value Store tracks seen listing IDs so you never get the same notification twice
- **Bergedorf-focused**: All sources narrowed to Bergedorf district
- **Dashboard UI**: Responsive grid with price slider, district filters, sort options, and "new" badges
- **Free hosting**: Vercel (app) + Apify (scraping/storage) + cron-job.org (scheduling)

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Vercel (Next.js 16)                                         │
├──────────────────────────────────────────────────────────────┤
│  /api/scrape        → Dashboard: live scrape + Apify data    │
│  /api/saga          → Dashboard: SAGA Hamburg scraper         │
│  /api/notify        → POST: Apify webhook → Telegram alerts  │
│  /api/notify-scrape → GET: cron → scrape KA/WG/SAGA → alerts │
├──────────────────────────────────────────────────────────────┤
│  Dashboard UI       → React 19, Tailwind CSS 4               │
└──────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────────┐
│ Apify Console  │  │ cron-job.org   │  │ Telegram Bot API   │
│ Scheduled runs │  │ Triggers       │  │ Notifications      │
│ IS24 + Immowelt│  │ /notify-scrape │  │                    │
│ Key-Value Store│  │ every 30 min   │  │                    │
│ (SEEN_IDS)     │  │                │  │                    │
└────────────────┘  └────────────────┘  └────────────────────┘
```

## How It Works

### Apify Actors (ImmoScout24 + Immowelt)
1. Apify schedules run the scraper actors at configured intervals
2. When a run succeeds, Apify sends a **webhook** (POST) to `/api/notify?secret=...`
3. The endpoint reads the dataset directly from the webhook payload
4. Compares listing IDs against `SEEN_IDS` in Apify Key-Value Store
5. Sends Telegram messages for new listings only
6. Updates `SEEN_IDS` to prevent future duplicates

### Direct Scraping (Kleinanzeigen, WG-Gesucht, SAGA)
1. **cron-job.org** hits `/api/notify-scrape?secret=...` on a schedule
2. The endpoint scrapes all three platforms via HTML parsing
3. Same deduplication logic via Apify Key-Value Store
4. Sends Telegram alerts for new listings

## Schedules

| Source | Actor/Method | Schedule (UTC) | Results/run |
|--------|-------------|----------------|-------------|
| ImmoScout24 | `fatihtahta/immobilienscout24-scraper` | `0 9-12,14-17 * * *` (8x/day) | 9 |
| Immowelt | `igolaizola/immowelt-scraper` | `0 8-18/2 * * *` (6x/day) | 15 |
| Kleinanzeigen + WG-Gesucht + SAGA | cron-job.org → `/api/notify-scrape` | Every 30 min | All available |

## Apify Actor Inputs

### ImmoScout24 (`fatihtahta/immobilienscout24-scraper`)
```json
{
  "start_url": ["https://www.immobilienscout24.de/Suche/de/hamburg/hamburg/bergedorf/wohnung-mieten?numberofrooms=1.5-3.0&price=300.0-850.0&exclusioncriteria=swapflat&pricetype=rentpermonth&sorting=2"],
  "limit": 9,
  "enrich_data": false
}
```

### Immowelt (`igolaizola/immowelt-scraper`)
```json
{
  "availableFromIsLooseMode": false,
  "commissionFree": false,
  "estateType": "apartment",
  "fetchDetails": false,
  "isSaleGoodwill": false,
  "location": "Hamburg Bergedorf",
  "matchAnyKeyword": false,
  "maxItems": 15,
  "maxPrice": 850,
  "maxRooms": 3,
  "minPrice": 300,
  "minRooms": 1,
  "operation": "rent",
  "order": "datedesc",
  "preferredWarmRent": false,
  "projectTypes": ["stock", "resale", "new_build"]
}
```

## Quick Start

```bash
npm install
cp .env.local.example .env.local
# Fill in your keys (see below)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `APIFY_API_TOKEN` | Yes | From [apify.com](https://console.apify.com/account/integrations) |
| `TELEGRAM_BOT_TOKEN` | Yes | From @BotFather on Telegram |
| `TELEGRAM_CHAT_ID` | Yes | Your chat/group ID |
| `WEBHOOK_SECRET` | Yes | Any random string for authenticating webhook/cron calls |

## Setup Guide

### 1. Apify
1. Create account at [apify.com](https://apify.com) (free tier: $5/month)
2. Create two schedules with the actor inputs above
3. Add webhook on each actor: `https://your-app.vercel.app/api/notify?secret=YOUR_SECRET`
4. Get API token from Settings → Integrations

### 2. Telegram Bot
1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → get token
2. Start chat with your bot (send "hi")
3. For groups: add bot, send message, visit `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Find `chat_id` (negative number for groups)

### 3. cron-job.org
1. Create account at [cron-job.org](https://cron-job.org)
2. Create cronjob with URL: `https://your-app.vercel.app/api/notify-scrape?secret=YOUR_SECRET`
3. Set schedule (e.g., every 30 minutes during business hours)

### 4. Vercel
1. Push repo to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Add env vars: `APIFY_API_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `WEBHOOK_SECRET`
4. Deploy

## Filtering Logic

Listings are excluded if they contain:
- **Swap**: tausch, tauschwohnung, nur tausch, zum tausch
- **Short-term**: befristet, zwischenmiete, untermiete, kurzfristig, möbliert auf zeit, wohnen auf zeit
- **Senior**: seniorenwohnung, senioren
- **Attic**: dachgeschoss
- **Date ranges**: "vom DD.MM bis DD.MM", "DD.MM-DD.MM" patterns
- **End dates**: "frei bis", "available until"

## Search Criteria

- **Area**: Hamburg-Bergedorf (Bezirk)
- **Price**: €300–€850/month
- **Rooms**: 1–3
- **Excluded**: Swap, short-term, senior, attic, flatsharing

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Scraping**: Apify actors (IS24, Immowelt) + direct HTML parsing (Kleinanzeigen, WG-Gesucht, SAGA)
- **Notifications**: Telegram Bot API
- **Scheduling**: Apify Schedules + cron-job.org
- **Storage**: Apify Key-Value Store (seen IDs), localStorage (dashboard cache)
- **Hosting**: Vercel (free tier)
