"use client";

import { DEFAULT_FILTERS } from "../types";

interface Props {
  maxPrice: number;
  setMaxPrice: (price: number) => void;
  selectedDistricts: string[];
  setSelectedDistricts: (districts: string[]) => void;
  sortBy: "newest" | "price" | "size";
  setSortBy: (sort: "newest" | "price" | "size") => void;
  totalCount: number;
}

export default function FilterPanel({
  maxPrice,
  setMaxPrice,
  selectedDistricts,
  setSelectedDistricts,
  sortBy,
  setSortBy,
  totalCount,
}: Props) {
  const toggleDistrict = (district: string) => {
    if (selectedDistricts.includes(district)) {
      setSelectedDistricts(selectedDistricts.filter((d) => d !== district));
    } else {
      setSelectedDistricts([...selectedDistricts, district]);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
        {/* Price filter */}
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Max rent: {maxPrice}€
          </label>
          <input
            type="range"
            min={400}
            max={1200}
            step={50}
            value={maxPrice}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>400€</span>
            <span>1200€</span>
          </div>
        </div>

        {/* Sort */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sort by
          </label>
          <select
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as "newest" | "price" | "size")
            }
            className="block w-full rounded-md border-gray-300 shadow-sm text-sm p-2 border"
          >
            <option value="newest">Newest first</option>
            <option value="price">Cheapest first</option>
            <option value="size">Largest first</option>
          </select>
        </div>

        {/* Count */}
        <div className="text-sm text-gray-500">
          <span className="font-semibold text-gray-700">{totalCount}</span>{" "}
          apartments found
        </div>
      </div>

      {/* District chips */}
      <div className="mt-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium text-gray-700">Districts:</span>
          <button
            onClick={() => setSelectedDistricts([])}
            className={`text-xs px-2 py-0.5 rounded ${
              selectedDistricts.length === 0
                ? "bg-blue-600 text-white"
                : "text-blue-600 hover:text-blue-800"
            }`}
          >
            All Hamburg
          </button>
          <button
            onClick={() => setSelectedDistricts(DEFAULT_FILTERS.districts)}
            className={`text-xs px-2 py-0.5 rounded ${
              selectedDistricts.length === DEFAULT_FILTERS.districts.length
                ? "bg-blue-600 text-white"
                : "text-blue-600 hover:text-blue-800"
            }`}
          >
            Bergedorf & nearby only
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DEFAULT_FILTERS.districts.map((district) => (
            <button
              key={district}
              onClick={() => toggleDistrict(district)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedDistricts.includes(district)
                  ? "bg-blue-100 text-blue-800 border border-blue-200"
                  : "bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200"
              }`}
            >
              {district}
            </button>
          ))}
        </div>
        {selectedDistricts.length > 0 && (
          <p className="text-xs text-gray-400 mt-1">
            Only showing listings from selected districts.
          </p>
        )}
      </div>
    </div>
  );
}
