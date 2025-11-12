import React, { useState, useEffect, useRef } from "react";
import { Input, Button, message, Spin, Select, Card, Modal, DatePicker } from "antd";
import { apiClient } from "./utils/api";
import dayjs from "dayjs";
import { Link, useParams } from "react-router-dom";
import "./InsertHistory.css";
import { useUserStore } from "./store/store";
import moment from "moment";
import { IGame } from "./games";
import { IGroup } from "./userGames";
import { checkAuthAndHandleLogout } from "./authcheck";
import {  fillWithNextValue } from "./utils/helpter";

interface NumberEntry {
  number: string;
  type: string;
  amount: number;
  typeid?: number;
}
interface GameMessage {
  id: number;
  created_at: string;
  message: string;
  gameid: number;
  groupid: number;
  userid: number;
  gamedate: string;
}

const InsertHistory: React.FC = () => {
  const { gameid, gamename, groupid, typ } = useParams<{
    gameid: string;
    gamename: string;
    groupid: string;
    typ: string;
  }>();
  const { userId } = useUserStore();
  const today = moment().format("YYYY-MM-DD");

  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [inputValue, setInputValue] = useState("");
  const [groupedData, setGroupedData] = useState<{ [key: number]: NumberEntry[] }>({ 1: [], 2: [], 3: [] });
  const [types, setTypes] = useState<{ typeid: number; typename: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<GameMessage[]>([]);
  const [selectedTyp, setSelectedTyp] = useState<string>(typ || "Open");
  const [games, setGames] = useState<IGame[]>([]);
  const [selectedGame, setSelectedGame] = useState<IGame | null>(null);
  const [userGroups, setUserGroups] = useState<IGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<IGroup | null>(null);

  const [invalidLines, setInvalidLines] = useState<{ line: number; raw: string; reason: string }[]>([]);
  const [ambiguousLines, setAmbiguousLines] = useState<{ line: number; raw: string; reason: string }[]>([]);

  const groupRefs = useRef<(HTMLDivElement | null)[]>([]);
  const highlighterRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const fetchGamesAndGroups = async () => {
      try {
        const stillLoggedIn = await checkAuthAndHandleLogout();
        if (!stillLoggedIn) return;
        const gamesResponse = await apiClient.get("/games");
        setGames(gamesResponse.data);
        const groupsResponse = await apiClient.get(`/user/groups/${userId}`);
        setUserGroups(groupsResponse.data);
      } catch (error) {
        message.error("Failed to load games and groups");
        console.error("Error fetching games/groups:", error);
      }
    };
    fetchGamesAndGroups();
  }, [userId]);

  useEffect(() => {
    if (games.length > 0 && gameid) {
      const initialGame = games.find((game) => game.gameid.toString() === gameid);
      if (initialGame) setSelectedGame(initialGame);
    }
  }, [games, gameid]);

  useEffect(() => {
    if (userGroups.length > 0 && groupid) {
      const initialGroup = userGroups.find((group) => group.id.toString() === groupid);
      if (initialGroup) setSelectedGroup(initialGroup);
    }
  }, [userGroups, groupid]);

  useEffect(() => {
    fetchTypes();
  }, []);

  useEffect(() => {
    groupRefs.current.forEach((ref) => {
      if (ref) ref.scrollTop = ref.scrollHeight;
    });
  }, [groupedData]);

  useEffect(() => {
    if (inputValue.trim()) validateAndGroupNumbers(inputValue);
    else {
      setGroupedData({ 1: [], 2: [], 3: [] });
      setInvalidLines([]);
      setAmbiguousLines([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, selectedTyp]);

  const fetchTypes = async () => {
    setLoading(true);
    try {
      const stillLoggedIn = await checkAuthAndHandleLogout();
      if (!stillLoggedIn) return;
      const response = await apiClient.get("/types");
      const formattedTypes = response.data.map((item: { gameid: number; gamename: string }) => ({
        typeid: item.gameid,
        typename: item.gamename.toLowerCase(),
      }));
      setTypes(formattedTypes);
    } catch (error) {
      console.error(error);
      message.error("Failed to fetch types");
    } finally {
      setLoading(false);
    }
  };

  const getHistory = async () => {
    try {
      const payload = {
        gameid: selectedGame?.gameid,
        userid: userId,
        groupid: selectedGroup?.id,
        date: selectedDate,
      };
      const response = await apiClient.post("/get/messages", payload);
      if (response.data) {
        const sortedMessages = response.data.sort((a: GameMessage, b: GameMessage) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        setMessages(sortedMessages);
        setIsOpen(true);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
    }
  };

  const getMapping = (length: number) => {
    if (selectedTyp === "Open") {
      if (length === 1) return types.find((t) => t.typename === "open") || { typeid: 1, typename: "open" };
      if (length === 2) return types.find((t) => t.typename === "jodi") || { typeid: 2, typename: "jodi" };
      if (length === 3) return types.find((t) => t.typename === "open pana") || { typeid: 3, typename: "open pana" };
    } else {
      if (length === 1) return types.find((t) => t.typename === "close") || { typeid: 4, typename: "close" };
      if (length === 3) return types.find((t) => t.typename === "close pana") || { typeid: 5, typename: "close pana" };
    }
    return null;
  };

  const isValidNumber = (num: string) => {
    if (!/^\d+$/.test(num) || num.length > 3) return false;
    if (num.length === 2 && selectedTyp !== "Open") return false;
    if (num.length === 3) {
      const digits = num.split("").map(Number);
      return isValidThreeDigit(digits);
    }
    return true;
  };

  const isValidThreeDigit = (digits: number[]) => {
    const priority: { [key: number]: number } = {
      0: 10,
      9: 9,
      8: 8,
      7: 7,
      6: 6,
      5: 5,
      4: 4,
      3: 3,
      2: 2,
      1: 1,
    };
    return digits.every((d, i, arr) => i === 0 || priority[arr[i - 1]] <= priority[d]);
  };

  // ---------- Parser (same logic you required) ----------
  const validateAndGroupNumbers = (input: string) => {
    const lines = input.split(/\r?\n/);
    const validNumbers: { [key: number]: NumberEntry[] } = { 1: [], 2: [], 3: [] };
    const invalids: { line: number; raw: string; reason: string }[] = [];
    const ambigs: { line: number; raw: string; reason: string }[] = [];

    const isSeparatorLine = (ln: string) => /^[\s=+\-_*#]{2,}$/.test(ln.trim());
    let prevNonEmptyIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = rawLine.trim();
      if (line === "") continue;

      if (isSeparatorLine(line)) {
        prevNonEmptyIdx = i;
        continue;
      }
      if (/^\d+$/.test(line) && prevNonEmptyIdx >= 0 && isSeparatorLine(lines[prevNonEmptyIdx])) {
        prevNonEmptyIdx = i;
        continue;
      }

      const tokens = line.match(/\d+/g);
      if (tokens && tokens.length >= 2) {
        const amountStr = tokens[tokens.length - 1];
        const numberTokens = tokens.slice(0, tokens.length - 1);
        const amount = parseInt(amountStr.replace(/[,]/g, ""), 10);
        if (Number.isNaN(amount) || amount <= 0) {
          invalids.push({ line: i, raw: rawLine, reason: "invalid amount (last token)" });
          prevNonEmptyIdx = i;
          continue;
        }

        let anyInvalidNum = false;
        numberTokens.forEach((num) => {
          if (isValidNumber(num)) {
            const len = num.length;
            const mapping = getMapping(len);
            if (mapping) {
              validNumbers[len].push({
                number: num,
                type: mapping.typename,
                amount,
                typeid: mapping.typeid,
              });
            } else {
              ambigs.push({ line: i, raw: rawLine, reason: `no mapping for length ${len}` });
            }
          } else {
            anyInvalidNum = true;
          }
        });

        if (anyInvalidNum) invalids.push({ line: i, raw: rawLine, reason: "one or more numbers invalid for selected type" });
        prevNonEmptyIdx = i;
        continue;
      }

      const pairMatch = line.match(/^\s*(\d{1,3})\s*[.\-=:]\s*(\d[\d,.]*)\s*$/);
      if (pairMatch) {
        const num = pairMatch[1];
        const amtStr = pairMatch[2].replace(/,/g, "");
        const amt = parseInt(amtStr, 10);
        if (isValidNumber(num) && !Number.isNaN(amt) && amt > 0) {
          const len = num.length;
          const mapping = getMapping(len);
          if (mapping) {
            validNumbers[len].push({
              number: num,
              type: mapping.typename,
              amount: amt,
              typeid: mapping.typeid,
            });
          } else {
            ambigs.push({ line: i, raw: rawLine, reason: "no mapping found for number length" });
          }
        } else {
          invalids.push({ line: i, raw: rawLine, reason: "invalid number or amount" });
        }
        prevNonEmptyIdx = i;
        continue;
      }

      const groupMatch = line.match(/([\d*\s,.\-+:*]+?)\s*(?:\(\s*([0-9][\d,]*)\s*\)|\/\s*([0-9][\d,]*)|=\s*([0-9][\d,]*))$/);
      if (groupMatch) {
        const rawNums = groupMatch[1];
        const amountStr = (groupMatch[2] || groupMatch[3] || groupMatch[4] || "").replace(/,/g, "");
        const amount = parseInt(amountStr, 10);
        if (Number.isNaN(amount) || amount <= 0) {
          invalids.push({ line: i, raw: rawLine, reason: "invalid trailing amount" });
          prevNonEmptyIdx = i;
          continue;
        }
        const numbers = rawNums.replace(/[,.\-\+:*]+/g, " ").trim().split(/\s+/).filter(Boolean);
        let anyInvalid = false;
        numbers.forEach((num) => {
          const cleaned = (num.match(/\d+/) || [""])[0];
          if (isValidNumber(cleaned)) {
            const len = cleaned.length;
            const mapping = getMapping(len);
            if (mapping) {
              validNumbers[len].push({
                number: cleaned,
                type: mapping.typename,
                amount,
                typeid: mapping.typeid,
              });
            } else {
              ambigs.push({ line: i, raw: rawLine, reason: `no mapping for length ${len}` });
            }
          } else {
            anyInvalid = true;
          }
        });
        if (anyInvalid) invalids.push({ line: i, raw: rawLine, reason: "one or more numbers invalid in group" });
        prevNonEmptyIdx = i;
        continue;
      }

      const smallNums = (line.match(/\b(\d{1,3})\b/g) || []).map((m) => m.replace(/\D/g, ""));
      if (smallNums.length === 1) {
        ambigs.push({ line: i, raw: rawLine, reason: "single number with no amount" });
        prevNonEmptyIdx = i;
        continue;
      }
      if (smallNums.length > 1) {
        ambigs.push({ line: i, raw: rawLine, reason: "multiple numbers with no clear amount" });
        prevNonEmptyIdx = i;
        continue;
      }

      prevNonEmptyIdx = i;
    }

    setGroupedData(validNumbers);
    setInvalidLines(invalids);
    setAmbiguousLines(ambigs);
  };

  // ---------- Highlighting logic ----------
  // issueMap: exact raw-line strings -> type
  const issueMap = React.useMemo(() => {
    const map = new Map<string, "invalid" | "ambig">();
    invalidLines.forEach((l) => map.set(l.raw.trim(), "invalid"));
    ambiguousLines.forEach((l) => {
      const key = l.raw.trim();
      if (!map.has(key)) map.set(key, "ambig");
    });
    return map;
  }, [invalidLines, ambiguousLines]);

  function escapeHtml(unsafe: string) {
    // keep newlines intact (do not replace with <br/>)
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function makeHighlightedHTML(text: string) {
    if (text === "") return "<div></div>";
    let html = escapeHtml(text);

    const keys = Array.from(issueMap.keys()).sort((a, b) => b.length - a.length);
    keys.forEach((raw) => {
      if (!raw) return;
      const kind = issueMap.get(raw) || "ambig";
      const cls = kind === "invalid" ? "issue-invalid" : "issue-ambig";
      const esc = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(esc, "gm");
      html = html.replace(re, `<span class="${cls}">${escapeHtml(raw)}</span>`);
    });

    return `<div class="highlight-content">${html}</div>`;
  }

  const syncScroll = () => {
    if (!textareaRef.current || !highlighterRef.current) return;
    highlighterRef.current.scrollTop = textareaRef.current.scrollTop;
    highlighterRef.current.scrollLeft = textareaRef.current.scrollLeft;
  };

  const mapPosition = (original: string, cleaned: string, pos: number): number => {
    const originalLines = original.split(/\r?\n/);
    const cleanedLines = cleaned.split(/\r?\n/);
    let currentPos = 0;
    let newPos = 0;
    for (let k = 0; k < originalLines.length; k++) {
      const origLine = originalLines[k];
      const cleanLine = cleanedLines[k] || "";
      const removed = origLine.length - cleanLine.length;
      const lineStart = currentPos;
      const lineEnd = currentPos + origLine.length;
      if (pos >= lineStart && pos < lineEnd) {
        const posInLine = pos - lineStart;
        if (posInLine < removed) {
          return newPos;
        } else {
          return newPos + (posInLine - removed);
        }
      }
      currentPos += origLine.length + (k < originalLines.length - 1 ? 1 : 0);
      newPos += cleanLine.length + (k < cleanedLines.length - 1 ? 1 : 0);
    }
    return newPos;
  };

  // ---------- Submit ----------
  const handleSubmit = async () => {
    if (!selectedGame || !selectedGroup) {
      message.error("Please select a game and group.");
      return;
    }
    if (invalidLines.length > 0) {
      message.error("Cannot submit: unresolved parse errors in input.");
      return;
    }
    const allFilled = Object.values(groupedData).every((group) => group.every((item) => item.amount > 0 && item.typeid));
    if (!allFilled) {
      message.error("Please fill all amount fields.");
      return;
    }

    const payload = {
      data: Object.values(groupedData)
        .flat()
        .map((item) => ({
          flag: "I",
          createdat: dayjs().format("YYYY-MM-DD HH:mm:ss"),
          number: item.number,
          gameid: selectedGame.gameid,
          game: selectedGame.gamename,
          typeid: item.typeid,
          type: item.type,
          amount: item.amount,
          uid: userId,
          group: selectedGroup.id,
          grpname: selectedGroup.groupname,
          gamedate: selectedDate,
        })),
      messageData: {
        createdat: dayjs().format("YYYY-MM-DD HH:mm:ss"),
        gameid: selectedGame.gameid,
        uid: userId,
        group: selectedGroup.id,
        gamedate: selectedDate,
        message: inputValue,
      },
    };

    setLoading(true);
    try {
      await apiClient.post("/createorupdatedata", payload);
      message.success("Data submitted successfully!");
      setGroupedData({ 1: [], 2: [], 3: [] });
      setInputValue("");
      setInvalidLines([]);
      setAmbiguousLines([]);
    } catch (error) {
      console.error(error);
      message.error("Failed to submit data");
    } finally {
      setLoading(false);
    }
  };

  const disabledDate = (current: dayjs.Dayjs | null) => {
    if (!current) return false;
    const todayEnd = dayjs().endOf("day");
    const earliest = dayjs().subtract(30, "day").startOf("day");
    return current.isAfter(todayEnd, "day") || current.isBefore(earliest, "day");
  };

  const isBlocked = invalidLines.length > 0 || Object.values(groupedData).flat().length === 0;

  return (
    <div className="insert-history-page card-container">
      <div className="header">
        <Link to={`/userGames`}>Games</Link>
        <Link to={`/insert/${gameid}/${gamename}`} className="active">
          INSERT
        </Link>
        <Link to={`/history/${gameid}/${gamename}`}>HISTORY</Link>
        <Link to={`/data/${gameid}/${gamename}`}>TOTAL</Link>
      </div>

      <Modal title={<span className="modal-title">Insert History</span>} open={isOpen} onCancel={() => setIsOpen(false)} footer={null} centered width={600}>
        <div className="modal-body-content h-96 overflow-y-auto flex flex-col gap-2 p-2">
          {messages.map((msg) => (
            <Card key={msg.id} className="history-message-card">
              <Card.Meta
                title={
                  <div className="whitespace-pre">
                            {msg.message.replace(/\r\n/g, '\n').split('\n').map((line, index) => (
  <div key={index}>{line}</div>
))}
                  </div>
                }
                description={dayjs(msg.created_at).format("hh:mm A")}
              />
            </Card>
          ))}
        </div>
      </Modal>

      <div className="history-toolbar">
        <div className="history-toolbar__date">
          <DatePicker
            value={dayjs(selectedDate)}
            onChange={(date) => date && setSelectedDate(date.format("YYYY-MM-DD"))}
            disabledDate={disabledDate}
            allowClear={false}
            className="history-toolbar__date-picker"
          />
          <div className="history-toolbar__quick">
            <Button className="btn-ghost btn-responsive" onClick={() => setSelectedDate(dayjs().format("YYYY-MM-DD"))}>
              Today
            </Button>
            <Button className="btn-ghost btn-responsive" onClick={() => setSelectedDate(dayjs().subtract(1, "day").format("YYYY-MM-DD"))}>
              Yesterday
            </Button>
          </div>
        </div>

        <div className="history-toolbar__filters">
          <div className="history-toolbar__field">
            <label>Game</label>
            <Select
              placeholder="Select Game"
              value={selectedGame ? selectedGame.gameid : undefined}
              onChange={(value: number) => setSelectedGame(games.find((g) => g.gameid === value) || null)}
              className="history-toolbar__select"
            >
              {games.map((game) => (
                <Select.Option key={game.gameid} value={game.gameid}>
                  {game.gamename}
                </Select.Option>
              ))}
            </Select>
          </div>

          <div className="history-toolbar__field">
            <label>Group</label>
            <Select
              placeholder="Select Group"
              value={selectedGroup ? selectedGroup.id : undefined}
              onChange={(value: number) => setSelectedGroup(userGroups.find((g) => g.id === value) || null)}
              className="history-toolbar__select"
            >
              {userGroups.map((group) => (
                <Select.Option key={group.id} value={group.id}>
                  {group.groupname}
                </Select.Option>
              ))}
            </Select>
          </div>

          <div className="history-toolbar__field history-toolbar__field--compact">
            <label>Type</label>
            <Select value={selectedTyp} onChange={(value) => setSelectedTyp(value)} className="history-toolbar__select">
              <Select.Option value="Open">Open</Select.Option>
              <Select.Option value="Close">Close</Select.Option>
            </Select>
          </div>

          <Button
            type="primary"
            className="btn-responsive"
            onClick={getHistory}
            disabled={!selectedGroup || !selectedGame}
          >
            Fetch History
          </Button>
        </div>
      </div>

      <div className="containerx">
        {/* Left Input Section with overlay highlighter */}
        <div className="input-section">
          <div className={`input-shell ${invalidLines.length > 0 ? "input-shell--error" : ""}`}>
            <div
              ref={highlighterRef}
              className="input-highlighter"
              aria-hidden
              dangerouslySetInnerHTML={{ __html: makeHighlightedHTML(inputValue) }}
            />
            <textarea
              ref={textareaRef}
              value={inputValue}
           onChange={(e) => {
  const textarea = e.target as HTMLTextAreaElement;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const originalValue = e.target.value;

  // strip headers (your existing logic)
  const cleaned = originalValue
    .split(/\r?\n/)
    .map((line) =>
      line.replace(
  /^\s*\[\s*\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?(?:\s+\d{1,2}:\d{2}(?:\s*[APMapm]{2})?)?\s*\][^:]*:\s*/,
  ""
)
    )
    .join("\n");

  const normalized = fillWithNextValue(cleaned);
  setInputValue(normalized);

  // map old cursor positions -> new positions using your mapPosition
  const mappedStart = mapPosition(originalValue, normalized, start);
  const mappedEnd = mapPosition(originalValue, normalized, end);

  // clamp to valid range
  const clamp = (n: number) => Math.max(0, Math.min(normalized.length, n));
  const newStart = clamp(mappedStart);
  const newEnd = clamp(mappedEnd);

  // restore selection on next frame and sync scroll
  requestAnimationFrame(() => {
    if (textareaRef.current) {
      try {
        textareaRef.current.setSelectionRange(newStart, newEnd);
      } catch (err) {
        console.log(err)// ignore if browser doesn't allow
      }
      syncScroll();
    }
  });
}}

              onInput={syncScroll}
              onScroll={syncScroll}
              onKeyUp={syncScroll}
              onClick={syncScroll}
              placeholder="Enter numbers separated by comma, space, or dash"
            />
          </div>

          <Button type="primary" className="btn-responsive" onClick={handleSubmit} disabled={isBlocked}>
            Update
          </Button>

          {/* Compact banner message only — no line numbers */}
          <div className="validation-banner">
            {invalidLines.length + ambiguousLines.length > 0 ? (
              <div
                className={`validation-banner__card ${
                  invalidLines.length > 0 ? "validation-banner__card--error" : "validation-banner__card--warn"
                }`}
              >
                <div
                  className={`validation-banner__text ${
                    invalidLines.length > 0 ? "validation-banner__text--error" : "validation-banner__text--warn"
                  }`}
                >
                  Possible errors detected — fix the underlined parts in the input.
                </div>
              </div>
            ) : (
              <div className="validation-banner__card validation-banner__card--success">
                <div className="validation-banner__text validation-banner__text--success">No parse issues detected.</div>
              </div>
            )}
          </div>
        </div>

        {/* Right Table Section */}
        <div className="table-section">
          {loading ? (
            <Spin size="large" />
          ) : Object.entries(groupedData).length > 0 ? (
            Object.entries(groupedData).map(([length, numbers], idx) =>
              numbers.length > 0 ? (
                <div className="group" key={length}>
                  <h3>{getMapping(Number(length))?.typename.toUpperCase()}</h3>
                  <div className="scroll-container" ref={(el) => (groupRefs.current[idx] = el)}>
                    {numbers.map((item, index) => (
                      <div key={index} className="row">
                        <span>{item.number}</span>
                        <Input
                          type="text"
                          value={new Intl.NumberFormat("en-IN").format(item.amount)}
                          onFocus={(e: React.FocusEvent<HTMLInputElement>) => (e.target.value = item.amount.toString())}
                          onBlur={(e: React.FocusEvent<HTMLInputElement>) => (e.target.value = new Intl.NumberFormat("en-IN").format(item.amount))}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setGroupedData((prev) => ({
                              ...prev,
                              [length]: prev[Number(length)].map((el, i) => (i === index ? { ...el, amount: Number(e.target.value.replace(/,/g, "")) } : el)),
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            )
          ) : (
            <div className="placeholder">No data available</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InsertHistory;
