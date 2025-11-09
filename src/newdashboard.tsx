import React, { useEffect, useState } from "react";
import { DatePicker, Spin, message, Button, Modal, Table } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { saveAs } from "file-saver";
import { Link } from "react-router-dom";
import { apiClient } from "./utils/api";
import "./datatable.css";
import { checkAuthAndHandleLogout } from "./authcheck";

type IGroup = {
  group_id: number;
  group_name: string;
};

type RowData = {
  key: number | string;
  group_name: string;
  pnl: number;
};

const SummaryDashboard: React.FC = () => {
  const [groups, setGroups] = useState<IGroup[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    dayjs().format("YYYY-MM-DD")
  );
  const [tableRows, setTableRows] = useState<RowData[]>([]);
  const [aggregatedSum, setAggregatedSum] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  const loaderIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

  // Initial load: fetch groups and data - wait for user state to be ready
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const stillLoggedIn = await checkAuthAndHandleLogout();
  if (!stillLoggedIn) return;
        const res = await apiClient.get<IGroup[]>("/groups");
        const groupData = res.data;
        setGroups(groupData);
        await fetchDataForGroups(groupData, selectedDate);
      } catch {
        message.error("Failed to load groups or data");
      } finally {
        setLoading(false);
      }
    };
    
    // Only initialize if we have proper user state
    init();
  }, []);

  // Re-fetch data when date changes
  useEffect(() => {
    if (groups.length > 0) {
      fetchDataForGroups(groups, selectedDate);
    }
  }, [selectedDate]);

  const fetchDataForGroups = async (
    groupList: IGroup[],
    date: string
  ) => {
    setLoading(true);
    try {
      const results = await Promise.all(
        groupList.map(async (g) => {
          const res = await apiClient.post("/group-payments-by-date", {
            gamedate: date,
            groupid: g.group_id,
            gameid: 0,
          });
          const data = res.data;
          return data.length > 0 ? data[data.length - 1].res_win_amt : 0;
        })
      );

      const rows: RowData[] = groupList.map((g, idx) => ({
        key: g.group_id,
        group_name: g.group_name,
        pnl: results[idx],
      }));

      setTableRows(rows);
      setAggregatedSum(results.reduce((sum, val) => sum + val, 0));
    } catch {
      message.error("Failed to fetch data for groups");
    } finally {
      setLoading(false);
    }
  };

  // Recalculate endpoint
  const recalcAll = async () => {
    setLoading(true);
    try {
      const res = await apiClient.post("/recalculate", {
        groupid: -1,
        date: selectedDate,
      });
      if (res.status === 200) {
        message.success("Recalculation complete");
        await fetchDataForGroups(groups, selectedDate);
      } else {
        message.warning(`Unexpected response: ${res.status}`);
      }
    } catch {
      message.error("Recalculation failed");
    } finally {
      setLoading(false);
    }
  };

  const showConfirm = () =>
    Modal.confirm({
      title: <span style={{ color: 'white' }}>Recalculate All Groups?</span>,
      content: <span style={{ color: 'white' }}>This will recalculate profit and loss for every group. This operation cannot be undone.</span>,
      onOk: recalcAll,
      okText: "Yes, recalc",
      cancelText: "Cancel",
    });

  // CSV export
  const exportToCSV = () => {
    let csv = "Group Name,Profit/Loss\n";
    tableRows.forEach((row) => {
      csv += `"${row.group_name}",${row.pnl}\n`;
    });
    csv += `Total,${aggregatedSum}\n`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `Summary_${selectedDate}.csv`);
  };

  const columns = [
    {
      title: "Group Name",
      dataIndex: "group_name",
      key: "group_name",
    },
    {
      title: "Profit/Loss",
      dataIndex: "pnl",
      key: "pnl",
      render: (value: number) => (
        <span style={{ color: value < 0 ? "red" : "green", textAlign: "right", display: "block" }}>
          {value}
        </span>
      ),
    },
  ];

  return (
    <div className="data-page">
      <div className="header top-nav">
        <Link to="/users">Users</Link>
        <Link to="/games">Games</Link>
        <Link to="/groups">Groups</Link>
        <Link to="/result/:gameid/:gamename">Settlement</Link>
        <Link to="/summary" className="active">Day</Link>
      </div>
      <div className="new-header" style={{ maxHeight: 'none' }}>
        <h2>Day Profit and Loss</h2>
        <div className="inputs-row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <DatePicker
            value={dayjs(selectedDate)}
            onChange={(date) => setSelectedDate(date?.format("YYYY-MM-DD") || selectedDate)}
          />
          <Button
            onClick={showConfirm}
            disabled={dayjs(selectedDate).isBefore(dayjs().subtract(15, 'day'))}
          >
            Recalculate
          </Button>
          <Button type="primary" onClick={exportToCSV}>
            Download CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="loading-container" style={{ textAlign: "center", padding: 50 }}>
          <Spin indicator={loaderIcon} />
        </div>
      ) : tableRows.length > 0 ? (
        <div style={{ marginTop: 20 }}>
          <Table
            columns={columns}
            dataSource={[
              ...tableRows,
              { key: "total", group_name: "Total", pnl: aggregatedSum },
            ]}
            pagination={false}
            bordered
            rowClassName={(record) => (record.key === "total" ? "total-row" : "")}
          />
        </div>
      ) : (
        <div style={{ textAlign: "center", marginTop: 20 }}>No data available</div>
      )}

    </div>
  );
};

export default SummaryDashboard;
