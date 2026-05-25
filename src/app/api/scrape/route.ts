import { NextResponse } from "next/server";
import { ApifyClient } from "apify-client";
import { Apartment } from "../../types";

const apifyClient = process.env.APIFY_API_TOKEN
  ? new ApifyClient({ token: process.env.APIFY_API_TOKEN })
  : null;

// Cache last successful results per source (survives across requests in dev/serverless warm starts)
const cache: Record<string, { apartments: Apartment[]; timestamp: string }> = {};

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
};

// Valid Hamburg postal codes start with 20, 21, or 22
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

// ============ KLEINANZEIGEN ============
async function scrapeKleinanzeigen(): Promise<Apartment[]> {
  try {
    const urls = [
      "https://www.kleinanzeigen.de/s-wohnung-mieten/hamburg/anzeige:angebote/preis::1000/c203l9409+wohnung_mieten.zimmer_d:1.5,3.0",
      "https://www.kleinanzeigen.de/s-wohnung-mieten/bergedorf/anzeige:angebote/preis::1000/c203l17929+wohnung_mieten.zimmer_d:1.5,3.0",
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
      const titleMatch = card.match(/class="[^"]*ellipsis[^"]*"[^>]*>([^<]+)</);
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

    const lowerTitle = title.toLowerCase();
    const lowerDesc = desc.toLowerCase();
    const isSwap = lowerTitle.includes("tausch") || lowerDesc.includes("tauschwohnung") || lowerTitle.includes("suche ") || lowerTitle.includes("sucht ");
    const isDachgeschoss = lowerTitle.includes("dachgeschoss") || lowerDesc.includes("dachgeschoss");
    const isShortTerm = lowerTitle.includes("befristet") || lowerTitle.includes("zwischenmiete") || lowerDesc.includes("frei bis") || lowerDesc.includes("available until") || lowerTitle.includes("untermiete");
    const inHamburg = isHamburgAddress(location);

    if (title && price > 0 && !isSwap && !isDachgeschoss && !isShortTerm && inHamburg) {
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
      "https://www.wg-gesucht.de/wohnungen-in-Hamburg.55.2.1.0.html?offer_filter=1&city_id=55&noDe498=1&categories%5B%5D=2&rent_types%5B%5D=0&sMin=40&rMax=1000";
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

  // Split by offer_list_item cards
  const cardPattern = /<div[^>]*class="[^"]*offer_list_item[^"]*"[^>]*data-id="(\d+)"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*offer_list_item[^"]*"|<div class="pagination_panel")/g;
  let match;

  while ((match = cardPattern.exec(html)) !== null) {
    const id = match[1];
    const card = match[2];

    // Title and link
    const titleMatch = card.match(/title="Anzeige ansehen:\s*([^"]+)"/);
    const title = titleMatch ? titleMatch[1].trim() : "";

    const linkMatch = card.match(/href="(\/wohnungen-in-[^"]+\.html)"/);
    const link = linkMatch ? linkMatch[1] : "";

    // Price: <b>930 &euro;</b> or <b>930 €</b>
    const priceMatch = card.match(/<b>\s*([\d.]+)\s*(?:&euro;|€)\s*<\/b>/);
    const price = priceMatch ? parseFloat(priceMatch[1].replace(".", "")) : 0;

    // Size: look for m² pattern
    const sizeMatch = card.match(/(\d+)\s*(?:m²|m&sup2;)/);
    const size = sizeMatch ? parseFloat(sizeMatch[1]) : 0;

    // Rooms from title or card text
    const roomsMatch = (title + " " + card).match(/(\d+)[.,]?(\d?)\s*-?\s*Zimmer/i);
    const rooms = roomsMatch ? parseFloat(roomsMatch[1] + (roomsMatch[2] ? "." + roomsMatch[2] : "")) : 0;

    // District from URL: /wohnungen-in-Hamburg-DISTRICT.ID.html
    const districtMatch = link.match(/Hamburg-([^.]+)\./);
    const district = districtMatch ? districtMatch[1].replace(/-/g, " ") : "Hamburg";

    // Address from card content
    const addressMatch = card.match(/col-xs-11[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/);
    const address = addressMatch
      ? addressMatch[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
      : `Hamburg ${district}`;

    // Filter: skip sublets/tausch/short-term, must have price
    const lowerTitle = title.toLowerCase();
    const lowerCard = card.toLowerCase();
    const isSwap = lowerTitle.includes("tausch");
    const isShortTerm = lowerTitle.includes("befristet") || lowerTitle.includes("zwischenmiete") || lowerTitle.includes("untermiete") || lowerCard.includes("frei bis") || lowerCard.includes("available until");

    // Available from date - look for date patterns in the card
    const availMatch = card.match(/frei ab[:\s]*([\d.]+)/i) || card.match(/(\d{2}\.\d{2}\.\d{4})/);
    const availableFrom = availMatch ? availMatch[1] : undefined;

    if (title && price > 0 && price <= 1000 && !isSwap && !isShortTerm) {
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
        availableFrom,
        firstSeen: new Date().toISOString(),
      });
    }
  }

  return apartments;
}

// ============ HELPERS ============
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

// ============ IMMOSCOUT24 (Apify - fetch latest dataset) ============
async function scrapeImmoScout(): Promise<Apartment[]> {
  if (!apifyClient) return [];
  try {
    // Fetch the latest successful run's dataset (actor scheduled in Apify Console)
    const runs = await apifyClient.actor("fatihtahta/immobilienscout24-scraper").runs().list({
      limit: 1,
      status: "SUCCEEDED",
    });

    if (runs.items.length === 0) return cache["immoscout24"]?.apartments || [];

    const latestRun = runs.items[0];
    const { items: is24Items } = await apifyClient.dataset(latestRun.defaultDatasetId).listItems();

    if (is24Items.length === 0) return cache["immoscout24"]?.apartments || [];
    if (is24Items.length === 1 && (is24Items[0] as Record<string, unknown>).message) {
      return cache["immoscout24"]?.apartments || [];
    }

    const results: Apartment[] = [];
    for (const item of is24Items as Record<string, unknown>[]) {
      const title = String(item.title || "").trim();
      if (!title) continue;
      const lowerTitle = title.toLowerCase();
      if (lowerTitle.includes("tausch") || lowerTitle.includes("dachgeschoss") || lowerTitle.includes("befristet") || lowerTitle.includes("zwischenmiete") || lowerTitle.includes("untermiete")) continue;

      const pricing = item.pricing as Record<string, unknown> | undefined;
      const priceObj = pricing?.price as Record<string, unknown> | undefined;
      const price = Number(priceObj?.value || 0);
      if (price <= 0 || price > 1000) continue;

      const property = item.property as Record<string, unknown> | undefined;
      const size = Number(property?.living_space || 0);
      const rooms = Number(property?.rooms || 0);

      const location = item.location as Record<string, unknown> | undefined;
      const quarter = String(location?.quarter || "");
      const city = String(location?.city || "Hamburg");
      const postcode = String(location?.postal_code || "");
      const address = `${quarter}, ${postcode} ${city}`.trim();

      const media = item.media as Record<string, unknown> | undefined;
      const images = (media?.images || []) as Array<Record<string, unknown>>;
      const imageUrl = images.length > 0 ? String(images[0].url || "").replace("%WIDTH%", "400").replace("%HEIGHT%", "300") : undefined;

      const url = String(item.url || `https://www.immobilienscout24.de/expose/${item.listing_id}`);
      const listingDates = item.listing_dates as Record<string, string> | undefined;
      const postedDate = listingDates?.published || listingDates?.created || undefined;
      const details = item.details as Record<string, unknown> | undefined;
      const availableFrom = String(details?.available_from || details?.availableFrom || "") || undefined;

      results.push({
        id: `is24-${item.listing_id || Math.random().toString(36).slice(2)}`,
        title,
        price,
        size,
        rooms,
        address,
        district: extractDistrict(quarter || address),
        url,
        source: "ImmoScout24",
        imageUrl,
        availableFrom: availableFrom || undefined,
        postedAt: postedDate ? new Date(postedDate).toLocaleDateString("de-DE") : undefined,
        firstSeen: postedDate || new Date().toISOString(),
      });
    }

    if (results.length > 0) {
      cache["immoscout24"] = { apartments: results, timestamp: new Date().toISOString() };
    }
    return results;
  } catch (error) {
    console.error("ImmoScout24 fetch failed:", error);
    return cache["immoscout24"]?.apartments || [];
  }
}

// ============ IMMOWELT (Apify - fetch latest dataset) ============
async function scrapeImmowelt(): Promise<Apartment[]> {
  if (!apifyClient) return [];
  try {
    // Fetch the latest successful run's dataset (actor scheduled in Apify Console)
    const runs = await apifyClient.actor("igolaizola/immowelt-scraper").runs().list({
      limit: 1,
      status: "SUCCEEDED",
    });

    if (runs.items.length === 0) return cache["immowelt"]?.apartments || [];

    const latestRun = runs.items[0];
    const { items } = await apifyClient.dataset(latestRun.defaultDatasetId).listItems();

    if (items.length === 0) return cache["immowelt"]?.apartments || [];

    const results: Apartment[] = [];
    for (const item of items as Record<string, unknown>[]) {
      const mainDesc = item.mainDescription as Record<string, unknown> | undefined;
      const metadata = item.metadata as Record<string, unknown> | undefined;
      const title = String(mainDesc?.headline || item.title || item.name || "").trim();
      const lowerTitle = title.toLowerCase();
      if (!title) continue;
      if (lowerTitle.includes("tausch") || lowerTitle.includes("dachgeschoss") || lowerTitle.includes("befristet") || lowerTitle.includes("zwischenmiete") || lowerTitle.includes("untermiete")) continue;

      const hardFacts = item.hardFacts as Record<string, unknown> | undefined;
      const priceObj = hardFacts?.price as Record<string, unknown> | undefined;
      const priceStr = String(priceObj?.value || priceObj?.formatted || item.price || "0");
      const price = parseFloat(priceStr.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
      if (price <= 0 || price > 1000) continue;

      const facts = (hardFacts?.facts || []) as Array<Record<string, string>>;
      const roomsFact = facts.find((f) => f.type === "numberOfRooms");
      const sizeFact = facts.find((f) => f.type === "livingSpace");
      const availFact = facts.find((f) => f.type === "availability");
      const rooms = roomsFact ? parseFloat(roomsFact.splitValue.replace(",", ".")) : 0;
      const size = sizeFact ? parseFloat(sizeFact.splitValue.replace(",", ".")) : 0;
      const availableFrom = availFact?.value || undefined;

      const loc = item.location as Record<string, unknown> | undefined;
      const addr = loc?.address as Record<string, string> | undefined;
      const address = addr
        ? `${addr.street || ""} ${addr.zipCode || ""} ${addr.city || "Hamburg"} ${addr.district || ""}`.trim()
        : "Hamburg Bergedorf";
      const district = addr?.district || "Bergedorf";

      results.push({
        id: `iw-${item.id || Math.random().toString(36).slice(2)}`,
        title,
        price,
        size,
        rooms,
        address,
        district: extractDistrict(district + " " + address),
        url: String(item.url || "https://www.immowelt.de"),
        source: "Immowelt",
        imageUrl: String(item._image || "") || undefined,
        description: String(mainDesc?.description || "").substring(0, 200) || undefined,
        availableFrom: availableFrom || undefined,
        postedAt: metadata?.creationDate
          ? new Date(String(metadata.creationDate)).toLocaleDateString("de-DE")
          : undefined,
        firstSeen: metadata?.creationDate ? String(metadata.creationDate) : new Date().toISOString(),
      });
    }

    if (results.length > 0) {
      cache["immowelt"] = { apartments: results, timestamp: new Date().toISOString() };
    }
    return results;
  } catch (error) {
    console.error("Immowelt fetch failed:", error);
    return cache["immowelt"]?.apartments || [];
  }
}

// ============ ROUTE HANDLER ============
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  void searchParams; // unused now

  // Scrape all sources
  // Free scrapers run in parallel, Apify actors run sequentially (memory limit)
  try {
    const [kleinanzeigen, wgGesucht] = await Promise.all([
      scrapeKleinanzeigen(),
      scrapeWgGesucht(),
    ]);

    // Run Apify actors one at a time to stay within free tier memory (8GB shared)
    const immoscout = await scrapeImmoScout();
    const immowelt = await scrapeImmowelt();

    const allApartments = [...kleinanzeigen, ...wgGesucht, ...immoscout, ...immowelt];

    // Deduplicate
    const seen = new Set<string>();
    const unique = allApartments.filter((apt) => {
      const key = `${apt.title.slice(0, 30).toLowerCase()}-${apt.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    unique.sort((a, b) => b.id.localeCompare(a.id));

    const sources = [
      kleinanzeigen.length > 0 ? `Kleinanzeigen (${kleinanzeigen.length})` : null,
      wgGesucht.length > 0 ? `WG-Gesucht (${wgGesucht.length})` : null,
      immoscout.length > 0 ? `ImmoScout24 (${immoscout.length})` : null,
      immowelt.length > 0 ? `Immowelt (${immowelt.length})` : null,
    ].filter(Boolean);

    const failedSources = [
      kleinanzeigen.length === 0 ? "Kleinanzeigen" : null,
      wgGesucht.length === 0 ? "WG-Gesucht" : null,
      immoscout.length === 0 && apifyClient ? "ImmoScout24" : null,
      immowelt.length === 0 && apifyClient ? "Immowelt" : null,
    ].filter(Boolean);

    let note = `${unique.length} apartments from ${sources.join(", ")}`;
    if (failedSources.length > 0) note += `. ⚠️ No results from: ${failedSources.join(", ")}`;
    if (!apifyClient) note += ". 💡 APIFY_API_TOKEN not set — ImmoScout24 & Immowelt disabled.";

    return NextResponse.json({
      apartments: unique,
      lastUpdated: new Date().toISOString(),
      mode: "live",
      note,
    });
  } catch (error) {
    console.error("Scraping error:", error);
    return NextResponse.json({
      apartments: [],
      lastUpdated: new Date().toISOString(),
      note: `Scraping failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}
