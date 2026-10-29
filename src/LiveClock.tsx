import React, { useEffect, useState } from "react";
import { Calendar, Popover, Radio, Switch } from "antd";
import { CalendarOutlined, SettingOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";

const STORAGE_KEY = "clock-format";

const DATE_FORMATS = [
  { value: "DD-MM-YYYY", label: "04-10-2026" },
  { value: "DD MMM YYYY", label: "04 Oct 2026" },
  { value: "ddd, DD MMM YYYY", label: "Sun, 04 Oct 2026" },
  { value: "YYYY-MM-DD", label: "2026-10-04" },
] as const;

type ClockFormat = { date: string; hour12: boolean; seconds: boolean };

const DEFAULT: ClockFormat = { date: "DD-MM-YYYY", hour12: true, seconds: true };

const load = (): ClockFormat => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (parsed && DATE_FORMATS.some((f) => f.value === parsed.date)) {
      return { date: parsed.date, hour12: !!parsed.hour12, seconds: !!parsed.seconds };
    }
  } catch {
    // use the default
  }
  return DEFAULT;
};

// A digital clock with the date; the cog changes how they are shown and the choice is remembered.
const LiveClock: React.FC = () => {
  const [now, setNow] = useState(dayjs());
  const [format, setFormat] = useState<ClockFormat>(load);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // What the popover calendar is showing -- browsing other months doesn't move this away from
  // today's actual date, and reopening the popover always lands back on today.
  const [calendarMonth, setCalendarMonth] = useState<Dayjs>(now);

  useEffect(() => {
    const id = window.setInterval(() => setNow(dayjs()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const update = (next: Partial<ClockFormat>) => {
    const merged = { ...format, ...next };
    setFormat(merged);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // the choice just is not remembered
    }
  };

  const time = now.format(`${format.hour12 ? "hh" : "HH"}:mm${format.seconds ? ":ss" : ""}${format.hour12 ? " A" : ""}`);

  const settings = (
    <div className="live-clock__settings">
      <div className="live-clock__group">
        <strong>Date</strong>
        <Radio.Group value={format.date} onChange={(e) => update({ date: e.target.value })}>
          {DATE_FORMATS.map((f) => (
            <Radio key={f.value} value={f.value}>
              {f.label}
            </Radio>
          ))}
        </Radio.Group>
      </div>
      <div className="live-clock__group">
        <strong>Time</strong>
        <Radio.Group value={format.hour12 ? "12" : "24"} onChange={(e) => update({ hour12: e.target.value === "12" })}>
          <Radio value="12">12 hour</Radio>
          <Radio value="24">24 hour</Radio>
        </Radio.Group>
        <label className="live-clock__switch">
          <Switch size="small" checked={format.seconds} onChange={(v) => update({ seconds: v })} /> Show seconds
        </label>
      </div>
    </div>
  );

  const calendar = (
    <Calendar
      fullscreen={false}
      value={calendarMonth}
      onPanelChange={(d) => setCalendarMonth(d)}
      onSelect={(d) => setCalendarMonth(d)}
      className="live-clock__calendar"
    />
  );

  return (
    <span className="live-clock" data-testid="live-clock">
      <span className="live-clock__time">{time}</span>
      <Popover
        content={calendar}
        trigger="click"
        placement="bottom"
        open={calendarOpen}
        onOpenChange={(v) => {
          setCalendarOpen(v);
          if (v) setCalendarMonth(dayjs()); // always reopen centered on today
        }}
        getPopupContainer={() => document.body}
      >
        <button type="button" className="live-clock__date live-clock__date-btn" aria-label="View calendar">
          <CalendarOutlined className="live-clock__calendar-icon" />
          {now.format(format.date)}
        </button>
      </Popover>
      <Popover content={settings} title="Clock format" trigger="click" placement="bottomLeft" getPopupContainer={() => document.body}>
        <button type="button" className="live-clock__cog" aria-label="Change clock format">
          <SettingOutlined />
        </button>
      </Popover>
    </span>
  );
};

export default LiveClock;
