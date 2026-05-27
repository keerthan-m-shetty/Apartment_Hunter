import { NextResponse } from "next/server";
import { ApifyClient } from "apify-client";
import { Apartment } from "../../types";

export const dynamic = "force-dynamic";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

const MAX_PRICE = 850;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
};

const BANNED_KEYWORDS = [
  "tauschwohnung",
  "nur tausch",
  "zum tausch",
  "tauschen",
  "tausch",
  "seniorenwohnung",
  "senioren",
  "dachgeschoss",
  "befristet",
  "zwischenmiete",
  "untermiete",
];

// ============ HELPERS ============
function isHamburgAddress(address: string): boolean {
  if (!address) return false;
  const lower = address.toLowerCase();
  if (lower.includes("hamburg")) return true;
  const plzMatch = address.match(/\b(2[012]\d{3})\b/);
  if (plzMatch) return true;
  const hamburgDistricts = [
    "bergedorf", "lohbrügge", "nettelnburg", "allermöhe", "billwerder",
    "billstedt", "horn", "hamm", "wandsbek", "barmbek", "eimsbüttel",
    "altona", "harburg", "wilhelmsburg", "ottensen", "winterhude",
    "eppendorf", "uhlenhorst", "rotherbaum", "neustadt", "st. georg",
    "st. pauli", "sternschanze", "borgfelde", "eilbek", "marienthal",
    "jenfeld", "rahlstedt", "farmsen", "bramfeld", "steilshoop",
    "langenhorn", "fuhlsbüttel", "ohlsdorf", "alsterdorf", "lokstedt",
    "niendorf", "schnelsen", "stellingen", "bahrenfeld", "lurup",
    "osdorf", "blankenese", "rissen", "finkenwerder", "moorburg",
    "neugraben", "hausbruch", "heimfeld", "veddel", "rothenburgsort",
    "moorfleet", "tatenberg", "spadenland", "ochsenwerder", "kirchwerder",
    "neuengamme", "altengamme", "curslack", "reitbrook",
  ];
  return hamburgDistricts.some((d) => lower.includes(d));
}

function extractDistrict(address: string): string {
  const districts = [
    "Bergedorf", "Lohbrügge", "Nettelnburg", "Allermöhe", "Neuallermöhe",
    "Billwerder", "Curslack", "Billstedt", "Horn", "Hamm",
    "Rothenburgsort", "Moorfleet", "Wandsbek", "Barmbek", "Eimsbüttel",
    "Altona", "Harburg", "Wilhelmsburg", "Ottensen", "St. Georg",
    "Winterhude", "Eppendorf", "Uhlenhorst", "Eilbek", "Bahrenfeld",
    "Moorburg", "Kirchwerder", "Bramfeld", "Farmsen", "Rahlstedt",
  ];
  for (const d of districts) {
    if (address.toLowerCase().includes(d.toLowerCase())) {
      return d;
    }
  }
  return "Hamburg";
}

function isBanned(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_KEYWORDS.some((kw) => lower.includes(kw));
}

// ============ KLEINANZEIGEN ============
async function scrapeKleinanzeigen(): Promise<Apartment[]> {
  try {
    const urls = [
      `https://www.kleinanzeigen.de/s-wohnung-mieten/hamburg/anzeige:angebote/preis::${MAX_PRICE}/c203l9409+wohnung_mieten.zimmer_d:1.5,3.0`,
      `https://www.kleinanzeigen.de/s-wohnung-mieten/bergedorf/anzeige:angebote/preis::${MAX_PRICE}/c203l17929+wohnung_mieten.zimmer_d:1.5,3.0`,
    ];

    const allApartments: Apartment[] = [];

    for (const url of urls) {
      try {
        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) continue;
        const html = await res.text();
        const parsed = parseKleinanzeigenHTML(html);
        allApartments.push(...parsed);
      } catch {
        continue;
      }
    }

    const seen = new Set<string>();
    return allApartments.filter((apt) => {
      if (seen.has(apt.id)) return false;
      seen.add(apt.id);
      return true;
    });
  } catch (error) {
    console.error("Kleinanzeigen scrape failed:", error);
    return [];
  }
}

function parseKleinanzeigenHTML(html: string): Apartment[] {
  const apartments: Apartment[] = [];
  const pattern =
    /<article\s+class="aditem"\s+data-adid="(\d+)"\s+data-href="([^"]+)">([\s\S]*?)<\/article>/g;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    const id = match[1];
    const href = match[2];
    const card = match[3];

    let title = "";
    let imageUrl: string | undefined;
    const jsonLdMatch = card.match(
      /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/
    );
    if (jsonLdMatch) {
      try {
        const ld = JSON.parse(jsonLdMatch[1]);
        title = ld.title || "";
        imageUrl = ld.contentUrl || undefined;
      } catch { /* skip */ }
    }
    if (!title) {
      const titleMatch = card.match(/class="[^"]*ellipsis[^"]*"[^>]*>([^<]+)/);
      title = titleMatch ? titleMatch[1].trim() : "";
    }

    const priceMatch = card.match(
      /class="aditem-main--middle--price-shipping--price[^"]*"[^>]*>\s*([\s\S]*?)\s*<\//
    );
    let price = 0;
    if (priceMatch) {
      const priceText = priceMatch[1].replace(/<[^>]*>/g, "").trim();
      const numMatch = priceText.match(/([\d.]+),?(\d{0,2})/);
      if (numMatch) {
        price = parseFloat(numMatch[1].replace(".", "") + (numMatch[2] ? "." + numMatch[2] : ""));
      }
    }

    const locationMatch = card.match(/class="aditem-main--top--left"[^>]*>([\s\S]*?)<\/div>/);
    const location = locationMatch ? locationMatch[1].replace(/<[^>]*>/g, "").trim() : "";

    const descMatch = card.match(/class="aditem-main--middle--description"[^>]*>([\s\S]*?)<\/p>/);
    const desc = descMatch ? descMatch[1].replace(/<[^>]*>/g, "").trim() : "";

    const sizeMatch = (desc + " " + title).match(/(\d+)\s*m[²2]/);
    const roomsMatch = (desc + " " + title).match(/([\d,]+)\s*Zimmer|([\d,]+)\s*Zi\.?|([\d,]+)-Zimmer/i);
    const size = sizeMatch ? parseFloat(sizeMatch[1]) : 0;
    const rooms = roomsMatch ? parseFloat((roomsMatch[1] || roomsMatch[2] || roomsMatch[3]).replace(",", ".")) : 0;

    const inHamburg = isHamburgAddress(location);

    if (title && price > 0 && price <= MAX_PRICE && !isBanned(title + " " + desc) && inHamburg) {
      apartments.push({
        id: `ka-${id}`,
        title: title.trim(),
        price,
        size,
        rooms,
        address: location,
        district: extractDistrict(location),
        url: `https://www.kleinanzeigen.de${href}`,
        source: "Kleinanzeigen",
        imageUrl,
        description: desc.substring(0, 200) || undefined,
        firstSeen: new Date().toISOString(),
      });
    }
  }

  return apartments;
}

// ============ WG-GESUCHT ============
async function scrapeWgGesucht(): Promise<Apartment[]> {
  try {
    const url =
      `https://www.wg-gesucht.de/wohnungen-in-Hamburg.55.2.1.0.html?offer_filter=1&city_id=55&noDe498=1&categories%5B%5D=2&rent_types%5B%5D=0&sMin=40&rMax=${MAX_PRICE}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return [];
    const html = await res.text();
    return parseWgGesuchtHTML(html);
  } catch (error) {
    console.error("WG-Gesucht scrape failed:", error);
    return [];
  }
}

function parseWgGesuchtHTML(html: string): Apartment[] {
  const apartments: Apartment[] = [];

  const cardPattern = /<div[^>]*class="[^"]*offer_list_item[^"]*"[^>]*data-id="(\d+)"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*offer_list_item[^"]*"|<div class="pagination_panel")/g;
  let match;

  while ((match = cardPattern.exec(html)) !== null) {
    const id = match[1];
    const card = match[2];

    const titleMatch = card.match(/title="Anzeige ansehen:\s*([^"]+)"/);
    const title = titleMatch ? titleMatch[1].trim() : "";

    const linkMatch = card.match(/href="(\/wohnungen-in-[^"]+\.html)"/);
    const link = linkMatch ? linkMatch[1] : "";

    const priceMatch = card.match(/<b>\s*([\d.]+)\s*(?:&euro;|€)\s*<\/b>/);
    const price = priceMatch ? parseFloat(priceMatch[1].replace(".", "")) : 0;

    const sizeMatch = card.match(/(\d+)\s*(?:m²|m&sup2;)/);
    const size = sizeMatch ? parseFloat(sizeMatch[1]) : 0;

    const roomsMatch = (title + " " + card).match(/(\d+)[.,]?(\d?)\s*-?\s*Zimmer/i);
    const rooms = roomsMatch ? parseFloat(roomsMatch[1] + (roomsMatch[2] ? "." + roomsMatch[2] : "")) : 0;

    const districtMatch = link.match(/Hamburg-([^.]+)\./);
    const district = districtMatch ? districtMatch[1].replace(/-/g, " ") : "Hamburg";

    const addressMatch = card.match(/col-xs-11[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/);
    const address = addressMatch
      ? addressMatch[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
      : `Hamburg ${district}`;

    const isShortTerm = title.toLowerCase().includes("befristet") || title.toLowerCase().includes("zwischenmiete") || title.toLowerCase().includes("untermiete");

    if (title && price > 0 && price <= MAX_PRICE && !isBanned(title) && !isShortTerm) {
      apartments.push({
        id: `wg-${id}`,
        title,
        price,
        size,
        rooms,
        address,
        district: extractDistrict(district + " " + address),
        url: `https://www.wg-gesucht.de${link}`,
        source: "WG-Gesucht",
        firstSeen: new Date().toISOString(),
      });
    }
  }

  return apartments;
}

// ============ SAGA ============
async function scrapeSaga(): Promise<Apartment[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(
      "https://www.saga.hamburg/immobiliensuche?type=wohnung&city=hamburg&district=bergedorf&rooms_from=1.5&rooms_to=3&rent_to=" + MAX_PRICE,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);
    if (!response.ok) return [];

    const html = await response.text();
    const apartments: Apartment[] = [];

    const listingPattern = /<article[^>]*class="[^"]*immo-card[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
    let match;

    while ((match = listingPattern.exec(html)) !== null) {
      const card = match[1];

      const titleMatch = card.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
      const priceMatch = card.match(/(\d+[.,]?\d*)\s*€/);
      const roomsMatch = card.match(/(\d+[.,]?\d*)\s*Zimmer/i);
      const sizeMatch = card.match(/(\d+[.,]?\d*)\s*m²/);
      const addressMatch = card.match(/<[^>]*class="[^"]*address[^"]*"[^>]*>([\s\S]*?)<\//i);
      const linkMatch = card.match(/href="([^"]*immobiliensuche[^"]*)"/i);

      const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : "SAGA Wohnung";
      const price = priceMatch ? parseFloat(priceMatch[1].replace(",", ".")) : 0;

      if ((titleMatch || priceMatch) && price <= MAX_PRICE && !isBanned(title)) {
        apartments.push({
          id: `saga-${apartments.length}-${Date.now()}`,
          title,
          price,
          size: sizeMatch ? parseFloat(sizeMatch[1].replace(",", ".")) : 0,
          rooms: roomsMatch ? parseFloat(roomsMatch[1].replace(",", ".")) : 2,
          address: addressMatch ? addressMatch[1].replace(/<[^>]*>/g, "").trim() : "Hamburg Bergedorf",
          district: "Bergedorf",
          url: linkMatch ? `https://www.saga.hamburg${linkMatch[1]}` : "https://www.saga.hamburg/immobiliensuche",
          source: "SAGA",
          firstSeen: new Date().toISOString(),
        });
      }
    }

    return apartments;
  } catch (error) {
    console.error("SAGA scrape failed:", error);
    return [];
  }
}

// ============ TELEGRAM ============
function formatTelegramMessage(apt: Apartment): string {
  return (
    `🚨 <b>New Apartment Found!</b>\n\n` +
    `🏠 ${apt.title}\n` +
    `💰 Rent: €${apt.price}\n` +
    `📐 Size: ${apt.size > 0 ? apt.size + "m²" : "N/A"}\n` +
    `🛏 Rooms: ${apt.rooms > 0 ? apt.rooms : "N/A"}\n` +
    `📍 ${apt.address || apt.district}\n` +
    `📦 Source: ${apt.source}\n` +
    `🔗 <a href="${apt.url}">View Listing</a>`
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

// ============ ROUTE HANDLER ============
export async function GET(request: Request) {
  // Verify secret
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Scrape all free sources in parallel
    const [kleinanzeigen, wgGesucht, saga] = await Promise.all([
      scrapeKleinanzeigen(),
      scrapeWgGesucht(),
      scrapeSaga(),
    ]);

    const allApartments = [...kleinanzeigen, ...wgGesucht, ...saga];

    // Deduplicate
    const seen = new Set<string>();
    const unique = allApartments.filter((apt) => {
      const key = `${apt.title.slice(0, 30).toLowerCase()}-${apt.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (unique.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No listings found from scraping",
        newApartments: 0,
      });
    }

    // Get seen IDs from Apify Key-Value Store
    if (!APIFY_API_TOKEN) {
      return NextResponse.json(
        { error: "APIFY_API_TOKEN needed for memory store" },
        { status: 500 }
      );
    }

    const client = new ApifyClient({ token: APIFY_API_TOKEN });
    const store = await client.keyValueStores().getOrCreate("apartment-memory");
    const memoryRecord = await client.keyValueStore(store.id).getRecord("SEEN_IDS");
    const seenIds: string[] = memoryRecord ? (memoryRecord.value as string[]) : [];

    // Filter to only new listings
    const newListings = unique.filter((apt) => !seenIds.includes(apt.id));

    if (newListings.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All listings already seen",
        totalScraped: unique.length,
        newApartments: 0,
      });
    }

    // Send Telegram notifications
    let sentCount = 0;
    for (const apt of newListings) {
      const message = formatTelegramMessage(apt);
      const sent = await sendTelegramMessage(message);
      if (sent) sentCount++;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Update memory
    const newIds = newListings.map((apt) => apt.id);
    let updatedMemory = [...seenIds, ...newIds];
    if (updatedMemory.length > 1000) {
      updatedMemory = updatedMemory.slice(updatedMemory.length - 1000);
    }
    await client.keyValueStore(store.id).setRecord({ key: "SEEN_IDS", value: updatedMemory });

    // Summary
    if (newListings.length > 0) {
      const sources = [
        kleinanzeigen.length > 0 ? `KA:${kleinanzeigen.length}` : null,
        wgGesucht.length > 0 ? `WG:${wgGesucht.length}` : null,
        saga.length > 0 ? `SAGA:${saga.length}` : null,
      ].filter(Boolean).join(", ");

      await sendTelegramMessage(
        `✅ Scrape summary: ${newListings.length} new from ${sources}. ${sentCount} notifications sent.`
      );
    }

    return NextResponse.json({
      success: true,
      totalScraped: unique.length,
      newApartments: newListings.length,
      sentNotifications: sentCount,
      sources: {
        kleinanzeigen: kleinanzeigen.length,
        wgGesucht: wgGesucht.length,
        saga: saga.length,
      },
    });
  } catch (error) {
    console.error("Notify-scrape error:", error);

    await sendTelegramMessage(
      `⚠️ Scrape notify error: ${error instanceof Error ? error.message : "Unknown error"}`
    );

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
