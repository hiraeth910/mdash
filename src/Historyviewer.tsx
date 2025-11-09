import  { useEffect, useMemo, useState } from "react";
import { Tabs, DatePicker, Select, Table, Button, Space, Spin, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { useUserStore } from "./store/store";
import { apiClient } from "./utils/api";

const { TabPane } = Tabs;
const { Option } = Select;

type HistoryRow = {
  id: number;
  createdat: string | null;
  modified: string | null;
  number: string;
  gameid: number;
  game: string;
  typeid: number;
  type: string;
  amount: number;
  uid: number | null;
  groupid: number | null;
  groupname: string | null;
  date: string;
  is_active: boolean;
  username?: string | null;
};

type ModifiedRow = {
  audit_id: number;
  history_id: number;
  createdat: string | null;
  modified: string | null;
  number: string;
  gameid: number;
  game: string;
  typeid: number;
  type: string;
  amount: number;
  uid: number | null;
  groupid: number | null;
  groupname: string | null;
  date: string;
  is_active: boolean;
  username?: string | null;
  originalRow?: HistoryRow | null;
};

export default function HistoryViewer(): JSX.Element {
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [loading, setLoading] = useState<boolean>(false);
  const [deleted, setDeleted] = useState<HistoryRow[]>([]);
  const [modified, setModified] = useState<ModifiedRow[]>([]);
  const [gameFilter, setGameFilter] = useState<string>("");
  const [userFilter, setUserFilter] = useState<string>("");

  // fetch userId if you need to pass to API headers
  const userId = useUserStore.getState().userId;

  
  const fetchData = async (fetchDate?: Dayjs) => {
    try {
      setLoading(true);
      const d = (fetchDate ?? date).format("YYYY-MM-DD");
      const response = await apiClient.get(`/fetch-history`, {
        params: { date: d },
        headers: {
          "x-userid": userId ?? undefined,
        },
        validateStatus: () => true,
      });
      
      if (response.status === 401) {
        // backend will handle logout; optionally show message
        message.warning("Session invalid. Redirecting to login.");
        return;
      }

      const payload = response.data ?? {};
      setDeleted(Array.isArray(payload.deleted) ? payload.deleted : []);
      setModified(Array.isArray(payload.modified) ? payload.modified : []);
    } catch (err) {
      console.error("fetchHistory error:", err);
      message.error("Failed to fetch history. Check console for details.");
    } finally {
      setLoading(false);
    }
  };
  
  // initial fetch for today's date
  useEffect(() => {
    fetchData(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // derived filter lists
  const allGames = useMemo(() => {
    const setGames = new Set<string>();
    [...deleted, ...modified].forEach((r) => {
      if (r.game) setGames.add(r.game);
    });
    return Array.from(setGames).sort();
  }, [deleted, modified]);

  const allUsers = useMemo(() => {
    const setUsers = new Set<string>();
    [...deleted, ...modified].forEach((r) => {
      if (r.username) setUsers.add(r.username);
    });
    return Array.from(setUsers).sort();
  }, [deleted, modified]);

  // filtered lists
  const filteredDeleted = deleted.filter((r) => {
    return (!gameFilter || r.game === gameFilter) && (!userFilter || r.username === userFilter);
  });

  const filteredModified = modified.filter((r) => {
    return (!gameFilter || r.game === gameFilter) && (!userFilter || r.username === userFilter);
  });
  
  // AntD Table columns
  const deletedColumns: ColumnsType<HistoryRow> = [
    { title: "ID", dataIndex: "id", key: "id", width: 80 },
    { title: "Game", dataIndex: "game", key: "game" },
    { title: "User", dataIndex: "username", key: "username" },
    { title: "Number", dataIndex: "number", key: "number" },
    { title: "Amount", dataIndex: "amount", key: "amount" },
    { title: "Date", dataIndex: "date", key: "date" },
    { title: "Modified At", dataIndex: "modified", key: "modified" },
  ];

  const modifiedColumns: ColumnsType<ModifiedRow> = [
    { title: "Audit ID", dataIndex: "audit_id", key: "audit_id", width: 100 },
    { title: "History ID", dataIndex: "history_id", key: "history_id", width: 100 },
    { title: "Game", dataIndex: "game", key: "game" },
    { title: "User", dataIndex: "username", key: "username" },
    { title: "Orig Number", dataIndex: ["originalRow", "number"], key: "orig_number", render: (_, record) => record.originalRow?.number ?? "-" },
    { title: "New Number", dataIndex: "number", key: "new_number" },
    { title: "Orig Amount", dataIndex: ["originalRow", "amount"], key: "orig_amount", render: (_, record) => (record.originalRow?.amount ?? "-") },
    { title: "New Amount", dataIndex: "amount", key: "new_amount" },
    { title: "Date", dataIndex: "date", key: "date" },
    { title: "Modified At", dataIndex: "modified", key: "modified" },
  ];

  // handlers
  const onDateChange = (d: Dayjs | null) => {
    if (!d) return;
    setDate(d);
    fetchData(d);
  };
  
  const onRefresh = () => {
    fetchData(date);
  };
  
  const totalDeletedAmount = useMemo(() => {
  return filteredDeleted.reduce((sum, r) => sum + (r.amount ?? 0), 0);
}, [filteredDeleted]);
  return (
    <div className="history-container">
      <Button 
        type="text" 
        icon={<span style={{ fontSize: '20px' }}>←</span>} 
        onClick={() => window.history.back()}
        style={{ marginBottom: '16px' }}
      >
        Back
      </Button>
      <Space className="history-filters" direction="horizontal" size="middle">
        <DatePicker value={date} onChange={onDateChange} allowClear={false} />
        <Select
          placeholder="All Games"
          value={gameFilter}
          onChange={(v) => setGameFilter(v)}
          style={{ minWidth: 160 }}
          allowClear
        >
          {allGames.map((g) => (
            <Option key={g} value={g}>
              {g}
            </Option>
          ))}
        </Select>

        <Select
          placeholder="All Users"
          value={userFilter}
          onChange={(v) => setUserFilter(v)}
          style={{ minWidth: 160 }}
          allowClear
        >
          {allUsers.map((u) => (
            <Option key={u ?? "null"} value={u ?? ""}>
              {u}
            </Option>
          ))}
        </Select>

        <Button onClick={onRefresh}>Refresh</Button>
          <span style={{ fontWeight: "bold" }}>
    Total Deleted: {totalDeletedAmount}
  </span>
      </Space>

      <div className="history-tabs">
        <Tabs defaultActiveKey="deleted">
          <TabPane tab="Deleted" key="deleted">
            <div className="table-wrap">
              {loading ? (
                <div className="table-loader"><Spin /></div>
              ) : (
                <Table<HistoryRow>
                  dataSource={filteredDeleted}
                  columns={deletedColumns}
                  rowKey="id"
                  pagination={{ pageSize: 25 }}
                />
              )}
            </div>
          </TabPane>

          <TabPane tab="Modified" key="modified">
            <div className="table-wrap">
              {loading ? (
                <div className="table-loader"><Spin /></div>
              ) : (
                <Table<ModifiedRow>
                  dataSource={filteredModified}
                  columns={modifiedColumns}
                  rowKey="audit_id"
                  pagination={{ pageSize: 25 }}
                />
              )}
            </div>
          </TabPane>
        </Tabs>
      </div>
    </div>
  );
}
