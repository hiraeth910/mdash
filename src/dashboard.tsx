import React, { useEffect, useMemo, useState } from "react";
import { Table, Button, DatePicker, Select, Spin, message, Modal, InputNumber, Collapse } from "antd";
import dayjs from "dayjs";
import { apiClient } from "./utils/api";
import { Link, useParams } from "react-router-dom";
import { useUserStore } from "./store/store";
import { isAdminRole } from "./utils/session";
import "./datatable.css";
const { Option } = Select;
import pdfMake from "pdfmake/build/pdfmake";
import { vfs } from "pdfmake/build/vfs_fonts";
import { IUser } from "./users";
import { checkAuthAndHandleLogout } from "./authcheck";

pdfMake.vfs = vfs;
export interface PaymentData {
  res_game: string;
  res_type: string;
  res_bet_on: string;
  res_bet_amt: number;
  res_payable_times: number;
  res_win_amt: number;
}

type GameRow = {
  key: string;
  game: string;
  bet: number;
  single: number;
  jodi: number | null;
  pana: number;
  win: number;
};

type Settlement = {
  games: GameRow[];
  winners: PaymentData[];
  totalBet: number;
  totalWin: number;
  commissionLabel: string;
  commission: number;
  remaining: number;
  conclusion: number;
};

const normName = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const fmt = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(v);
const conclusionLabel = (v: number) => (v < 0 ? "Payment" : "Due");

// Regroups the settlement rows the API already returns: per-game open/close summary rows, the winning
// bets (typed open / close / jodi / open pana / close pana) and the four total rows.
const buildSettlement = (rows: PaymentData[]): Settlement | null => {
  const total = rows.find((r) => r.res_game === "Total Amount");
  const commission = rows.find((r) => r.res_game.startsWith("Commsion("));
  const remaining = rows.find((r) => r.res_game === "Remaining");
  const conclusion = rows.find((r) => r.res_game === "Payable/Receivable");
  if (!total || !commission || !remaining || !conclusion) return null;

  const winners = rows.filter((r) => r.res_type !== "");
  const winsFor = (game: string, type: string) =>
    winners
      .filter((w) => normName(w.res_game) === game && w.res_type === type)
      .reduce((s, w) => s + Number(w.res_win_amt || 0), 0);

  const games: GameRow[] = [];
  rows.forEach((r, i) => {
    if (r.res_type !== "") return;
    const m = r.res_game.trim().match(/^(.*?)\s*\((open|close)\)$/);
    if (!m) return;
    const name = m[1].trim().replace(/\s+/g, " ");
    const side = m[2] as "open" | "close";
    const key = normName(name);
    games.push({
      key: `${i}`,
      game: `${name} (${side})`,
      bet: Number(r.res_bet_amt || 0),
      single: winsFor(key, side),
      jodi: side === "open" ? winsFor(key, "jodi") : null,
      pana: winsFor(key, `${side} pana`),
      win: Number(r.res_win_amt || 0),
    });
  });

  return {
    games,
    winners,
    totalBet: Number(total.res_bet_amt || 0),
    totalWin: -Number(total.res_win_amt || 0),
    commissionLabel: commission.res_game.replace("Commsion", "Commission").replace("(", " ("),
    commission: Number(commission.res_bet_amt || 0),
    remaining: Number(remaining.res_bet_amt || 0),
    conclusion: Number(conclusion.res_win_amt || 0),
  };
};

const Dashboard: React.FC = () => {
  const { gameid, gamename } = useParams<{
    gameid: string;
    gamename: string;
  }>();
  const [users, setusers] = useState<IUser[]>([]);
  const { userRole } = useUserStore();
  const [grpname, setGrpname] = useState<string>();
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [paymentData, setPaymentData] = useState<PaymentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [groups, setGroups] = useState([]);
  const [selectedUser, setSelectedUser] = useState<IUser | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [modalVisible, setModalVisible] = useState(false);
  const [adjustment, setAdjustment] = useState<number>(0);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleGroupChange = (groupName: string) => {
    setGrpname(groupName);
    const group = groups.find((group) => group["group_name"] === groupName);
    setSelectedGroupId(group ? group["group_id"] : null);
    if (group && group["group_id"] && users) {
      // Find the first user whose group_ids include the selected group_id
      const user = (users ?? []).find((user) => (user.group_ids || []).includes(group["group_id"]));
      setSelectedUser(user || null);
    } else {
      setSelectedUser(null);
    }
  };

  useEffect(() => {
    fetchGroups();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedGroupId !== null) {
      fetchData();
    }
    setAdjustment(0);
  }, [selectedDate, selectedGroupId]);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const stillLoggedIn = await checkAuthAndHandleLogout();
      if (!stillLoggedIn) return;
      const response = await apiClient.get("/groups");
      setGroups(response.data);
    } catch {
      message.error("Failed to fetch groups");
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const stillLoggedIn = await checkAuthAndHandleLogout();
      if (!stillLoggedIn) return;
      const response = await apiClient.get("/users");
      setusers(response.data.users);
    } catch {
      message.error("Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await apiClient.post("/group-payments-by-date", {
        gamedate: dayjs(selectedDate).format("YYYY-MM-DD"),
        groupid: selectedGroupId,
        gameid: 0,
      });
      setPaymentData(response.data);
    } catch {
      message.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  const recalc = async () => {
    try {
      const res = await apiClient.post("/recalculate", {
        groupid: selectedGroupId,
        date: selectedDate,
      });
      if (res.status === 200) {
        return fetchData();
      }
    } catch {
      message.error("Recalculation failed:");
    }
  };

  const showConfirm = () => {
    Modal.confirm({
      title: <span style={{ color: "var(--color-heading)" }}>Are you sure?</span>,
      content: <span style={{ color: "var(--color-text)" }}>Once recalculated, data cannot be reverted. Be careful.</span>,
      bodyStyle: { backgroundColor: "var(--color-background)", color: "var(--color-text)" },
      onOk: () => {
        recalc();
      },
    });
  };

  const settlement = useMemo(() => buildSettlement(paymentData), [paymentData]);
  const finalAmount = settlement ? settlement.conclusion + (adjustment || 0) : 0;

  const downloadSettlement = () => {
    if (!settlement) return;
    const groupLabel = grpname ?? "All Groups";
    const date = dayjs(selectedDate).format("YYYY-MM-DD");
    const num = (v: number | null) => ({ text: fmt(v), alignment: "right" });
    const docDefinition = {
      pageOrientation: "landscape",
      content: [
        { text: `Settlement — ${groupLabel} — ${date}`, style: "header" },
        { text: `Generated on: ${dayjs().format("YYYY-MM-DD HH:mm:ss")}`, style: "subheader" },
        {
          table: {
            headerRows: 1,
            widths: ["*", "auto", "auto", "auto", "auto", "auto"],
            body: [
              [
                { text: "Game", bold: true },
                { text: "Total bet", bold: true, alignment: "right" },
                { text: "Single", bold: true, alignment: "right" },
                { text: "Jodi", bold: true, alignment: "right" },
                { text: "Pana", bold: true, alignment: "right" },
                { text: "Total winning", bold: true, alignment: "right" },
              ],
              ...settlement.games.map((g) => [g.game, num(g.bet), num(g.single), num(g.jodi), num(g.pana), num(g.win)]),
              [
                { text: "Total", bold: true },
                { ...num(settlement.totalBet), bold: true },
                "",
                "",
                "",
                { ...num(settlement.totalWin), bold: true },
              ],
            ],
          },
        },
        { text: "Calculation", style: "section" },
        {
          table: {
            widths: ["*", "auto"],
            body: [
              ["Total bet amount", num(settlement.totalBet)],
              [settlement.commissionLabel, num(settlement.commission)],
              ["Remaining", num(settlement.remaining)],
              ["Total winning", num(-settlement.totalWin)],
              [`${conclusionLabel(settlement.conclusion)} (payable/receivable)`, num(settlement.conclusion)],
              ["Adjustment", num(adjustment || 0)],
              [
                { text: `Final ${conclusionLabel(finalAmount).toLowerCase()}`, bold: true },
                { ...num(finalAmount), bold: true },
              ],
            ],
          },
        },
        ...(settlement.winners.length
          ? [
              { text: "Winning numbers", style: "section" },
              {
                table: {
                  headerRows: 1,
                  widths: ["*", "auto", "auto", "auto", "auto", "auto"],
                  body: [
                    ["Game", "Type", "Number", "Bet", "Times", "Winning"].map((t) => ({ text: t, bold: true })),
                    ...settlement.winners.map((w) => [
                      w.res_game.trim(),
                      w.res_type,
                      w.res_bet_on,
                      num(w.res_bet_amt),
                      num(w.res_payable_times),
                      num(w.res_win_amt),
                    ]),
                  ],
                },
              },
            ]
          : []),
      ],
      styles: {
        header: { fontSize: 18, bold: true, marginBottom: 4 },
        subheader: { fontSize: 9, marginBottom: 12 },
        section: { fontSize: 13, bold: true, margin: [0, 14, 0, 6] },
      },
    };
    pdfMake.createPdf(docDefinition as never).download(`Settlement_${date}(${groupLabel}).pdf`);
  };

  const amountCell = (v: number | null) => <span className="settle-num">{fmt(v)}</span>;

  const gameColumns = [
    { title: "Game", dataIndex: "game", key: "game" },
    { title: "Total bet", dataIndex: "bet", key: "bet", align: "right" as const, render: amountCell },
    { title: "Single", dataIndex: "single", key: "single", align: "right" as const, render: amountCell },
    { title: "Jodi", dataIndex: "jodi", key: "jodi", align: "right" as const, render: amountCell },
    { title: "Pana", dataIndex: "pana", key: "pana", align: "right" as const, render: amountCell },
    { title: "Total winning", dataIndex: "win", key: "win", align: "right" as const, render: amountCell },
  ];

  const winnerColumns = [
    { title: "Game", dataIndex: "res_game", key: "g", render: (t: string) => t.trim() },
    { title: "Type", dataIndex: "res_type", key: "t" },
    { title: "Number", dataIndex: "res_bet_on", key: "n" },
    { title: "Bet", dataIndex: "res_bet_amt", key: "b", align: "right" as const, render: amountCell },
    { title: "Times", dataIndex: "res_payable_times", key: "p", align: "right" as const },
    { title: "Winning", dataIndex: "res_win_amt", key: "w", align: "right" as const, render: amountCell },
  ];

  return (
    <div className="data-page">
      {!isAdminRole(userRole) ? (
        <div className="header top-nav">
          <Link to={`/insert/${gameid}/${gamename}`}>INSERT</Link>
          <Link to={`/history/${gameid}/${gamename}`}>HISTORY</Link>
          <Link to={`/data/${gameid}/${gamename}`} className="active">
            TOTAL
          </Link>
        </div>
      ) : (
        <div className="header top-nav">
          <Link to="/users">Users</Link>
          <Link to="/games">Games</Link>
          <Link to="/groups">Groups</Link>
          <Link to="/result/:gameid/:gamename" className="active">Settlement</Link>
          <Link to="/summary">Day</Link>
        </div>
      )}
      <div className="new-header" style={{ maxHeight: "none" }}>
        <div className="controls">
          <DatePicker
            value={dayjs(selectedDate)}
            onChange={(date) => setSelectedDate(date?.format("YYYY-MM-DD") || selectedDate)}
          />
          {isMobile ? (
            <Button onClick={() => setModalVisible(true)}>{grpname || "Select Group"}</Button>
          ) : (
            <Select
              className="group-select"
              onChange={handleGroupChange}
              getPopupContainer={() => document.body}
              defaultValue="Select Group"
            >
              <option value="Select Group">Select Group</option>
              {groups.map((group) => (
                <Option key={group["group_id"]} value={group["group_name"]}>
                  {group["group_name"]}
                </Option>
              ))}
            </Select>
          )}
          {selectedUser && (
            <p style={{ fontWeight: "bold", color: "var(--color-text)" }}>User: {selectedUser.user_name}</p>
          )}
          <Button
            style={{ backgroundColor: "black", color: "red" }}
            disabled={!selectedGroupId || dayjs(selectedDate).isBefore(dayjs().subtract(15, "day"))}
            onClick={showConfirm}
          >
            Recalculate
          </Button>
          <Button type="primary" onClick={downloadSettlement} disabled={!settlement}>
            Download settlement
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="loading-container">
          <Spin size="large" />
        </div>
      ) : settlement ? (
        <div className="payment-summary-container settlement">
          <div className="table-container" style={{ maxHeight: "none", height: "auto", overflow: "visible" }}>
            <h3>Settlement by game</h3>
            <Table
              className="settlement-table"
              dataSource={settlement.games}
              columns={gameColumns}
              rowKey="key"
              pagination={false}
              size={isMobile ? "small" : "middle"}
              scroll={{ x: "max-content" }}
              locale={{ emptyText: "No bets for this group on this date" }}
              summary={() => (
                <Table.Summary.Row className="settlement-total-row">
                  <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">{fmt(settlement.totalBet)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={2} />
                  <Table.Summary.Cell index={3} />
                  <Table.Summary.Cell index={4} />
                  <Table.Summary.Cell index={5} align="right">{fmt(settlement.totalWin)}</Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />

            <h3 style={{ marginTop: 24 }}>Calculation</h3>
            <div className="settlement-calc">
              <div className="settlement-calc__row">
                <span>Total bet amount</span>
                <span>{fmt(settlement.totalBet)}</span>
              </div>
              <div className="settlement-calc__row">
                <span>{settlement.commissionLabel}</span>
                <span>{fmt(settlement.commission)}</span>
              </div>
              <div className="settlement-calc__row">
                <span>Remaining</span>
                <span>{fmt(settlement.remaining)}</span>
              </div>
              <div className="settlement-calc__row">
                <span>Total winning</span>
                <span>{fmt(-settlement.totalWin)}</span>
              </div>
              <div className={`settlement-calc__row settlement-calc__result ${settlement.conclusion < 0 ? "is-negative" : "is-positive"}`}>
                <span>{conclusionLabel(settlement.conclusion)} (payable/receivable)</span>
                <span>{fmt(settlement.conclusion)}</span>
              </div>
              <div className="settlement-calc__row settlement-calc__adjust">
                <label htmlFor="settlement-adjustment">
                  Adjustment
                  <small>Positive adds, negative subtracts. Not saved; goes into the download.</small>
                </label>
                <InputNumber
                  id="settlement-adjustment"
                  value={adjustment}
                  onChange={(v) => setAdjustment(Number(v) || 0)}
                  style={{ width: 160 }}
                />
              </div>
              <div className={`settlement-calc__row settlement-calc__final ${finalAmount < 0 ? "is-negative" : "is-positive"}`}>
                <span>Final {conclusionLabel(finalAmount).toLowerCase()}</span>
                <span>{fmt(finalAmount)}</span>
              </div>
            </div>

            {settlement.winners.length > 0 && (
              <Collapse
                style={{ marginTop: 24 }}
                items={[
                  {
                    key: "winners",
                    label: `Winning numbers (${settlement.winners.length})`,
                    children: (
                      <Table
                        dataSource={settlement.winners.map((w, i) => ({ ...w, key: i }))}
                        columns={winnerColumns}
                        pagination={false}
                        size="small"
                        scroll={{ x: "max-content" }}
                      />
                    ),
                  },
                ]}
              />
            )}
          </div>
        </div>
      ) : null}
      <Modal title="Select Group" open={modalVisible} onCancel={() => setModalVisible(false)} footer={null}>
        {groups.map((group) => (
          <Button
            key={group["group_id"]}
            block
            onClick={() => {
              handleGroupChange(group["group_name"]);
              setModalVisible(false);
            }}
            style={{ marginBottom: 8 }}
          >
            {group["group_name"]}
          </Button>
        ))}
      </Modal>
    </div>
  );
};

export default Dashboard;
