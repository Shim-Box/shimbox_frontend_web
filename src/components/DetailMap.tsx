import { useEffect, useState } from "react";
import { Map as KakaoMap, MapMarker } from "react-kakao-maps-sdk";

declare global {
  interface Window {
    kakao: any;
  }
}

interface DetailMapProps {
  address: string;
}

function DetailMap({ address }: DetailMapProps) {
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!window.kakao || !window.kakao.maps) {
      console.error("카카오 지도 SDK가 로드되지 않았습니다.");
      return;
    }

    const geocoder = new window.kakao.maps.services.Geocoder();
    geocoder.addressSearch(address, (result: any, status: any) => {
      if (status === window.kakao.maps.services.Status.OK) {
        const { x, y } = result[0];
        setCenter({ lat: y, lng: x });
        setIsLoading(false);
      } else {
        console.error("주소 검색 실패:", status);
      }
    });
  }, [address]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      {center && (
        <KakaoMap
          center={center}
          isPanto={true}
          style={{ width: "100%", height: "100%" }}
          level={2}
        >
          {!isLoading && <MapMarker position={center} />}
        </KakaoMap>
      )}
    </div>
  );
}

export default DetailMap;
