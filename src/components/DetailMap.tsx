import React, { useEffect, useMemo, useRef, useState } from "react";
import { Map as KakaoMap, MapMarker } from "react-kakao-maps-sdk";

declare global { interface Window { kakao: any; } }

export interface LatLng { lat: number; lng: number; }

export interface DetailMapProps {
  addresses?: string[];
  coords?: LatLng[];
  centerCoord?: LatLng;
  centerAddress?: string;
  /** 작을수록 더 확대됨 (기본 8) */
  level?: number;
  markerImageUrls?: string[];
  markerSize?: { width: number; height: number };
  onMarkerClick?: (idx: number) => void;
  /** 여러 마커일 때 fitBounds 후 추가 확대/축소(음수면 확대). 기본 -1 */
  fitBiasAfterBounds?: number;
}

const DEFAULT_CENTER: LatLng = { lat: 37.5665, lng: 126.978 };

const DetailMap: React.FC<DetailMapProps> = ({
  addresses, coords, centerCoord, centerAddress,
  level = 6,                   // 기본 더 줌인
  markerImageUrls,
  markerSize = { width: 35, height: 45 },
  onMarkerClick,
  fitBiasAfterBounds = -2,     // 기본 더 줌인
}) => {
  const [ready, setReady] = useState(false);
  const [geoPoints, setGeoPoints] = useState<LatLng[]>([]);
  const [addrCenter, setAddrCenter] = useState<LatLng | null>(null);

  const mapRef = useRef<kakao.maps.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const addrList = useMemo<string[]>(() => (Array.isArray(addresses) ? addresses : []), [addresses]);

  // ✅ Kakao SDK 늦게 로드돼도 자동 감지해서 ready 설정
  useEffect(() => {
    if (window.kakao?.maps) setReady(true);
    const wait = setInterval(() => {
      if (window.kakao?.maps?.services) {
        setReady(true);
        clearInterval(wait);
      }
    }, 300);
    return () => clearInterval(wait);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => { if (mapRef.current) mapRef.current.relayout(); });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // 주소 → 좌표 (coords 없을 때만)
  useEffect(() => {
    if (!ready) return;
    if (Array.isArray(coords) && coords.length > 0) return;
    if (!window.kakao?.maps?.services) return;

    if (addrList.length === 0) {
      setGeoPoints((prev) => (prev.length ? [] : prev));
      return;
    }

    const geocoder = new window.kakao.maps.services.Geocoder();
    Promise.all(
      addrList.map(
        (addr) =>
          new Promise<LatLng>((resolve) => {
            const q = String(addr || "").trim();
            if (!q) return resolve(DEFAULT_CENTER);
            geocoder.addressSearch(q, (res: any, status: any) => {
              if (status === window.kakao.maps.services.Status.OK && res?.[0]) {
                const { x, y } = res[0];
                resolve({ lat: parseFloat(y), lng: parseFloat(x) });
              } else {
                resolve(DEFAULT_CENTER);
              }
            });
          })
      )
    )
      .then((locs) => {
        const same =
          locs.length === geoPoints.length &&
          locs.every((p, i) => p.lat === geoPoints[i]?.lat && p.lng === geoPoints[i]?.lng);
        if (!same) setGeoPoints(locs);
      })
      .catch(() => { if (geoPoints.length) setGeoPoints([]); });
  }, [ready, addrList, coords, geoPoints.length]);

  // 주소 중심 (centerCoord/coords 없을 때만)
  useEffect(() => {
    if (!ready) return;
    if (centerCoord || (Array.isArray(coords) && coords.length > 0)) {
      if (addrCenter !== null) setAddrCenter(null);
      return;
    }
    const useAddr = (centerAddress || addrList[0] || "").trim();
    if (!useAddr || !window.kakao?.maps?.services) {
      if (addrCenter !== null) setAddrCenter(null);
      return;
    }
    const geocoder = new window.kakao.maps.services.Geocoder();
    geocoder.addressSearch(useAddr, (res: any, status: any) => {
      if (status === window.kakao.maps.services.Status.OK && res?.[0]) {
        const { x, y } = res[0];
        const next = { lat: parseFloat(y), lng: parseFloat(x) };
        if (addrCenter?.lat !== next.lat || addrCenter?.lng !== next.lng) setAddrCenter(next);
      } else {
        if (addrCenter !== null) setAddrCenter(null);
      }
    });
  }, [ready, centerCoord, coords, centerAddress, addrList, addrCenter]);

  const markerPoints: LatLng[] = useMemo(() => {
    if (Array.isArray(coords) && coords.length > 0) return coords;
    return geoPoints;
  }, [coords, geoPoints]);

  const center: LatLng = useMemo(() => {
    if (centerCoord) return centerCoord;
    if (Array.isArray(coords) && coords.length > 0) return coords[0];
    if (addrCenter) return addrCenter;
    if (geoPoints.length > 0) return geoPoints[0];
    return DEFAULT_CENTER;
  }, [centerCoord, coords, addrCenter, geoPoints]);

  // 마커 변경 시 화면 맞춤 + 살짝 더 확대(bias)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (markerPoints.length === 0) { map.relayout(); return; }

    if (markerPoints.length === 1) {
      const p = markerPoints[0];
      map.setCenter(new window.kakao.maps.LatLng(p.lat, p.lng));
      // ✅ 단일 마커는 전달 level보다 더 확대
      map.setLevel(Math.max(1, level - 2));
      map.relayout();
      return;
    }

    const bounds = new window.kakao.maps.LatLngBounds();
    markerPoints.forEach((p) => bounds.extend(new window.kakao.maps.LatLng(p.lat, p.lng)));
    map.setBounds(bounds);
    if (fitBiasAfterBounds && fitBiasAfterBounds !== 0) {
      const cur = map.getLevel();
      const next = Math.max(1, cur + fitBiasAfterBounds);
      if (next !== cur) map.setLevel(next);
    }
    map.relayout();
  }, [markerPoints, level, fitBiasAfterBounds]);

  // 마커 이미지 배열 보정
  const resolvedMarkerImages = useMemo(() => {
    if (!markerImageUrls || markerImageUrls.length === 0) return [];
    if (markerImageUrls.length === markerPoints.length) return markerImageUrls;
    if (markerImageUrls.length === 1) return Array(markerPoints.length).fill(markerImageUrls[0]);
    return markerPoints.map((_p, i) => markerImageUrls[i] ?? markerImageUrls[markerImageUrls.length - 1]);
  }, [markerImageUrls, markerPoints.length]);

  if (!ready) {
    return <div ref={containerRef} style={{ width: "100%", height: "100%", background: "#e6e6e6" }} />;
  }

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
      <KakaoMap
        center={center}
        isPanto
        level={level}
        style={{ width: "100%", height: "100%" }}
        onCreate={(map) => {
          mapRef.current = map;
          setTimeout(() => map.relayout(), 0);
        }}
      >
        {markerPoints.map((c, idx) => {
          const src = resolvedMarkerImages[idx];
          return (
            <MapMarker
              key={`${c.lat},${c.lng},${idx}`}
              position={c}
              image={src ? { src, size: markerSize } : undefined}
              onClick={() => onMarkerClick?.(idx)}
            />
          );
        })}
      </KakaoMap>
    </div>
  );
};

export default DetailMap;
