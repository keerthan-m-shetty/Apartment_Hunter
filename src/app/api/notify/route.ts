import { NextResponse } from "next/server";
import { ApifyClient } from "apify-client";

export const dynamic = "force-dynamic";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;

// Your Apify Actor IDs (the actor names used in your schedules)
const IMMOSCOUT_ACTOR_ID = process.env.APIFY_IMMOSCOUT_ACTOR_ID || "fatihtahta/immobilienscout24-scraper";
const IMMOWELT_ACTOR_ID = process.env.APIFY_IMMOWELT_ACTOR_ID || "igolaizola/immowelt-scraper";

// Banned keywords for swap apartments
const BANNED_KEYWORDS = [
  "tauschwohnung",
  "nur tausch",
  "zum tausch",
  "tauschen",
  "tausch",
];

interface ApifyListing {
  id?: string;
  globalId?: string;
  listing_id?: string;
  title?: string;
  name?: string;
  description?: string;
  url?: string;
  price?: number;
  warmRent?: number;
  rooms?: number;
  minRooms?: number;
  address?: string;
  location?: string | Record<string, unknown>;
  mainDescription?: Record<string, string>;
  hardFacts?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  property?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

function isSwapApartment(listing: ApifyListing): boolean {
  const title = listing.title || listing.name || "";
  const description =
    listing.description ||
    listing.mainDescription?.description ||
    listing.mainDescription?.headline ||
    "";
  const text = (title + " " + description).toLowerCase();
  return BANNED_KEYWORDS.some((keyword) => text.includes(keyword));
}

function getListingId(listing: ApifyListing): string | null {
  return (
    listing.id?.toString() ||
    listing.globalId?.toString() ||
    listing.listing_id?.toString() ||
    null
  );
}

function formatTelegramMessage(listing: ApifyListing): string {
  // Extract price (handles different scraper output formats)
  let price: string | number = "N/A";
  if (listing.price) {
    price = listing.price;
  } else if (listing.warmRent) {
    price = listing.warmRent;
  } else if (listing.pricing) {
    const pricingPrice = listing.pricing.price as Record<string, unknown> | undefined;
    if (pricingPrice?.value) price = Number(pricingPrice.value);
  } else if (listing.hardFacts) {
    const hfPrice = listing.hardFacts.price as Record<string, unknown> | undefined;
    if (hfPrice?.value) price = String(hfPrice.value).replace(/[^\d.,]/g, "");
  }

  // Extract rooms
  let rooms: string | number = "N/A";
  if (listing.rooms) {
    rooms = listing.rooms;
  } else if (listing.minRooms) {
    rooms = listing.minRooms;
  } else if (listing.property) {
    const propRooms = (listing.property as Record<string, unknown>).rooms;
    if (propRooms) rooms = Number(propRooms);
  }

  // Extract location
  let location = "N/A";
  if (listing.address) {
    location = listing.address;
  } else if (typeof listing.location === "string") {
    location = listing.location;
  } else if (listing.location && typeof listing.location === "object") {
    const loc = listing.location as Record<string, string>;
    location = [loc.quarter, loc.postal_code, loc.city]
      .filter(Boolean)
      .join(", ");
  }

  // Extract title
  const title =
    listing.title ||
    listing.name ||
    listing.mainDescription?.headline ||
    "New Listing";

  return (
    `🚨 <b>New Apartment Found!</b>\n\n` +
    `🏠 ${title}\n` +
    `💰 Rent: €${price}\n` +
    `🛏 Rooms: ${rooms}\n` +
    `📍 Location: ${location}\n` +
    `🔗 <a href="${listing.url || "#"}">View Listing</a>`
  );
}

async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("Telegram not configured.");
    return false;
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        }),
      }
    );
    return res.ok;
  } catch (error) {
    console.error("Telegram send failed:", error);
    return false;
  }
}

export async function GET(request: Request) {
  // 1. Security: verify cron secret (Vercel sets this automatically for cron jobs)
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!APIFY_API_TOKEN) {
    return NextResponse.json(
      { error: "APIFY_API_TOKEN not configured" },
      { status: 500 }
    );
  }

  const client = new ApifyClient({ token: APIFY_API_TOKEN });

  try {
    // 2. Fetch latest run datasets from both scheduled Apify tasks
    const allListings: ApifyListing[] = [];

    // Fetch latest successful run from each scheduled actor
    try {
      const immoscoutRuns = await client.actor(IMMOSCOUT_ACTOR_ID).runs().list({
        limit: 1,
        status: "SUCCEEDED",
      });
      if (immoscoutRuns.items.length > 0) {
        const { items } = await client
          .dataset(immoscoutRuns.items[0].defaultDatasetId)
          .listItems();
        allListings.push(...(items as ApifyListing[]));
      }
    } catch (e) {
      console.error("Failed to fetch ImmoScout actor data:", e);
    }

    try {
      const immoweltRuns = await client.actor(IMMOWELT_ACTOR_ID).runs().list({
        limit: 1,
        status: "SUCCEEDED",
      });
      if (immoweltRuns.items.length > 0) {
        const { items } = await client
          .dataset(immoweltRuns.items[0].defaultDatasetId)
          .listItems();
        allListings.push(...(items as ApifyListing[]));
      }
    } catch (e) {
      console.error("Failed to fetch Immowelt actor data:", e);
    }

    if (allListings.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No listings found in latest Apify runs",
        newApartments: 0,
      });
    }

    // 3. Get seen IDs from Apify Key-Value Store (persistent memory)
    const store = await client
      .keyValueStores()
      .getOrCreate("apartment-memory");
    const memoryRecord = await client
      .keyValueStore(store.id)
      .getRecord("SEEN_IDS");
    let seenIds: string[] = memoryRecord
      ? (memoryRecord.value as string[])
      : [];

    // 4. Process listings — filter new ones
    const newIdsFound: string[] = [];
    let sentCount = 0;

    for (const listing of allListings) {
      const id = getListingId(listing);
      if (!id) continue;
      if (seenIds.includes(id)) continue;
      if (isSwapApartment(listing)) continue;

      newIdsFound.push(id);

      // 5. Send Telegram notification for each new listing
      const message = formatTelegramMessage(listing);
      const sent = await sendTelegramMessage(message);
      if (sent) sentCount++;

      // Small delay to avoid Telegram rate limits (30 msgs/sec max)
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // 6. Update Apify memory (keep last 1000 IDs)
    let updatedMemory = [...seenIds, ...newIdsFound];
    if (updatedMemory.length > 1000) {
      updatedMemory = updatedMemory.slice(updatedMemory.length - 1000);
    }
    await client
      .keyValueStore(store.id)
      .setRecord({ key: "SEEN_IDS", value: updatedMemory });

    // 7. Send summary if there were new listings
    if (newIdsFound.length > 0) {
      await sendTelegramMessage(
        `✅ Summary: ${newIdsFound.length} new apartment(s) found, ${sentCount} notifications sent.`
      );
    }

    return NextResponse.json({
      success: true,
      newApartments: newIdsFound.length,
      sentNotifications: sentCount,
      totalListingsChecked: allListings.length,
      memorySize: updatedMemory.length,
    });
  } catch (error) {
    console.error("Notify error:", error);

    // Try to alert via Telegram that something went wrong
    await sendTelegramMessage(
      `⚠️ Apartment Hunter error: ${error instanceof Error ? error.message : "Unknown error"}`
    );

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
