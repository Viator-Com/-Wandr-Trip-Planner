import React, { useEffect, useRef } from "react";
import "./MapView.css";

export interface MapPin {
  name: string;
  lat: number;
  lng: number;
  description?: string;
  image?: string;
}

interface MapViewProps {
  pins: MapPin[];
}

const MapView: React.FC<MapViewProps> = ({ pins }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!mapContainerRef.current || pins.length === 0) return;
    // Prevent double-init on re-renders
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    // Dynamically import Leaflet so it's SSR-safe
    import("leaflet").then((L) => {
      // Fix default marker icons (Leaflet webpack issue)
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      const avgLat = pins.reduce((s, p) => s + p.lat, 0) / pins.length;
      const avgLng = pins.reduce((s, p) => s + p.lng, 0) / pins.length;

      const map = L.map(mapContainerRef.current!, {
        center: [avgLat, avgLng],
        zoom: 15,
        zoomControl: true,
        attributionControl: false,
      });

      mapRef.current = map;

      // Dark-friendly tile layer (CartoDB Dark Matter)
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { maxZoom: 19 },
      ).addTo(map);

      pins.forEach((pin, idx) => {
        const numberedIcon = L.divIcon({
          className: "",
          html: `<div class="map-pin"><span class="map-pin-num">${idx + 1}</span></div>`,
          iconSize: [32, 42],
          iconAnchor: [16, 42],
          popupAnchor: [0, -44],
        });
        const marker = L.marker([pin.lat, pin.lng], {
          icon: numberedIcon,
        }).addTo(map);
        marker.bindPopup(
          `<div class="map-popup">
            ${pin.image ? `<div class="map-popup-img"><img src="${pin.image}" alt="${pin.name}" onerror="this.parentElement.style.display='none'" /></div>` : ""}
            <div class="map-popup-body">
              <div class="map-popup-header">
                <div class="map-popup-num">${idx + 1}</div>
                <strong>${pin.name}</strong>
              </div>
              ${pin.description ? `<p>${pin.description}</p>` : ""}
              <small>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}
              </small>
            </div>
          </div>`,
          { className: "map-popup-wrapper", maxWidth: 260 },
        );
      });

      // Fit all markers into view
      if (pins.length > 1) {
        const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [pins]);

  if (pins.length === 0) return null;

  return (
    <div className="map-card">
      <div className="map-card-header">
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <span>
          {pins.length} location{pins.length > 1 ? "s" : ""} on map
        </span>
      </div>
      <div className="map-container" ref={mapContainerRef} />
      <div className="map-legend">
        {pins.map((pin, i) => (
          <div key={i} className="map-legend-item">
            <span className="map-legend-num">{i + 1}</span>
            <span className="map-legend-name">{pin.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MapView;
