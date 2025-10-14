// src/components/PopupNotice.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNotifications } from "../context/NotificationsProvider";
import "../styles/NotificationPopup.css";

const PopupNotice: React.FC = () => {
  const { notices, remove } = useNotifications();
  // 큐의 맨 앞(가장 오래된 것)을 먼저 보여주면, 순차적으로 확인 가능
  const current = useMemo(
    () => (notices.length ? notices[0] : null),
    [notices]
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(!!current);
  }, [current]);

  if (!current || !open) return null;

  const tone =
    current.type === "danger"
      ? "danger"
      : current.type === "warning"
      ? "warning"
      : "info";

  const close = () => {
    setOpen(false);
    remove(current.id);
  };

  return (
    <div className="np-backdrop" role="dialog" aria-modal="true">
      <div className={`np-modal ${tone}`}>
        <div className="np-header">
          <strong>{current.title}</strong>
          <button className="np-close" onClick={close} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="np-body">{current.message}</div>
        <div className="np-actions">
          <button className="np-primary" onClick={close}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
};

export default PopupNotice;
