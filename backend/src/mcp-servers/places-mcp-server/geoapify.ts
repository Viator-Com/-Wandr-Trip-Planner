import { z } from "zod";

/**
 * Geoapify Place Details Feature IDs
 * Source: Geoapify Place Details API documentation
 */
export const GEOAPIFY_PLACE_DETAILS_FEATURES = [
  // ----- Core details -----
  "details",
  "details.population",
  "details.names",
  "details.full_geometry",

  // ----- Building -----
  "building",
  "building.places",
  "building.commercial",
  "building.catering",

  // ----- Radius 100m -----
  "radius_100",
  "radius_100.supermarket",
  "radius_100.restaurant",
  "radius_100.cafe",
  "radius_100.toilet",

  // ----- Radius 500m -----
  "radius_500",
  "radius_500.supermarket",
  "radius_500.shopping_mall",
  "radius_500.tourism",
  "radius_500.restaurant",
  "radius_500.cafe",
  "radius_500.school",
  "radius_500.toilet",
  "radius_500.hotel",
  "radius_500.playground",
  "radius_500.atm",

  // ----- Radius 1000m -----
  "radius_1000",
  "radius_1000.supermarket",
  "radius_1000.shopping_mall",
  "radius_1000.tourism",
  "radius_1000.restaurant",
  "radius_1000.cafe",
  "radius_1000.school",
  "radius_1000.toilet",
  "radius_1000.hotel",
  "radius_1000.playground",
  "radius_1000.atm",
  "radius_1000.park",
  "radius_1000.pharmacy",
  "radius_1000.entertainment",

  // ----- Walk isochrones -----
  "walk_5",
  "walk_5.supermarket",
  "walk_5.shopping_mall",
  "walk_5.tourism",
  "walk_5.restaurant",
  "walk_5.cafe",
  "walk_5.school",
  "walk_5.toilet",
  "walk_5.hotel",
  "walk_5.playground",
  "walk_5.atm",

  "walk_10",
  "walk_10.supermarket",
  "walk_10.shopping_mall",
  "walk_10.tourism",
  "walk_10.restaurant",
  "walk_10.cafe",
  "walk_10.school",
  "walk_10.toilet",
  "walk_10.hotel",
  "walk_10.playground",
  "walk_10.atm",
  "walk_10.park",
  "walk_10.pharmacy",
  "walk_10.entertainment",

  "walk_15",
  "walk_15.supermarket",
  "walk_15.shopping_mall",
  "walk_15.tourism",
  "walk_15.restaurant",
  "walk_15.cafe",
  "walk_15.school",
  "walk_15.hotel",
  "walk_15.playground",
  "walk_15.atm",
  "walk_15.park",
  "walk_15.pharmacy",
  "walk_15.entertainment",

  "walk_30",
  "walk_30.supermarket",
  "walk_30.shopping_mall",
  "walk_30.tourism",
  "walk_30.restaurant",
  "walk_30.cafe",
  "walk_30.school",
  "walk_30.hotel",
  "walk_30.playground",
  "walk_30.atm",
  "walk_30.park",
  "walk_30.pharmacy",
  "walk_30.entertainment",

  // ----- Drive isochrones -----
  "drive_5",
  "drive_5.supermarket",
  "drive_5.shopping_mall",
  "drive_5.tourism",
  "drive_5.restaurant",
  "drive_5.cafe",
  "drive_5.school",
  "drive_5.hotel",
  "drive_5.playground",
  "drive_5.atm",
  "drive_5.park",
  "drive_5.hospital",
  "drive_5.pharmacy",
  "drive_5.entertainment",
  "drive_5.fuel",
  "drive_5.charging_station",
  "drive_5.parking",

  "drive_10",
  "drive_10.supermarket",
  "drive_10.shopping_mall",
  "drive_10.tourism",
  "drive_10.restaurant",
  "drive_10.cafe",
  "drive_10.school",
  "drive_10.hotel",
  "drive_10.playground",
  "drive_10.atm",
  "drive_10.park",
  "drive_10.hospital",
  "drive_10.pharmacy",
  "drive_10.entertainment",
  "drive_10.fuel",
  "drive_10.charging_station",
  "drive_10.parking",

  "drive_15",
  "drive_15.supermarket",
  "drive_15.shopping_mall",
  "drive_15.tourism",
  "drive_15.restaurant",
  "drive_15.cafe",
  "drive_15.school",
  "drive_15.hotel",
  "drive_15.playground",
  "drive_15.atm",
  "drive_15.park",
  "drive_15.hospital",
  "drive_15.pharmacy",
  "drive_15.entertainment",
  "drive_15.fuel",
  "drive_15.charging_station",
  "drive_15.parking",
] as const;

export const GEOAPIFY_PLACE_CATEGORY = [
  "accommodation",
  "accommodation.hotel",
  "accommodation.hostel",
  "accommodation.apartment",
  "accommodation.guest_house",

  "tourism",
  "tourism.attraction",
  "tourism.sights",
  "tourism.museum",
  "tourism.gallery",
  "tourism.theme_park",
  "tourism.zoo",
  "tourism.viewpoint",

  "catering",
  "catering.restaurant",
  "catering.cafe",
  "catering.fast_food",
  "catering.bar",
  "catering.pub",

  "commercial",
  "commercial.shopping_mall",
  "commercial.supermarket",
  "commercial.marketplace",

  "transport",
  "transport.airport",
  "transport.train_station",
  "transport.bus_station",
  "transport.parking",

  "natural",
  "natural.park",
  "natural.beach",
  "natural.forest",

  "entertainment",
  "entertainment.cinema",
  "entertainment.theatre",
  "entertainment.nightclub",

  "religion",
  "religion.temple",
  "religion.church",
  "religion.mosque",

  "healthcare",
  "healthcare.hospital",
  "healthcare.pharmacy",

  "public",
  "public.toilet",
  "public.library",

  "sport",
  "sport.stadium",
  "sport.fitness",
] as const;

/**
 * Zod enum for MCP tools
 */
export const GeoapifyPlaceDetailsFeatureEnum = z.enum(
  GEOAPIFY_PLACE_DETAILS_FEATURES
);

export const GeoapifyGeoapifyCategoriesEnum = z.enum(GEOAPIFY_PLACE_CATEGORY);
/**
 * TS helper type
 */
export type GeoapifyPlaceDetailsFeature =
  (typeof GEOAPIFY_PLACE_DETAILS_FEATURES)[number];

export type GeoapifyGeoapifyCategories =
  (typeof GEOAPIFY_PLACE_CATEGORY)[number];
