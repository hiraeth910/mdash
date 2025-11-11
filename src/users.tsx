import React, { useEffect, useState } from "react";
import {
  Table,
  Button,
  Modal,
  Input,
  Select,
  message,
  Card,
} from "antd";
import { EditFilled, DeleteFilled } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { apiClient } from "./utils/api";
import { useUserStore } from "./store/store";
import "./game.css";
import { checkAuthAndHandleLogout } from "./authcheck";

const { Option } = Select;

// Define models to avoid ambiguity and build errors.
export interface IGroup {
  group_id: number;
  group_name: string;
}

export interface IUser {
  user_id: number;
  user_name: string;
  user_password: string;
  user_role: string;
  group_ids: number[];
  last_login: string;
  created_at: string;
  // Computed property: the names of the groups
  groups?: string[];
}

export interface INewUser {
  userid: string;
  password: string;
  role: string;
  group_ids: number[];
}

const Users: React.FC = () => {
  const { userRole } = useUserStore();
  const [users, setUsers] = useState<IUser[]>([]);
  const [groups, setGroups] = useState<IGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [selectedUser, setSelectedUser] = useState<IUser | null>(null);
  const [newUser, setNewUser] = useState<INewUser>({
    userid: "",
    password: "",
    role: "",
    group_ids: [],
  });
  const [searchText, setSearchText] = useState<string>("");
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);

  // Fetch groups on mount.
  useEffect(() => {
    fetchGroups();
  }, []);

  // Once groups are loaded, fetch users.
  useEffect(() => {
    if (groups.length > 0) {
      fetchUsers();
    }
  }, [groups]);

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
      // Assuming your /groups endpoint returns an array of IGroup objects.
      const response = await apiClient.get<IGroup[]>("/groups");
      setGroups(response.data);
    } catch (error) {
      console.error(error)
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
      // Assuming your /users endpoint returns an object with a 'users' property.
      const response = await apiClient.get<{ users: IUser[] }>("/users");
      // Map each user’s group_ids to group names from the groups state.
      const fetchedUsers = response.data.users.map((user) => {
        const groupNames = user.group_ids?.map((id) => {
          const grp = groups.find((group) => group.group_id === id);
          return grp ? grp.group_name : "Missing";
        });
        return { ...user, groups: groupNames };
      });
      setUsers(fetchedUsers || []);
    } catch (error) {
      console.error(error)
      message.error("Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewUser({ ...newUser, [e.target.name]: e.target.value });
  };

  const handleRoleChange = (value: string) => {
    setNewUser({ ...newUser, role: value });
  };

  const handleGroupChange = (value: number[]) => {
    setNewUser({ ...newUser, group_ids: value });
  };

  const handleSubmit = async () => {
    if (!newUser.userid || !newUser.password || !newUser.role) {
      return message.warning("All fields are required!");
    }
    try {
      await apiClient.post("/manage-user", {
        flag: "I",
        userid: newUser.userid,
        password: newUser.password,
        role: newUser.role,
        group_ids: newUser.group_ids,
        id: null,
        createdat: new Date().toISOString(),
      });
      message.success("User added successfully!");
      setModalVisible(false);
      fetchUsers();
    } catch (error) {
            console.error(error)

      message.error("Failed to add user");
    }
  };

  const handleEdit = (record: IUser) => {
    setNewUser({
      userid: record.user_name,
      password: record.user_password,
      role: record.user_role,
      group_ids: record.group_ids,
    });
    setSelectedUser(record);
    setIsEditing(true);
    setModalVisible(true);
  };

  const handleUpdate = async () => {
    if (!selectedUser) return;
    try {
      await apiClient.post("/manage-user", {
        flag: "U",
        userid: newUser.userid,
        password: newUser.password,
        role: newUser.role,
        group_ids: newUser.group_ids,
        id: selectedUser.user_id,
        createdat: new Date().toISOString(),
      });
      message.success("User updated successfully!");
      setModalVisible(false);
      fetchUsers();
    } catch (error) {
            console.error(error)

      message.error("Failed to update user");
    }
  };

  const handleDelete = async (userId: number) => {
    try {
      await apiClient.post("/manage-user", { flag: "D", id: userId });
      message.success("User deleted successfully!");
      fetchUsers();
    } catch (error) {
            console.error(error)

      message.error("Failed to delete user");
    }
  };

  const filteredUsers = users.filter((user) =>
    user.user_name.toLowerCase().includes(searchText.toLowerCase())
  );

  // Define table columns. For groups, simply display a comma‑separated list.
  const columns = [
    {
      title: "User Name",
      dataIndex: "user_name",
      key: "user_name",
    },
    {
      title: "Role",
      dataIndex: "user_role",
      key: "user_role",
    },
    {
      title: "Access to Groups",
      dataIndex: "groups",
      key: "groups",
      render: (groups: string[]) => groups.join(", "),
    },
    ...(userRole === "admin"
      ? [
          {
            title: "Password",
            dataIndex: "user_password",
            key: "user_password",
          },
        {
  title: "Actions",
  key: "actions",
  render: (_: unknown, record: IUser): JSX.Element => (
    <>
      <EditFilled
        style={{ color: "#52c41a", marginRight: 10, cursor: "pointer" }}
        onClick={() => handleEdit(record)}
      />
      <DeleteFilled
        style={{ color: "#ff4d4f", cursor: "pointer" }}
        onClick={() => handleDelete(record.user_id)}
      />
    </>
  ),
}
,
        ]
      : []),
  ];

  return (
    <div className="container">
      {userRole === "admin" && (
        <div className="header top-nav">
          <Link to="/users" className="active">
            Users
          </Link>
          <Link to="/games">Games</Link>
                      <Link to="/groups">Groups</Link>
                      <Link to="/result/:gameid/:gamename">Settlement</Link>
                      <Link to="/summary">Day</Link>
        </div>
      )}

      <div className="table-container">
        <div className="table-header">
          <Input.Search
            placeholder="Search by user name"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
          />
          <Button
            type="primary"
            className="add-button"
            onClick={() => {
              setIsEditing(false);
              setSelectedUser(null);
              setNewUser({ userid: "", password: "", role: "", group_ids: [] });
              setModalVisible(true);
            }}
          >
            Add User
          </Button>
        </div>
        <div className="scrollable-table">
          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
              {filteredUsers.map((user) => (
                <Card key={user.user_id} style={{ width: '100%', backgroundColor: 'transparent', color: 'var(--color-text)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div><strong>User Name:</strong> {user.user_name}</div>
                    <div><strong>Role:</strong> {user.user_role}</div>
                    <div><strong>Access to Groups:</strong> {user.groups?.join(', ')}</div>
                    {userRole === 'admin' && (
                      <>
                        <div><strong>Password:</strong> {user.user_password}</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <EditFilled
                            style={{ color: "#52c41a", cursor: "pointer" }}
                            onClick={() => handleEdit(user)}
                          />
                          <DeleteFilled
                            style={{ color: "#ff4d4f", cursor: "pointer" }}
                            onClick={() => handleDelete(user.user_id)}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Table
              columns={columns}
              dataSource={filteredUsers}
              rowKey="user_id"
              loading={loading}
              pagination={false}
              style={{fontSize:'30px'}}
            />
          )}
        </div>
      </div>

      <Modal
        title={<span style={{ color: 'var(--color-heading)' }}>{isEditing ? "Edit User" : "Add New User"}</span>}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setSelectedUser(null);
          setNewUser({ userid: "", password: "", role: "", group_ids: [] });
        }}
        onOk={isEditing ? handleUpdate : handleSubmit}
      >
        <div style={{ color: 'var(--color-text)' }}>
          <label>User Name</label>
          <Input
            placeholder="Enter user name"
            name="userid"
            value={newUser.userid}
            onChange={handleInputChange}
          />
          <label>Password</label>
          <Input
            type="password"
            placeholder="Enter password"
            name="password"
            value={newUser.password}
            onChange={handleInputChange}
          />
          <label>Role</label>
          <Select
            placeholder="Select role"
            value={newUser.role}
            onChange={handleRoleChange}
            style={{ width: "100%", marginBottom: "1rem" }}
          >
            <Option value="admin">Admin</Option>
            <Option value="user">User</Option>
          </Select>
          <label>Groups</label>
         <Select
    mode="multiple"
    placeholder="Select groups"
    value={newUser.group_ids}
    onChange={handleGroupChange}
    style={{ width: "100%" }}
    showSearch
    optionFilterProp="children" // Ensures search happens based on the displayed text (group_name)
  >
    {groups.map((group: IGroup) => (
      <Option key={group.group_id} value={group.group_id}>
        {group.group_name}
      </Option>
    ))}
  </Select>
        </div>
      </Modal>
      
    </div>
  );
};

export default Users;
