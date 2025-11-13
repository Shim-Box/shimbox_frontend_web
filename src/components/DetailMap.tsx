// src/components/DetailMap.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    google?: any;
    __GMAPS_LOADING__?: Promise<void>;
    __GMAPS_KEY?: string;
  }
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DetailMapProps {
  addresses?: string[];
  coords?: LatLng[];
  centerCoord?: LatLng;
  centerAddress?: string;
  /** 숫자가 작을수록 더 확대 (카카오 level과 유사 의미, 기본 6) */
  level?: number;
  markerImageUrls?: string[];
  markerSize?: { width: number; height: number };
  onMarkerClick?: (idx: number) => void;
  /** 여러 마커일 때 fitBounds 후 추가 확대/축소(음수면 확대). 기본 -2 */
  fitBiasAfterBounds?: number;
}

/** ─────────────────────────────────────────────────────────
 *  🔑 Google Maps API Key 주입 규칙(우선순위)
 *  1) process.env.REACT_APP_GOOGLE_MAPS_API_KEY (.env)
 *  2) process.env.GOOGLE_MAPS_API_KEY
 *  3) window.__GMAPS_KEY (전역 주입)
 *  4) 하드코딩(최후 수단): DEFAULT_FALLBACK_KEY
 * ───────────────────────────────────────────────────────── */

// ⚠️ 실제로는 이 키를 .env로 옮기는 걸 강력 추천!
// .env 에 REACT_APP_GOOGLE_MAPS_API_KEY=... 로 넣고,
// 여기 fallback 은 제거해도 됩니다.
const DEFAULT_FALLBACK_KEY = "AIzaSyDcaQDrzTPJQ1bT2feHqyyo-LA_ijEXHCs";

function resolveApiKey(): string {
  const fromReactEnv =
    typeof process !== "undefined"
      ? (process as any).env?.REACT_APP_GOOGLE_MAPS_API_KEY
      : undefined;
  const fromNodeEnv =
    typeof process !== "undefined"
      ? (process as any).env?.GOOGLE_MAPS_API_KEY
      : undefined;
  const fromWin =
    typeof window !== "undefined" ? window.__GMAPS_KEY : undefined;

  return fromReactEnv || fromNodeEnv || fromWin || DEFAULT_FALLBACK_KEY;
}

/** Google Maps JS API 로더 (중복 로딩 방지) */
async function loadGoogleMaps(): Promise<void> {
  if (window.google?.maps) return;
  if (window.__GMAPS_LOADING__) return window.__GMAPS_LOADING__;

  const key = resolveApiKey();
  window.__GMAPS_LOADING__ = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      key
    )}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });

  return window.__GMAPS_LOADING__;
}

const DEFAULT_CENTER: LatLng = { lat: 37.5665, lng: 126.978 }; // 서울시청 근처

const DetailMap: React.FC<DetailMapProps> = ({
  addresses,
  coords,
  centerCoord,
  centerAddress,
  level = 6,
  markerImageUrls,
  markerSize = { width: 35, height: 45 },
  onMarkerClick,
  fitBiasAfterBounds = -2,
}) => {
  const [ready, setReady] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const markersRef = useRef<any[]>([]);

  const addrList = useMemo<string[]>(
    () => (Array.isArray(addresses) ? addresses : []),
    [addresses]
  );

  const [geoPoints, setGeoPoints] = useState<LatLng[]>([]);
  const [addrCenter, setAddrCenter] = useState<LatLng | null>(null);

  /** 1) Google Maps SDK 로드 */
  useEffect(() => {
    let canceled = false;
    loadGoogleMaps()
      .then(() => {
        if (!canceled) setReady(true);
      })
      .catch(() => {
        // 실패해도 앱이 죽진 않게 조용히 무시
      });
    return () => {
      canceled = true;
    };
  }, []);

  /** 2) 맵 초기화 & ResizeObserver */
  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;

    const gmaps = window.google.maps;
    mapRef.current = new gmaps.Map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: toGoogleZoom(level),
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    const ro = new ResizeObserver(() => {
      if (mapRef.current) gmaps.event.trigger(mapRef.current, "resize");
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [ready, level]);

  /** 3) 주소 -> 좌표 (coords 비었을 때만) */
  useEffect(() => {
    if (!ready) return;
    if (Array.isArray(coords) && coords.length > 0) return;

    if (addrList.length === 0) {
      setGeoPoints((prev) => (prev.length ? [] : prev));
      return;
    }
    if (!window.google?.maps?.Geocoder) return;

    const geocoder = new window.google.maps.Geocoder();
    Promise.all(addrList.map((addr) => geocodeToLatLng(geocoder, addr)))
      .then((locs) => {
        setGeoPoints((prev) => {
          const same =
            locs.length === prev.length &&
            locs.every(
              (p, i) => p.lat === prev[i]?.lat && p.lng === prev[i]?.lng
            );
          return same ? prev : locs;
        });
      })
      .catch(() => setGeoPoints([]));
  }, [ready, addrList, coords]);

  /** 4) 중심 주소 -> 좌표 (centerCoord/coords 없을 때만) */
  useEffect(() => {
    if (centerCoord || (Array.isArray(coords) && coords.length > 0)) {
      if (addrCenter !== null) setAddrCenter(null);
      return;
    }

    const useAddr = (centerAddress || addrList[0] || "").trim();
    if (!useAddr) {
      if (addrCenter !== null) setAddrCenter(null);
      return;
    }

    if (!ready || !window.google?.maps?.Geocoder) return;

    const geocoder = new window.google.maps.Geocoder();
    geocodeToLatLng(geocoder, useAddr)
      .then((pt) => setAddrCenter(pt))
      .catch(() => setAddrCenter(null));
  }, [ready, centerCoord, coords, centerAddress, addrList, addrCenter]);

  /** 5) 마커 소스 계산 */
  const markerPoints: LatLng[] = useMemo(() => {
    if (Array.isArray(coords) && coords.length > 0) return coords;
    return geoPoints;
  }, [coords, geoPoints]);

  /** 6) 중심 계산 */
  const center: LatLng = useMemo(() => {
    if (centerCoord) return centerCoord;
    if (Array.isArray(coords) && coords.length > 0) return coords[0];
    if (addrCenter) return addrCenter;
    if (geoPoints.length > 0) return geoPoints[0];
    return DEFAULT_CENTER;
  }, [centerCoord, coords, addrCenter, geoPoints]);

  /** 7) 마커 그리기 & bounds/zoom 조정 */
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    const gmaps = window.google.maps;
    const map = mapRef.current as any;

    // 기존 마커 제거
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    // 마커 이미지 배열 보정
    const resolvedMarkerImages: string[] = (() => {
      if (!markerImageUrls || markerImageUrls.length === 0) return [];
      if (markerImageUrls.length === markerPoints.length) return markerImageUrls;
      if (markerImageUrls.length === 1)
        return Array(markerPoints.length).fill(markerImageUrls[0]);
      return markerPoints.map(
        (_p, i) =>
          markerImageUrls[i] ??
          markerImageUrls[markerImageUrls.length - 1]
      );
    })();

    // 마커 생성
    markerPoints.forEach((p, idx) => {
      const icon = resolvedMarkerImages[idx]
        ? {
            url: resolvedMarkerImages[idx],
            scaledSize: new gmaps.Size(markerSize.width, markerSize.height),
          }
        : undefined;

      const marker = new gmaps.Marker({
        position: p,
        map,
        icon,
      });

      if (onMarkerClick) {
        marker.addListener("click", () => onMarkerClick(idx));
      }

      markersRef.current.push(marker);
    });

    // 화면 맞춤/줌
    if (markerPoints.length === 0) {
      map.setCenter(center);
      map.setZoom(toGoogleZoom(level));
      return;
    }

    if (markerPoints.length === 1) {
      map.setCenter(markerPoints[0]);
      // 카카오 level ↔ 구글 zoom 차이를 보정: level-2 만큼 더 확대
      map.setZoom(toGoogleZoom(Math.max(1, level - 2)));
      return;
    }

    const bounds = new gmaps.LatLngBounds();
    markerPoints.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds);

    if (fitBiasAfterBounds && fitBiasAfterBounds !== 0) {
      const cur = map.getZoom();
      // kakao level 감소 = 줌인 → google zoom 증가 (fitBias가 음수면 확대)
      map.setZoom(Math.max(1, cur - fitBiasAfterBounds));
    }
  }, [
    ready,
    markerPoints,
    center,
    level,
    markerImageUrls,
    markerSize,
    onMarkerClick,
    fitBiasAfterBounds,
  ]);

  /** 8) 중심만 바뀌는 경우 */
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    (mapRef.current as any).setCenter(center);
  }, [ready, center]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
};

/** 주소 → LatLng */
async function geocodeToLatLng(geocoder: any, addr: string): Promise<LatLng> {
  const q = String(addr || "").trim();
  if (!q) return DEFAULT_CENTER;

  return new Promise<LatLng>((resolve) => {
    geocoder.geocode({ address: q }, (results: any, status: any) => {
      if (status === "OK" && results?.[0]?.geometry?.location) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else {
        resolve(DEFAULT_CENTER);
      }
    });
  });
}

/** 카카오의 level(작을수록 확대)을 구글 zoom(클수록 확대)처럼 보이게 단순 변환 */
function toGoogleZoom(kakaoLevel: number): number {
  // 대충 level 6 ≈ zoom 13 정도로 매핑. 필요한 경우 조정하세요.
  const base = 19 - kakaoLevel; // 러프 변환
  return Math.max(3, Math.min(18, base));
}

export default DetailMap;
