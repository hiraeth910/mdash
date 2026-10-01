import React, { useEffect, useMemo, useState } from "react";
import { Table, Button, DatePicker, Select, Spin, message, Modal, InputNumber, Tabs } from "antd";
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
import { downloadTableImage } from "./utils/tableImage";

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
  open: number;
  jodi: number;
  openPana: number;
  close: number;
  closePana: number;
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

  // One row per game: the open and close summary rows are added together, and the winnings are
  // split by bet type.
  const byGame = new Map<string, GameRow>();
  rows.forEach((r) => {
    if (r.res_type !== "") return;
    const m = r.res_game.trim().match(/^(.*?)\s*\((open|close)\)$/);
    if (!m) return;
    const name = m[1].trim().replace(/\s+/g, " ");
    const key = normName(name);
    const row = byGame.get(key) ?? {
      key,
      game: name,
      bet: 0,
      open: winsFor(key, "open"),
      jodi: winsFor(key, "jodi"),
      openPana: winsFor(key, "open pana"),
      close: winsFor(key, "close"),
      closePana: winsFor(key, "close pana"),
      win: 0,
    };
    row.bet += Number(r.res_bet_amt || 0);
    row.win += Number(r.res_win_amt || 0);
    byGame.set(key, row);
  });
  const games = [...byGame.values()];

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
  // Balance carried over from earlier: an old due is added to the remaining, an old payment is taken off it.
  const [oldType, setOldType] = useState<"due" | "payment">("due");
  const [oldAmount, setOldAmount] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<string>("settlement");

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Group names are only unique within an account, so the pickers select by id.
  const handleGroupChange = (groupId: number | string) => {
    const group = groups.find((group) => group["group_id"] === groupId);
    setGrpname(group ? group["group_name"] : undefined);
    setSelectedGroupId(group ? group["group_id"] : null);
    if (group && group["group_id"] && users) {
      // Find the first user whose group_ids include the selected group_id
      const user = (users ?? []).find((user) => (user.group_ids || []).includes(group["group_id"]));
      setSelectedUser(user || null);
    } else {
      setSelectedUser(null);
    }
  };

  // The platform admin sees every account's groups, so each option also names the admin it belongs to.
  const groupOptionText = (group: { group_name: string; admin_id?: number | null }) => {
    const owner =
      userRole === "superadmin" ? users.find((u) => u.user_id === group.admin_id)?.user_name : undefined;
    return (
      <span className="group-option">
        {group.group_name}
        {owner && <small className="group-option__admin">{owner}</small>}
      </span>
    );
  };

  useEffect(() => {
    fetchGroups();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedGroupId !== null) {
      fetchData();
    }
    setOldAmount(0);
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

  // The original settlement table labels its last row "payment" or "due".
  const summaryRows = useMemo(
    () =>
      paymentData.map((row, index) =>
        index === paymentData.length - 1 ? { ...row, res_game: row.res_win_amt < 0 ? "payment" : "due" } : row
      ),
    [paymentData]
  );

  const exportToCSV = () => {
    const tableBody = [
      ["Game", "Type", "Bet On", "Bet Amount", "Payable Times", "Win Amount"],
      ...summaryRows.map(({ res_game, res_type, res_bet_on, res_bet_amt, res_payable_times, res_win_amt }) => [
        res_game,
        res_type,
        res_bet_on,
        res_bet_amt,
        res_payable_times,
        res_win_amt,
      ]),
    ];
    const groupLabel = grpname ?? "All Groups";
    const formattedDate = dayjs(selectedDate).format("YYYY-MM-DD");
    const docDefinition = {
      content: [
        { text: `Final Payment Data for group (${groupLabel}) - ${formattedDate}`, style: "header" },
        { text: `Generated on: ${dayjs().format("YYYY-MM-DD HH:mm:ss")}`, style: "subheader" },
        {
          table: {
            headerRows: 1,
            widths: ["*", "*", "*", "*", "*", "*"],
            body: tableBody,
          },
        },
      ],
      styles: {
        header: {
          fontSize: 18,
          bold: true,
          marginBottom: 15,
        },
      },
    };
    pdfMake.createPdf(docDefinition as never).download(`${selectedDate}(${grpname}).pdf`);
  };

  const settlement = useMemo(() => buildSettlement(paymentData), [paymentData]);
  const oldBalance = oldAmount || 0;
  const oldDelta = oldType === "due" ? oldBalance : -oldBalance;
  const finalAmount = settlement ? settlement.conclusion + oldDelta : 0;
  const finalLabel = `Final ${conclusionLabel(finalAmount).toLowerCase()}`;

  // The calculation as shown on screen, in the PDF and in the image.
  const calcLines = (): { label: string; value: number; strong?: boolean }[] => {
    if (!settlement) return [];
    const lines = [
      { label: "Total bet amount", value: settlement.totalBet },
      { label: settlement.commissionLabel, value: settlement.commission },
      { label: "Remaining", value: settlement.remaining },
    ];
    if (oldBalance > 0) {
      lines.push(
        { label: oldType === "due" ? "Old due (added)" : "Old payment (subtracted)", value: oldDelta },
        { label: "Remaining after old balance", value: settlement.remaining + oldDelta }
      );
    }
    return [
      ...lines,
      { label: "Total winning", value: -settlement.totalWin },
      { label: finalLabel, value: finalAmount, strong: true },
    ];
  };

  const billImageTitle = () => `Bill — ${grpname ?? "All Groups"} — ${dayjs(selectedDate).format("YYYY-MM-DD")}`;
  const imageName = (part: string) => `Bill_${dayjs(selectedDate).format("YYYY-MM-DD")}(${grpname ?? "All Groups"})_${part}.png`;

  const downloadBillTableImage = () => {
    if (!settlement) return;
    downloadTableImage({
      title: billImageTitle(),
      subtitle: "Bill by game",
      fileName: imageName("table"),
      columns: [
        { header: "Game" },
        ...["Total bet", "Open win", "Jodi win", "Open pana win", "Close win", "Close pana win", "Total winning"].map((header) => ({
          header,
          align: "right" as const,
        })),
      ],
      rows: [
        ...settlement.games.map((g) => ({
          cells: [g.game, fmt(g.bet), fmt(g.open), fmt(g.jodi), fmt(g.openPana), fmt(g.close), fmt(g.closePana), fmt(g.win)],
        })),
        { cells: ["Total", fmt(settlement.totalBet), "", "", "", "", "", fmt(settlement.totalWin)], bold: true, shaded: true },
      ],
    }).catch(() => message.error("Could not create the image"));
  };

  const downloadCalculationImage = () => {
    if (!settlement) return;
    downloadTableImage({
      title: billImageTitle(),
      subtitle: "Calculation",
      fileName: imageName("calculation"),
      columns: [{ header: "Calculation" }, { header: "Amount", align: "right" }],
      rows: calcLines().map((l) => ({
        cells: [l.label, fmt(l.value)],
        bold: l.strong,
        shaded: l.strong,
        tone: l.strong ? (l.value < 0 ? ("negative" as const) : ("positive" as const)) : undefined,
      })),
    }).catch(() => message.error("Could not create the image"));
  };

  const downloadBill = () => {
    if (!settlement) return;
    const groupLabel = grpname ?? "All Groups";
    const date = dayjs(selectedDate).format("YYYY-MM-DD");
    const num = (v: number | null) => ({ text: fmt(v), alignment: "right" });
    const docDefinition = {
      pageOrientation: "landscape",
      content: [
        { text: `Bill — ${groupLabel} — ${date}`, style: "header" },
        { text: `Generated on: ${dayjs().format("YYYY-MM-DD HH:mm:ss")}`, style: "subheader" },
        {
          table: {
            headerRows: 1,
            widths: ["*", "auto", "auto", "auto", "auto", "auto", "auto", "auto"],
            body: [
              ["Game", "Total bet", "Open win", "Jodi win", "Open pana win", "Close win", "Close pana win", "Total winning"].map(
                (t, i) => ({ text: t, bold: true, alignment: i === 0 ? "left" : "right" })
              ),
              ...settlement.games.map((g) => [
                g.game,
                num(g.bet),
                num(g.open),
                num(g.jodi),
                num(g.openPana),
                num(g.close),
                num(g.closePana),
                num(g.win),
              ]),
              [
                { text: "Total", bold: true },
                { ...num(settlement.totalBet), bold: true },
                "",
                "",
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
              ...calcLines().map((l) => [
                l.strong ? { text: l.label, bold: true } : l.label,
                l.strong ? { ...num(l.value), bold: true } : num(l.value),
              ]),
            ],
          },
        },
      ],
      styles: {
        header: { fontSize: 18, bold: true, marginBottom: 4 },
        subheader: { fontSize: 9, marginBottom: 12 },
        section: { fontSize: 13, bold: true, margin: [0, 14, 0, 6] },
      },
    };
    pdfMake.createPdf(docDefinition as never).download(`Bill_${date}(${groupLabel}).pdf`);
  };

  const amountCell = (v: number | null) => <span className="settle-num">{fmt(v)}</span>;

  const gameColumns = [
    { title: "Game", dataIndex: "game", key: "game" },
    { title: "Total bet", dataIndex: "bet", key: "bet", align: "right" as const, render: amountCell },
    {
      title: "Winning",
      key: "winning",
      align: "center" as const,
      children: [
        { title: "Open", dataIndex: "open", key: "open", align: "right" as const, render: amountCell },
        { title: "Jodi", dataIndex: "jodi", key: "jodi", align: "right" as const, render: amountCell },
        { title: "Open pana", dataIndex: "openPana", key: "openPana", align: "right" as const, render: amountCell },
        { title: "Close", dataIndex: "close", key: "close", align: "right" as const, render: amountCell },
        { title: "Close pana", dataIndex: "closePana", key: "closePana", align: "right" as const, render: amountCell },
      ],
    },
    { title: "Total winning", dataIndex: "win", key: "win", align: "right" as const, render: amountCell },
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
              optionLabelProp="label"
              popupMatchSelectWidth={false}
            >
              <Option value="Select Group" label="Select Group">Select Group</Option>
              {groups.map((group) => (
                <Option key={group["group_id"]} value={group["group_id"]} label={group["group_name"]}>
                  {groupOptionText(group)}
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
          {activeTab === "settlement" ? (
            <Button type="primary" onClick={exportToCSV}>
              Export as Excel
            </Button>
          ) : (
            <>
              <Button type="primary" onClick={downloadBill} disabled={!settlement}>
                Download bill
              </Button>
              <Button onClick={downloadBillTableImage} disabled={!settlement}>
                Table image
              </Button>
              <Button onClick={downloadCalculationImage} disabled={!settlement}>
                Calculation image
              </Button>
            </>
          )}
        </div>
      </div>
      {loading ? (
        <div className="loading-container">
          <Spin size="large" />
        </div>
      ) : (
        <Tabs
          className="settlement-tabs"
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: "settlement",
              label: "Settlement",
              children: (
                <div className="payment-summary-container">
                  <div className="table-container"  style={{maxHeight:'none', height: 'auto', overflow: 'visible' }}>
                    <h3>Payment Summary</h3>
                     <Table
        
          className="payment-summary-table"
          dataSource={summaryRows}
          columns={[
            {
              title: "Game",
              dataIndex: "res_game",
              key: "res_game",
              render: (text, record, index) => {
                const isLast = index === summaryRows.length - 1;
                if (isLast) {
                  const color = record.res_win_amt < 0 ? 'red' : '#00796B';
                  return <span style={{ color, fontWeight: 'bold' }}>{text}</span>;
                }
                return text;
              }
            },
            {
              title: "Type",
              dataIndex: "res_type",
              key: "res_type",
              render: (text, record, index) => {
                const isLast = index === summaryRows.length - 1;
                if (isLast) {
                  const color = record.res_win_amt < 0 ? 'red' : '#00796B';
                  return <span style={{ color, fontWeight: 'bold' }}>{text}</span>;
                }
                return text;
              }
            },
            {
              title: "Bet On",
              dataIndex: "res_bet_on",
              key: "res_bet_on",
              render: (text, record, index) => {
                const isLast = index === summaryRows.length - 1;
                if (isLast) {
                  const color = record.res_win_amt < 0 ? 'red' : '#00796B';
                  return <span style={{ color, fontWeight: 'bold' }}>{text}</span>;
                }
                return text;
              }
            },
            {
              title: "Bet Amount",
              dataIndex: "res_bet_amt",
              key: "res_bet_amt",
              render: (text, record, index) => {
                const isLast = index === summaryRows.length - 1;
                if (isLast) {
                  const color = record.res_win_amt < 0 ? 'red' : '#00796B';
                  return <span style={{ color, fontWeight: 'bold' }}>{text}</span>;
                }
                return text;
              }
            },
            {
              title: "Payable Times",
              dataIndex: "res_payable_times",
              key: "res_payable_times",
              render: (text, record, index) => {
                const isLast = index === summaryRows.length - 1;
                if (isLast) {
                  const color = record.res_win_amt < 0 ? 'red' : '#00796B';
                  return <span style={{ color, fontWeight: 'bold' }}>{text}</span>;
                }
                return text;
              }
            },
            {
              title: "Win Amount",
              dataIndex: "res_win_amt",
              key: "res_win_amt",
              render: (text, record, index) => {
                const isLast = index === summaryRows.length - 1;
                if (isLast) {
                  const color = record.res_win_amt < 0 ? 'red' : '#00796B';
                  return <span style={{ color, fontWeight: 'bold' }}>{text}</span>;
                }
                return text;
              }
            },
          ]}
          rowKey="game"
          pagination={false}
          rowClassName={(_, index) => {
            if (index === summaryRows.length - 1) {
              return "blink";
            }
            return "";
          }}
        />
        
        <div className="payment-summary-cards">
          {summaryRows.map((row, index) => {
            const isLast = index === summaryRows.length - 1;
            const cardClass = isLast
              ? (row.res_win_amt < 0 ? "negative-row" : "positive-row")
              : "";
            return (
              <div key={index} className={`mobile-card ${cardClass} ${isLast ? 'blink' : ''}`}>
                <div className="mobile-card__row">
                  <span className="mobile-card__label">Game</span>
                  <span className="mobile-card__value">{row.res_game}</span>
                </div>
                <div className="mobile-card__row">
                  <span className="mobile-card__label">Type</span>
                  <span className="mobile-card__value">{row.res_type}</span>
                </div>
                <div className="mobile-card__row">
                  <span className="mobile-card__label">Bet On</span>
                  <span className="mobile-card__value">{row.res_bet_on}</span>
                </div>
                <div className="mobile-card__row">
                  <span className="mobile-card__label">Bet Amount</span>
                  <span className="mobile-card__value">{row.res_bet_amt}</span>
                </div>
                <div className="mobile-card__row">
                  <span className="mobile-card__label">Payable Times</span>
                  <span className="mobile-card__value">{row.res_payable_times}</span>
                </div>
                <div className="mobile-card__row">
                  <span className="mobile-card__label">Win Amount</span>
                  <span className="mobile-card__value">{row.res_win_amt}</span>
                </div>
              </div>
            );
          })}
        </div>
        
                  </div>
                </div>
              ),
            },
            {
              key: "bills",
              label: "Bills",
              children: settlement ? (
                <div className="payment-summary-container settlement">
                  <div className="table-container" style={{ maxHeight: "none", height: "auto", overflow: "visible" }}>
                    <h3>Bill by game</h3>
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
                          <Table.Summary.Cell index={5} />
                          <Table.Summary.Cell index={6} />
                          <Table.Summary.Cell index={7} align="right">{fmt(settlement.totalWin)}</Table.Summary.Cell>
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
                      <div className="settlement-calc__row settlement-calc__adjust">
                        <div className="settlement-calc__old">
                          <Select
                            className="old-balance-type"
                            value={oldType}
                            onChange={setOldType}
                            getPopupContainer={() => document.body}
                            style={{ width: 150 }}
                            options={[
                              { value: "due", label: "Old due" },
                              { value: "payment", label: "Old payment" },
                            ]}
                          />
                          <small>
                            {oldType === "due" ? "Added to the remaining." : "Subtracted from the remaining."} Not saved; goes into the downloads.
                          </small>
                        </div>
                        <InputNumber
                          id="old-balance-amount"
                          aria-label="Old balance amount"
                          min={0}
                          value={oldAmount}
                          onChange={(v) => setOldAmount(Math.max(Number(v) || 0, 0))}
                          style={{ width: 160 }}
                        />
                      </div>
                      {oldBalance > 0 && (
                        <div className="settlement-calc__row settlement-calc__after-old">
                          <span>Remaining after old balance</span>
                          <span>{fmt(settlement.remaining + oldDelta)}</span>
                        </div>
                      )}
                      <div className="settlement-calc__row">
                        <span>Total winning</span>
                        <span>{fmt(-settlement.totalWin)}</span>
                      </div>
                      <div className={`settlement-calc__row settlement-calc__final ${finalAmount < 0 ? "is-negative" : "is-positive"}`}>
                        <span>{finalLabel}</span>
                        <span>{fmt(finalAmount)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: 24 }}>Select a group to see its bill.</div>
              ),
            },
          ]}
        />
      )}
      <Modal title="Select Group" open={modalVisible} onCancel={() => setModalVisible(false)} footer={null}>
        {groups.map((group) => (
          <Button
            key={group["group_id"]}
            block
            onClick={() => {
              handleGroupChange(group["group_id"]);
              setModalVisible(false);
            }}
            style={{ marginBottom: 8 }}
          >
            {groupOptionText(group)}
          </Button>
        ))}
      </Modal>
    </div>
  );
};

export default Dashboard;
