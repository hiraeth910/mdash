import React, { useEffect, useState } from "react";
import { DatePicker, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { Link } from "react-router-dom";
import { apiClient } from "./utils/api";
import { checkAuthAndHandleLogout } from "./authcheck";
import "./datatable.css";

const { RangePicker } = DatePicker;

interface DayStat {
  day: string;
  images: number;
  events: number;
  users: number;
}

// How many images users pasted into the ChatGPT extraction button on Insert History, day by day,
// over a date range the platform admin picks.
const ImagePasteStats: React.FC = () => {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(6, "day"), dayjs()]);
  const [rows, setRows] = useState<DayStat[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStats = async (start: Dayjs, end: Dayjs) => {
    setLoading(true);
    try {
      const stillLoggedIn = await checkAuthAndHandleLogout();
      if (!stillLoggedIn) return;
      const response = await apiClient.get<DayStat[]>("/image-paste-stats", {
        params: { start: start.format("YYYY-MM-DD"), end: end.format("YYYY-MM-DD") },
      });
      setRows(response.data || []);
    } catch {
      message.error("Failed to load paste stats");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats(range[0], range[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (!dates || !dates[0] || !dates[1]) return;
    const next: [Dayjs, Dayjs] = [dates[0], dates[1]];
    setRange(next);
    fetchStats(next[0], next[1]);
  };

  const totals = rows.reduce(
    (acc, r) => ({ images: acc.images + r.images, events: acc.events + r.events }),
    { images: 0, events: 0 }
  );

  const columns: ColumnsType<DayStat> = [
    { title: "Date", dataIndex: "day", key: "day", render: (d: string) => dayjs(d).format("ddd D MMM YYYY") },
    { title: "Images pasted", dataIndex: "images", key: "images", align: "right" },
    { title: "Paste events", dataIndex: "events", key: "events", align: "right" },
    { title: "Users", dataIndex: "users", key: "users", align: "right" },
  ];

  return (
    <div className="data-page">
      <div className="header top-nav">
        <Link to="/users">Users</Link>
        <Link to="/games">Games</Link>
        <Link to="/groups">Groups</Link>
        <Link to="/result/:gameid/:gamename">Settlement</Link>
        <Link to="/summary">Day</Link>
        <Link to="/compare">Compare</Link>
        <Link to="/image-paste-stats" className="active">ChatGPT pastes</Link>
      </div>
      <div className="new-header" style={{ maxHeight: "none" }}>
        <h2>Images pasted into ChatGPT</h2>
        <div className="inputs-row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <RangePicker value={range} format="DD-MM-YYYY" onChange={onRangeChange} allowClear={false} />
        </div>
      </div>

      <div className="compare-summary" style={{ margin: "4px 0 16px" }}>
        {totals.images} image{totals.images === 1 ? "" : "s"} across {totals.events} paste{totals.events === 1 ? "" : "s"} in this range
      </div>

      <Table<DayStat>
        dataSource={rows}
        columns={columns}
        rowKey="day"
        loading={loading}
        pagination={false}
        locale={{ emptyText: "No images were pasted into ChatGPT in this range." }}
      />
    </div>
  );
};

export default ImagePasteStats;
