import React, { useEffect, useMemo, useRef, useState } from "react";
import { Table, Button, DatePicker, Select, Spin, message, Modal, InputNumber, Tabs } from "antd";
import dayjs from "dayjs";
import { apiClient } from "./utils/api";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useUserStore } from "./store/store";
import { isAdminRole } from "./utils/session";
import "./datatable.css";
const { Option } = Select;
import pdfMake from "pdfmake/build/pdfmake";
import { vfs } from "pdfmake/build/vfs_fonts";
import { IUser } from "./users";
import { checkAuthAndHandleLogout } from "./authcheck";
import { downloadTableImage, renderTableImage, type TableImage } from "./utils/tableImage";
import { buildSettlement, fmt, type PaymentData } from "./utils/settlement";
import { searchProps } from "./utils/selectSearch";
import { PaymentDetailsForm, paymentImageSections, usePaymentDetails } from "./PaymentDetails";

pdfMake.vfs = vfs;
// Payment is what we owe them (negative), due is what they owe us.
const conclusionLabel = (v: number) => (v < 0 ? "Payment" : "Due");

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
  // Everything picked here lives in the address (?date=&group=&tab=&ld=&old=&oldAmt=), so a reload or a
  // shared link comes back the same.
  const [searchParams, setSearchParams] = useSearchParams();
  const fromUrl = useRef(searchParams);
  const urlDate = fromUrl.current.get("date");
  const [selectedDate, setSelectedDate] = useState(urlDate && dayjs(urlDate, "YYYY-MM-DD", true).isValid() ? urlDate : dayjs().format("YYYY-MM-DD"));
  const [groups, setGroups] = useState([]);
  const [selectedUser, setSelectedUser] = useState<IUser | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [modalVisible, setModalVisible] = useState(false);
  // Balance carried over from earlier: an old due is added to the remaining, an old payment is taken off it.
  const [oldType, setOldType] = useState<"due" | "payment">(fromUrl.current.get("old") === "payment" ? "payment" : "due");
  const [oldAmount, setOldAmount] = useState<number | null>(() => {
    const v = Number(fromUrl.current.get("oldAmt"));
    return Number.isFinite(v) && v > 0 ? v : null;
  });
  // L/D %: the share (1-100) taken off the day's due or payment. Platform admin only.
  const [ldPercent, setLdPercent] = useState<number | null>(() => {
    const v = Number(fromUrl.current.get("ld"));
    return Number.isFinite(v) && v >= 1 && v <= 100 ? Math.round(v) : null;
  });
  const [activeTab, setActiveTab] = useState<string>(fromUrl.current.get("tab") === "bills" ? "bills" : "settlement");
  const [urlReady, setUrlReady] = useState(false); // the group in the address has been looked up

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Group names are only unique within an account, so the pickers select by id.
  const handleGroupChange = (groupId: number | string, restoring = false) => {
    if (!restoring) {
      setOldAmount(null);
      setLdPercent(null);
    }
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
  }, [selectedDate, selectedGroupId]);

  // Put the group from the address back once the groups are known, then start writing to the address.
  useEffect(() => {
    if (urlReady || groups.length === 0) return;
    const id = Number(fromUrl.current.get("group"));
    if (Number.isInteger(id) && groups.some((g) => g["group_id"] === id)) handleGroupChange(id, true);
    setUrlReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, urlReady]);

  useEffect(() => {
    if (!urlReady) return;
    const next = new URLSearchParams();
    next.set("date", selectedDate);
    if (selectedGroupId !== null) next.set("group", String(selectedGroupId));
    if (activeTab !== "settlement") next.set("tab", activeTab);
    if (ldPercent) next.set("ld", String(ldPercent));
    if (oldAmount) {
      next.set("old", oldType);
      next.set("oldAmt", String(oldAmount));
    }
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlReady, selectedDate, selectedGroupId, activeTab, ldPercent, oldType, oldAmount]);

  // A recalculation started from the header: show the new figures for the selected group.
  useEffect(() => {
    const refresh = () => {
      if (selectedGroupId !== null) fetchData();
    };
    window.addEventListener("recalculated", refresh);
    return () => window.removeEventListener("recalculated", refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId, selectedDate]);

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
  const [payInfo, setPayInfo, payStatus] = usePaymentDetails();
  const oldBalance = oldAmount || 0;
  const oldDelta = oldType === "due" ? oldBalance : -oldBalance;

  // The percent keeps the sign of the due/payment it is taken from and is subtracted from it, so a
  // payment (negative) shrinks towards zero and a due (positive) does too: day = amount - percent of amount.
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const isSuper = userRole === "superadmin";
  const ldPct = isSuper && ldPercent ? ldPercent : 0;
  const ldBase = settlement ? settlement.conclusion : 0;
  const ldAmount = round2((ldBase * ldPct) / 100);
  const dayAmount = round2(ldBase - ldAmount);
  const dayLabel = dayAmount < 0 ? "Day's payment" : "Day's due";
  const finalAmount = settlement ? round2(dayAmount + oldDelta) : 0;
  const finalLabel = `Final ${conclusionLabel(finalAmount).toLowerCase()}`;

  // The calculation as shown on screen, in the PDF and in the image.
  const calcLines = (): { label: string; value: number; strong?: boolean }[] => {
    if (!settlement) return [];
    // Payment is what we owe them (winnings above the remaining), due is what they owe us.
    const lines = [
      { label: "Total bet amount", value: settlement.totalBet },
      { label: settlement.commissionLabel, value: settlement.commission },
      { label: "Remaining", value: settlement.remaining },
      { label: "Total winning", value: -settlement.totalWin },
      { label: conclusionLabel(settlement.conclusion), value: settlement.conclusion },
    ];
    if (ldPct > 0) {
      lines.push({ label: `L/D ${ldPct}%`, value: ldAmount }, { label: dayLabel, value: dayAmount });
    }
    if (oldBalance > 0) {
      lines.push({ label: oldType === "due" ? "Old due" : "Old payment", value: oldDelta });
    }
    return [...lines, { label: finalLabel, value: finalAmount, strong: true }];
  };

  const billImageTitle = () => `Bill — ${grpname ?? "All Groups"} — ${dayjs(selectedDate).format("DD-MM-YYYY")}`;
  // The detailed picture adds the per-type winning numbers under the calculation.
  const billImage = (detailed = false): TableImage | null => {
    if (!settlement) return null;
    return {
      title: billImageTitle(),
      fileName: `Bill_${dayjs(selectedDate).format("DD-MM-YYYY")}(${grpname ?? "All Groups"})${detailed ? "_detailed" : ""}.png`,
      sections: [
        {
          heading: "Bill by game",
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
        },
        {
          heading: "Calculation",
          columns: [{ header: "Calculation" }, { header: "Amount", align: "right" }],
          rows: calcLines().map((l) => ({
            cells: [l.label, fmt(l.value)],
            bold: l.strong,
            shaded: l.strong,
            tone: l.strong ? (l.value < 0 ? ("negative" as const) : ("positive" as const)) : undefined,
          })),
        },
        ...(finalAmount > 0 ? paymentImageSections(payInfo) : []),
        ...(detailed && settlement.winners.length
          ? [
              {
                heading: "Winning numbers (detail)",
                columns: [
                  { header: "Game" },
                  { header: "Type" },
                  { header: "Number", align: "right" as const },
                  { header: "Bet", align: "right" as const },
                  { header: "Winning", align: "right" as const },
                ],
                rows: settlement.winners.map((w) => ({
                  cells: [
                    w.res_game.trim(),
                    w.res_type,
                    String(w.res_bet_on),
                    fmt(w.res_bet_amt),
                    fmt(w.res_win_amt),
                  ],
                })),
              },
            ]
          : []),
      ],
    };
  };

  const downloadBillImage = (detailed = false) => {
    const image = billImage(detailed);
    if (image) downloadTableImage(image).catch(() => message.error("Could not create the image"));
  };

  // Puts the bill picture on the clipboard so it can be pasted into a chat. Browsers that cannot copy
  // images get the picture downloaded instead.
  const copyBillImage = async (detailed = false) => {
    const image = billImage(detailed);
    if (!image) return;
    const blobPromise = renderTableImage(image);
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]);
      message.success("Image copied. Paste it where you want to send it.");
    } catch {
      downloadBillImage(detailed);
      message.info("Couldn't copy the image here, so it was downloaded instead.");
    }
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

  const winnerColumns = [
    { title: "Game", dataIndex: "res_game", key: "g", render: (t: string) => t.trim() },
    { title: "Type", dataIndex: "res_type", key: "t" },
    { title: "Number", dataIndex: "res_bet_on", key: "n", align: "right" as const },
    { title: "Bet", dataIndex: "res_bet_amt", key: "b", align: "right" as const, render: amountCell },
    { title: "Winning", dataIndex: "res_win_amt", key: "w", align: "right" as const, render: amountCell },
  ];

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
            {userRole === "superadmin" && <Link to="/compare">Compare</Link>}
        </div>
      )}
      <div className="new-header" style={{ maxHeight: "none" }}>
        <div className="controls">
          <DatePicker
            value={dayjs(selectedDate)}
            format="DD-MM-YYYY"
            onChange={(date) => {
              setSelectedDate(date?.format("YYYY-MM-DD") || selectedDate);
              setOldAmount(null);
              setLdPercent(null);
            }}
          />
          {isMobile ? (
            <Button onClick={() => setModalVisible(true)}>{grpname || "Select Group"}</Button>
          ) : (
            <Select {...searchProps}
              className="group-select"
              onChange={(v: number | string) => handleGroupChange(v)}
              getPopupContainer={() => document.body}
              value={selectedGroupId ?? "Select Group"}
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
            disabled={!selectedGroupId || dayjs(selectedDate).isBefore(dayjs().subtract(30, "day"))}
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
              <Button onClick={() => copyBillImage(false)} disabled={!settlement}>
                Copy image
              </Button>
              <Button onClick={() => copyBillImage(true)} disabled={!settlement}>
                Copy detailed image
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
                    <div className="settlement-calc-wrap">
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
                        <span>{conclusionLabel(settlement.conclusion)}</span>
                        <span>{fmt(settlement.conclusion)}</span>
                      </div>
                      {isSuper && (
                        <div className="settlement-calc__row">
                          <span className="settlement-calc__ld">
                            <label htmlFor="ld-percent">L/D %</label>
                            <InputNumber
                              id="ld-percent"
                              min={1}
                              max={100}
                              precision={0}
                              controls={false}
                              value={ldPercent}
                              onChange={(v) => setLdPercent(v === null ? null : Math.min(100, Math.max(1, Math.round(Number(v)))))}
                              style={{ width: 72 }}
                            />
                          </span>
                          <span>{ldPct > 0 ? fmt(ldAmount) : ""}</span>
                        </div>
                      )}
                      {ldPct > 0 && (
                        <div className={`settlement-calc__row settlement-calc__result ${dayAmount < 0 ? "is-negative" : "is-positive"}`}>
                          <span>{dayLabel}</span>
                          <span>{fmt(dayAmount)}</span>
                        </div>
                      )}
                      <div className="settlement-calc__row settlement-calc__adjust">
                        <div className="settlement-calc__old">
                          <Select {...searchProps}
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
                        </div>
                        <InputNumber
                          id="old-balance-amount"
                          aria-label="Old balance amount"
                          min={0}
                          value={oldAmount}
                          onChange={(v) => setOldAmount(v === null ? null : Math.max(Number(v) || 0, 0))}
                          style={{ width: 160 }}
                        />
                      </div>
                      <div className={`settlement-calc__row settlement-calc__final ${finalAmount < 0 ? "is-negative" : "is-positive"}`}>
                        <span>{finalLabel}</span>
                        <span>{fmt(finalAmount)}</span>
                      </div>
                    </div>
                    {finalAmount > 0 && <PaymentDetailsForm info={payInfo} onChange={setPayInfo} status={payStatus} />}
                    </div>

                    {settlement.winners.length > 0 && (
                      <>
                        <h3 style={{ marginTop: 24 }}>Winning numbers (detail)</h3>
                        <Table
                          className="settlement-table settlement-detail-table"
                          dataSource={settlement.winners.map((w, i) => ({ ...w, key: i }))}
                          columns={winnerColumns}
                          pagination={false}
                          size={isMobile ? "small" : "middle"}
                          scroll={{ x: "max-content" }}
                        />
                      </>
                    )}
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
