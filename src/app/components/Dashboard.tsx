"use client";

import { useState, useEffect, useCallback } from "react";
import { Apartment, DEFAULT_FILTERS } from "../types";
import ApartmentCard from "./ApartmentCard";
import FilterPanel from "./FilterPanel";

export default function Dashboard() {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [maxPrice, setMaxPrice] = useState(DEFAULT_FILTERS.maxPrice);
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"newest" | "price" | "size">("newest");
  const [note, setNote] = useState<string | null>(null);

  // Load saved results from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("apartment-hunter-data");
      if (saved) {
        const parsed = JSON.parse(saved);
        setApartments(parsed.apartments || []);
        setLastUpdated(parsed.lastUpdated || null);
        setNote(parsed.note || null);
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const fetchApartments = useCallback(async () => {
    setLoading(true);
    try {
      const results: Apartment[] = [];
      let newNote: string | null = null;

      try {
        const scrapeRes = await fetch("/api/scrape?mode=live");
        if (scrapeRes.ok) {
          const scrapeData = await scrapeRes.json();
          results.push(...(scrapeData.apartments || []));
          newNote = scrapeData.note || null;
        }
      } catch (e) {
        console.warn("Scrape API failed:", e);
      }

      try {
        const sagaRes = await fetch("/api/saga");
        if (sagaRes.ok) {
          const sagaData = await sagaRes.json();
          results.push(...(sagaData.apartments || []));
        }
      } catch (e) {
        console.warn("SAGA API failed:", e);
      }

      const now = Date.now();
      const marked = results.map((apt: Apartment) => ({
        ...apt,
        isNew:
          apt.isNew ??
          now - new Date(apt.firstSeen).getTime() < 24 * 60 * 60 * 1000,
      }));

      const updatedTime = new Date().toISOString();
      setApartments(marked);
      setLastUpdated(updatedTime);
      setNote(newNote);

      // Save to localStorage so results persist across page refreshes
      try {
        localStorage.setItem(
          "apartment-hunter-data",
          JSON.stringify({ apartments: marked, lastUpdated: updatedTime, note: newNote })
        );
      } catch {
        // localStorage full or unavailable
      }
    } catch (err) {
      console.error("Failed to fetch apartments:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const filtered = apartments
    .filter((apt) => apt.price <= maxPrice && apt.price > 0)
    .filter(
      (apt) =>
        selectedDistricts.length === 0 ||
        selectedDistricts.some(
          (d) =>
            apt.district.toLowerCase().includes(d.toLowerCase()) ||
            apt.address.toLowerCase().includes(d.toLowerCase())
        )
    );

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "newest")
      return (
        new Date(b.firstSeen).getTime() - new Date(a.firstSeen).getTime()
      );
    if (sortBy === "price") return a.price - b.price;
    if (sortBy === "size") return b.size - a.size;
    return 0;
  });

  const newCount = sorted.filter((a) => a.isNew).length;

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                🏠 Apartment Search Hamburg-Bergedorf
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Apartments for 2 people · under {maxPrice}€ · Bergedorf &
                surroundings
              </p>
            </div>
            <div className="flex items-center gap-3">
              {newCount > 0 && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  🆕 {newCount} new
                </span>
              )}
              <button
                onClick={fetchApartments}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                {loading ? "⏳ Loading..." : "🔄 Update"}
              </button>
            </div>
          </div>
          {loading && (
            <p className="text-xs text-blue-500 mt-2 animate-pulse">
              ⏳ Fetching latest listings from all sources...
            </p>
          )}
          {!loading && lastUpdated && (
            <p className="text-xs text-gray-400 mt-2">
              Last updated:{" "}
              {new Date(lastUpdated).toLocaleString("en-GB")}
              {note && (
                <span className="ml-2 text-amber-600">⚠️ {note}</span>
              )}
            </p>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {/* Filters */}
        <FilterPanel
          maxPrice={maxPrice}
          setMaxPrice={setMaxPrice}
          selectedDistricts={selectedDistricts}
          setSelectedDistricts={setSelectedDistricts}
          sortBy={sortBy}
          setSortBy={setSortBy}
          totalCount={sorted.length}
        />

        {/* Results */}
        {loading && apartments.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-500">Searching for apartments...</p>
            </div>
          </div>
        ) : !loading && apartments.length === 0 && !lastUpdated ? (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">
              👆 Click <strong>Update</strong> to fetch latest listings.
            </p>
            <p className="text-gray-400 mt-2">
              Results take 30-60 seconds to load from all sources.
            </p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">
              No apartments found with these filters.
            </p>
            <p className="text-gray-400 mt-2">
              Try increasing the price or selecting more districts.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((apt) => (
              <ApartmentCard key={apt.id} apartment={apt} />
            ))}
          </div>
        )}
      </div>

      {/* Quick Links Footer */}
      <footer className="bg-white border-t border-gray-200 mt-8">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            🔗 Search directly on:
          </h3>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://www.immobilienscout24.de/Suche/de/hamburg/hamburg/wohnung-mieten?numberofrooms=1.5-3.0&price=-1000.0&exclusioncriteria=swapflat&pricetype=rentpermonth"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 rounded-md text-sm bg-blue-50 text-blue-700 hover:bg-blue-100"
            >
              ImmoScout24
            </a>
            <a
              href="https://www.immowelt.de/liste/hamburg-bergedorf/wohnungen/mieten?ami=1.5&pma=1000&sort=createdate%2Bdesc"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 rounded-md text-sm bg-orange-50 text-orange-700 hover:bg-orange-100"
            >
              Immowelt
            </a>
            <a
              href="https://www.kleinanzeigen.de/s-wohnung-mieten/hamburg/anzeige:angebote/preis::1000/c203l9409"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 rounded-md text-sm bg-green-50 text-green-700 hover:bg-green-100"
            >
              Kleinanzeigen
            </a>
            <a
              href="https://www.saga.hamburg/immobiliensuche"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 rounded-md text-sm bg-purple-50 text-purple-700 hover:bg-purple-100"
            >
              SAGA Hamburg
            </a>
            <a
              href="https://www.wg-gesucht.de/wohnungen-in-Hamburg.55.2.1.0.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 rounded-md text-sm bg-red-50 text-red-700 hover:bg-red-100"
            >
              WG-Gesucht
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
