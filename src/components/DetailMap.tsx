import React, { useEffect, useState } from "react";
import { Map as KakaoMap, MapMarker } from "react-kakao-maps-sdk";

declare global {
  interface Window {
    kakao: any;
  }
}

interface DetailMapProps {
  addresses: string[];
  level?: number;
  markerImageUrl?: string;
  markerImageUrls?: string[];
  markerSize?: { width: number; height: number };
  onMarkerClick?: (index: number) => void; // 클릭 시 콜백
}

const DetailMap: React.FC<DetailMapProps> = ({
  addresses,
  level = 3,
  markerImageUrl,
  markerImageUrls,
  markerSize = { width: 40, height: 40 },
  onMarkerClick,
}) => {
  const [centers, setCenters] = useState<{ lat: number; lng: number }[]>([]);

  useEffect(() => {
    if (!window.kakao?.maps) return;
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
                console.error(`주소 검색 실패 (${addr}):`, status);
                resolve({ lat: 37.5665, lng: 126.978 });
              }
            });
          })
      )
    ).then((locations) => setCenters(locations));
  }, [addresses]);

  const center = centers[0] || { lat: 37.5665, lng: 126.978 };

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <KakaoMap
        center={center}
        isPanto
        style={{ width: "100%", height: "100%" }}
        level={level}
      >
        {centers.map((c, idx) => {
          const src = markerImageUrls ? markerImageUrls[idx] : markerImageUrl;
          return (
            <MapMarker
              key={idx}
              position={c}
              image={src ? { src, size: markerSize } : undefined}
              onClick={() => onMarkerClick?.(idx)} // 클릭 핸들러
            />
          );
        })}
      </KakaoMap>
    </div>
  );
};

export default DetailMap;
