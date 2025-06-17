import React, { useEffect, useState } from "react";
import { Map as KakaoMap, MapMarker } from "react-kakao-maps-sdk";

declare global {
  interface Window {
    kakao: any;
  }
}

export interface DetailMapProps {
  addresses: string[];
  level?: number;
  markerImageUrls?: string[];
  markerSize?: { width: number; height: number };
  onMarkerClick?: (idx: number) => void;
}

const DetailMap: React.FC<DetailMapProps> = ({
  addresses,
  level = 8, // 초기 줌 레벨 (약 2km 범위)
  markerImageUrls,
  markerSize = { width: 35, height: 45 },
  onMarkerClick,
}) => {
  const [centers, setCenters] = useState<{ lat: number; lng: number }[]>([]);

  useEffect(() => {
    if (!window.kakao?.maps) {
      console.error("카카오 지도 SDK가 로드되지 않았습니다.");
      return;
    }
    const geocoder = new window.kakao.maps.services.Geocoder();
    Promise.all(
      addresses.map(
        (addr) =>
          new Promise<{ lat: number; lng: number }>((resolve) => {
            geocoder.addressSearch(addr.trim(), (res: any, status: any) => {
              if (status === window.kakao.maps.services.Status.OK) {
                const { x, y } = res[0];
                resolve({ lat: parseFloat(y), lng: parseFloat(x) });
              } else {
                console.warn(`주소 검색 실패 (${addr}):`, status);
                // 실패 시 지도 기본 중심으로
                resolve({ lat: 37.5665, lng: 126.978 });
              }
            });
          })
      )
    ).then((locs) => setCenters(locs));
  }, [addresses]);

  // 첫 번째 좌표를 중심으로 사용
  const center = centers[0] || { lat: 37.5665, lng: 126.978 };

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <KakaoMap
        center={center}
        isPanto
        level={level}
        style={{ width: "100%", height: "100%" }}
      >
        {centers.map((c, idx) => {
          const src = markerImageUrls ? markerImageUrls[idx] : undefined;
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
