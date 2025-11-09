import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useUserStore } from "../store/store";
import { LogOut } from "lucide-react";
import { Modal } from "antd";

const BottomNavigator: React.FC = () => {
  const { userRole, setUser } = useUserStore();
  const location = useLocation();

  const handleLogout = () => {
    Modal.confirm({
      title: "Confirm Logout",
      content: "Are you sure you want to log out?",
      onOk() {
        localStorage.clear();
        setUser(null, null);
        window.location.href = "/";
      },
    });
  };

  if (!userRole) return null;

  const isActive = (path: string) => {
    if (path === "/result/:gameid/:gamename") {
      return location.pathname.startsWith("/result");
    }
    if (path === "/insert") {
      return location.pathname.startsWith("/insert");
    }
    if (path === "/history") {
      return location.pathname.startsWith("/history");
    }
    if (path === "/data") {
      return location.pathname.startsWith("/data");
    }
    return location.pathname === path;
  };

  if (userRole === "user") {
    return (
      <div className="bottom-navigator">
        <Link to="/userGames" className={`nav-item ${isActive("/userGames") ? "active" : ""}`}>
          Games
        </Link>
        <Link to="/insert" className={`nav-item ${isActive("/insert") ? "active" : ""}`}>
          Insert
        </Link>
        <Link to="/history" className={`nav-item ${isActive("/history") ? "active" : ""}`}>
          History
        </Link>
        <Link to="/data" className={`nav-item ${isActive("/data") ? "active" : ""}`}>
          Total
        </Link>
        <button onClick={handleLogout} className="nav-item logout-btn">
          <LogOut size={16} />
        </button>
      </div>
    );
  }

  // Admin navigation
  return (
    <div className="bottom-navigator">
      <Link to="/users" className={`nav-item ${isActive("/users") ? "active" : ""}`}>
        Users
      </Link>
      <Link to="/games" className={`nav-item ${isActive("/games") ? "active" : ""}`}>
        Games
      </Link>
      <Link to="/groups" className={`nav-item ${isActive("/groups") ? "active" : ""}`}>
        Groups
      </Link>
      <Link to="/result/:gameid/:gamename" className={`nav-item ${isActive("/result/:gameid/:gamename") ? "active" : ""}`}>
        Settlement
      </Link>
      <Link to="/summary" className={`nav-item ${isActive("/summary") ? "active" : ""}`}>
        Day
      </Link>
      <button onClick={handleLogout} className="nav-item logout-btn">
        <LogOut size={16} />
      </button>
    </div>
  );
};

export default BottomNavigator;
