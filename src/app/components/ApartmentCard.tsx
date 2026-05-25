"use client";

import { useState, useEffect } from "react";
import { Apartment } from "../types";
import { formatDistanceToNow } from "date-fns";

interface Props {
  apartment: Apartment;
}

const sourceColors: Record<string, string> = {
  ImmoScout24: "bg-blue-100 text-blue-800",
  Immowelt: "bg-orange-100 text-orange-800",
  Kleinanzeigen: "bg-green-100 text-green-800",
  "WG-Gesucht": "bg-red-100 text-red-800",
  SAGA: "bg-purple-100 text-purple-800",
};

export default function ApartmentCard({ apartment }: Props) {
  const [timeAgo, setTimeAgo] = useState<string>("");

  useEffect(() => {
    setTimeAgo(
      formatDistanceToNow(new Date(apartment.firstSeen), {
        addSuffix: true,
      })
    );
  }, [apartment.firstSeen]);

  return (
    <a
      href={apartment.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-lg border bg-white shadow-sm hover:shadow-md transition-shadow ${
        apartment.isNew
          ? "border-green-300 ring-2 ring-green-100"
          : "border-gray-200"
      }`}
    >
      <div className="p-4">
        {/* Header with badges */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex flex-wrap gap-1.5">
            {apartment.isNew && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                🆕 New
              </span>
            )}
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                sourceColors[apartment.source] || "bg-gray-100 text-gray-800"
              }`}
            >
              {apartment.source}
            </span>
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {timeAgo}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-gray-900 text-sm leading-tight mb-2 line-clamp-2">
          {apartment.title}
        </h3>

        {/* Key details */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center p-2 bg-gray-50 rounded">
            <p className="text-lg font-bold text-blue-600">
              {apartment.price}€
            </p>
            <p className="text-xs text-gray-500">Rent</p>
          </div>
          <div className="text-center p-2 bg-gray-50 rounded">
            <p className="text-lg font-bold text-gray-700">
              {apartment.size > 0 ? `${apartment.size}` : "—"}
            </p>
            <p className="text-xs text-gray-500">m²</p>
          </div>
          <div className="text-center p-2 bg-gray-50 rounded">
            <p className="text-lg font-bold text-gray-700">
              {apartment.rooms > 0 ? apartment.rooms : "—"}
            </p>
            <p className="text-xs text-gray-500">Rooms</p>
          </div>
        </div>

        {/* Address */}
        <div className="flex items-start gap-1.5 text-sm text-gray-600 mb-2">
          <span className="shrink-0">📍</span>
          <span className="line-clamp-1">
            {apartment.address || apartment.district}
          </span>
        </div>

        {/* Description preview */}
        {apartment.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-2">
            {apartment.description}
          </p>
        )}

        {/* Available from / Posted date */}
        {apartment.availableFrom && (
          <p className="text-xs text-gray-500">
            🏠 Available: {apartment.availableFrom}
          </p>
        )}
        {apartment.postedAt && (
          <p className="text-xs text-gray-400">
            📅 Posted: {apartment.postedAt}
          </p>
        )}

        {/* CTA */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <span className="text-sm text-blue-600 font-medium hover:text-blue-800">
            Open listing →
          </span>
        </div>
      </div>
    </a>
  );
}
