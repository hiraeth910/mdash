import React, { useEffect, useMemo, useState } from "react";
import { DatePicker, Spin, message, Button, Table, InputNumber, Select } from "antd";
import { LoadingOutlined, HolderOutlined, LeftOutlined, RightOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { saveAs } from "file-saver";
import { Link } from "react-router-dom";
import { apiClient } from "./utils/api";
import "./datatable.css";
import { checkAuthAndHandleLogout } from "./authcheck";
import { useUserStore } from "./store/store";
import { downloadTableImage, renderTableImage, type TableImage } from "./utils/tableImage";

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

const isTotalKey = (key: unknown) => String(key).startsWith("total");
const round2 = (v: number) => Math.round(v * 100) / 100;

// A row of the table of picked groups: a group, or one of the closing rows under it.
type PickedRow = {
  key: number | string;
  kind: "group" | "total" | "ld" | "day" | "old" | "final";
  group_name: string;
  pnl: number;
};

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

  // Groups the viewer has ticked; they leave their own table and gather in the table on the right.
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState<(number | string)[]>([]);
  const [ldPercent, setLdPercent] = useState<number | null>(null);
  const [oldType, setOldType] = useState<"due" | "payment">("due");
  const [oldAmount, setOldAmount] = useState<number | null>(null);

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

  const pickedGroups = useMemo(() => tableRows.filter((r) => picked.includes(r.key)), [tableRows, picked]);
  const pickedTotal = pickedGroups.reduce((sum, r) => sum + r.pnl, 0);
  // The percent is taken from the total with its sign and subtracted, so "minus a minus" adds back:
  // a payment of -1000 with 10% gives L/D -100 and a final of -900.
  const ldAmount = round2((pickedTotal * (ldPercent || 0)) / 100);
  const dayAmount = round2(pickedTotal - ldAmount);
  const dayLabel = dayAmount < 0 ? "Day payment" : "Day due";
  // What was carried over from before: a due adds to the day, a payment takes away from it.
  const oldDelta = oldType === "due" ? oldAmount || 0 : -(oldAmount || 0);
  const finalAmount = round2(dayAmount + oldDelta);
  const finalLabel = finalAmount < 0 ? "Final payment" : "Final due";

  // Ticked groups stay in their own table and are copied into the table on the right.
  const pick = (keys: (number | string)[]) => setPicked((p) => [...p, ...keys.filter((k) => !p.includes(k))]);
  const unpick = (keys: (number | string)[]) => setPicked((p) => p.filter((k) => !keys.includes(k)));

  // The box on a table's header ticks (or clears) every group in that table.
  const selection = (rows: RowData[]) =>
    selectMode
      ? {
          selectedRowKeys: picked as React.Key[],
          onSelect: (record: RowData, selected: boolean) => (selected ? pick([record.key]) : unpick([record.key])),
          onSelectAll: (selected: boolean) => (selected ? pick(rows.map((r) => r.key)) : unpick(rows.map((r) => r.key))),
          getCheckboxProps: (record: RowData) => ({ disabled: isTotalKey(record.key) }),
          renderCell: (_: unknown, record: RowData, __: number, node: React.ReactNode) => (isTotalKey(record.key) ? null : node),
        }
      : undefined;

  const pickedRows: PickedRow[] = [
    ...pickedGroups.map((r) => ({
      key: r.key,
      kind: "group" as const,
      group_name: r.group_name,
      pnl: r.pnl,
    })),
    { key: "total-picked", kind: "total", group_name: "Total", pnl: pickedTotal },
    { key: "total-ld", kind: "ld", group_name: "", pnl: ldAmount },
    { key: "total-day", kind: "day", group_name: "", pnl: dayAmount },
    { key: "total-old", kind: "old", group_name: "", pnl: oldDelta },
    { key: "total-final", kind: "final", group_name: "", pnl: finalAmount },
  ];

  const pickedImage = (): TableImage => {
    const date = selectedDate;
    const tone = (v: number) => (v < 0 ? ("negative" as const) : ("positive" as const));
    return {
      title: `Selected groups — ${date}`,
      fileName: `Selected_groups_${date}.png`,
      sections: [
        {
          columns: [{ header: "Group Name" }, { header: "Profit/Loss", align: "right" }],
          rows: [
            ...pickedGroups.map((g) => ({ cells: [g.group_name, String(g.pnl)], tone: tone(g.pnl) })),
            { cells: ["Total", String(pickedTotal)], bold: true, shaded: true, tone: tone(pickedTotal) },
            { cells: [`L/D ${ldPercent || 0}%`, String(ldAmount)] },
            { cells: [dayLabel, String(dayAmount)], bold: true, tone: tone(dayAmount) },
            ...((oldAmount || 0) > 0 ? [{ cells: [oldType === "due" ? "Old due" : "Old payment", String(oldDelta)], tone: tone(oldDelta) }] : []),
            { cells: [finalLabel, String(finalAmount)], bold: true, shaded: true, tone: tone(finalAmount) },
          ],
        },
      ],
    };
  };

  // Puts the picture on the clipboard; browsers that cannot copy images download it instead.
  const copyPickedImage = async () => {
    const image = pickedImage();
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": renderTableImage(image) })]);
      message.success("Image copied. Paste it where you want to send it.");
    } catch {
      downloadTableImage(image).catch(() => message.error("Could not create the image"));
      message.info("Couldn't copy the image here, so it was downloaded instead.");
    }
  };

  const pickedColumns = [
    {
      title: "Group Name",
      dataIndex: "group_name",
      key: "group_name",
      render: (_: unknown, r: PickedRow) =>
        r.kind === "ld" ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <strong>L/D</strong>
            <InputNumber
            size="small"
            min={0}
            max={100}
            value={ldPercent}
            onChange={(v) => setLdPercent(v === null ? null : Number(v))}
            addonAfter="%"
            placeholder="L/D %"
            aria-label="L/D percent"
            style={{ width: 120 }}
            />
          </span>
        ) : r.kind === "day" ? (
          <strong>{dayLabel}</strong>
        ) : r.kind === "old" ? (
          <Select
            size="small"
            value={oldType}
            onChange={setOldType}
            getPopupContainer={() => document.body}
            style={{ width: 130 }}
            options={[
              { value: "due", label: "Old due" },
              { value: "payment", label: "Old payment" },
            ]}
          />
        ) : r.kind === "final" ? (
          <strong>{finalLabel}</strong>
        ) : (
          r.group_name
        ),
    },
    {
      title: "Profit/Loss",
      dataIndex: "pnl",
      key: "pnl",
      render: (_: unknown, r: PickedRow) =>
        r.kind === "old" ? (
          <InputNumber
            size="small"
            min={0}
            value={oldAmount}
            onChange={(v) => setOldAmount(v === null ? null : Math.max(Number(v) || 0, 0))}
            aria-label="Old balance amount"
            style={{ width: 120 }}
          />
        ) : r.kind === "day" || r.kind === "final" ? (
          <strong style={{ color: r.pnl < 0 ? "red" : "#009416ff", textAlign: "right", display: "block" }}>{r.pnl}</strong>
        ) : r.kind === "ld" ? (
          <span style={{ textAlign: "right", display: "block" }}>{r.pnl}</span>
        ) : (
          pnlCell(r.pnl)
        ),
    },
  ];

  const pickedPanel =
    selectMode || pickedGroups.length > 0 ? (
      <div className="day-picked">
        <div className="day-picked__head">
          <h3 className="day-picked__title">Selected groups</h3>
          <Button size="small" onClick={copyPickedImage} disabled={pickedGroups.length === 0}>
            Copy image
          </Button>
        </div>
        {pickedGroups.length === 0 ? (
          <p className="day-hint">Tick groups in the tables; they are listed here too.</p>
        ) : (
          <Table
            columns={pickedColumns}
            dataSource={pickedRows}
            pagination={false}
            bordered
            size="small"
            rowClassName={(r) => (r.kind === "group" ? "" : "total-row")}
            rowSelection={{
              selectedRowKeys: pickedGroups.map((g) => g.key),
              onSelect: (record, selected) => !selected && unpick([record.key]),
              onSelectAll: (selected) => !selected && setPicked([]),
              getCheckboxProps: (record) => ({ disabled: record.kind !== "group" }),
              renderCell: (_, record, __, node) => (record.kind === "group" ? node : null),
            }}
          />
        )}
      </div>
    ) : null;

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
          {tableRows.length > 0 && (
            <Button type={selectMode ? "primary" : "default"} ghost={selectMode} onClick={() => setSelectMode((m) => !m)}>
              {selectMode ? "Done selecting" : "Select"}
            </Button>
          )}
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
          <div className="day-split">
          <div className="day-main">
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
                  rowSelection={selection(s.rows)}
                  pagination={false}
                  bordered
                  size="small"
                  rowClassName={(record) => (String(record.key).startsWith("total") ? "total-row" : "")}
                />
              </div>
            ))}
          </div>
          </div>
          {pickedPanel}
          </div>
        </>
      ) : (
        <div className="day-split" style={{ justifyContent: "center" }}>
          <div className="table-container day-main" style={{ marginTop: 20, maxWidth: "600px" }}>
            <Table
              columns={columns}
              dataSource={[...tableRows, { key: "total", group_name: "Total", pnl: aggregatedSum, admin_id: null }]}
              rowSelection={selection(tableRows)}
              pagination={false}
              bordered
              rowClassName={(record) => (record.key === "total" ? "total-row" : "")}
            />
          </div>
          {pickedPanel}
        </div>
      )}
    </div>
  );
};

export default SummaryDashboard;
