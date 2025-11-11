import React, { useEffect } from "react";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";
import { useUserStore, useThemeStore } from "./store/store";
import { LogOut, Sun, Moon } from "lucide-react";
import { Modal } from "antd";
import Login from "./login";
import GamesPage from "./games";
import Users from "./users";
import InsertHistory from "./InsertHistory";
import HistoryTable from "./History";
import Dashboard from "./dashboard";
import Groups from "./groups";
import DataTables from "./datatables";
import Games from "./userGames";
import SummaryDashboard from "./newdashboard";
import HistoryViewer from "./Historyviewer";
import BottomNavigator from "./components/BottomNavigator";

const ProtectedRoute = ({
  children,
  allowedRoles,
}: {
  children: JSX.Element;
  allowedRoles: string[];
}) => {
  const { userRole } = useUserStore();

  if (!userRole) {
    return <Navigate to="/" replace />;
  }

  if (!allowedRoles.includes(userRole)) {
    return <Navigate to="/games" replace />;
  }

  return children;
};

const App: React.FC = () => {
  const { userRole, setUser } = useUserStore();
  const { theme, toggleTheme, setTheme } = useThemeStore();

  useEffect(() => {
    const storedTheme = localStorage.getItem("theme-store");
    if (storedTheme) {
      try {
        const parsed = JSON.parse(storedTheme);
        const themeValue = parsed.state?.theme || "dark";
        setTheme(themeValue);
      } catch {
        setTheme("dark");
      }
    } else {
      setTheme("dark");
    }
  }, [setTheme]);

  const handleLogout = () => {
    Modal.confirm({
      title: <span style={{ color: 'var(--color-heading)' }}>Confirm Logout</span>,
      content: <span style={{ color: 'var(--color-text)' }}>Are you sure you want to log out?</span>,
      bodyStyle: { backgroundColor: 'var(--color-background)', color: 'var(--color-text)' },
      onOk() {
        localStorage.clear();
        setUser(null, null);
        window.location.href = "/";
      },
    });
  };

  return (
    <Router>
      <div
        onClick={toggleTheme}
        style={{
          position: 'fixed',
          top: '1rem',
          right: '1.5rem',
          zIndex: 9999,
          cursor: 'pointer',
          padding: '8px',
          borderRadius: '50%',
          backgroundColor: theme === 'dark' ? '#ffdf00' : '#87ceeb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </div>

      <Routes>
        <Route path="/" element={<Login />} />
        <Route
          path="/games"
          element={userRole ? <GamesPage /> : <Navigate to="/" replace />}
        />
        <Route
          path="/result/:gameid/:gamename"
          element={userRole ? <Dashboard /> : <Navigate to="/" replace />}
        />
        <Route
          path="/data/:gameid/:gamename"
          element={userRole ? <DataTables /> : <Navigate to="/" replace />}
        />
        <Route
          path="/data"
          element={userRole ? <DataTables /> : <Navigate to="/" replace />}
        />
        <Route
          path="/insert/:gameid/:gamename/:groupid/:groupname/:typ"
          element={userRole ? <InsertHistory /> : <Navigate to="/" replace />}
        />
        <Route
          path="/insert"
          element={userRole ? <InsertHistory /> : <Navigate to="/" replace />}
        />
        <Route
          path="/history/:gameId/:gamename"
          element={userRole ? <HistoryTable /> : <Navigate to="/" replace />}
        />
        <Route
          path="/history"
          element={userRole ? <HistoryTable /> : <Navigate to="/" replace />}
        />
        <Route path="/summary" element={<SummaryDashboard />} />
        <Route
          path="/users"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route path="/userGames" element={<Games />} />
        <Route
          path="/groups"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <Groups />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history-viewer"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <HistoryViewer />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {userRole && <BottomNavigator />}
      {userRole && (
        <div className="desktop-logout" style={{textAlign:'center'}}>
          <button onClick={handleLogout} className="logout-btn" style={{backgroundColor:'orange'}}>
            <LogOut size={16} />
            Logout
          </button>
        </div>
      )}
    </Router>
  );
};

export default App;
