import { NextResponse } from "next/server";
import { Apartment } from "../../types";

export async function GET() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(
      "https://www.saga.hamburg/immobiliensuche?type=wohnung&city=hamburg&district=bergedorf&rooms_from=1.5&rooms_to=3&rent_to=1000",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json({
        apartments: [],
        lastUpdated: new Date().toISOString(),
        error: `SAGA returned ${response.status}`,
      });
    }

    const html = await response.text();
    const apartments = parseSagaListings(html);

    return NextResponse.json({
      apartments,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    // Always return valid JSON, never crash
    return NextResponse.json({
      apartments: [],
      lastUpdated: new Date().toISOString(),
      error:
        error instanceof Error ? error.message : "SAGA fetch failed",
    });
  }
}

function parseSagaListings(html: string): Apartment[] {
  const apartments: Apartment[] = [];

  // Simple regex-based parsing for SAGA listing cards
  const listingPattern =
    /<article[^>]*class="[^"]*immo-card[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let match;

  while ((match = listingPattern.exec(html)) !== null) {
    const card = match[1];

    const titleMatch = card.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
    const priceMatch = card.match(/(\d+[.,]?\d*)\s*€/);
    const roomsMatch = card.match(/(\d+[.,]?\d*)\s*Zimmer/i);
    const sizeMatch = card.match(/(\d+[.,]?\d*)\s*m²/);
    const addressMatch = card.match(
      /<[^>]*class="[^"]*address[^"]*"[^>]*>([\s\S]*?)<\//i
    );
    const linkMatch = card.match(
      /href="([^"]*immobiliensuche[^"]*)"/i
    );

    if (titleMatch || priceMatch) {
      apartments.push({
        id: `saga-${apartments.length}-${Date.now()}`,
        title: titleMatch
          ? titleMatch[1].replace(/<[^>]*>/g, "").trim()
          : "SAGA Wohnung",
        price: priceMatch
          ? parseFloat(priceMatch[1].replace(",", "."))
          : 0,
        size: sizeMatch
          ? parseFloat(sizeMatch[1].replace(",", "."))
          : 0,
        rooms: roomsMatch
          ? parseFloat(roomsMatch[1].replace(",", "."))
          : 2,
        address: addressMatch
          ? addressMatch[1].replace(/<[^>]*>/g, "").trim()
          : "Hamburg Bergedorf",
        district: "Bergedorf",
        url: linkMatch
          ? `https://www.saga.hamburg${linkMatch[1]}`
          : "https://www.saga.hamburg/immobiliensuche",
        source: "SAGA",
        firstSeen: new Date().toISOString(),
        isNew: true,
      });
    }
  }

  return apartments;
}
