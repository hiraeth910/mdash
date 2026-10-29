import React, { useEffect, useState } from "react";
import { Button, Modal, Input, message, DatePicker } from "antd";
import dayjs from "dayjs";
import { EditOutlined, PlusCircleOutlined } from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import { useUserStore } from "./store/store";
import { isAdminRole } from "./utils/session";
import { apiClient } from "./utils/api";
import { getGames, invalidateGamesCache } from "./utils/gamesCache";
import "./game.css";
import { checkAuthAndHandleLogout } from "./authcheck";


// Models / Interfaces
export interface IGame {
  gameid: number;
  gamename: string;
  gamedescription: string;
  // Add other properties if needed.
}

export interface IGameEntry {
  flag: string;
  name: string;
  description: string;
}

export interface INewGame {
  gamename: string;
  gamedescription: string;
}

export interface IGameResult {
  id: number;
  open_pana: string;     // ← change to string
  close_pana: string;    // ← change to string
}

const GamesPage: React.FC = () => {
  const navigate = useNavigate();
  const { userRole } = useUserStore();

  const [games, setGames] = useState<IGame[]>([]);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [newGamesList, setNewGamesList] = useState<IGameEntry[]>([]);
  const [newGame, setNewGame] = useState<INewGame>({ gamename: "", gamedescription: "" });
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingGame, setEditingGame] = useState<IGame | null>(null);
 
  const [id, setId] = useState<number>(-1);

  // New state for result modal
  const [resultModalVisible, setResultModalVisible] = useState<boolean>(false);
  const [selectedGame, setSelectedGame] = useState<IGame | undefined>(undefined);
  // dayjs() reads the browser's local time; this platform runs on IST, so this rolls over to
  // "today" right at local midnight instead of ~5.5 hours later the way a UTC-based
  // `new Date().toISOString()` would (IST is UTC+5:30).
  const [resultDate, setResultDate] = useState<string>(dayjs().format("YYYY-MM-DD"));
 const [openPana, setOpenPana]   = useState<string>("");
const [closePana, setClosePana] = useState<string>("");
const [dbOpenPana, setDbOpenPana] = useState<string>("");
const [dbClosePana, setDbClosePana] = useState<string>("");

  // Ticks every 30s so "is the open/close time already past" and "what's today" (for the result
  // lookups below) stay correct live, including right across local midnight, without a refresh.
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const id = window.setInterval(() => setNow(dayjs()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const today = now.format("YYYY-MM-DD");

  // Each game's result for today, fetched once the game list and the date are known and kept
  // current after a result is saved (fetchGames() -> this effect re-runs) or at midnight (today
  // changes). Keyed by gameid; undefined means "not fetched yet", null fields mean "no result".
  const [resultsByGame, setResultsByGame] = useState<Record<number, { open_pana: string | null; close_pana: string | null }>>({});
  useEffect(() => {
    if (games.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        games.map(async (g) => {
          try {
            const res = await apiClient.get<IGameResult[]>("/get/game/result", { params: { gameid: g.gameid, game_date: today } });
            const result = res.data[0];
            return [g.gameid, { open_pana: result?.open_pana ?? null, close_pana: result?.close_pana ?? null }] as const;
          } catch {
            return [g.gameid, { open_pana: null, close_pana: null }] as const;
          }
        })
      );
      if (!cancelled) setResultsByGame(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [games, today]);

  // A card is flagged when its time has passed and today's result for that side isn't in yet —
  // close takes priority over open since it's the more overdue state. Neither flag once both
  // sides are in (or before their time).
  const gameStatus = (game: IGame): "missing-open" | "missing-close" | null => {
    const [openTime, closeTime] = game.gamedescription.split("-");
    const result = resultsByGame[game.gameid];
    const pastTime = (t: string) => !!t && now.isAfter(dayjs(`${today} ${t}`, "YYYY-MM-DD HH:mm"));
    if (pastTime(closeTime) && !result?.close_pana) return "missing-close";
    if (pastTime(openTime) && !result?.open_pana) return "missing-open";
    return null;
  };

  // Today's result, shown right on the card once it's in (or dashed while waiting on it).
  const resultsLine = (game: IGame) => {
    const result = resultsByGame[game.gameid];
    if (!result || (!result.open_pana && !result.close_pana)) return null;
    return (
      <p className="game-results">
        Open: {result.open_pana ?? "—"} · Close: {result.close_pana ?? "—"}
      </p>
    );
  };

  const formatTime = (timeString: string): string => {
    if(!timeString){
      return "12:45 AM"
    }
    const [hour, minute] = timeString.split(":").map(Number);
    const suffix = hour >= 12 ? "PM" : "AM";
    const formattedHour = hour % 12 || 12;
    return `${formattedHour}:${minute.toString().padStart(2, "0")} ${suffix}`;
  };
const isOpenValid  = /^\d{3}$/.test(openPana);
const isCloseValid = /^\d{3}$/.test(closePana);
  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    try {
      const stillLoggedIn = await checkAuthAndHandleLogout();
  if (!stillLoggedIn) return;
      setGames(await getGames());
    } catch (error) {
      console.error(error);
      message.error("Failed to fetch games");
    } 
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewGame({ ...newGame, [e.target.name]: e.target.value });
  };

  const addGameToList = () => {
    if (!newGame.gamename || !newGame.gamedescription) {
      return message.warning("Please fill in all fields");
    }
    const newEntry: IGameEntry = {
      flag: "GI",
      name: newGame.gamename,
      description: newGame.gamedescription,
    };
    setNewGamesList([...newGamesList, newEntry]);
    setNewGame({ gamename: "", gamedescription: "" });
  };

  const handleSubmit = async () => {
    if (newGamesList.length === 0) {
      return message.warning("No games to submit");
    }
    try {
      await apiClient.post("/managemasterdata", { data: newGamesList });
      message.success("Games processed successfully!");
      setNewGamesList([]);
      setModalVisible(false);
      invalidateGamesCache();
      fetchGames();
    } catch (error) {
      console.error(error);
      message.error("Failed to process games");
    }
  };

  const handleEdit = (record: IGame) => {
    setNewGame({
      gamename: record.gamename,
      gamedescription: record.gamedescription,
    });
    setEditingGame(record);
    setIsEditing(true);
    setModalVisible(true);
  };

  const openAddGameModal = () => {
    setNewGame({ gamename: "", gamedescription: "" });
    setNewGamesList([]);
    setEditingGame(null);
    setIsEditing(false);
    setModalVisible(true);
  };

  const handleUpdate = async () => {
    if (!editingGame) return;
    try {
      const updateEntry = {
        flag: "GU",
        id: editingGame.gameid,
        name: newGame.gamename,
        description: newGame.gamedescription,
      };
      await apiClient.post("/managemasterdata", { data: [updateEntry] });
      message.success("Game updated successfully!");
      setModalVisible(false);
      invalidateGamesCache();
      fetchGames();
    } catch (error) {
      console.error(error);
      message.error("Failed to update game");
    }
  };

  // Opens the modal for whatever date is already picked on the page (see the shared date
  // picker above the game lists) instead of always resetting to today — so entering results
  // for several games on the same (possibly past) date doesn't mean re-picking it each time.
  // The fetch itself is left to the effect below, which already re-runs once selectedGame and
  // resultModalVisible change.
  const openResultModal = (game: IGame) => {
    setSelectedGame(game);
    setResultModalVisible(true);
  };

  // Remove old date Input and use DatePicker instead.
  // New onChange handler is integrated in the DatePicker component inline.
  // New effect: When resultDate changes, fetch the game result again.
  useEffect(() => {
    if (selectedGame && resultModalVisible) {
      (async () => {
        try {
          const stillLoggedIn = await checkAuthAndHandleLogout();
  if (!stillLoggedIn) return;
          const response = await apiClient.get<IGameResult[]>("/get/game/result", {
            params: { gameid: selectedGame.gameid, game_date: resultDate },
          });
          const result = response.data[0];
          setOpenPana(result?.open_pana || '');
          setClosePana(result?.close_pana || '');
          setDbOpenPana(result?.open_pana || '');
          setDbClosePana(result?.close_pana || '');
          setId(result?.id || -1);
        } catch (error) {
          console.error(error);
          message.error("Failed to fetch game result");
          setOpenPana('');
          setClosePana('');
          setDbOpenPana('');
          setDbClosePana('');
        }
      })();
    }
  }, [resultDate, selectedGame, resultModalVisible]);

  const handleResultInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
if (name === "open_pana")  setOpenPana(value);
    if (name === "close_pana") setClosePana(value);
  };

  const handleSubmitResult = async () => {
    const resultData: any = {
      id: id,
      gameid: selectedGame?.gameid,
      game_date: resultDate,
      openPana: openPana === '' ? null : openPana,
    };

    if (id !== -1) {
      resultData.closePana = closePana === '' ? null : closePana;
    }

    try {
      await apiClient.post("/game/result", resultData);
      message.success("Game result added/updated successfully!");
      // The games list is cached and may not change reference, so the results-by-game effect
      // (which only re-fetches when `games` or `today` change) wouldn't otherwise notice a save
      // against today -- update the card's result right away instead of waiting on that.
      if (selectedGame && resultDate === today) {
        setResultsByGame((prev) => ({
          ...prev,
          [selectedGame.gameid]: { open_pana: openPana || null, close_pana: closePana || null },
        }));
      }
      setId(-1);
      setDbOpenPana("");
      setDbClosePana("");
      setResultModalVisible(false);
      fetchGames();
    } catch (error) {
      console.error(error);
      message.error("Failed to add/update game result");
    }
  };

  // Shared by the result modal's OK button and Enter-to-save on its inputs.
  const resultSaveDisabled = (() => {
    const isChanged = openPana !== dbOpenPana || closePana !== dbClosePana;
    if (!isChanged) return true;
    if (id === -1) return !isOpenValid;
    const isCloseNowEntered = closePana !== "";
    if (!isOpenValid) return true;
    if (isCloseNowEntered && !isCloseValid) return true;
    return false;
  })();

  return (
    <>
      <div className="container">
        {isAdminRole(userRole) && (
          <div className="header top-nav">
            <Link to="/users">Users</Link>
            <Link to="/games" className="active">
              Games
            </Link>
            <Link to="/groups">Groups</Link>
            <Link to="/result/:gameid/:gamename">Settlement</Link>
            <Link to="/summary">Day</Link>
            {userRole === "superadmin" && <Link to="/compare">Compare</Link>}
          </div>
        )}
        {isAdminRole(userRole) && (
          <div className="games-result-date">
            <label>Result date</label>
            <DatePicker
              value={resultDate ? dayjs(resultDate) : null}
              onChange={(date) => setResultDate((date || dayjs()).format("YYYY-MM-DD"))}
              allowClear={false}
            />
            <Button className="btn-ghost btn-responsive" onClick={() => setResultDate(dayjs().format("YYYY-MM-DD"))}>
              Today
            </Button>
            <Button type="primary" icon={<PlusCircleOutlined />} onClick={openAddGameModal}>
              Add Game
            </Button>
          </div>
        )}
        <div className="games-layout">
          <div className="games-lists">
            <div className="game-stack">
              <h2>Day Games</h2>
              {games
                .filter((game) => game.gamedescription.split("-")[0] < "18:00")
                .sort((a, b) => a.gamedescription.split("-")[0].localeCompare(b.gamedescription.split("-")[0]))
                .map((game) => {
                  const [openTime, closeTime] = game.gamedescription.split("-");
                  const status = gameStatus(game);
                  return (
                    <div
                      key={game.gameid}
                      className={`game-card day-game ${status ? `game-card--${status}` : ""}`.trim()}
                    onClick={() => {
                      setSelectedGame(game);
                      navigate(`/data/${game.gameid}/${encodeURIComponent(game.gamename)}`);
                    }}
                    >
                      <div className="game-details">
                        <h4>{game.gamename}</h4>
                        <p>{formatTime(openTime)} - {formatTime(closeTime)}</p>
                        {resultsLine(game)}
                      </div>
                      <div className="game-buttons">
                        <Button
                          type="primary"
                          icon={<EditOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(game);
                          }}
                        />
                        {isAdminRole(userRole) && (
                        <Button
                          type="default"
                          danger
                          icon={<PlusCircleOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            openResultModal(game);
                          }}
                        />
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="game-stack">
              <h2>Night Games</h2>
              {games
                .filter((game) => game.gamedescription.split("-")[0] >= "18:00")
                .sort((a, b) => a.gamedescription.split("-")[0].localeCompare(b.gamedescription.split("-")[0]))
                .map((game) => {
                  const [openTime, closeTime] = game.gamedescription.split("-");
                  const status = gameStatus(game);
                  return (
                    <div
                      key={game.gameid}
                      className={`game-card night-game ${status ? `game-card--${status}` : ""}`.trim()}
                    onClick={() => {
                      setSelectedGame(game);
                      navigate(`/data/${game.gameid}/${encodeURIComponent(game.gamename)}`);
                    }}
                    >
                      <div className="game-details">
                        <h4>{game.gamename}</h4>
                        <p>{formatTime(openTime)} - {formatTime(closeTime)}</p>
                        {resultsLine(game)}
                      </div>
                      <div className="game-buttons">
                        <Button
                          type="primary"
                          icon={<EditOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(game);
                          }}
                        />
                        {isAdminRole(userRole) && (
                        <Button
                          type="default"
                          danger
                          icon={<PlusCircleOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            openResultModal(game);
                          }}
                        />
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>


        </div>

        <Modal
          title={<span style={{ color: 'var(--color-heading)' }}>{isEditing ? "Edit Game" : "Add New Game"}</span>}
          open={modalVisible}
          onCancel={() => {
            setModalVisible(false);
            setNewGamesList([]);
            setEditingGame(null);
          }}
          onOk={isEditing ? handleUpdate : handleSubmit}
        >
          <div style={{ color: 'var(--color-text)' }}>
            <label>Game Name</label>
            <Input
              placeholder="Enter game name"
              name="gamename"
              value={newGame.gamename}
              onChange={handleInputChange}
              onPressEnter={isEditing ? handleUpdate : addGameToList}
            />
            <label>Description</label>
            <Input
              placeholder="Enter game description"
              name="gamedescription"
              value={newGame.gamedescription}
              onChange={handleInputChange}
              onPressEnter={isEditing ? handleUpdate : addGameToList}
            />
            {!isEditing && (
              <>
                <Button onClick={addGameToList} style={{ marginTop: 10 }}>
                  Add to List
                </Button>
                <ul>
                  {newGamesList.map((game, index) => (
                    <li key={index}>
                      {game.name} - {game.description}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Modal>
        <Modal
title={
  <>
    <span style={{ color: 'var(--color-heading)' }}>Add / Edit Result for{" "}</span>
    <span style={{ fontWeight: "700", fontSize: "1.2em", color: 'var(--color-heading)' }}>
      {selectedGame?.gamename}
    </span>
  </>
}
          open={resultModalVisible}
          onCancel={() => setResultModalVisible(false)}
          onOk={handleSubmitResult}
          okButtonProps={{ disabled: resultSaveDisabled }}
        >
          <div style={{ color: 'var(--color-text)' }}>
            <label>Game Date</label>
       <DatePicker
  value={resultDate ? dayjs(resultDate) : null}
  onChange={(_, dateString) => {
    const finalDate = Array.isArray(dateString) ? dateString[0] : dateString;
    setResultDate(finalDate);
  }}
/>


            <label>Open Pana</label>
            <Input
              type="text"             // ← use text, not number
  maxLength={3}
              name="open_pana"
              value={openPana}
              onChange={handleResultInputChange}
              onPressEnter={() => !resultSaveDisabled && handleSubmitResult()}
            />
            <label>Close Pana</label>
            <Input
              type="text"             // ← use text, not number
  maxLength={3}
              name="close_pana"
              value={closePana}
              onChange={handleResultInputChange}
              onPressEnter={() => !resultSaveDisabled && handleSubmitResult()}
              // Disable closePana input when inserting a new result
              disabled={id === -1}
            />
          </div>
        </Modal>
      </div>
    </>
  );
};

export default GamesPage;
