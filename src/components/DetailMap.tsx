import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Map as KakaoMap,
  MapMarker,
  useKakaoLoader,
} from "react-kakao-maps-sdk";

declare global {
  interface Window {
    kakao: any;
  }
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DetailMapProps {
  /** 이미 서버(지오코딩+캐시)에서 내려준 좌표들 */
  coords?: LatLng[];

  /** 백엔드 지오코딩 엔드포인트 (예: "/api/geocode?address=") — 없으면 주소 지오코딩 안 함 */
  backendGeocodeUrl?: string;

  /** 마커로 쓰고 싶은 주소들(백엔드 엔드포인트 있을 때만 천천히 변환) */
  addresses?: string[];

  /** 지도 중심을 주소로 잡고 싶으면(백엔드 엔드포인트 있을 때만 변환) */
  centerAddress?: string;

  /** 명시적 중심 (없으면 coords[0] → geocoded[0] → DEFAULT_CENTER) */
  centerCoord?: LatLng;

  /** 확대 레벨 (작을수록 확대) */
  level?: number;

  /** 마커 이미지들(개수 1개면 모든 마커에 동일 적용) */
  markerImageUrls?: string[];
  markerSize?: { width: number; height: number };

  /** 마커 클릭 핸들러 */
  onMarkerClick?: (idx: number) => void;

  /** 여러 마커일 때 fitBounds 후 레벨 보정(음수 확대, 양수 축소). 기본 -2 */
  fitBiasAfterBounds?: number;

  /** 주소 지오코딩을 이 컴포넌트 마운트 동안 최대 몇 번 시도할지(과도 호출 방지). 기본 5 */
  maxGeocodePerMount?: number;
}

const DEFAULT_CENTER: LatLng = { lat: 37.5665, lng: 126.978 }; // 서울시청 근처

// ── 로컬스토리지 캐시 (프론트 재방문/라우팅에도 재사용) ───────────────────────────
const LS_PREFIX = "geo:ll:";
function getLSCache(addr: string): LatLng | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + addr);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.lat === "number" && typeof p?.lng === "number") return p;
  } catch {}
  return null;
}
function setLSCache(addr: string, p: LatLng | null) {
  try {
    if (!addr) return;
    if (p && typeof p.lat === "number" && typeof p.lng === "number") {
      localStorage.setItem(LS_PREFIX + addr, JSON.stringify(p));
    }
  } catch {}
}

// 간단 rate limit (백엔드 과도 호출 방지)
let _lastFetch = 0;
const MIN_GAP_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchBackendGeocode(
  endpoint: string,
  addr: string
): Promise<LatLng | null> {
  const key = (addr || "").trim();
  if (!key) return null;

  // 1) 로컬 캐시
  const cached = getLSCache(key);
  if (cached) return cached;

  // 2) rate limit + 약간의 지터
  const now = Date.now();
  const jitter = Math.floor(Math.random() * 120);
  const wait = Math.max(0, MIN_GAP_MS - (now - _lastFetch)) + jitter;
  if (wait) await sleep(wait);
  _lastFetch = Date.now();

  try {
    const url = `${endpoint}${encodeURIComponent(key)}`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return null;
    const data = await res.json();
    const lat = Number(data?.lat);
    const lng = Number(data?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const point = { lat, lng };
      setLSCache(key, point);
      return point;
    }
    return null;
  } catch {
    return null;
  }
}

const DetailMap: React.FC<DetailMapProps> = ({
  coords,
  backendGeocodeUrl, // 예: "/api/geocode?address="
  addresses,
  centerAddress,
  centerCoord,
  level = 6,
  markerImageUrls,
  markerSize = { width: 35, height: 45 },
  onMarkerClick,
  fitBiasAfterBounds = -2,
  maxGeocodePerMount = 5,
}) => {
  // 카카오 SDK 로드 (지도 타일/인터랙션만 사용; services.js/Geocoder는 안 씀)
  useKakaoLoader({
    appkey: process.env.REACT_APP_KAKAO_JS_KEY as string,
    libraries: [], // ← services 미사용
  });

  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // addresses 안정화 (참조 변경 최소화)
  const addrList = useMemo<string[]>(
    () => (Array.isArray(addresses) ? addresses : []),
    [addresses]
  );
  const addrHash = useMemo(() => addrList.join(" | "), [addrList]);

  // 최종 마커 좌표(서버 제공 coords 우선)
  const [resolvedPoints, setResolvedPoints] = useState<LatLng[]>([]);
  // centerAddress가 있을 때, 백엔드로 지오코딩한 결과
  const [centerFromAddress, setCenterFromAddress] = useState<LatLng | null>(
    null
  );

  // 컨테이너 리사이즈 시 relayout
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.relayout();
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // 1) 서버에서 이미 coords를 준 경우 → 그대로 사용 (가장 권장)
  useEffect(() => {
    if (Array.isArray(coords) && coords.length > 0) {
      setResolvedPoints(coords);
      return;
    }
    // 2) coords가 없고, 백엔드 지오코딩 엔드포인트와 주소가 있는 경우에만 천천히 지오코딩
    let abort = false;
    (async () => {
      if (!backendGeocodeUrl || addrList.length === 0) {
        setResolvedPoints([]); // 센터만 기본좌표로
        return;
      }
      const out: LatLng[] = [];
      let tries = 0;
      for (const a of addrList) {
        if (abort) return;
        if (tries >= maxGeocodePerMount) {
          // 마운트당 시도 상한 — 남은 건 기본좌표 채워두기
          out.push(DEFAULT_CENTER);
          continue;
        }
        const p = await fetchBackendGeocode(backendGeocodeUrl, a);
        out.push(p || DEFAULT_CENTER);
        tries += 1;
      }
      if (!abort) setResolvedPoints(out);
    })();

    return () => {
      abort = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, backendGeocodeUrl, addrHash, maxGeocodePerMount]);

  // 3) centerAddress를 주소로 받아 중심을 잡고 싶을 때 (백엔드 엔드포인트 있을 때만)
  useEffect(() => {
    let abort = false;
    (async () => {
      if (!backendGeocodeUrl || !centerAddress?.trim()) {
        setCenterFromAddress(null);
        return;
      }
      const p = await fetchBackendGeocode(
        backendGeocodeUrl,
        centerAddress.trim()
      );
      if (!abort) setCenterFromAddress(p);
    })();
    return () => {
      abort = true;
    };
  }, [backendGeocodeUrl, centerAddress]);

  // 지도 중심 결정: centerCoord → (centerFromAddress) → resolvedPoints[0] → DEFAULT
  const center: LatLng = useMemo(() => {
    if (centerCoord) return centerCoord;
    if (centerFromAddress) return centerFromAddress;
    if (resolvedPoints.length > 0) return resolvedPoints[0];
    return DEFAULT_CENTER;
  }, [centerCoord, centerFromAddress, resolvedPoints]);

  // 마커 이미지 배열 보정
  const resolvedMarkerImages = useMemo(() => {
    if (!markerImageUrls || markerImageUrls.length === 0) return [];
    if (resolvedPoints.length <= 1) return [markerImageUrls[0]];
    if (markerImageUrls.length === 1)
      return Array(resolvedPoints.length).fill(markerImageUrls[0]);
    return resolvedPoints.map(
      (_p, i) =>
        markerImageUrls[i] ?? markerImageUrls[markerImageUrls.length - 1]
    );
  }, [markerImageUrls, resolvedPoints.length]);

  // 마커 변화 시 화면 맞춤 (+옵션 줌 보정)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;

    if (resolvedPoints.length === 0) {
      map.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
      map.setLevel(level);
      map.relayout();
      return;
    }

    if (resolvedPoints.length === 1) {
      const p = resolvedPoints[0];
      map.setCenter(new window.kakao.maps.LatLng(p.lat, p.lng));
      map.setLevel(Math.max(1, level - 2));
      map.relayout();
      return;
    }

    const bounds = new window.kakao.maps.LatLngBounds();
    resolvedPoints.forEach((p) =>
      bounds.extend(new window.kakao.maps.LatLng(p.lat, p.lng))
    );
    map.setBounds(bounds);

    if (fitBiasAfterBounds && fitBiasAfterBounds !== 0) {
      const cur = map.getLevel();
      const next = Math.max(1, cur + fitBiasAfterBounds);
      if (next !== cur) map.setLevel(next);
    }
    map.relayout();
  }, [resolvedPoints, center, level, fitBiasAfterBounds]);

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
        {resolvedPoints.map((c, idx) => {
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
