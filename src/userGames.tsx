import React, { useEffect, useState } from "react";
import { Table, Modal, Select, message } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { useUserStore } from "./store/store";
import { apiClient } from "./utils/api";
import { checkAuthAndHandleLogout } from "./authcheck";

// Type Definitions
interface IGame {
  gameid: number;
  gamename: string;
  gamedescription: string;
}

export interface IGroup {
  id: number;
  groupname: string;
}

const Games: React.FC = () => {
  const navigate = useNavigate();
  const { userId, userRole } = useUserStore(); // Get user details

  // State Hooks
  const [games, setGames] = useState<IGame[]>([]);
  const [userGroups, setUserGroups] = useState<IGroup[]>([]);
  const [selectedGame, setSelectedGame] = useState<IGame | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<IGroup | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [groupSelectionModal, setGroupSelectionModal] = useState<boolean>(false);
  const [loading,setloading]=useState(false)
  // Fetch games and user groups on mount
  useEffect(() => {
    const fetchGamesAndGroups = async () => {
      try {
        const stillLoggedIn = await checkAuthAndHandleLogout();
  if (!stillLoggedIn) return;
        const gamesResponse = await apiClient.get("/games");
        setloading(true)
        setGames(gamesResponse.data);

        const groupsResponse = await apiClient.get(`/user/groups/${userId}`);
        setUserGroups(groupsResponse.data);
        console.log(groupsResponse.data)
        setloading(false)
      } catch (error) {
        console.error("Error fetching data:", error);
        message.error("Failed to load data");
      }
    };

    fetchGamesAndGroups();
  }, [userId]);

  // Table Columns
  const columns = [
    {
      title: "Game Name",
      dataIndex: "gamename",
      key: "gamename",
      render: (text: string, record: IGame) => (
        <span
          style={{
            color: "var(--color-heading)",
            fontSize: "24px",
            cursor: "pointer",
            textDecoration: "none",
            fontWeight: 600,
          }}
          onClick={() => handleGameClick(record)}
        >
          {text}
        </span>
      ),
    },
    {
      title: "Description",
      dataIndex: "gamedescription",
      key: "gamedescription",
      render: (text: string) => (
        <span style={{ color: "green", fontSize: "16px" }}>{text}</span>
      ),
    },
  ];

  // Handle Game Click
  const handleGameClick = (record: IGame) => {
    if (userRole === "admin") {
      navigate(`/data/${record.gameid}/${encodeURIComponent(record.gamename)}/admin/admin`);
      return;
    }

    if (!userGroups.length) {
      message.warning("You are not part of any group.");
      return;
    }

    setSelectedGame(record);
    setGroupSelectionModal(true);
  };

  // Handle Group & Time Selection
  const handleGroupSelection = () => {
    if (!selectedGroup || !selectedTime) {
      message.warning("Please select both a group and a time.");
      return;
    }

    if (selectedGame) {
      navigate(
        `/insert/${selectedGame.gameid}/${encodeURIComponent(selectedGame.gamename)}/${selectedGroup.id}/${selectedGroup.groupname}/${selectedTime}`,
        {
          state: { group: selectedGroup, selectedTime },
        }
      );
    }

    setGroupSelectionModal(false);
    setSelectedGame(null);
    setSelectedGroup(null);
    setSelectedTime(null);
  };

  return (  <>
  <div className="header top-nav">
        <Link to={`/userGames`}className="active">Games</Link>
        <Link to={'/insert'}>Insert</Link>
        <Link to={`/history`} >
          HISTORY
        </Link>
        <Link to={`/data`}>TOTAL</Link>
      </div>
    <div className="games-layout">
    <div>
  <h2>Day Games</h2>
  <Table
    columns={columns}
    dataSource={games
      .filter((game) => game.gamedescription.split("-")[0] < "18:00")
      .sort((a, b) =>
        a.gamedescription.split("-")[0].localeCompare(b.gamedescription.split("-")[0])
      )}
    rowKey="gameid"
    pagination={false}
    loading={loading}
  />
</div>
<div>
  <h2>Night Games</h2>
  <Table
    columns={columns}
    dataSource={games
      .filter((game) => game.gamedescription.split("-")[0] >= "18:00")
      .sort((a, b) =>
        a.gamedescription.split("-")[0].localeCompare(b.gamedescription.split("-")[0])
      )}
    rowKey="gameid"
    loading={loading}
    pagination={false}
  />
</div>


      {/* Group Selection Modal */}
      <Modal title={<span style={{ color: 'var(--color-heading)' }}>Select Group and Time</span>} open={groupSelectionModal} onCancel={() => setGroupSelectionModal(false)} onOk={handleGroupSelection}>
        <div style={{ color: 'var(--color-text)' }}>
          <label>Select Group:</label>
          <Select
            style={{ width: "100%", marginBottom: "10px" }}
            onChange={(value) => {
              const group = userGroups.find((g) => g.id === value) || null;
              setSelectedGroup(group);
            }}
            >
            {userGroups.map((group) => (
              <Select.Option key={group.id} value={group.id}>
                {group.groupname}
              </Select.Option>
            ))}
          </Select>

          <label>Select Time:</label>
          <Select style={{ width: "100%" }} onChange={(value) => setSelectedTime(value)}>
            <Select.Option value="Open">Open</Select.Option>
            <Select.Option value="Close">Close</Select.Option>
          </Select>
        </div>
      </Modal>
    </div>
          </>
  );
};

export default Games;
