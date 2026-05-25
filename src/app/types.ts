export interface Apartment {
  id: string;
  title: string;
  price: number; // monthly rent in EUR
  size: number; // square meters
  rooms: number;
  address: string;
  district: string;
  url: string;
  source: string; // immoscout, immowelt, kleinanzeigen, saga
  imageUrl?: string;
  description?: string;
  availableFrom?: string; // when you can move in
  postedAt?: string; // when the listing was published
  firstSeen: string; // ISO date when we first scraped it
  isNew?: boolean; // less than 24h old
}

export interface SearchFilters {
  maxPrice: number;
  minRooms: number;
  maxRooms: number;
  districts: string[];
}

export const DEFAULT_FILTERS: SearchFilters = {
  maxPrice: 1000,
  minRooms: 1.5,
  maxRooms: 3,
  districts: [
    "Bergedorf",
    "Lohbrügge",
    "Nettelnburg",
    "Allermöhe",
    "Neuallermöhe",
    "Billwerder",
    "Curslack",
    "Altengamme",
    "Neuengamme",
    "Kirchwerder",
    "Ochsenwerder",
    "Reitbrook",
    "Tatenberg",
    "Spadenland",
    "Moorfleet",
    "Billstedt",
    "Horn",
    "Hamm",
    "Rothenburgsort",
  ],
};
