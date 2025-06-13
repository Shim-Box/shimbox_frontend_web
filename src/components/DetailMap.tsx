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
  /** 단일 URL 또는 각 마커별 배열 길이와 같은 배열로 전달 */
  markerImageUrl?: string;
  markerImageUrls?: string[];
  /** 마커 아이콘 크기 (width, height) */
  markerSize?: { width: number; height: number };
}

const DetailMap: React.FC<DetailMapProps> = ({
  addresses,
  level = 3,
  markerImageUrl,
  markerImageUrls,
  markerSize = { width: 30, height: 40 },
}) => {
  const [centers, setCenters] = useState<{ lat: number; lng: number }[]>([]);

  useEffect(() => {
    if (!window.kakao || !window.kakao.maps) {
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
          // 각 마커별 이미지 URL 선택
          const src = markerImageUrls ? markerImageUrls[idx] : markerImageUrl;
          return (
            <MapMarker
              key={idx}
              position={c}
              image={
                src
                  ? {
                      src,
                      size: markerSize,
                    }
                  : undefined
              }
            />
          );
        })}
      </KakaoMap>
    </div>
  );
};

export default DetailMap;
