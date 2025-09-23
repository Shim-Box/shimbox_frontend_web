import React, { useEffect, useMemo, useRef, useState } from "react";
import "../styles/Footer.css";

export type FooterFilters = {
  residence?: string;
  attendance?: "출근전" | "출근" | "퇴근";
  conditionStatus?: "위험" | "불안" | "좋음";
};

interface FooterProps {
  onSearch: (filters: FooterFilters, nameQuery?: string) => void;
  placeholder?: string;
}

const ATTENDANCE = ["출근전", "출근", "퇴근"] as const;
const CONDITIONS = ["위험", "불안", "좋음"] as const;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

const Footer: React.FC<FooterProps> = ({
  onSearch,
  placeholder = "이름, 근무지, 상태(출근/퇴근/출근전/위험/불안/좋음) 조합 검색",
}) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 시계
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const tokens = clean(q)
      .split(/[,\s]+/)
      .map((t) => clean(t))
      .filter(Boolean);

    const filters: FooterFilters = {};
    const nameParts: string[] = [];

    tokens.forEach((t) => {
      if ((ATTENDANCE as readonly string[]).includes(t)) {
        filters.attendance = t as FooterFilters["attendance"];
        return;
      }
      if ((CONDITIONS as readonly string[]).includes(t)) {
        filters.conditionStatus = t as FooterFilters["conditionStatus"];
        return;
      }
      if (/[구군시동면읍]$/.test(t) || t.length >= 2) {
        if (
          /^(?:[가-힣]{2,4}|[A-Za-z]+)$/.test(t) &&
          !/구$|군$|시$|동$|면$|읍$/.test(t)
        ) {
          nameParts.push(t);
        } else {
          filters.residence = t;
        }
        return;
      }
      nameParts.push(t);
    });

    const nameQuery = nameParts.join(" ").trim() || undefined;
    onSearch(filters, nameQuery);
  };

  const { timeStr, dateStr } = useMemo(() => {
    const h24 = now.getHours();
    const mm = String(now.getMinutes()).padStart(2, "0");
    const period = h24 < 12 ? "오전" : "오후";
    const h12 = h24 % 12 || 12;

    const yyyy = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const weekday = now
      .toLocaleDateString("ko-KR", { weekday: "short" })
      .replace(".", "");

    return {
      timeStr: `${period} ${h12}:${mm}`,
      dateStr: `${yyyy}-${m}-${dd} (${weekday})`,
    };
  }, [now]);

  return (
    <footer className="app-footer">
      <div className={`footer-left ${open ? "open" : ""}`}>
        <button
          className="search-icon-btn"
          aria-label="검색"
          onClick={() => setOpen((v) => !v)}
          title="검색"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="11"
              cy="11"
              r="7"
              stroke="currentColor"
              strokeWidth="2"
            ></circle>
            <line
              x1="16.65"
              y1="16.65"
              x2="21"
              y2="21"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            ></line>
          </svg>
        </button>

        <form className="footer-search-form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="footer-search-input"
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
          />
        </form>
      </div>

      <div className="footer-right">
        <div className="clock-box" role="timer" aria-live="polite">
          <span className="clock-time">{timeStr}</span>
          <span className="clock-date">{dateStr}</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
