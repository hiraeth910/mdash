import React, { useEffect, useState } from "react";
import { Table, Button, DatePicker, Select, Spin, message, Modal } from "antd";
import dayjs from "dayjs";
import { apiClient } from "./utils/api";
import { Link, useParams } from "react-router-dom";
import { useUserStore } from "./store/store";
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
const Dashboard: React.FC = () => {
  const { gameid, gamename } = useParams<{
    gameid: string;
    gamename: string;
  }>();
  const [users,setusers] = useState<IUser[]>([])
  const { userRole } = useUserStore();
  const [grpname,setGrpname] = useState<string>();
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  //const [data, setData] = useState([]);
  const [paymentData, setPaymentData] = useState<PaymentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    dayjs().format("YYYY-MM-DD")
  );
  const [groups, setGroups] = useState([]);
  //const [groupedData, setGroupedData] = useState<{
  //  [key: string]: { typename: string; data: any[] };
  //}>({});
const [selectedUser, setSelectedUser] = useState<IUser | null>(null);
const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
const [modalVisible, setModalVisible] = useState(false);
useEffect(()=>{console.log(users)},[users])
useEffect(() => {
  const handleResize = () => setIsMobile(window.innerWidth < 768);
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
  const handleGroupChange = (groupName: string) => {
    setGrpname(groupName)
    const group = groups.find((group) => group["group_name"] === groupName);
    setSelectedGroupId(group ? group["group_id"] : null);
     if (group && group["group_id"] && users) {
    // Find the first user whose group_ids include the selected group_id
    const user = (users ?? []).find((user) => user.group_ids.includes(group["group_id"]));
    console.log(user)
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
      setusers(response.data.users)

      // Find current logged-in user
      // Remove the logged-in user from the list for dropdown
      //const filteredUsers = allUsers.filter((user) => user.user_id !== userId);
      //setUsers(filteredUsers);
    } catch {
      message.error("Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const endpoint = "/group-payments-by-date";
      const requestBody = {
        gamedate: dayjs(selectedDate).format("YYYY-MM-DD"),
        groupid: selectedGroupId,
        gameid: 0,
      };
      const response = await apiClient.post(endpoint, requestBody);
      // setData(response.data);
      const data = response.data;
      if (data.length > 0) {
        const lastIndex = data.length - 1;
        const lastElement = data[lastIndex];
        lastElement.res_game = lastElement.res_win_amt < 0 ? "payment" : "due";
      }
      setPaymentData(data);
    } catch {
      message.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };
 const recalc = async () => {
     try {
         const res = await apiClient.post('/recalculate', {
             groupid:selectedGroupId,
            date:selectedDate
       });

       if (res.status === 200) {
           return fetchData()
        } else {
            console.warn("Unexpected response:", res.status, res.data);
         }
     } catch {
         message.error("Recalculation failed:");
  }
 };
const showConfirm = () => {
   Modal.confirm({
    title: <span style={{ color: 'var(--color-heading)' }}>Are you sure?</span>,
   content: <span style={{ color: 'var(--color-text)' }}>Once recalculated, data cannot be reverted. Be careful.</span>,
     bodyStyle: { backgroundColor: 'var(--color-background)', color: 'var(--color-text)' },
     onOk: () => {
      recalc();
     },
   });
};

  const exportToCSV = () => {
     const tableBody = [
    ["Game", "Type", "Bet On", "Bet Amount", "Payable Times", "Win Amount"],
    ...paymentData.map(
      ({
        res_game,
        res_type,
        res_bet_on,
        res_bet_amt,
        res_payable_times,
        res_win_amt,
      }) => [
        res_game,
        res_type,
        res_bet_on,
        res_bet_amt,
        res_payable_times,
        res_win_amt,
      ]
    ),
  ];
   const groupLabel = grpname ?? "All Groups";
  const formattedDate = dayjs(selectedDate).format("YYYY-MM-DD");
  const headerText = `Final Payment Data for group (${groupLabel}) - ${formattedDate}`;
  const docDefinition = {
    content: [
      { text: headerText, style: "header" },
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

  // Build the file name using selectedDate and selectedGroupId
  const fileName = `${selectedDate}(${grpname}).pdf`;

  // Create and download the PDF
  pdfMake.createPdf(docDefinition).download(fileName);
  };

  return (
    <div className="data-page">
      {userRole != "admin" ? (
        <div className="header top-nav">
          <Link to={`/insert/${gameid}/${gamename}`}>INSERT</Link>
          <Link to={`/history/${gameid}/${gamename}`}>HISTORY</Link>
          <Link to={`/data/${gameid}/${gamename}`} className="active">
            TOTAL
          </Link>
        </div>
      ):( <div className="header top-nav">
                  <Link to="/users">Users</Link>
                  <Link to="/games">
                    Games
                  </Link>
                  <Link to="/groups">Groups</Link>
                  <Link to="/result/:gameid/:gamename" className="active">Settlement</Link>
                  <Link to="/summary">Day</Link>
                </div>)}
      <div className="new-header" style={{ maxHeight: 'none' }}>
        <div className="controls">
          <DatePicker
            value={dayjs(selectedDate)}
            onChange={(date) =>
              setSelectedDate(date?.format("YYYY-MM-DD") || selectedDate)
            }
          />
          {isMobile ? (
            <Button onClick={() => setModalVisible(true)}>
              {grpname || "Select Group"}
            </Button>
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
  <p style={{ fontWeight: "bold", color: "var(--color-text)" }}>
    User: {selectedUser.user_name}
  </p>
)}
         <Button
  style={{ backgroundColor: "black", color: "red" }}
  disabled={!selectedGroupId || dayjs(selectedDate).isBefore(dayjs().subtract(15, 'day'))}
  onClick={showConfirm}
>
  Recalculate
</Button>
          <Button type="primary" onClick={exportToCSV}>
            Export as Excel
          </Button>
        </div>
      </div>
      <div>
     
      </div>
      {loading ? (
        <div className="loading-container">
          <Spin size="large" />
        </div>
      ) : (
        <div className="payment-summary-container">
          <div className="table-container">
            <h3>Payment Summary</h3>
             <Table
  className="payment-summary-table"
  dataSource={paymentData}
  columns={[
    {
      title: "Game",
      dataIndex: "res_game",
      key: "res_game",
      render: (text, record, index) => {
        const isLast = index === paymentData.length - 1;
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
        const isLast = index === paymentData.length - 1;
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
        const isLast = index === paymentData.length - 1;
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
        const isLast = index === paymentData.length - 1;
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
        const isLast = index === paymentData.length - 1;
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
        const isLast = index === paymentData.length - 1;
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
  scroll={paymentData.length > 0 ? { y: 350 } : undefined}
  rowClassName={(_, index) => {
    if (index === paymentData.length - 1) {
      return "blink";
    }
    return "";
  }}
/>

<div className="payment-summary-cards">
  {paymentData.map((row, index) => {
    const isLast = index === paymentData.length - 1;
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
      )}
      <Modal
        title="Select Group"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
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
