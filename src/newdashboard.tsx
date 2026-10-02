import React, { useEffect, useMemo, useState } from "react";
import { DatePicker, Spin, message, Button, Table } from "antd";
import { LoadingOutlined, HolderOutlined, LeftOutlined, RightOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { saveAs } from "file-saver";
import { Link } from "react-router-dom";
import { apiClient } from "./utils/api";
import "./datatable.css";
import { checkAuthAndHandleLogout } from "./authcheck";
import { useUserStore } from "./store/store";

type IGroup = {
  group_id: number;
  group_name: string;
  admin_id?: number | null;
};

type RowData = {
  key: number | string;
  group_name: string;
  pnl: number;
  admin_id: number | null;
};

type AdminSection = {
  adminId: number;
  adminName: string;
  rows: RowData[];
  total: number;
};

type IUserRow = { user_id: number; user_name: string; admin_id: number | null };

const ORDER_KEY = "day-admin-order";

const readOrder = (): number[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(ORDER_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(Number) : [];
  } catch {
    return [];
  }
};

const saveOrder = (ids: number[]) => {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
  } catch {
    // Order is a convenience; ignore storage failures.
  }
};

const pnlCell = (value: number) => (
  <span style={{ color: value < 0 ? "red" : "#009416ff", textAlign: "right", display: "block" }}>{value}</span>
);

const columns = [
  { title: "Group Name", dataIndex: "group_name", key: "group_name" },
  { title: "Profit/Loss", dataIndex: "pnl", key: "pnl", render: pnlCell },
];

const SummaryDashboard: React.FC = () => {
  const { userRole } = useUserStore();
  const isSuper = userRole === "superadmin";
  const [groups, setGroups] = useState<IGroup[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(dayjs().format("YYYY-MM-DD"));
  const [tableRows, setTableRows] = useState<RowData[]>([]);
  const [aggregatedSum, setAggregatedSum] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [adminNames, setAdminNames] = useState<Record<number, string>>({});
  const [order, setOrder] = useState<number[]>(readOrder);
  const [dragging, setDragging] = useState<number | null>(null);

  const loaderIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const stillLoggedIn = await checkAuthAndHandleLogout();
        if (!stillLoggedIn) return;
        const res = await apiClient.get<IGroup[]>("/groups");
        const groupData = res.data;
        setGroups(groupData);
        if (isSuper) {
          const usersRes = await apiClient.get<{ users: IUserRow[] }>("/users");
          const names: Record<number, string> = {};
          usersRes.data.users.forEach((u) => {
            if (u.admin_id !== null && u.user_id === u.admin_id) names[u.user_id] = u.user_name;
          });
          setAdminNames(names);
        }
        await fetchDataForGroups(groupData, selectedDate);
      } catch {
        message.error("Failed to load groups or data");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (groups.length > 0) {
      fetchDataForGroups(groups, selectedDate);
    }
  }, [selectedDate]);

  const fetchDataForGroups = async (groupList: IGroup[], date: string) => {
    setLoading(true);
    try {
      const results = await Promise.all(
        groupList.map(async (g) => {
          const res = await apiClient.post("/group-payments-by-date", {
            gamedate: date,
            groupid: g.group_id,
            gameid: 0,
          });
          const data = res.data;
          return data.length > 0 ? data[data.length - 1].res_win_amt : 0;
        })
      );

      const rows: RowData[] = groupList.map((g, idx) => ({
        key: g.group_id,
        group_name: g.group_name,
        pnl: results[idx],
        admin_id: g.admin_id ?? null,
      }));

      setTableRows(rows);
      setAggregatedSum(results.reduce((sum, val) => sum + val, 0));
    } catch {
      message.error("Failed to fetch data for groups");
    } finally {
      setLoading(false);
    }
  };

  // One section per admin account, in the order this viewer last arranged them.
  const sections: AdminSection[] = useMemo(() => {
    if (!isSuper) return [];
    const byAdmin = new Map<number, RowData[]>();
    tableRows.forEach((r) => {
      const id = r.admin_id ?? 0;
      byAdmin.set(id, [...(byAdmin.get(id) || []), r]);
    });
    const list = [...byAdmin.entries()].map(([adminId, rows]) => ({
      adminId,
      adminName: adminNames[adminId] || `Admin #${adminId}`,
      rows,
      total: rows.reduce((s, r) => s + r.pnl, 0),
    }));
    const rank = (id: number) => {
      const i = order.indexOf(id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return list.sort((a, b) => rank(a.adminId) - rank(b.adminId) || a.adminName.localeCompare(b.adminName));
  }, [isSuper, tableRows, adminNames, order]);

  const moveSection = (fromId: number, toIndex: number) => {
    const ids = sections.map((s) => s.adminId).filter((id) => id !== fromId);
    ids.splice(Math.max(0, Math.min(toIndex, ids.length)), 0, fromId);
    setOrder(ids);
    saveOrder(ids);
  };

  // The Recalculate button now lives in the header; show the new figures when it finishes.
  useEffect(() => {
    const refresh = () => {
      if (groups.length > 0) fetchDataForGroups(groups, selectedDate);
    };
    window.addEventListener("recalculated", refresh);
    return () => window.removeEventListener("recalculated", refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, selectedDate]);

  const exportToCSV = () => {
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    let csv = "";
    if (isSuper) {
      csv = "Admin,Group Name,Profit/Loss\n";
      sections.forEach((s) => {
        s.rows.forEach((row) => {
          csv += `${q(s.adminName)},${q(row.group_name)},${row.pnl}\n`;
        });
        csv += `${q(s.adminName)},Total,${s.total}\n`;
      });
      csv += `All admins,Total,${aggregatedSum}\n`;
    } else {
      csv = "Group Name,Profit/Loss\n";
      tableRows.forEach((row) => {
        csv += `${q(row.group_name)},${row.pnl}\n`;
      });
      csv += `Total,${aggregatedSum}\n`;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `Summary_${selectedDate}.csv`);
  };

  return (
    <div className="data-page">
      <div className="header top-nav">
        <Link to="/users">Users</Link>
        <Link to="/games">Games</Link>
        <Link to="/groups">Groups</Link>
        <Link to="/result/:gameid/:gamename">Settlement</Link>
        <Link to="/summary" className="active">Day</Link>
            {userRole === "superadmin" && <Link to="/compare">Compare</Link>}
      </div>
      <div className="new-header" style={{ maxHeight: "none" }}>
        <h2>Day Profit and Loss</h2>
        <div className="inputs-row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <DatePicker
            value={dayjs(selectedDate)}
            onChange={(date) => setSelectedDate(date?.format("YYYY-MM-DD") || selectedDate)}
          />
          <Button type="primary" onClick={exportToCSV}>
            Download CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="loading-container" style={{ textAlign: "center", padding: 50 }}>
          <Spin indicator={loaderIcon} />
        </div>
      ) : tableRows.length === 0 ? (
        <div style={{ textAlign: "center", marginTop: 20 }}>No data available</div>
      ) : isSuper ? (
        <>
          <div className="day-grand-total">
            <span>All admins</span>
            <span style={{ color: aggregatedSum < 0 ? "red" : "#009416ff" }}>{aggregatedSum}</span>
          </div>
          <p className="day-hint">Drag a table by its header to reorder. The order is remembered on this browser.</p>
          <div className="day-admin-grid">
            {sections.map((s, index) => (
              <div
                key={s.adminId}
                className={`day-admin-card ${dragging === s.adminId ? "is-dragging" : ""}`}
                draggable
                onDragStart={(e) => {
                  setDragging(s.adminId);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => setDragging(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging !== null && dragging !== s.adminId) moveSection(dragging, index);
                  setDragging(null);
                }}
              >
                <div className="day-admin-card__header">
                  <HolderOutlined className="day-admin-card__handle" aria-hidden />
                  <span className="day-admin-card__title">{s.adminName}</span>
                  <span className="day-admin-card__total" style={{ color: s.total < 0 ? "red" : "#009416ff" }}>
                    {s.total}
                  </span>
                  <Button
                    size="small"
                    type="text"
                    icon={<LeftOutlined />}
                    aria-label={`Move ${s.adminName} earlier`}
                    disabled={index === 0}
                    onClick={() => moveSection(s.adminId, index - 1)}
                  />
                  <Button
                    size="small"
                    type="text"
                    icon={<RightOutlined />}
                    aria-label={`Move ${s.adminName} later`}
                    disabled={index === sections.length - 1}
                    onClick={() => moveSection(s.adminId, index + 1)}
                  />
                </div>
                <Table
                  columns={columns}
                  dataSource={[...s.rows, { key: `total-${s.adminId}`, group_name: "Total", pnl: s.total, admin_id: s.adminId }]}
                  pagination={false}
                  bordered
                  size="small"
                  rowClassName={(record) => (String(record.key).startsWith("total") ? "total-row" : "")}
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="table-container" style={{ marginTop: 20, maxWidth: "600px", marginLeft: "auto", marginRight: "auto" }}>
          <Table
            columns={columns}
            dataSource={[...tableRows, { key: "total", group_name: "Total", pnl: aggregatedSum, admin_id: null }]}
            pagination={false}
            bordered
            rowClassName={(record) => (record.key === "total" ? "total-row" : "")}
          />
        </div>
      )}
    </div>
  );
};

export default SummaryDashboard;
