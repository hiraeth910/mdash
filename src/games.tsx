import React, { useEffect, useMemo, useState } from "react";
import { Button, Modal, Input, message, DatePicker, Select } from "antd";
import dayjs from "dayjs";
import { EditOutlined, PlusCircleOutlined } from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import { useUserStore } from "./store/store";
import { apiClient } from "./utils/api";
import "./game.css";
import { checkAuthAndHandleLogout } from "./authcheck";

const { Option } = Select;

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

  const upcomingGames = useMemo(() => {
    return games
      .slice()
      .sort((a, b) => a.gamedescription.localeCompare(b.gamedescription))
      .slice(0, 4);
  }, [games]);

  // New state for result modal
  const [resultModalVisible, setResultModalVisible] = useState<boolean>(false);
  const [selectedGame, setSelectedGame] = useState<IGame | undefined>(undefined);
  const [resultDate, setResultDate] = useState<string>(new Date().toISOString().split("T")[0]);
 const [openPana, setOpenPana]   = useState<string>("");
const [closePana, setClosePana] = useState<string>("");
  

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
  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    try {
      const stillLoggedIn = await checkAuthAndHandleLogout();
  if (!stillLoggedIn) return;
      const response = await apiClient.get<IGame[]>("/games");
      setGames(response.data);
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
      fetchGames();
    } catch (error) {
      console.error(error);
      message.error("Failed to update game");
    }
  };

  const openResultModal = async (game: IGame) => {
    setSelectedGame(game);
    const currentDate = new Date().toISOString().split("T")[0];
    setResultDate(currentDate); // default to current date
    setResultModalVisible(true); // Open modal immediately
    try {
      const stillLoggedIn = await checkAuthAndHandleLogout();
      if (!stillLoggedIn) return;
      const response = await apiClient.get<IGameResult[]>("/get/game/result", {
        params: { gameid: game.gameid, game_date: currentDate },
      });
      const result = response.data[0]; // Assuming the API returns an array
      setOpenPana(result?.open_pana || '');
      setClosePana(result?.close_pana || '');
      setId(result?.id || -1);
    } catch (error) {
      console.error(error);
      message.error("Failed to fetch game result");
      setOpenPana('');
      setClosePana('');
    }
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
          setId(result?.id || -1);
        } catch (error) {
          console.error(error);
          message.error("Failed to fetch game result");
          setOpenPana('');
          setClosePana('');
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
    const resultData = {
      id: id,
      gameid: selectedGame?.gameid,
      game_date: resultDate,
      openPana: openPana === '' ? null : openPana,
      closePana: closePana === '' ? null : closePana,
    };

    try {
      await apiClient.post("/game/result", resultData);
      message.success("Game result added/updated successfully!");
      setId(-1);
      setResultModalVisible(false);
      fetchGames();
    } catch (error) {
      console.error(error);
      message.error("Failed to add/update game result");
    }
  };

  return (
    <>
      <div className="container">
        {userRole === "admin" && (
          <div className="header top-nav">
            <Link to="/users">Users</Link>
            <Link to="/games" className="active">
              Games
            </Link>
            <Link to="/groups">Groups</Link>
            <Link to="/result/:gameid/:gamename">Settlement</Link>
            <Link to="/summary">Day</Link>
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
                  return (
                    <div
                      key={game.gameid}
                      className="game-card day-game"
                    onClick={() => {
                      setSelectedGame(game);
                      navigate(`/data/${game.gameid}/${encodeURIComponent(game.gamename)}`);
                    }}
                    >
                      <div className="game-details">
                        <h4>{game.gamename}</h4>
                        <p>{formatTime(openTime)} - {formatTime(closeTime)}</p>
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
                        <Button
                          type="default"
                          danger
                          icon={<PlusCircleOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            openResultModal(game);
                          }}
                        />
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
                  return (
                    <div
                      key={game.gameid}
                      className="game-card night-game"
                    onClick={() => {
                      setSelectedGame(game);
                      navigate(`/data/${game.gameid}/${encodeURIComponent(game.gamename)}`);
                    }}
                    >
                      <div className="game-details">
                        <h4>{game.gamename}</h4>
                        <p>{formatTime(openTime)} - {formatTime(closeTime)}</p>
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
                        <Button
                          type="default"
                          danger
                          icon={<PlusCircleOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            openResultModal(game);
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {userRole === "admin" && (
            <aside className="games-sidebar">
              <div className="games-sidebar__card">
                <h3>Quick Actions</h3>
                <p>Manage schedules and capture results directly from this dashboard.</p>
                <div className="games-sidebar__actions">
                  <Button
                    type="primary"
                    className="btn-responsive"
                    onClick={() => {
                      setIsEditing(false);
                      setEditingGame(null);
                      setModalVisible(true);
                    }}
                  >
                    Add Game
                  </Button>
                  <Select
                    placeholder="Select Game for Result"
                    value={selectedGame ? selectedGame.gameid : undefined}
                    onChange={(value: number) => {
                      const game = games.find((g) => g.gameid === value);
                      if (game) {
                        setSelectedGame(game);
                        openResultModal(game);
                      }
                    }}
                    className="btn-responsive"
                    style={{ width: "100%" }}
                  >
                    {games.map((game) => (
                      <Option key={game.gameid} value={game.gameid}>
                        {game.gamename}
                      </Option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="games-sidebar__card">
                <h3>Upcoming Slots</h3>
                <ul className="games-sidebar__list">
                  {upcomingGames.length === 0 && (
                    <li className="games-sidebar__empty">No games scheduled.</li>
                  )}
                  {upcomingGames.map((game) => {
                    const [openTime, closeTime] = game.gamedescription.split("-");
                    return (
                      <li key={game.gameid}>
                        <span>{game.gamename}</span>
                        <span>{formatTime(openTime)} • {formatTime(closeTime)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </aside>
          )}
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
            />
            <label>Description</label>
            <Input
              placeholder="Enter game description"
              name="gamedescription"
              value={newGame.gamedescription}
              onChange={handleInputChange}
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
          okButtonProps={{
            disabled: !isOpenValid
          }}
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
            />
            <label>Close Pana</label>
            <Input
              type="text"             // ← use text, not number
  maxLength={3}
              name="close_pana"
              value={closePana}
              onChange={handleResultInputChange}
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
