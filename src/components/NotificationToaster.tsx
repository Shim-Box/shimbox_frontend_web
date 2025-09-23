import React from "react";
import { useNotifications } from "../context/NotificationsProvider";
import "../styles/NotificationToaster.css";

const NotificationToaster: React.FC = () => {
  const { notices, remove } = useNotifications();

  return (
    <div className="notice-stack" aria-live="polite" aria-atomic="true">
      {notices.map((n) => (
        <div key={n.id} className={`notice ${n.type}`}>
          <div className="notice-head">
            <strong>{n.title}</strong>
            <button
              className="notice-close"
              onClick={() => remove(n.id)}
              aria-label="닫기"
            >
              ×
            </button>
          </div>
          <div className="notice-body">{n.message}</div>
        </div>
      ))}
    </div>
  );
};

export default NotificationToaster;
