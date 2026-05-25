# 🏠 Apartment Hunter — Hamburg Bergedorf

Automated apartment search dashboard for finding affordable rentals in Hamburg-Bergedorf and surrounding areas. Built for a couple looking for apartments under €1000/month.

Scrapes multiple German housing platforms, deduplicates listings, and sends Telegram notifications when new apartments appear.

## Features

- **Multi-source scraping**: ImmoScout24, Immowelt, Kleinanzeigen, WG-Gesucht, SAGA Hamburg
- **Telegram alerts**: Get notified 3x daily when new listings appear
- **New listing badges**: Highlights apartments posted in the last 24 hours
- **Smart filters**: Price slider, district selection, sort by newest/cheapest/largest
- **Swap/sublet filtering**: Automatically excludes Tauschwohnungen, short-term sublets, and attic apartments
- **Hamburg-only**: Filters out listings outside Hamburg using postal codes and district matching
- **Persistent results**: Saves to localStorage so listings survive page refreshes
- **Mobile-friendly**: Responsive grid layout
- **Free hosting**: Deploys to Vercel with cron jobs included

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Vercel (Next.js 16)                            │
├─────────────────────────────────────────────────┤
│  /api/scrape     → Kleinanzeigen, WG-Gesucht   │
│                    + Apify datasets (IS24, IW)  │
│  /api/saga       → SAGA Hamburg HTML scraper    │
│  /api/notify     → Cron: check new → Telegram  │
├─────────────────────────────────────────────────┤
│  Dashboard UI    → React 19, Tailwind CSS       │
└─────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
┌─────────────────┐    ┌──────────────────────┐
│  Apify Console  │    │  Telegram Bot API     │
│  Scheduled runs │    │  Notifications        │
│  (IS24+Immowelt)│    │                      │
└─────────────────┘    └──────────────────────┘
```

## How It Works

1. **Apify Schedules** run the ImmoScout24 and Immowelt scrapers on a schedule you configure in the Apify Console
2. **Vercel cron jobs** (`vercel.json`) hit `/api/notify` 3x daily (8:45, 12:45, 17:45 UTC)
3. The notify endpoint fetches the latest successful actor run datasets, compares against seen IDs (stored in Apify Key-Value Store), and sends Telegram messages for new listings
4. **The dashboard** (`/api/scrape`) also scrapes Kleinanzeigen and WG-Gesucht directly via HTML parsing, plus fetches the Apify datasets for a combined view

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local
# Fill in your keys (see below)

# Run locally
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `APIFY_API_TOKEN` | Yes | Free token from [apify.com](https://console.apify.com/account/integrations) |
| `TELEGRAM_BOT_TOKEN` | Yes | From @BotFather on Telegram |
| `TELEGRAM_CHAT_ID` | Yes | Your chat/group ID (see setup below) |
| `CRON_SECRET` | Auto | Vercel injects this for cron jobs |
| `APIFY_IMMOSCOUT_ACTOR_ID` | No | Defaults to `fatihtahta/immobilienscout24-scraper` |
| `APIFY_IMMOWELT_ACTOR_ID` | No | Defaults to `igolaizola/immowelt-scraper` |

## Apify Setup

1. Create a free account at [apify.com](https://apify.com) (free tier: $5/month compute)
2. Go to **Schedules** → Create a new schedule
3. Add these actors to the schedule with your custom search JSON:
   - `fatihtahta/immobilienscout24-scraper`
   - `igolaizola/immowelt-scraper`
4. Set the schedule frequency (e.g., every 6-8 hours)
5. Get your API token from **Settings → Integrations**

## Telegram Bot Setup

1. Message [@BotFather](https://t.me/BotFather) on Telegram → `/newbot` → get the token
2. Start a chat with your bot (send "hi")
3. For a group chat: add the bot to the group, send a message, then visit:
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Find your `chat_id` in the response (negative number for groups)

## Deploy to Vercel

1. Push this repo to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Add environment variables: `APIFY_API_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
4. Deploy — cron jobs start automatically

## Search Criteria

- **Area**: Bergedorf, Lohbrügge, Nettelnburg, Allermöhe, Neuallermöhe, Billwerder, Curslack, Billstedt, Horn, Hamm, Rothenburgsort, Moorfleet + more
- **Price**: Up to €1000/month (adjustable via slider)
- **Rooms**: 1.5–3 (suitable for a couple)
- **Excluded**: Swap apartments, short-term sublets, attic apartments (Dachgeschoss)

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Scraping**: Apify (ImmoScout24, Immowelt) + direct HTML parsing (Kleinanzeigen, WG-Gesucht, SAGA)
- **Notifications**: Telegram Bot API
- **Hosting**: Vercel (free tier with cron)
- **State**: Apify Key-Value Store (seen IDs), localStorage (dashboard cache)
