import React, { useEffect, useState } from "react";
import { Button, DatePicker, Modal, message } from "antd";
import dayjs from "dayjs";
import { apiClient } from "./utils/api";
import { useUserStore } from "./store/store";
import { getTabUserName, saveUserName } from "./utils/session";

// Shown at the top of every admin page: who is logged in, and a Recalculate button for all of
// that admin's groups (the platform admin's covers every admin's groups).
const AdminBar: React.FC = () => {
  const { userRole, userId } = useUserStore();
  const [name, setName] = useState<string | null>(getTabUserName());
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(dayjs());
  const [busy, setBusy] = useState(false);
  const isSuper = userRole === "superadmin";

  // A login from before the name was remembered: look it up once.
  useEffect(() => {
    if (name || userId === null) return;
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
  }, [name, userId]);

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
          <span className="admin-bar__role">{isSuper ? "Platform admin" : "Admin"}</span>
        </span>
        <Button
          className="admin-bar__recalc"
          onClick={() => {
            setDate(dayjs());
            setOpen(true);
          }}
        >
          Recalculate
        </Button>
      </div>
      <Modal
        title={<span style={{ color: "var(--color-heading)" }}>Recalculate all groups</span>}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={recalculate}
        okText="Yes, recalculate"
        confirmLoading={busy}
      >
        <div style={{ color: "var(--color-text)", display: "flex", flexDirection: "column", gap: 12 }}>
          <span>
            This recalculates profit and loss for every group {isSuper ? "of every admin" : "in your account"} on the date
            below. It cannot be undone.
          </span>
          <DatePicker
            value={date}
            allowClear={false}
            onChange={(d) => d && setDate(d)}
            disabledDate={(d) => d.isBefore(dayjs().subtract(15, "day"), "day") || d.isAfter(dayjs(), "day")}
          />
        </div>
      </Modal>
    </>
  );
};

export default AdminBar;
