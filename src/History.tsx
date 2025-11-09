import React, { useEffect, useState } from "react";
import { Table, Button, Modal, Input, Select, message, Spin, DatePicker, Checkbox, Grid } from "antd";
import { EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { Link, useParams } from "react-router-dom";
import dayjs from "dayjs";
import { useUserStore } from "./store/store";
import { apiClient } from "./utils/api";
import { IGroup } from "./userGames";
import { IGame } from "./games";
import { checkAuthAndHandleLogout } from "./authcheck";
import "./datatable.css";

interface HistoryRecord {
  history_id: number;
  history_created_at: string;
  history_modified_at?: string | null;
  history_number: string;
  history_game_id: number;
  history_game_name: string;
  history_type_id: number;
  history_type_name: string;
  history_amount: number;
  history_user_id: number;
  history_date: string;
  history_group:number;
  history_groupname:string;
}

interface Game {
  gameid: number;
  gamename: string;
}

interface Err {
  number?: string;
  amount?: string;
  game?: string;
  type?: string;
}

const HistoryTable: React.FC = () => {
  const { userId } = useUserStore();
  const { gameId, gamename } = useParams<{ gameId: string; gamename: string }>();
  const [loading, setLoading] = useState(false);
  const [historyData, setHistoryData] = useState<HistoryRecord[]>([]);
  const [types, setTypes] = useState<{ value: number; label: string }[]>([]);
  const [editingRecord, setEditingRecord] = useState<HistoryRecord | null>(null);
  const [originalRecord, setOriginalRecord] = useState<HistoryRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalErrors, setModalErrors] = useState<Err>({});
  const [isDirty, setIsDirty] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [userGroups, setUserGroups] = useState<IGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<IGroup | null>(null);
  const [searchNumber, setSearchNumber] = useState("");
  const [searchAmount, setSearchAmount] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [games, setGames] = useState<IGame[]>([]);
  const [selectedGame, setSelectedGame] = useState<IGame | null>(null);
  const [displayedRecords, setDisplayedRecords] = useState(historyData);

useEffect(() => {
  const newDisplayedRecords = historyData
    .filter((record) => {
      const matchesNumber = record.history_number
        .toLowerCase()
        .includes(searchNumber.toLowerCase());
      const matchesAmount = searchAmount
        ? record.history_amount === Number(searchAmount)
        : true;
      return matchesNumber && matchesAmount;
    });

  setDisplayedRecords(newDisplayedRecords);
}, [historyData,  searchNumber, searchAmount]);
  // Fetch history records
  const fetchHistory = async () => {
    setLoading(true);
    try {
      const response = await apiClient.post("/history-by-uid", {
        uid: userId,
        game: selectedGame?.gameid,
        date: selectedDate,
        gid:selectedGroup?.id||-1
      });
      setHistoryData(response.data);
    } catch {
      message.error("Failed to fetch history");
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (games.length > 0 && gameId) {
      const initialGame = games.find(
        (game) => game.gameid.toString() === gameId
      );
      if (initialGame) {
        setSelectedGame(initialGame);
      }
    }
  }, [games, gameId]);
  
  const fetchGamesAndGroups = async () => {
    try {
      const stillLoggedIn = await checkAuthAndHandleLogout();
  if (!stillLoggedIn) return;
      
      const groupsResponse = await apiClient.get(`/user/groups/${userId}`);
      setUserGroups(groupsResponse.data);
      console.log(groupsResponse.data)
    } catch (error) {
      console.error("Error fetching data:", error);
         message.error("Failed to load data");
        }
      };
      const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
  if (e.target.checked) {
    // Select all history_id values from filteredData
    const allIds = displayedRecords.map((record) => record.history_id);
    setSelectedIds(allIds);
  } else {
    // Clear selection
    setSelectedIds([]);
  }
};
      useEffect(() => {
        if(selectedDate&&selectedGame&&selectedGroup){

          fetchHistory();
        }
      }, [selectedDate,selectedGroup,selectedGame]);
      
      // Fetch games for dropdown
      const fetchGames = async () => {
        try {
          const stillLoggedIn = await checkAuthAndHandleLogout();
  if (!stillLoggedIn) return;
          const response = await apiClient.get("/games");
          setGames(response.data);
    } catch {
      message.error("Failed to fetch games");
    }
  };
  
  // Fetch types for dropdown
  const fetchTypes = async () => {
    try {
      const stillLoggedIn = await checkAuthAndHandleLogout();
  if (!stillLoggedIn) return;
      const response = await apiClient.get("/types");
      setTypes(response.data.map((type: Game) => ({ value: type.gameid, label: type.gamename })));
    } catch {
      message.error("Failed to fetch types");
    }
  };
  const handleDeleteSelected = () => {
    if (!selectedIds.length) return;
    Modal.confirm({
      title: <span style={{ color: 'white' }}>Are you sure you want to delete selected records?</span>,
      content: <span style={{ color: 'white' }}>This action cannot be undone.</span>,
      onOk: async () => {
        try {
          const payload = {
            data: selectedIds.map((id) => ({ flag: "D", id })),
          };
          setLoading(true);
          await apiClient.post("/createorupdatedata", payload);
          message.success("Records deleted successfully");
          setSelectedIds([]);
          fetchHistory();
        } catch {
          message.error("Failed to delete selected records");
        } finally {
          setLoading(false);
        }
      },
    });
  };

  useEffect(() => {
    fetchGamesAndGroups();
    fetchGames();
    fetchTypes();
  }, []);
  

  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const tableTypes = [
    { key: "open", typeId: 4, title: "Open" },
    { key: "openPana", typeId: 3, title: "Open Pana" },
    { key: "jodi", typeId: 2, title: "Jodi" },
    { key: "close", typeId: 7, title: "Close" },
    { key: "closePana", typeId: 9, title: "Close Pana" },
  ];
  // Transform the raw history data so that the amount appears in its corresponding column:
  // Mapping: 2 => Jodi, 3 => Open Pana, 4 => Open, 7 => Close, 9 => Close Pana.
  const filteredTables = tableTypes.map(({ key, typeId, title }) => {
    const filteredData = historyData
      .filter((record) => record.history_type_id === typeId)
      .filter((record) => {
        const matchesNumber = record.history_number
          .toLowerCase()
          .includes(searchNumber.toLowerCase());
        const matchesAmount = searchAmount
          ? record.history_amount === Number(searchAmount)
          : true;
        return matchesNumber && matchesAmount;
      });

    if (isMobile) {
      return (
        <div key={key} style={{ marginBottom: "20px" }}>
          <h3 style={{ textAlign: "center", marginBottom: "1rem", color: "var(--color-heading)" }}>{title}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {filteredData.map((record) => (
              <div key={record.history_id} className="mobile-card" style={{ position: "relative" }}>
                <div className="mobile-card__row">
                  <span className="mobile-card__label">Number</span>
                  <span className="mobile-card__value">{record.history_number}</span>
                </div>
                <div className="mobile-card__row">
                  <span className="mobile-card__label">Amount</span>
                  <span className="mobile-card__value">{record.history_amount}</span>
                </div>
                <div className="mobile-card__row">
                  <span className="mobile-card__label">Created</span>
                  <span className="mobile-card__value">{dayjs(record.history_created_at).format("h:mm A")}</span>
                </div>
                <div className="mobile-card__row">
                  <span className="mobile-card__label">Modified</span>
                  <span className="mobile-card__value">
                    {record.history_modified_at ? dayjs(record.history_modified_at).format("h:mm A") : "N/A"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                  <Checkbox
                    checked={selectedIds.includes(record.history_id)}
                    onChange={(e) => handleCheckboxChange(record.history_id, e.target.checked)}
                  />
                  <Button
                    icon={<EditOutlined />}
                    size="small"
                    style={{ color: "blue" }}
                    onClick={() => handleEdit(record)}
                  />
                  <Button
                    icon={<DeleteOutlined />}
                    size="small"
                    danger
                    onClick={() => handleDelete(record.history_id)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <Table
        key={key}
        dataSource={filteredData}
        rowKey="history_id"
        size="small"
        bordered
        pagination={false}
        title={() => title}
  scroll={{ y: 300 }}
          style={{ marginBottom: "20px", width: "100%", margin: "0 1rem 20px 1rem" }}
      >
        <Table.Column title="Number" dataIndex="history_number" key="history_number" />
        <Table.Column title="Amount" dataIndex="history_amount" key="history_amount" />
        <Table.Column
          title="Created At"
          dataIndex="history_created_at"
          key="history_created_at"
          render={(date: string) => dayjs(date).format("h:mm A")}
        />
        <Table.Column
          title="Modified At"
          dataIndex="history_modified_at"
          key="history_modified_at"
          render={(date: string | null) =>
            date ? dayjs(date).format("h:mm: A") : "N/A"
          }
        />
        <Table.Column
          title="Actions"
          key="actions"
          render={(_, record: HistoryRecord) => (
            <>
              <Checkbox
                checked={selectedIds.includes(record.history_id)}
                onChange={(e) =>
                  handleCheckboxChange(record.history_id, e.target.checked)
                }
              />
              <Button
                icon={<EditOutlined />}
                style={{ color: "blue", marginLeft: 8 }}
                onClick={() => handleEdit(record)}
              />
              <Button
                icon={<DeleteOutlined />}
                danger
                onClick={() => handleDelete(record.history_id)}
                style={{ marginLeft: 8 }}
              />
            </>
          )}
        />
      </Table>
    );
  });

  // Handle edit click - also store the original record to compare changes
  const handleEdit = (record: HistoryRecord) => {
    setEditingRecord({ ...record });
    setOriginalRecord({ ...record });
    setModalErrors({});
    setIsDirty(false);
    setIsModalOpen(true);
  };
const handleCheckboxChange = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        return [...prev, id];
      } else {
        return prev.filter((selectedId) => selectedId !== id);
      }
    });
  };
  // Handle delete click
  const handleDelete = async (id: number) => {
    try {
      await apiClient.post("/createorupdatedata", { data: [{ flag: "D", id: id }] });
      message.success("Record deleted successfully");
      fetchHistory();
    } catch {
      message.error("Failed to delete record");
    }
  };

  // Validate three-digit numbers based on priority
  const isValidThreeDigit = (digits: number[]) => {
    const priority = { 0: 10, 9: 9, 8: 8, 7: 7, 6: 6, 5: 5, 4: 4, 3: 3, 2: 2, 1: 1 };
    return digits.every((d, i, arr) => i === 0 || priority[arr[i - 1]] <= priority[d]);
  };

  // Filter type options based on the length of the number
  const getFilteredTypeOptions = () => {
    if (!editingRecord) return [];
    const numLen = editingRecord.history_number.length;
    return types.filter((type) => {
      const labelLower = type.label.toLowerCase();
      if (numLen === 1) {
        return ["open", "close"].includes(labelLower);
      } else if (numLen === 2) {
        return labelLower === "jodi";
      } else if (numLen === 3) {
        return ["open pana", "close pana"].includes(labelLower);
      }
      return false;
    });
  };

  // Handle change for modal fields and run validations
  const handleModalChange = (field: keyof HistoryRecord, value: string) => {
    if (!editingRecord) return;
    const newRecord = { ...editingRecord, [field]: value };
    setEditingRecord(newRecord);

    // Mark as dirty if changed from original
    if (originalRecord && newRecord[field] !== originalRecord[field]) {
      setIsDirty(true);
    }

    // Run validations per field
    const errors: Err = { ...modalErrors };

    if (field === "history_number") {
      const strVal = String(value);
      if (strVal.length > 3) {
        errors.number = "Number cannot exceed 3 digits.";
      } else if (strVal.length === 3) {
        const digits = strVal.split("").map(Number);
        if (!isValidThreeDigit(digits)) {
          errors.number = "Three digit number does not pass priority check.";
        } else {
          errors.number = "";
        }
      } else {
        errors.number = "";
      }
      setModalErrors(errors);
      // Do NOT update type fields here to avoid recursive calls.
    }

    if (field === "history_amount") {
      if (!value || Number(value) <= 0) {
        errors.amount = "Amount must be greater than zero.";
      } else {
        errors.amount = "";
      }
      setModalErrors(errors);
    }
  };

  // When the history_number changes, update the type fields based on filtered options.
  useEffect(() => {
    if (editingRecord) {
      const filteredTypes = getFilteredTypeOptions();
      if (filteredTypes.length > 0) {
        // If current type is not in filtered options, select the first option.
        const currentInFiltered = filteredTypes.find(
          (opt) => opt.value === editingRecord.history_type_id
        );
        if (!currentInFiltered) {
          setEditingRecord((prev) =>
            prev
              ? {
                  ...prev,
                  history_type_id: filteredTypes[0].value,
                  history_type_name: filteredTypes[0].label,
                }
              : prev
          );
        }
      } else {
        // Clear type selection if no option matches.
        setEditingRecord((prev) =>
          prev
            ? {
                ...prev,
                history_type_id: -1,
                history_type_name: "",
              }
            : prev
        );
      }
    }
    // Only re-run when history_number or types change.
  }, [editingRecord?.history_number, types]);

  // Handle modal form submission
  const handleModalOk = async () => {
    if (!editingRecord) return;

    const errors: Err = {};
    const numStr = editingRecord.history_number;
    if (numStr.length > 3) {
      errors.number = "Number cannot exceed 3 digits.";
    } else if (numStr.length === 3) {
      const digits = numStr.split("").map(Number);
      if (!isValidThreeDigit(digits)) {
        errors.number = "Three digit number does not pass priority check.";
      }
    }
    if (!editingRecord.history_amount || editingRecord.history_amount <= 0) {
      errors.amount = "Amount must be greater than zero.";
    }

    setModalErrors(errors);
    // If there are any errors, do not proceed.
    if (Object.values(errors).some((msg) => msg)) {
      return;
    }

    if (!isDirty) {
      message.error("No changes made to update.");
      return;
    }

    // Construct payload with flag "U", preserving createdat and id from original record, and modified timestamp as current
    const payload = {
      data: [
        {
          flag: "U",
          number: editingRecord.history_number,
          gameid: editingRecord.history_game_id,
          game: editingRecord.history_game_name,
          typeid: editingRecord.history_type_id,
          type: editingRecord.history_type_name,
          amount: editingRecord.history_amount,
          createdat: editingRecord.history_created_at, // original creation timestamp
          id: editingRecord.history_id, // original id
          modified: dayjs().format("YYYY-MM-DD HH:mm:ss"),
          gamedate: editingRecord.history_date,
          uid: userId,
          group:editingRecord.history_group,
          grpname:editingRecord.history_groupname
        },
      ],
    };

    setLoading(true);
    try {
      await apiClient.post("/createorupdatedata", payload);
      message.success("Record updated successfully");
      setIsModalOpen(false);
      fetchHistory();
    } catch {
      message.error("Failed to update record");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="data-page">
      <div className="header">
        <Link to={`/userGames`}>Games</Link>
        <Link to={'/insert'}>Insert</Link>
        <Link to={`/history/${gameId}/${gamename}`} className="active">
          HISTORY
        </Link>
        <Link to={`/data/${gameId}/${gamename}`}>TOTAL</Link>
      </div>
      {loading ? (
        <div className="loading-container">
          <Spin size="large" />
        </div>
      ) : (
        <div>
          <div className="filter-header" style={{display:'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent:'space-evenly', flexWrap: 'wrap', gap: '1rem', padding: '1rem'}}>

          <DatePicker
            value={dayjs(selectedDate)}
            onChange={(date) =>
              setSelectedDate(date?.format("YYYY-MM-DD") || selectedDate)
            }
            />  <Select
                  style={{ width: 180 }}
                  placeholder="Select Game"
                  value={selectedGame ? selectedGame.gameid : undefined}
                  onChange={(value: number) => {
                     const game = games.find((g) => g.gameid === value) || null;
                     setSelectedGame(game);
                  }}
                >
                  {games.map((game) => (
                    <Select.Option key={game.gameid} value={game.gameid}>
                      {game.gamename}
                    </Select.Option>
                  ))}
                </Select>
            <div style={{display:'flex', width: isMobile ? '100%' : '35%'}}>

              <label style={{ marginRight: "10px" }}>Group:</label>


  <Select
    value={selectedGroup?.id} // sets the current value based on the selected group's id
    style={{ width: isMobile ? "100%" : "25%", marginBottom: "10px" }}
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



                      </div>
            </div>
            <div className="filter-header" style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: 'wrap' }}>
        <Input
          placeholder="Search History Number"
          value={searchNumber}
          onChange={(e) => setSearchNumber(e.target.value)}
          style={{ width: 200 }}
        />
        <Input
          placeholder="Search History Amount"
          type="number"
          value={searchAmount}
          onChange={(e) => setSearchAmount(e.target.value)}
          style={{ width: 200 }}
        /><input 
  type="checkbox" 
  onChange={handleSelectAll} 
  checked={selectedIds.length === displayedRecords.length && displayedRecords.length > 0} 
/> Select All
          <Button
          type="primary"
          danger
          onClick={handleDeleteSelected}
          disabled={!selectedIds.length}
        >
          Delete Selected
        </Button>
      </div>
      <div style={{ maxHeight: isMobile ? '80vh' : 'auto', overflowY: isMobile ? 'auto' : 'visible', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {filteredTables}
      </div>
        </div>
      )}

      {/* Edit Modal */}
      <Modal
        title="Edit History"
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
      >
        <div style={{ marginBottom: 10 }}>
          <label>Number:</label>
          <Input
            value={editingRecord?.history_number}
            onChange={(e) => handleModalChange("history_number", e.target.value)}
          />
          {modalErrors.number && (
            <div style={{ color: "red", fontSize: "12px" }}>
              {modalErrors.number}
            </div>
          )}
        </div>
        <div style={{ marginBottom: 10 }}>
          <label>Amount:</label>
          <Input
            type="number"
            value={editingRecord?.history_amount}
            onChange={(e) =>
              handleModalChange("history_amount", e.target.value)
            }
          />
          {modalErrors.amount && (
            <div style={{ color: "red", fontSize: "12px" }}>
              {modalErrors.amount}
            </div>
          )}
        </div>
        <div style={{ marginBottom: 10 }}>
          <label>Game:</label>
        <Select
  value={editingRecord?.history_game_id}
  options={games.map(game => ({
    value: game.gameid,
    label: game.gamename
  }))}
  onChange={(value: number, option?: { value: number; label: string; } | { value: number; label: string; }[] | undefined) => {
    const label = typeof option === 'object' && option !== null && 'label' in option ? option.label : '';
    setEditingRecord(prev => prev && ({
      ...prev,
      history_game_id: value,
      history_game_name: label
    }));
    if (
      originalRecord &&
      value !== originalRecord.history_game_id
    ) {
      setIsDirty(true);
    }
  }}
  style={{ width: "100%" }}
/>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label>Type:</label>
          <Select
            value={editingRecord?.history_type_id}
            options={getFilteredTypeOptions()}
            onChange={(value: number, option?: { value: number; label: string; } | { value: number; label: string; }[] | undefined) => {
              const newTypeId = Number(value);
              const label = typeof option === 'object' && option !== null && 'label' in option ? option.label : '';
              setEditingRecord((prev) =>
                prev
                  ? {
                      ...prev,
                      history_type_id: newTypeId,
                      history_type_name: label,
                    }
                  : prev
              );
              if (
                originalRecord &&
                editingRecord &&
                newTypeId !== originalRecord.history_type_id
              ) {
                setIsDirty(true);
              }
            }}
            style={{ width: "100%" }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default HistoryTable;
