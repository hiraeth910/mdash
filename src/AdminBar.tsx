import React, { useEffect, useState } from "react";
import { Button, DatePicker, Modal, message } from "antd";
import dayjs from "dayjs";
import { apiClient } from "./utils/api";
import { useUserStore } from "./store/store";
import { getTabUserName, saveUserName } from "./utils/session";
import { Link } from "react-router-dom";
import CalculatorButton from "./Calculator";
import LiveClock from "./LiveClock";

// Shown at the top of every page: who is logged in, and a Recalculate button for all of that
// account's groups (the platform admin's covers every admin's groups, a user's only their own).
const AdminBar: React.FC = () => {
  const { userRole, userId } = useUserStore();
  const [name, setName] = useState<string | null>(getTabUserName());
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(dayjs());
  const [busy, setBusy] = useState(false);
  const isSuper = userRole === "superadmin";
  const isUser = userRole === "user";

  // A login from before the name was remembered: look it up once.
  useEffect(() => {
    if (name || userId === null || isUser) return; // users cannot read the users list
    apiClient
      .get<{ users: { user_id: number; user_name: string }[] }>("/users")
      .then((res) => {
        const me = res.data.users.find((u) => u.user_id === Number(userId));
        if (me) {
          saveUserName(me.user_name);
          setName(me.user_name);
        }
      })
      .catch(() => undefined);
  }, [name, userId, isUser]);

  const recalculate = async () => {
    setBusy(true);
    try {
      const res = await apiClient.post("/recalculate", { groupid: -1, date: date.format("YYYY-MM-DD") });
      if (res.status === 200) {
        message.success("Recalculation complete");
        setOpen(false);
        // pages showing recalculated figures refresh themselves
        window.dispatchEvent(new CustomEvent("recalculated", { detail: { date: date.format("YYYY-MM-DD") } }));
      } else {
        message.warning(`Unexpected response: ${res.status}`);
      }
    } catch {
      message.error("Recalculation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="admin-bar">
        <span className="admin-bar__who">
          Logged in as <strong>{name ?? "…"}</strong>{" "}
          <span className="admin-bar__role">{isSuper ? "Platform admin" : isUser ? "User" : "Admin"}</span>
        </span>
        <LiveClock />
        <span className="admin-bar__tools">
          {!isUser && (
            <Link to="/insert-test" className="admin-bar__link">
              Practice insert
            </Link>
          )}
          <CalculatorButton className="admin-bar__btn admin-bar__btn--calc" />
        <Button
          className="admin-bar__btn admin-bar__btn--recalc"
          onClick={() => {
            setDate(dayjs());
            setOpen(true);
          }}
        >
          Recalculate
        </Button>
        </span>
      </div>
      <Modal
        title={<span style={{ color: "var(--color-heading)" }}>{isUser ? "Recalculate your groups" : "Recalculate all groups"}</span>}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={recalculate}
        okText="Yes, recalculate"
        confirmLoading={busy}
      >
        <div style={{ color: "var(--color-text)", display: "flex", flexDirection: "column", gap: 12 }}>
          <span>
            This recalculates profit and loss for {isUser ? "the groups assigned to you" : `every group ${isSuper ? "of every admin" : "in your account"}`} on the
            date below. It cannot be undone.
          </span>
          <DatePicker
            value={date}
            format="DD-MM-YYYY"
            allowClear={false}
            onChange={(d) => d && setDate(d)}
            disabledDate={(d) => d.isBefore(dayjs().subtract(30, "day"), "day") || d.isAfter(dayjs(), "day")}
          />
        </div>
      </Modal>
    </>
  );
};

export default AdminBar;
