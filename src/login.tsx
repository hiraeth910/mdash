import React, { useState, useEffect } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import "./login.css";
import { useUserStore } from "./store/store";
import { loginUser } from "./utils/api";

const Login: React.FC = () => {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const setUser = useUserStore((state) => state.setUser);
  const [error, setError] = useState("");

  // Check localStorage on initial load.
  useEffect(() => {
    const storedRole = localStorage.getItem("role");
    const storedUserId = localStorage.getItem("userId");
    if (storedRole && storedUserId) {
      setUser(storedRole, Number(storedUserId));
      window.location.href = storedRole === "user" ? "/userGames" : "/games";
    }
  }, [setUser]);

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);
    
    const trimmedUserId = userId.trim();
    if (!trimmedUserId || !password) {
      setError("User ID and Password are required");
      setLoading(false);
      return;
    }

    const response = await loginUser(trimmedUserId, password);

    if (response.role) {
      setUser(response.role, response.id);
      localStorage.setItem("role", response.role);
      localStorage.setItem("userId", response.id);
      window.location.href = response.role === "user" ? "/userGames" : "/games";
    } else {
      setError(response.message || "Invalid credentials");
    }

    setLoading(false);
  };

  return (
    <div className="login-box">
      <h2 className="text-center">Hello User</h2>

      <label>User ID</label>
      <input
        type="text"
        className="form-control"
        placeholder="Enter your ID"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
      />
      <br />
      <label>Password</label>
      <div className="password-container">
        <input
          type={showPassword ? "text" : "password"}
          className="form-control"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        <span
          className="eye-icon"
          onClick={() => setShowPassword(!showPassword)}
        >
          {showPassword ? <FaEyeSlash /> : <FaEye />}
        </span>
      </div>
      {error && <p style={{ color: "red" }}>{error}</p>}
      
      <button className="btn btn-primary mt-3" onClick={handleSubmit} disabled={loading}>
        {loading ? "Logging in..." : "Login"}
      </button>
    </div>
  );
};

export default Login;
