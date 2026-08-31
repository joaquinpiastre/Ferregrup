import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { subscribeLivePositions } from '../api';
import type { LivePosition } from '../types';

// Vite reescribe las rutas de los íconos por defecto de Leaflet y quedan rotas
// si no se las pasa explícitamente.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface Props {
  token: string;
}

const DEFAULT_CENTER: [number, number] = [-34.6037, -58.3816];

function fmtAgo(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'hace instantes';
  if (mins === 1) return 'hace 1 minuto';
  return `hace ${mins} minutos`;
}

export default function MapaVivo({ token }: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const [positions, setPositions] = useState<LivePosition[]>([]);
  const hasCenteredRef = useRef(false);

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current).setView(DEFAULT_CENTER, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => subscribeLivePositions(token, setPositions), [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const p of positions) {
      seen.add(p.courierId);
      const existing = markersRef.current.get(p.courierId);
      const label = `<b>${p.courierName}</b><br/>${fmtAgo(p.timestampMs)}`;
      if (existing) {
        existing.setLatLng([p.lat, p.lng]);
        existing.setPopupContent(label);
      } else {
        const marker = L.marker([p.lat, p.lng]).addTo(map).bindPopup(label);
        markersRef.current.set(p.courierId, marker);
      }
    }
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
    if (!hasCenteredRef.current && positions.length > 0) {
      map.setView([positions[0].lat, positions[0].lng], 13);
      hasCenteredRef.current = true;
    }
  }, [positions]);

  return (
    <div>
      <p style={{ color: '#666', fontSize: 12, marginBottom: 10 }}>
        Posiciones de los últimos 24hs (repartidores con el celular abierto en un turno activo, o con tracker físico). Se actualiza cada 8s.
      </p>
      <div ref={mapDivRef} style={{ height: 480, borderRadius: 12, overflow: 'hidden', border: '1px solid #2d2d2d' }} />
      {positions.length === 0 && (
        <p style={{ color: '#666', fontSize: 13, marginTop: 10 }}>Nadie está reportando posición ahora mismo.</p>
      )}
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {positions.map((p) => (
          <div key={p.courierId} style={{ color: '#888', fontSize: 12 }}>
            <span style={{ color: '#fff', fontWeight: 600 }}>{p.courierName}</span> — {fmtAgo(p.timestampMs)}
          </div>
        ))}
      </div>
    </div>
  );
}
