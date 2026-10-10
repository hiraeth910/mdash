import React, { useState, useEffect, useRef } from "react";
import { Input, Button, message, Spin, Select, Card, Modal, DatePicker, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { apiClient } from "./utils/api";
import { getGames } from "./utils/gamesCache";
import dayjs from "dayjs";
import { Link, useParams } from "react-router-dom";
import "./InsertHistory.css";
import { useUserStore } from "./store/store";
import CalculatorButton from "./Calculator";
import moment from "moment";
import { IGame } from "./games";
import { IGroup } from "./userGames";
import { checkAuthAndHandleLogout } from "./authcheck";
import {  fillWithNextValue } from "./utils/helpter";
import { compressForUpload } from "./utils/imageCompress";
import { ocrBetPairs } from "./utils/ocr";
import { searchProps } from "./utils/selectSearch";

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

// Practice data for the admin test page, which never calls the server.
const PRACTICE_GAMES = [
  { gameid: 1, gamename: "Practice Day", gamedescription: "1" },
  { gameid: 2, gamename: "Practice Night", gamedescription: "2" },
];
const PRACTICE_GROUPS = [
  { id: 1, groupname: "Practice A" },
  { id: 2, groupname: "Practice B" },
];

// The standard single/double/triple pana charts, grouped by digit (digit = the numbers' digit sum
// mod 10). Clicking a digit inserts that whole group as one "numbers=amount" line, which the parser
// above already reads as a shared-amount group.
const SP_PANA: Record<string, string> = {
  "0": "127.136.145.190.235.280.370.389.460.479.569.578",
  "1": "137.128.146.236.245.290.380.470.489.560.678.579",
  "2": "129.138.147.156.237.246.345.390.480.570.589.679",
  "3": "120.139.148.157.238.247.256.346.490.580.670.689",
  "4": "130.149.158.167.239.248.257.347.356.590.680.789",
  "5": "140.159.168.230.249.258.267.348.357.456.690.780",
  "6": "123.150.169.178.240.259.268.349.358.367.457.790",
  "7": "124.160.179.250.269.278.340.359.368.458.467.890",
  "8": "125.134.170.189.260.279.350.369.378.459.468.567",
  "9": "126.135.180.234.270.289.360.379.450.459.478.568",
};
const DP_PANA: Record<string, string> = {
  "0": "118.226.244.299.334.488.668.677.550",
  "1": "119.155.227.335.344.399.588.669.100",
  "2": "110.228.255.336.499.660.688.778.200",
  "3": "166.229.337.355.445.599.779.788.300",
  "4": "112.220.266.338.446.455.699.770.400",
  "5": "113.122.177.339.366.447.799.889.500",
  "6": "114.277.330.448.466.556.880.899.600",
  "7": "115.133.188.223.377.449.557.566.700",
  "8": "116.224.233.288.440.477.558.990.800",
  "9": "117.144.199.225.388.559.577.667.900",
};
const TP_PANA = "000.111.222.333.444.555.666.777.888.999";

const InsertHistory: React.FC<{ dummy?: boolean }> = ({ dummy = false }) => {
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
  const [pastedImagePreviews, setPastedImagePreviews] = useState<string[]>([]);
  const [extractingImages, setExtractingImages] = useState(false);
  const [readingLocally, setReadingLocally] = useState(false); // the first local read downloads the reader
  const [dropActive, setDropActive] = useState(false); // an image file is being dragged over the box
  const [panaAmount, setPanaAmount] = useState("10"); // shared amount used by the SP/DP/TP quick-insert buttons
  const prevInputRef = useRef<string>("");
  const [practiceMessages, setPracticeMessages] = useState<GameMessage[]>([]);

  // Text set from code (an image paste, or clearing after Update) must count as the previous value,
  // otherwise deleting it by hand looks like "no change" and the box refuses to clear.
  useEffect(() => {
    prevInputRef.current = inputValue;
  }, [inputValue]);
  const groupRefs = useRef<(HTMLDivElement | null)[]>([]);
  const highlighterRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const fetchGamesAndGroups = async () => {
      if (dummy) {
        setGames(PRACTICE_GAMES as unknown as IGame[]);
        setUserGroups(PRACTICE_GROUPS as unknown as IGroup[]);
        return;
      }
      try {
        const stillLoggedIn = await checkAuthAndHandleLogout();
        if (!stillLoggedIn) return;
       const gamesResp: IGame[] = await getGames();
// same extract function locally
const extractSortKey = (g: IGame) => {
  const desc = (g as any).gamedescription || "";
  const m = String(desc).trim().match(/^(\d{1,2})/);
  if (m) return Number(m[1]);
  const m2 = String(g.gamename || "").trim().match(/^(\d{1,2})/);
  return m2 ? Number(m2[1]) : Number.MAX_SAFE_INTEGER;
};
setGames(gamesResp.slice().sort((a, b) => extractSortKey(a) - extractSortKey(b)));

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
    if (dummy) return; // the default type names are used
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
    if (dummy) {
      setMessages(practiceMessages);
      setIsOpen(true);
      return;
    }
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
        if (amount === 1) {
          ambigs.push({ line: i, raw: rawLine, reason: "amount of 1 is usually a misread shared/bracket amount — please verify" });
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
        if (amt === 1) {
          ambigs.push({ line: i, raw: rawLine, reason: "amount of 1 is usually a misread shared/bracket amount — please verify" });
          prevNonEmptyIdx = i;
          continue;
        }
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
        if (amount === 1) {
          ambigs.push({ line: i, raw: rawLine, reason: "amount of 1 is usually a misread shared/bracket amount — please verify" });
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

  // ---------- Paste-an-image-to-extract-text ----------
  // Reads the images with `extract` and appends the resulting lines to the input box.
  const extractFromImages = async (
    files: File[],
    extract: (files: File[]) => Promise<string>,
    emptyMessage = "No text could be extracted from the image(s).",
    failMessage = "Failed to extract text from image(s).",
    local = false
  ) => {
    if (files.length === 0) return;
    if (files.length > 2) {
      message.warning("You can use at most 2 images at a time.");
      return;
    }

    const previews = files.map((f) => URL.createObjectURL(f));
    setPastedImagePreviews(previews);
    setExtractingImages(true);
    setReadingLocally(local);

    try {
      const extractedText = await extract(files);
      if (extractedText) {
        setInputValue((prev) => (prev.trim() ? `${prev}\n${extractedText}` : extractedText));
      } else {
        message.warning(emptyMessage);
      }
    } catch (err) {
      console.error("Image extraction failed:", err);
      // an error without a response means the request never got through
      const unreachable = typeof err === "object" && err !== null && "isAxiosError" in err && !(err as { response?: unknown }).response;
      message.error(
        unreachable
          ? "Couldn't reach the server. Check your internet connection and try again."
          : failMessage
      );
    } finally {
      setExtractingImages(false);
      previews.forEach((url) => URL.revokeObjectURL(url));
      setPastedImagePreviews([]);
    }
  };

  // Sends the images to the server, which reads them with ChatGPT (handles handwriting too).
  const readWithAi = (endpoint: string) => async (files: File[]) => {
    const encoded = await Promise.all(files.map((f) => compressForUpload(f)));
    // a time limit, so a bad connection ends in an error instead of spinning for minutes
    const response = await apiClient.post(
      endpoint,
      { images: encoded.map((c) => ({ data: c.base64, mediaType: c.mediaType })) },
      { timeout: 60_000 }
    );
    return (response.data?.text as string) || "";
  };

  // Reads typed lists in the browser with OCR: free, instant and nothing is uploaded.
  const readWithOcr = async (files: File[]) => {
    const pairs: string[] = [];
    for (const file of files) pairs.push(...(await ocrBetPairs(file)));
    return pairs.join("\n");
  };

  // Pasting an image straight into the box reads it with OCR in the browser (typed lists).
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItems = Array.from(e.clipboardData.items).filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return; // let normal text paste proceed

    e.preventDefault();
    const files = imageItems.map((item) => item.getAsFile()).filter((f): f is File => !!f);
    readInBox(files);
  };

  // Pasting or dropping into the box only ever reads on this device. If it cannot, the person is
  // pointed to the ChatGPT button.
  const readInBox = (files: File[]) =>
    extractFromImages(
      files,
      readWithOcr,
      "No entries found. For handwriting, use the Paste image (ChatGPT) button instead.",
      "Couldn't read the image on this device. Use the Paste image (ChatGPT) button instead.",
      true
    );

  // Drag a downloaded image onto the box. Dragged text is left to the browser as usual.
  const draggedFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types || []).includes("Files");
  const handleDragOver = (e: React.DragEvent) => {
    if (!draggedFiles(e)) return;
    e.preventDefault(); // without this the browser would open the dropped file instead
    e.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDropActive(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    if (!draggedFiles(e)) return;
    e.preventDefault();
    setDropActive(false);
    const images = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      message.warning("Only images can be dropped here.");
      return;
    }
    readInBox(images);
  };

  // The Paste button sends the clipboard image to ChatGPT and fills the box above.
  const handlePasteButtonClick = async () => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of clipboardItems) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        files.push(new File([blob], "pasted-image", { type: imageType }));
      }
      if (files.length === 0) {
        message.warning("No image found on the clipboard.");
        return;
      }
      extractFromImages(files, readWithAi("/extract-bet-image"));
    } catch (err) {
      console.error("Clipboard read failed:", err);
      message.error("Couldn't read an image from the clipboard. Copy an image first, then click Paste.");
    }
  };

  // Appends one SP/DP/TP group ("numbers=amount") to the input box, same as an image extraction would.
  const insertPana = (numbers: string) => {
    const amount = panaAmount.trim() || "10";
    const line = `${numbers}=${amount}`;
    setInputValue((prev) => (prev.trim() ? `${prev}\n${line}` : line));
  };

  const digitMenu = (chart: Record<string, string>): MenuProps => ({
    items: Object.keys(chart).map((digit) => ({ key: digit, label: digit })),
    onClick: ({ key }) => insertPana(chart[key]),
  });
  const tpMenu: MenuProps = {
    items: [{ key: "all", label: "000 · 111 · 222 · … · 999" }],
    onClick: () => insertPana(TP_PANA),
  };

  // const mapPosition = (original: string, cleaned: string, pos: number): number => {
  //   const originalLines = original.split(/\r?\n/);
  //   const cleanedLines = cleaned.split(/\r?\n/);
  //   let currentPos = 0;
  //   let newPos = 0;
  //   for (let k = 0; k < originalLines.length; k++) {
  //     const origLine = originalLines[k];
  //     const cleanLine = cleanedLines[k] || "";
  //     const removed = origLine.length - cleanLine.length;
  //     const lineStart = currentPos;
  //     const lineEnd = currentPos + origLine.length;
  //     if (pos >= lineStart && pos < lineEnd) {
  //       const posInLine = pos - lineStart;
  //       if (posInLine < removed) {
  //         return newPos;
  //       } else {
  //         return newPos + (posInLine - removed);
  //       }
  //     }
  //     currentPos += origLine.length + (k < originalLines.length - 1 ? 1 : 0);
  //     newPos += cleanLine.length + (k < cleanedLines.length - 1 ? 1 : 0);
  //   }
  //   return newPos;
  // };

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

    if (dummy) {
      // practice mode: keep the entry on this page only
      setPracticeMessages((prev) => [
        ...prev,
        { id: Date.now(), created_at: new Date().toISOString(), message: inputValue, gameid: selectedGame.gameid, groupid: selectedGroup.id, userid: 0, gamedate: selectedDate },
      ]);
      message.success(`Practice only: ${payload.data.length} entries checked, nothing was saved.`);
      setGroupedData({ 1: [], 2: [], 3: [] });
      setInputValue("");
      setInvalidLines([]);
      setAmbiguousLines([]);
      return;
    }

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

  const entries = Object.values(groupedData).flat();
  const entryTotal = entries.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const isBlocked = invalidLines.length > 0 || Object.values(groupedData).flat().length === 0;

  return (
    <div className="insert-history-page card-container">
      {!dummy && (
        <div className="header">
          <Link to={`/userGames`}>Games</Link>
          <Link to={`/insert/${gameid}/${gamename}`} className="active">
            INSERT
          </Link>
          <Link to={`/history/${gameid}/${gamename}`}>HISTORY</Link>
          <Link to={`/data/${gameid}/${gamename}`}>TOTAL</Link>
        </div>
      )}

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

      {!dummy && (
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
            <Select {...searchProps}
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
            <Select {...searchProps}
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
            <Select {...searchProps} value={selectedTyp} onChange={(value) => setSelectedTyp(value)} className="history-toolbar__select">
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
          <CalculatorButton className="btn-ghost btn-responsive" />
        </div>
      </div>
      )}

      <div className="containerx">
        {/* Left Input Section with overlay highlighter */}
        <div className="input-section">
          <div
            className={`input-shell ${invalidLines.length > 0 ? "input-shell--error" : ""} ${dropActive ? "input-shell--drop" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
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

  // Step 1: Strip headers
  const cleaned = originalValue
    .split(/\r?\n/)
    .map((line) =>
      line.replace(
        /^\s*\[\s*\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?(?:\s+\d{1,2}:\d{2}(?:\s*[APMapm]{2})?)?\s*\][^:]*:\s*/,
        ""
      )
    )
    .join("\n");

  // Step 2: Only apply autofill if needed AND text has changed
  const needsFilling = /^[0-9A-Za-z]+[=\-\+\:\;\,\.]$/m.test(cleaned);
  const normalized = needsFilling ? fillWithNextValue(cleaned) : cleaned;

  // Optimization: Skip update if nothing changed
  if (normalized === prevInputRef.current) {
    return;
  }

  prevInputRef.current = normalized;
  setInputValue(normalized);

  // Step 3: Intelligent cursor restoration
  requestAnimationFrame(() => {
    if (!textareaRef.current) return;

    try {
      let newStart = start;
      let newEnd = end;

      // If autofill added text, adjust cursor position
      if (needsFilling && normalized.length > cleaned.length) {
        // Find which line was affected
        const originalLines = cleaned.split("\n");
        const normalizedLines = normalized.split("\n");
        
        let charCount = 0;
        let adjustedStart = start;
        
        for (let i = 0; i < originalLines.length; i++) {
          const origLine = originalLines[i];
          const normLine = normalizedLines[i] || "";
          
          // If cursor is on or before this line
          if (start <= charCount + origLine.length + 1) {
            // If this line was autofilled
            if (normLine.length > origLine.length) {
              // Keep cursor at same position within the line
              const posInLine = start - charCount;
              adjustedStart = charCount + Math.min(posInLine, origLine.length);
            } else {
              adjustedStart = charCount + (start - charCount);
            }
            break;
          }
          
          charCount += origLine.length + 1; // +1 for newline
        }
        
        newStart = Math.min(adjustedStart, normalized.length);
        newEnd = Math.min(newStart + (end - start), normalized.length);
      } else {
        // Simple case: just clamp to new length
        newStart = Math.min(start, normalized.length);
        newEnd = Math.min(end, normalized.length);
      }

      textareaRef.current.setSelectionRange(newStart, newEnd);
    } catch (err) {
      console.warn("Could not restore selection:", err);
    }
    
    syncScroll();
  });
}}

              onInput={syncScroll}
              onScroll={syncScroll}
              onKeyUp={syncScroll}
              onClick={syncScroll}
              onPaste={handlePaste}
              placeholder="Enter numbers separated by comma, space, or dash — or paste / drop an image (up to 2)"
            />
          </div>

          {!dummy && (
          <Button
            className="btn-ghost btn-responsive"
            onClick={handlePasteButtonClick}
            disabled={extractingImages || dummy}
            title={dummy ? "Not available in practice mode (it uses the server)" : undefined}
          >
            Paste image (ChatGPT)
          </Button>
          )}

          <div className="pana-quick-row">
            <Dropdown menu={digitMenu(SP_PANA)} trigger={["click"]} getPopupContainer={() => document.body}>
              <Button className="btn-ghost btn-responsive">SP ▾</Button>
            </Dropdown>
            <Dropdown menu={digitMenu(DP_PANA)} trigger={["click"]} getPopupContainer={() => document.body}>
              <Button className="btn-ghost btn-responsive">DP ▾</Button>
            </Dropdown>
            <Dropdown menu={tpMenu} trigger={["click"]} getPopupContainer={() => document.body}>
              <Button className="btn-ghost btn-responsive">TP ▾</Button>
            </Dropdown>
            <Input
              className="pana-quick-row__amount"
              size="middle"
              value={panaAmount}
              onChange={(e) => setPanaAmount(e.target.value.replace(/\D/g, ""))}
              placeholder="Amount"
              aria-label="Amount for SP/DP/TP quick-insert"
            />
          </div>

          {(extractingImages || pastedImagePreviews.length > 0) && (
            <div className="pasted-images-row">
              {pastedImagePreviews.map((src, i) => (
                <img key={i} src={src} alt="Pasted bet slip" className="pasted-image-thumb" />
              ))}
              {extractingImages && (
                <span className="pasted-images-status">
                  <Spin size="small" /> Extracting text from image{pastedImagePreviews.length > 1 ? "s" : ""}…
                  {readingLocally && " (the first time can take a while on a slow connection)"}
                </span>
              )}
            </div>
          )}

          <div className="entry-total" data-testid="entry-total">
            <span>Total</span>
            <strong>{new Intl.NumberFormat("en-IN").format(entryTotal)}</strong>
            <small>
              {entries.length} entr{entries.length === 1 ? "y" : "ies"}
            </small>
          </div>

          {!dummy && (
          <Button type="primary" className="btn-responsive" onClick={handleSubmit} disabled={isBlocked}>
            Update
          </Button>
          )}

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
            ) : dummy ? null : (
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
                  <h3>
                    {getMapping(Number(length))?.typename.toUpperCase()}
                    <span className="group-total">{new Intl.NumberFormat("en-IN").format(numbers.reduce((sum, item) => sum + (Number(item.amount) || 0), 0))}</span>
                  </h3>
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
