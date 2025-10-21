import React, { useEffect, useState } from "react";
import { Map as KakaoMap, MapMarker } from "react-kakao-maps-sdk";

declare global {
  interface Window {
    kakao: any;
  }
}

export interface DetailMapProps {
  /** 마커로 표시할 주소들 */
  addresses: string[];
  /** 중심을 이 주소로 이동(마커와 별개). 없으면 addresses[0] 사용 */
  centerAddress?: string;
  level?: number;
  markerImageUrls?: string[];
  markerSize?: { width: number; height: number };
  onMarkerClick?: (idx: number) => void;
}

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청

const DetailMap: React.FC<DetailMapProps> = ({
  addresses,
  centerAddress,
  level = 8,
  markerImageUrls,
  markerSize = { width: 35, height: 45 },
  onMarkerClick,
}) => {
  const [markerCenters, setMarkerCenters] = useState<
    { lat: number; lng: number }[]
  >([]);
  const [center, setCenter] = useState<{ lat: number; lng: number }>(
    DEFAULT_CENTER
  );

  // 주소 → 마커 좌표
  useEffect(() => {
    if (!window.kakao?.maps || !window.kakao.maps.services) {
      console.error("카카오 지도 SDK가 로드되지 않았습니다.");
      return;
    }
    const geocoder = new window.kakao.maps.services.Geocoder();

    Promise.all(
      (addresses ?? []).map(
        (addr) =>
          new Promise<{ lat: number; lng: number }>((resolve) => {
            const query = (addr || "").trim();
            if (!query) return resolve(DEFAULT_CENTER);
            geocoder.addressSearch(query, (res: any, status: any) => {
              if (status === window.kakao.maps.services.Status.OK && res?.[0]) {
                const { x, y } = res[0];
                resolve({ lat: parseFloat(y), lng: parseFloat(x) });
              } else {
                console.warn(`주소 검색 실패 (${query}):`, status);
                resolve(DEFAULT_CENTER);
              }
            });
          })
      )
    ).then((locs) => setMarkerCenters(locs));
  }, [addresses]);

  // 중심 좌표(별도 주소가 있으면 그것 기준, 없으면 첫 마커/기본)
  useEffect(() => {
    if (!window.kakao?.maps || !window.kakao.maps.services) return;
    const geocoder = new window.kakao.maps.services.Geocoder();

    const useAddr = (centerAddress || addresses?.[0] || "").trim();
    if (!useAddr) {
      setCenter(markerCenters[0] || DEFAULT_CENTER);
      return;
    }
    geocoder.addressSearch(useAddr, (res: any, status: any) => {
      if (status === window.kakao.maps.services.Status.OK && res?.[0]) {
        const { x, y } = res[0];
        setCenter({ lat: parseFloat(y), lng: parseFloat(x) });
      } else {
        setCenter(markerCenters[0] || DEFAULT_CENTER);
      }
    });
  }, [centerAddress, addresses, markerCenters]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <KakaoMap
        center={center}
        isPanto
        level={level}
        style={{ width: "100%", height: "100%" }}
      >
        {markerCenters.map((c, idx) => {
          const src = markerImageUrls?.[idx];
          return (
            <MapMarker
              key={idx}
              position={c}
              image={src ? { src, size: markerSize } : undefined}
              onClick={() => onMarkerClick && onMarkerClick(idx)}
            />
          );
        })}
      </KakaoMap>
    </div>
  );
};

export default DetailMap;
