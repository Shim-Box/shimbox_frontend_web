import React, { useEffect, useMemo, useState } from "react";
import { Map as KakaoMap, MapMarker } from "react-kakao-maps-sdk";

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
  /** (선택) 지오코딩용 주소 목록 — coords가 없을 때만 사용 */
  addresses?: string[];
  /** (선택) 마커 좌표 목록 — 주(source). 있으면 주소는 무시 */
  coords?: LatLng[];
  /** (선택) 지도 중심 좌표 — 없으면 coords[0] / addresses[0] / DEFAULT */
  centerCoord?: LatLng;
  /** (선택) 주소 중심 — centerCoord/coords가 없을 때만 사용 */
  centerAddress?: string;
  /** 카카오 레벨 (작을수록 가까이: 5≈1km, 8≈4km 근처) */
  level?: number;
  markerImageUrls?: string[];
  markerSize?: { width: number; height: number };
  onMarkerClick?: (idx: number) => void;
}

const DEFAULT_CENTER: LatLng = { lat: 37.5665, lng: 126.978 };

const DetailMap: React.FC<DetailMapProps> = ({
  addresses,
  coords,
  centerCoord,
  centerAddress,
  level = 8,
  markerImageUrls,
  markerSize = { width: 35, height: 45 },
  onMarkerClick,
}) => {
  const [ready, setReady] = useState(false);
  const [geoPoints, setGeoPoints] = useState<LatLng[]>([]);
  const [addrCenter, setAddrCenter] = useState<LatLng | null>(null);

  const addrList = useMemo<string[]>(
    () => (Array.isArray(addresses) ? addresses : []),
    [addresses]
  );

  useEffect(() => {
    setReady(!!window.kakao?.maps);
  }, []);

  // 주소 → 좌표 변환
  useEffect(() => {
    if (!ready) return;

    if (Array.isArray(coords) && coords.length > 0) return;

    if (!window.kakao.maps.services) return;

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
          locs.every(
            (p, i) => p.lat === geoPoints[i]?.lat && p.lng === geoPoints[i]?.lng
          );
        if (!same) setGeoPoints(locs);
      })
      .catch(() => {
        if (geoPoints.length) setGeoPoints([]);
      });
  }, [ready, addrList, coords]);

  useEffect(() => {
    if (!ready) return;
    if (centerCoord || (Array.isArray(coords) && coords.length > 0)) {
      if (addrCenter !== null) setAddrCenter(null);
      return;
    }
    const useAddr = (centerAddress || addrList[0] || "").trim();
    if (!useAddr || !window.kakao.maps.services) {
      if (addrCenter !== null) setAddrCenter(null);
      return;
    }
    const geocoder = new window.kakao.maps.services.Geocoder();
    geocoder.addressSearch(useAddr, (res: any, status: any) => {
      if (status === window.kakao.maps.services.Status.OK && res?.[0]) {
        const { x, y } = res[0];
        const next = { lat: parseFloat(y), lng: parseFloat(x) };
        if (addrCenter?.lat !== next.lat || addrCenter?.lng !== next.lng) {
          setAddrCenter(next);
        }
      } else {
        if (addrCenter !== null) setAddrCenter(null);
      }
    });
  }, [ready, centerCoord, coords, centerAddress, addrList]);

  // 마커 리스트
  const markerPoints: LatLng[] = useMemo(() => {
    if (Array.isArray(coords) && coords.length > 0) return coords;
    return geoPoints;
  }, [coords, geoPoints]);

  // 중심
  const center: LatLng = useMemo(() => {
    if (centerCoord) return centerCoord;
    if (Array.isArray(coords) && coords.length > 0) return coords[0];
    if (addrCenter) return addrCenter;
    if (geoPoints.length > 0) return geoPoints[0];
    return DEFAULT_CENTER;
  }, [centerCoord, coords, addrCenter, geoPoints]);

  if (!ready) {
    return (
      <div style={{ width: "100%", height: "100%", background: "#e6e6e6" }} />
    );
  }

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <KakaoMap
        center={center}
        isPanto
        level={level}
        style={{ width: "100%", height: "100%" }}
      >
        {markerPoints.map((c, idx) => {
          const src = markerImageUrls?.[idx];
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
