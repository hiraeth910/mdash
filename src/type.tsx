import React, { useEffect, useState } from "react";
import { Table, Button, Modal, Input, message } from "antd";
import { EditOutlined } from "@ant-design/icons";
import "./game.css";
import { Link } from "react-router-dom";
import { apiClient } from "./utils/api";
import { useUserStore } from "./store/store";
import { checkAuthAndHandleLogout } from "./authcheck";
interface Game{
  name:string,
  description:string
}
const Types: React.FC = () => {
  const { userRole } = useUserStore();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newGamesList, setNewGamesList] = useState<Game[]>([]);
  const [newGame, setNewGame] = useState({ gamename: "", gamedescription: "" });
  const [isEditing, setIsEditing] = useState(false);
  const [editingGame, setEditingGame] = useState(null);

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    setLoading(true);
    try {
      const stillLoggedIn = await checkAuthAndHandleLogout();
  if (!stillLoggedIn) return;
      const response = await apiClient.get("/types");
      setGames(response.data);
    } catch (error) {
            console.error(error)

      message.error("Failed to fetch games");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewGame({ ...newGame, [e.target.name]: e.target.value });
  };

  const addGameToList = () => {
    const newEntry = {
      flag: "TI",
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
      console.error(error)
      message.error("Failed to process games");
    }
  };

  const handleEdit = (record) => {
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
        flag: "TU",
        id: editingGame["gameid"],
        name: newGame.gamename,
        description: newGame.gamedescription,
      };
      await apiClient.post("/managemasterdata", { data: [updateEntry] });
      message.success("Game updated successfully!");
      setModalVisible(false);
      fetchGames();
    } catch (error) {
      console.error(error)
      message.error("Failed to update game");
    }
  };



  const columns = [
    {
      title: "Type",
      dataIndex: "gamename",
      key: "gamename",
    },

    ...(userRole === "admin"
      ? [
          {
            title: "Actions",
            key: "actions",
            render: (_, record) => (
              <>
                <EditOutlined
                  style={{ color: "blue", marginRight: 10, cursor: "pointer" }}
                  onClick={() => handleEdit(record)}
                />
           
              </>
            ),
          },
        ]
      : []),
  ].filter(Boolean);

  return (
    <div className="container">
      {userRole === "admin" && (
        <div className="header">
          <Link to="/users">Users</Link>
          <Link to="/types" className="active">
            Types
          </Link>
          <Link to="/games">Games</Link>
                      <Link to="/groups">Groups</Link>
          
        </div>
      )}

      <div className="table-container">
        <div className="scrollable-table">
          <Table
            columns={columns}
            dataSource={games}
            rowKey="gameid"
            loading={loading}
            pagination={false}
          />
        </div>
        <Button
          type="primary"
          className="add-button"
          onClick={() => {
            setIsEditing(false);
            setEditingGame(null);
            setModalVisible(true);
          }}
        >
          Add Type
        </Button>
      </div>

      <Modal
        title={isEditing ? "Edit Game" : "Add New Game"}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setNewGamesList([]);
          setEditingGame(null);
        }}
        onOk={isEditing ? handleUpdate : handleSubmit}
      >
        <label>Type</label>
        <Input
          placeholder="Enter Type"
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
      </Modal>
    </div>
  );
};

export default Types;
