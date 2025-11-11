import { jsPDF } from "jspdf";
import React, { useEffect, useState, useRef } from "react";
import { Table, Button, DatePicker, Grid, Select, Spin, message } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { apiClient } from "./utils/api";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useUserStore } from "./store/store";
import "./datatable.css";
import { IGame } from "./games";
import { checkAuthAndHandleLogout } from "./authcheck";

export interface IGroup {
  id: number;
  groupname: string;
}

export interface IUser {
  user_id: number;
  user_name: string;
}

export interface IDataItem {
  itypeid: number;
  itypename: string;
  inumber: string | number;
  total_amount: number;
  adjusted_amount?: number;
  __isBucket?: boolean;
  bucketLabel?: string;
  bucketIndex?: number;
}

const { Option } = Select;

interface RequestBody {
  date?: string;
  gameid?: number | null;
  userid?: number | null;
  game?: number | null;
  groupid?: number[];
}

const DataTables: React.FC = () => {
  const { gameid, gamename } = useParams<{ gameid: string; gamename: string }>();
  const { userRole, userId } = useUserStore();
  const navigate = useNavigate();
  const [percentage, setPercentage] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [userGroups, setUserGroups] = useState<IGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<IGroup | null>(null);
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [users, setUsers] = useState<IUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [groupedData, setGroupedData] = useState<{ [key: string]: { typename: string; data: IDataItem[] } }>({});
  const [total, setTotal] = useState<number>(0);
  const [games, setGames] = useState<IGame[]>([]);
  const [selectedGame, setSelectedGame] = useState<IGame | null>(null);
  const [pickedGroups, setPickedGroups] = useState<IGroup[]>([]);
  const scrollRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const adjustedTotal = total - (total * (percentage || 0)) / 100;
  const formatNumber = (value: number | string) =>
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value) || 0);



  const addGroup = (group: IGroup) => {
    if (!pickedGroups.some((g) => g.id === group.id)) {
      setPickedGroups((prev) => [...prev, group]);
    }
  };

  const removeGroup = (groupId: number) => {
    setPickedGroups((prev) => prev.filter((g) => g.id !== groupId));
  };

  const handleUserChange = (userName: string) => {
    setSelectedUser(userName);
  };

  const fetchUserGroups = async () => {
    try {
      const stillLoggedIn = await checkAuthAndHandleLogout();
      if (!stillLoggedIn) return;
      const groupsResponse = await apiClient.get(`/user/groups/${selectedUserId}`);
      setUserGroups(groupsResponse.data);
    } catch {
      message.error("Failed to fetch user groups");
    }
  };

  useEffect(() => {
    if (games.length > 0 && gameid) {
      const initialGame = games.find((game) => game.gameid.toString() === gameid);
      if (initialGame) {
        setSelectedGame(initialGame);
      }
    }
  }, [games, gameid]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const stillLoggedIn = await checkAuthAndHandleLogout();
      if (!stillLoggedIn) return;
      const gameresponse = await apiClient.get("/games");
      setGames(gameresponse.data);
      const response = await apiClient.get("/users");
      const allUsers: IUser[] = response.data.users;
      const currentUser = allUsers.find((user: IUser) => user.user_id === userId);
      const filteredUsers = allUsers.filter((user: IUser) => user.user_id !== userId);
      setUsers(filteredUsers);
      setSelectedUser(userRole === "admin" ? "Game" : currentUser?.user_name || null);
      if (userRole !== "admin") {
        setSelectedUserId(currentUser?.user_id ?? null);
      }
    } catch {
      message.error("Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userRole && userId !== null) {
      fetchUsers();
    }
  }, [userRole, userId]);

  useEffect(() => {
    if (selectedUser && selectedUser !== "Game") {
      const user = users.find((user: any) => user.user_name === selectedUser);
      setSelectedUserId(user ? user.user_id : null);
      setSelectedGroup(null);
    } else {
      setSelectedUserId(null);
      setSelectedGroup(null);
    }
  }, [selectedUser, users]);

  useEffect(() => {
    if (selectedUserId !== null) {
      fetchUserGroups();
    } else {
      setUserGroups([]);
    }
  }, [selectedUserId]);

  useEffect(() => {
    if (selectedUser !== null && selectedGame) {
      fetchData();
    }
  }, [selectedDate, selectedUser, selectedGroup, selectedUserId, selectedGame, pickedGroups]);

    // helper: snap value to nearest/floor/ceil tens
const snapToTens = (v: number, mode: "floor" | "nearest" | "ceil" = "floor") => {
  if (!isFinite(v)) return v;
  // default behavior: floor to tens
  if (mode === "floor") return Math.floor(v / 10) * 10;
  if (mode === "ceil") return Math.ceil(v / 10) * 10;

  // mode === "nearest" with tie-breaker that sends .5 downwards (e.g., 15 -> 10)
  // use absolute value and reapply sign to avoid issues with negative numbers
  const sign = Math.sign(v) || 1;
  const absQ = Math.abs(v) / 10;
  const floorQ = Math.floor(absQ);
  const frac = absQ - floorQ;
  const EPS = 1e-9;
  if (Math.abs(frac - 0.5) < EPS) {
    // exactly halfway: choose the lower ten (i.e., round down)
    return sign * floorQ * 10;
  }
  // otherwise use normal nearest rounding on the absolute value
  return sign * Math.round(absQ) * 10;
}


  const fetchData = async () => {
    setLoading(true);
    try {
      let endpoint = "";
      let requestBody: RequestBody = {};
      if (selectedUser === "Game") {
        endpoint = "/data-by-date";
        requestBody = {
          date: selectedDate,
          gameid: selectedGame?.gameid,
        };
      } else {
        endpoint = "/summed-history-by-uid";
        const groupIds = pickedGroups.map((g) => g.id);
        requestBody = {
          userid: selectedUserId || userId,
          date: selectedDate,
          game: selectedGame?.gameid,
          groupid: groupIds,
        };
      }
      const response = await apiClient.post(endpoint, requestBody);
      setTotal(response.data.reduce((sum: number, item: IDataItem) => sum + item.total_amount, 0));

      // Group by type id
      const orderedGroupedData: { [key: string]: { typename: string; data: any[] } } = {};
      response.data.forEach((item: any) => {
        if (!orderedGroupedData[item.itypeid]) {
          orderedGroupedData[item.itypeid] = { typename: item.itypename, data: [] };
        }
        orderedGroupedData[item.itypeid].data.push(item);
      });
      setGroupedData(orderedGroupedData);
    } catch {
      message.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV=(mode: "open" | "close") => {
  const openTypeIds = new Set([2, 3, 4]);
  const closeTypeIds = new Set([7, 9]);
  const allowed = mode === "open" ? openTypeIds : closeTypeIds;

  const filenameBase = `${gamename}_${selectedDate}_${mode}`;
  const filename = `${filenameBase}.pdf`;
  const heading = filenameBase; // same as filename (without extension)

  // PDF layout settings (mm)
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 15;
  const marginRight = 15;
  const maxWidth = pageWidth - marginLeft - marginRight;

  // Y position tracking
  let y = 20;
  const lineHeight = 6; // mm
  const headingFontSize = 16;
  const headerFontSize = 11;
  const bodyFontSize = 10;

  // Column widths
  const colNumberW = 40;
  const colAmountW = 40;
  const colTypeW = maxWidth - colNumberW - colAmountW - 4; // small gap

  // Draw heading
  doc.setFontSize(headingFontSize);
  doc.setFont("helvetica", "bold");
  doc.text(heading, marginLeft, y);
  y += lineHeight + 2;

  // Add a blank line
  y += 2;

  // Draw table header
  doc.setFontSize(headerFontSize);
  doc.setFont("helvetica", "bold");
  doc.text("Number", marginLeft, y);
  doc.text("Amount", marginLeft + colNumberW + 4, y);
  doc.text("Type", marginLeft + colNumberW + colAmountW + 8, y);
  y += lineHeight;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(bodyFontSize);

  let grandTotal = 0;

  // Helper to add a new page if needed
  function ensureSpace(linesNeeded = 1) {
    const bottomMargin = 20;
    if (y + linesNeeded * lineHeight + bottomMargin > pageHeight) {
      doc.addPage();
      y = 20;
    }
  }

  // Helper to write a wrapped type text
  function writeWrappedText(text: string, x: number, w: number) {
    const splitted = doc.splitTextToSize(String(text), w);
    splitted.forEach((ln: string) => {
      ensureSpace(1);
      doc.text(ln, x, y);
      y += lineHeight;
    });
  }

  // Iterate groupedData
  Object.entries(groupedData).forEach(([typeid, { typename, data }]) => {
    const tid = parseInt(typeid, 10);
    if (!allowed.has(tid)) return;

    const rows = String(typeid) === "2" ? buildBucketedData(data) : data;

    let groupTotal = 0;

    rows.forEach((row: any) => {
      const amount = Number(row.total_amount || 0);
      const adjustedAmount = Number((amount - (amount * percentage) / 100) || 0);
      groupTotal += adjustedAmount;
      grandTotal += adjustedAmount;

      if (row.__isBucket) {
        // bucket total row: bold
        ensureSpace(1);
        doc.setFont("helvetica", "bold");
        // bucket label may contain commas, make it safe (no special CSV concerns here)
        const bucketLabel = String(row.bucketLabel);
        // write bucket label in Number column (left aligned) and amount in Amount column
        doc.text(bucketLabel, marginLeft, y);
        doc.text(String(adjustedAmount.toFixed(2)), marginLeft + colNumberW + 4, y);
        y += lineHeight;
        doc.setFont("helvetica", "normal");
      } else {
        // Regular row
        ensureSpace(1);
        // Number column: keep as-is (we previously used tab+quote to avoid excel)
        const numText = String(row.inumber ?? "");
        doc.text(numText, marginLeft, y);
        // Amount
        doc.text(String(adjustedAmount.toFixed(2)), marginLeft + colNumberW + 4, y);
        // Type (may be long — wrap inside colTypeW)
        writeWrappedText(typename ?? "", marginLeft + colNumberW + colAmountW + 8, colTypeW);
      }
    });

    // subtotal for this group
    ensureSpace(1);
    doc.setFont("helvetica", "bold");
    doc.text("Subtotal", marginLeft, y);
    doc.text(String(groupTotal.toFixed(2)), marginLeft + colNumberW + 4, y);
    y += lineHeight;
    doc.setFont("helvetica", "normal");

    // small gap between groups
    y += 2;
  });

  // final total
  ensureSpace(2);
  doc.setFont("helvetica", "bold");
  doc.text("Grand Total", marginLeft, y);
  doc.text(String(grandTotal.toFixed(2)), marginLeft + colNumberW + 4, y);
  y += lineHeight;

  // Save PDF
  doc.save(filename);
};

  const buildBucketedData = (rows: any[], bucketTotalsOnly: boolean = false) => {
    const buckets = new Map<number, { label: string; total: number; rows: any[] }>();

    rows.forEach((r) => {
      const n = parseInt(String(r.inumber), 10);
      const num = Number.isNaN(n) ? 99 : Math.max(0, Math.min(99, n));
      const start = Math.floor(num / 10) * 10;
      const end = start + 9;
      const label = `${String(start).padStart(2, "0")}-${String(end).padStart(2, "0")}`;
      if (!buckets.has(start)) {
        buckets.set(start, { label, total: 0, rows: [] });
      }
      const b = buckets.get(start)!;
      b.rows.push(r);
      b.total += r.total_amount;
    });

    const sortedStarts = Array.from(buckets.keys()).sort((a, b) => a - b);

    const augmented: any[] = [];
    let bucketIndex = 0;
    for (const start of sortedStarts) {
      const bucket = buckets.get(start)!;
      bucket.rows.sort((a, b) =>
        String(a.inumber).localeCompare(String(b.inumber), undefined, { numeric: true, sensitivity: "base" })
      );

 const numericLabel = String(bucketIndex );      if (bucketTotalsOnly) {
        augmented.push({
          __isBucket: true,
          bucketLabel: `${numericLabel} Total`,
          total_amount: bucket.total,
          bucketIndex: bucketIndex++,
        });
      } else {
        bucket.rows.forEach((r) => augmented.push(r));
        augmented.push({
          __isBucket: true,
          bucketLabel: `${numericLabel} Total`,
          total_amount: bucket.total,
          bucketIndex: bucketIndex++,
        });
      }
    }

    return augmented;
  };

  return (
    <div className="page-content data-page">
      {userRole !== "admin" ? (
        <div className="header">
          <Link to={`/userGames`}>Games</Link>
          <Link to={"/insert"}>Insert</Link>
          <Link to={`/history/${gameid}/${gamename}`}>HISTORY</Link>
          <Link to={`/data/${gameid}/${gamename}`} className="active">TOTAL</Link>
        </div>
      ) : (
        <div className="header">
          <Button
            type="text"
            className="back-button"
            icon={<span style={{ fontSize: '20px' }}>←</span>}
            onClick={() => navigate('/')}
          >
            Back
          </Button>
        </div>
      )}

      <div className="filter-header">
        
        <div className="controls">
          <div className="control-card">
            <p className="control-card__title">Totals</p>
            <div className="control-card__metric">{formatNumber(total)}</div>
            <div className="control-card__input-row">
              <input
                type="number"
                min={0}
                value={Number.isFinite(percentage) ? percentage : 0}
                onChange={(e) => setPercentage(Number(e.target.value) || 0)}
                placeholder="Apply percentage"
                className="control-input"
              />
              <span className="control-card__hint">%</span>
            </div>
            <div ></div>
        <Select
          style={{ width: 180 }}
          placeholder="Select Game"
          value={selectedGame ? selectedGame.gameid : undefined}
          onChange={(value: number) => {
            const game = games.find((g) => g.gameid === value) ?? null;
            setSelectedGame(game);
          }}
        >
          {games.map((game) => (
            <Select.Option key={game.gameid} value={game.gameid}>
              {game.gamename}
            </Select.Option>
          ))}
        </Select>

        {userRole === "admin" && (
          <Button
            type="primary"
            onClick={() => window.location.href = '/history-viewer'}
            style={{ marginLeft: '10px' }}
          >
             Altered History
          </Button>
        )}

            <p className="control-card__subtext">After Percentage: {formatNumber(adjustedTotal)}</p>
          </div>

          <div className="control-card">
            <p className="control-card__title">Filters</p>
            <div className="controls-select-grid">
              <div>
                <label>User</label>
                <Select
                  value={selectedUser || undefined}
                  onChange={handleUserChange}
                  disabled={userRole !== "admin"}
                  style={{ width: "100%" }}
                >
                  {userRole === "admin" && <Option value="Game">Game</Option>}
                  {users.map((user: any) => (
                    <Option key={user.user_id} value={user.user_name}>
                      {user.user_name}
                    </Option>
                  ))}
                </Select>
              </div>

              <div>
                <label>Game</label>
                <Select
                  placeholder="Select Game"
                  value={selectedGame ? selectedGame.gameid : undefined}
                  onChange={(value: number) => {
                    const game = games.find((g) => g.gameid === value) || null;
                    setSelectedGame(game);
                  }}
                  style={{ width: "100%" }}
                >
                  {games.map((game) => (
                    <Option key={game.gameid} value={game.gameid}>
                      {game.gamename}
                    </Option>
                  ))}
                </Select>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label>Group</label>
                  <Button onClick={() => fetchData()} type="primary" size="small">Refresh</Button>
                </div>
                <Select
                  placeholder="Select Group"
                  value={selectedGroup ? selectedGroup.id : undefined}
                  onChange={(value) => {
                    const group = userGroups.find((g) => g.id === value) || null;
                    if (group) addGroup(group);
                    setSelectedGroup(group);
                  }}
                  style={{ width: "100%" }}
                >
                  {userGroups.map((group: IGroup) => (
                    <Option key={group.id} value={group.id}>
                      {group.groupname}
                    </Option>
                  ))}
                </Select>
              </div>

            </div>

            <div className="controls-chips">
              {pickedGroups.length === 0 ? (
                <span className="control-empty-chip">No group selected yet</span>
              ) : (
                pickedGroups.map((g) => (
                  <div key={g.id} className="group-chip">
                    <span>{g.groupname}</span>
                    <Button
                      type="text"
                      icon={<CloseOutlined />}
                      onClick={() => removeGroup(g.id)}
                      className="chip-remove"
                      size="small"
                    />
                  </div>
                ))
              )}
            </div>

          </div>

          <div className="control-card">
            <p className="control-card__title">Schedule & Export</p>
            <DatePicker
              value={dayjs(selectedDate)}
              onChange={(date) => setSelectedDate(date?.format("YYYY-MM-DD") || selectedDate)}
              style={{ width: "100%" }}
            />

            <div className="control-button-row">
              <Button
                className="btn-ghost btn-responsive"
                onClick={() => setSelectedDate(dayjs().format("YYYY-MM-DD"))}
              >
                Today
              </Button>
              <Button
                className="btn-ghost btn-responsive"
                onClick={() => setSelectedDate(dayjs().subtract(1, "day").format("YYYY-MM-DD"))}
              >
                Yesterday
              </Button>
            </div>

            <div className="control-button-row">
              <Button type="primary" className="btn-responsive" onClick={() => exportToCSV("open")}>
                Download Open
              </Button>
              <Button className="btn-warning btn-responsive" onClick={() => exportToCSV("close")}>
                Download Close
              </Button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-container">
          <Spin size="large" />
        </div>
      ) : (
        <div className="grid-container">
          {Object.entries(groupedData).map(([typeid, { typename, data }]) => {
            // compute group total from original rows
           // --- START REPLACEMENT: compute adjusted rows & totals using percentage ---
const percentageNum = Number(percentage) || 0;

// original (possibly bucketed) table rows
const isType2 = String(typeid) === "2";
const tableData = isType2 ? buildBucketedData(data) : data.slice();

// build adjusted rows and recompute bucket totals (if any)
const adjustedRows = tableData.map((row: any) => {
  if (row.__isBucket) {
    // leave bucket row for now; we'll overwrite its total_amount below
    return { ...row };
  }
  const amount = Number(row.total_amount || 0);
  // if no percentage provided (0 or falsy), don't adjust or round — keep original amount
  if (!percentageNum) {
    return { ...row, adjusted_amount: amount };
  }
  const adjusted = +(amount - (amount * percentageNum) / 100);
  // round to tens only when a percentage is applied
  const adjustedRounded = snapToTens(adjusted, "nearest");
  return { ...row, adjusted_amount: adjustedRounded };
});

// If type 2, recompute bucket totals based on adjusted_amount
if (isType2) {
  // bucket rows appear after their bucket items (per buildBucketedData)
  let startIdx = 0;
  for (let i = 0; i < adjustedRows.length; ++i) {
    if (adjustedRows[i].__isBucket) {
      // sum adjusted_amount from startIdx..i-1
     const bucketSum = adjustedRows
  .slice(startIdx, i)
  .reduce((s, r) => s + (r.adjusted_amount ?? r.total_amount), 0);
adjustedRows[i] = { ...adjustedRows[i], total_amount: snapToTens(bucketSum, "floor") };

      // overwrite bucket row's total_amount to show adjusted total (rounded)
      adjustedRows[i] = { ...adjustedRows[i], total_amount: Math.round(bucketSum * 100) / 100 };
      startIdx = i + 1;
    }
  }
}

// compute adjusted group total: sum adjusted_amount for normal rows + bucket rows' total_amount
// compute adjusted group total: sum adjusted_amount for normal rows only (do NOT add bucket rows)
const adjustedGroupTotal = adjustedRows.reduce((s, r) => {
  if (r.__isBucket) return s; // bucket rows are for display only
  return s + (r.adjusted_amount ?? r.total_amount);
}, 0);


// Columns: render adjusted amount for every non-bucket row, and bucket rows keep their total_amount (already adjusted)
const columns = [
  {
    title: "Number",
    dataIndex: "inumber",
    key: "inumber",
    sorter: (a: any, b: any) => {
      if (a.__isBucket && b.__isBucket) return 0;
      if (a.__isBucket) return 1;
      if (b.__isBucket) return -1;
      if (isType2) {
        return String(a.inumber).localeCompare(String(b.inumber), undefined, { numeric: true, sensitivity: "base" });
      }
      const na = parseInt(a.inumber, 10);
      const nb = parseInt(b.inumber, 10);
      if (Number.isNaN(na) || Number.isNaN(nb)) {
        return String(a.inumber).localeCompare(String(b.inumber));
      }
      return na - nb;
    },
    render: (_: any, record: any) => {
      if (record.__isBucket) {
        return <strong>{record.bucketLabel}</strong>;
      }
      return <span>{record.inumber}</span>;
    },
  },
  {
    title: "Amount",
    dataIndex: "total_amount",
    key: "total_amount",
    sorter: (a: any, b: any) => {
      if (a.__isBucket && b.__isBucket) return a.total_amount - b.total_amount;
      if (a.__isBucket) return 1;
      if (b.__isBucket) return -1;
      const aval = a.adjusted_amount ?? a.total_amount;
      const bval = b.adjusted_amount ?? b.total_amount;
      return aval - bval;
    },
    render: (_: any, record: any) => {
      if (record.__isBucket) {
        return <strong>{formatNumber(record.total_amount)}</strong>;
      }
      const val = record.adjusted_amount ?? record.total_amount;
      return <span>{formatNumber(val)}</span>;
    },
  },
];

const tableContent = (
  <div
    className={isMobile ? "mobile-card-stack" : undefined}
    ref={(el) => (scrollRefs.current[typeid] = el)}
    style={{ height: 240, overflowY: 'auto' }}
  >
    <Table
      dataSource={adjustedRows}
      columns={columns}
      rowKey={(record: any) => (record.__isBucket ? `bucket-${record.bucketIndex}` : `${record.inumber}`)}
      pagination={false}
      rowClassName={(record: any) => (record.__isBucket ? "bucket-row" : "")}
    />
  </div>
);


            return (
              <div className="table-container" key={typeid}>
                <h3>
                  <span>{typename}</span>
                  <span className={`table-total ${isType2 ? "table-total--accent" : ""}`}>
                    Total: {formatNumber(adjustedGroupTotal)}
                  </span>
                </h3>

                {tableContent}
              </div>
            );
          })}
        </div>
      )}
      {/* The rest of your JSX (tables, buttons, etc.) goes here */}
    </div>
  );
};

export default DataTables;
