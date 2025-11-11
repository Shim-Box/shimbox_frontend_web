// src/components/DetailMap.tsx
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
  addresses?: string[];
  coords?: LatLng[];
  centerCoord?: LatLng;
  centerAddress?: string;
  /** 작을수록 더 확대됨 (기본 6) */
  level?: number;
  markerImageUrls?: string[];
  markerSize?: { width: number; height: number };
  onMarkerClick?: (idx: number) => void;
  /** 여러 마커일 때 fitBounds 후 추가 확대/축소(음수면 확대). 기본 -2 */
  fitBiasAfterBounds?: number;
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
  // ✅ 카카오 SDK는 *오직 이 로더*로만 로드 (index.html의 <script> 금지)
  useKakaoLoader({
    appkey: process.env.REACT_APP_KAKAO_JS_KEY as string,
    libraries: ["services", "clusterer", "drawing"],
  });

  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const addrList = useMemo<string[]>(
    () => (Array.isArray(addresses) ? addresses : []),
    [addresses]
  );

  const [geoPoints, setGeoPoints] = useState<LatLng[]>([]);
  const [addrCenter, setAddrCenter] = useState<LatLng | null>(null);

  // 🔧 반응형 레이아웃: 컨테이너 크기 변경 시 map.relayout()
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.relayout();
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // 🧭 주소 → 좌표 (coords가 없을 때에만 지오코딩)
  useEffect(() => {
    if (Array.isArray(coords) && coords.length > 0) {
      // 좌표가 직접 오면 주소 지오코딩 결과는 비움
      if (geoPoints.length) setGeoPoints([]);
      return;
    }
    if (!addrList.length) {
      if (geoPoints.length) setGeoPoints([]);
      return;
    }
    if (!window.kakao?.maps?.services) return; // SDK 아직이면 다음 렌더에서 자동 재시도

    const geocoder = new window.kakao.maps.services.Geocoder();
    Promise.all(
      addrList.map(
        (addr) =>
          new Promise<LatLng>((resolve) => {
            const q = String(addr || "").trim();
            if (!q) return resolve(DEFAULT_CENTER);
            geocoder.addressSearch(q, (res: any, status: any) => {
              if (
                status === window.kakao.maps.services.Status.OK &&
                Array.isArray(res) &&
                res[0]
              ) {
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
          locs.every(
            (p, i) => p.lat === geoPoints[i]?.lat && p.lng === geoPoints[i]?.lng
          );
        if (!same) setGeoPoints(locs);
      })
      .catch(() => {
        if (geoPoints.length) setGeoPoints([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, addrList, window.kakao?.maps?.services, geoPoints.length]);

  // 🎯 지도 중심 주소 (centerCoord/coords가 없을 때만)
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
    if (!window.kakao?.maps?.services) return;

    const geocoder = new window.kakao.maps.services.Geocoder();
    geocoder.addressSearch(useAddr, (res: any, status: any) => {
      if (
        status === window.kakao.maps.services.Status.OK &&
        Array.isArray(res) &&
        res[0]
      ) {
        const { x, y } = res[0];
        const next = { lat: parseFloat(y), lng: parseFloat(x) };
        if (addrCenter?.lat !== next.lat || addrCenter?.lng !== next.lng) {
          setAddrCenter(next);
        }
      } else {
        if (addrCenter !== null) setAddrCenter(null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    centerCoord,
    coords,
    centerAddress,
    addrList,
    window.kakao?.maps?.services,
    addrCenter,
  ]);

  // 🧩 마커 좌표 원본
  const markerPoints: LatLng[] = useMemo(() => {
    if (Array.isArray(coords) && coords.length > 0) return coords;
    return geoPoints;
  }, [coords, geoPoints]);

  // 🧭 지도 중심 좌표
  const center: LatLng = useMemo(() => {
    if (centerCoord) return centerCoord;
    if (Array.isArray(coords) && coords.length > 0) return coords[0];
    if (addrCenter) return addrCenter;
    if (geoPoints.length > 0) return geoPoints[0];
    return DEFAULT_CENTER;
  }, [centerCoord, coords, addrCenter, geoPoints]);

  // 🔍 마커 변경 시 화면 맞춤(+옵션 줌 보정)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;

    if (markerPoints.length === 0) {
      map.relayout();
      return;
    }

    if (markerPoints.length === 1) {
      const p = markerPoints[0];
      map.setCenter(new window.kakao.maps.LatLng(p.lat, p.lng));
      map.setLevel(Math.max(1, level - 2)); // 단일 마커는 좀 더 확대
      map.relayout();
      return;
    }

    const bounds = new window.kakao.maps.LatLngBounds();
    markerPoints.forEach((p) =>
      bounds.extend(new window.kakao.maps.LatLng(p.lat, p.lng))
    );
    map.setBounds(bounds);

    if (fitBiasAfterBounds && fitBiasAfterBounds !== 0) {
      const cur = map.getLevel();
      const next = Math.max(1, cur + fitBiasAfterBounds);
      if (next !== cur) map.setLevel(next);
    }
    map.relayout();
  }, [markerPoints, level, fitBiasAfterBounds]);

  // 🏷️ 마커 이미지 배열 보정
  const resolvedMarkerImages = useMemo(() => {
    if (!markerImageUrls || markerImageUrls.length === 0) return [];
    if (markerImageUrls.length === markerPoints.length) return markerImageUrls;
    if (markerImageUrls.length === 1)
      return Array(markerPoints.length).fill(markerImageUrls[0]);
    return markerPoints.map(
      (_p, i) =>
        markerImageUrls[i] ?? markerImageUrls[markerImageUrls.length - 1]
    );
  }, [markerImageUrls, markerPoints.length]);

  // 🔑 환경변수 누락 시 안내 (개발 중 디버깅용)
  useEffect(() => {
    if (!process.env.REACT_APP_KAKAO_JS_KEY) {
      // eslint-disable-next-line no-console
      console.warn(
        "[DetailMap] REACT_APP_KAKAO_JS_KEY 가 비어있습니다. .env를 확인하세요."
      );
    }
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
      <KakaoMap
        center={center}
        isPanto
        level={level}
        style={{ width: "100%", height: "100%" }}
        onCreate={(map) => {
          mapRef.current = map;
          // 최초 렌더 직후 강제 레이아웃 (컨테이너가 flex일 때 유용)
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
