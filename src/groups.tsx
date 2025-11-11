import React, { useEffect, useState } from "react";
import { Table, Button, Input, Modal, Form, message, Card } from "antd";
import { ColumnsType } from "antd/es/table";
import { DeleteFilled, EditFilled } from "@ant-design/icons";
import { Group } from "./models/group"; // Import Group interface
import { apiClient } from "./utils/api";
import { Link } from "react-router-dom";
import { checkAuthAndHandleLogout } from "./authcheck";

const Groups: React.FC = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [form] = Form.useForm();
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);

  // 🔄 Fetch Groups on Load
  useEffect(() => {
    fetchGroups();
  }, []);

  // Handle window resize for mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const stillLoggedIn = await checkAuthAndHandleLogout();
  if (!stillLoggedIn) return;
      const response = await apiClient.get<{ success: boolean; data: Group[] }>("/group");
      setGroups(response.data.data);
    } catch (error) {
              console.error(error)

      message.error("Failed to fetch groups");
    }
    setLoading(false);
  };

  // 🆕 Open Modal for Adding New Group
  const handleAddGroup = () => {
    setEditingGroup(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  // ✏️ Open Modal for Editing Group
  const handleEditGroup = (group: Group) => {
    setEditingGroup(group);
    form.setFieldsValue(group);
    setIsModalOpen(true);
  };
  const handleDeleteGroup = async (groupId: number) => {
    try {
      await apiClient.delete(`/delete-group/${groupId}`);
      message.success("Group deleted successfully!");
      fetchGroups();
    } catch (error) {
      console.error(error);
      message.error("Failed to delete group");
    }
  };
  // ✅ Submit Form (Insert/Update)
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingGroup) {
        // Update Existing Group
        await apiClient.put(`/groups/${editingGroup.id}`, values);
        message.success("Group updated successfully!");
      } else {
        // Add New Group
        const response = await apiClient.post<{ success: boolean; data: Group[] }>("/groups", values);
        if (response.data.data[0]?.groupname === values.groupname) {
          message.error("Group name already exists!");
        } else {
          message.success("Group added successfully!");
        }
      }
      setIsModalOpen(false);
      fetchGroups();
    } catch (error) {
              console.error(error)

      message.error("Something went wrong/Group name already exists!");
    }
  };

  // 🔍 Filter Groups
  const filteredGroups = groups.filter((group) =>
    group.groupname.toLowerCase().includes(search.toLowerCase())
  );

  // 📊 Table Columns
  const columns: ColumnsType<Group> = [
    { title: "Group Name", dataIndex: "groupname", key: "groupname" },
    { title: "Commission", dataIndex: "commission", key: "commission" },
    { title: "Non-Pana Payable", dataIndex: "nonpana_payable", key: "nonpana_payable" },
    { title: "Pana Payable", dataIndex: "pana_payable", key: "pana_payable" },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <>
          <EditFilled
            style={{ color: "#52c41a", marginRight: 10, cursor: "pointer" }}
            onClick={() => handleEditGroup(record)}
          />
          <DeleteFilled
            style={{ color: "#ff4d4f", cursor: "pointer" }}
            onClick={() =>
              Modal.confirm({
                title: <span style={{ color: 'var(--color-heading)' }}>Are you sure you want to delete this group?</span>,
                content: <span style={{ color: 'var(--color-text)' }}>This action cannot be undone.</span>,
                onOk: () => handleDeleteGroup(record.id),
              })
            }
          />
        </>
      ),
    },
  ];

  return (
    <div style={{paddingBottom:'40px'}}>
      <div className="header top-nav">
            <Link to="/users">Users</Link>
            <Link to="/games" >
              Games
            </Link>
            <Link className="active" to="/groups">Groups</Link>
             <Link to="/result/:gameid/:gamename" >
              Settlement
            </Link>
             <Link to="/summary">Day</Link>
          </div>
      <h2>Groups</h2>
      <Input.Search
        placeholder="Search by group name"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 16, width: 300 }}
      />
      <Button type="primary" onClick={handleAddGroup} style={{ marginBottom: 16 }}>
        Add Group
      </Button>
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
          {filteredGroups.map((group) => (
            <Card key={group.id} style={{ width: '100%', backgroundColor: 'transparent', color: 'var(--color-text)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div><strong>Group Name:</strong> {group.groupname}</div>
                <div><strong>Commission:</strong> {group.commission}</div>
                <div><strong>Non-Pana Payable:</strong> {group.nonpana_payable}</div>
                <div><strong>Pana Payable:</strong> {group.pana_payable}</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <EditFilled
                    style={{ color: "#52c41a", cursor: "pointer" }}
                    onClick={() => handleEditGroup(group)}
                  />
                  <DeleteFilled
                    style={{ color: "#ff4d4f", cursor: "pointer" }}
                    onClick={() =>
                      Modal.confirm({
                        title: <span style={{ color: 'var(--color-heading)' }}>Are you sure you want to delete this group?</span>,
                        content: <span style={{ color: 'var(--color-text)' }}>This action cannot be undone.</span>,
                        onOk: () => handleDeleteGroup(group.id),
                      })
                    }
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="table-container">
          <Table
            columns={columns}
            dataSource={filteredGroups}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10 }}
          />
        </div>
      )}
<Modal
  title={<span style={{ color: 'var(--color-heading)' }}>{editingGroup ? "Edit Group" : "Add Group"}</span>}
  open={isModalOpen}
  onOk={handleSubmit}
  onCancel={() => setIsModalOpen(false)}
>
  <div style={{ color: 'var(--color-text)' }}>
    <Form form={form} layout="vertical">
      <Form.Item
        name="groupname"
        label="Group Name"
        rules={[{ required: true }]}
      >
        <Input />
      </Form.Item>

      <Form.Item
        name="commission"
        label="Commission"
        rules={[
          { required: true, message: "Commission is required" },
          {
            validator: (_, value) =>
              value >= 100
                ? Promise.reject("Commission cannot be 100 or more")
                : Promise.resolve()
          }
        ]}
      >
        <Input
          type="number"
          onChange={(e) => {
            const commissionValue = Number(e.target.value);
            if (commissionValue < 100) {
              form.setFieldsValue({ nonpana_payable: 100 - commissionValue });
            }
          }}
        />
      </Form.Item>

      <Form.Item name="nonpana_payable" label="Non-Pana Payable">
        <Input type="number" readOnly />
      </Form.Item>

      <Form.Item name="pana_payable" label="Pana Payable">
        <Input type="number" />
      </Form.Item>
    </Form>
  </div>
</Modal>

    </div>
  );
};

export default Groups;
