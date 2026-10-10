import React, { useEffect, useState } from "react";
import { Modal, Input, message } from "antd";
import { apiClient } from "./utils/api";
import type { IGameResult } from "./games";

interface Props {
  open: boolean;
  gameId: number;
  gameName: string;
  date: string; // YYYY-MM-DD
  result: IGameResult | null;
  onClose: () => void;
  onSaved: () => void;
}

const PANA = /^\d{3}$/;

// Adds or edits one game's result for one date. Same rule as the Games page: the open result has to
// exist before a close result can be entered, so a new result takes the open pana only.
const ResultModal: React.FC<Props> = ({ open, gameId, gameName, date, result, onClose, onSaved }) => {
  const id = result?.id ?? -1;
  const savedOpen = result?.open_pana ?? "";
  const savedClose = result?.close_pana ?? "";
  const [openPana, setOpenPana] = useState(savedOpen);
  const [closePana, setClosePana] = useState(savedClose);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setOpenPana(savedOpen);
      setClosePana(savedClose);
    }
  }, [open, savedOpen, savedClose]);

  const changed = openPana !== savedOpen || closePana !== savedClose;
  // The open pana is always required; the close pana is optional but must be complete once typed.
  const valid = PANA.test(openPana) && (id === -1 || closePana === "" || PANA.test(closePana));

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.post("/game/result", {
        id,
        gameid: gameId,
        game_date: date,
        openPana,
        ...(id !== -1 ? { closePana: closePana === "" ? null : closePana } : {}),
      });
      message.success("Game result added/updated successfully!");
      onSaved();
      onClose();
    } catch {
      message.error("Failed to add/update game result");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={
        <span style={{ color: "var(--color-heading)" }}>
          {id === -1 ? "Add" : "Edit"} Result for <strong>{gameName}</strong> — {date}
        </span>
      }
      open={open}
      onCancel={onClose}
      onOk={save}
      okText="Save"
      confirmLoading={saving}
      okButtonProps={{ disabled: !changed || !valid }}
    >
      <div style={{ color: "var(--color-text)", display: "flex", flexDirection: "column", gap: 8 }}>
        <label htmlFor="result-open-pana">Open Pana</label>
        <Input
          id="result-open-pana"
          maxLength={3}
          inputMode="numeric"
          value={openPana}
          onChange={(e) => setOpenPana(e.target.value.replace(/\D/g, ""))}
          onPressEnter={() => changed && valid && save()}
        />
        <label htmlFor="result-close-pana">Close Pana</label>
        <Input
          id="result-close-pana"
          maxLength={3}
          inputMode="numeric"
          value={closePana}
          onChange={(e) => setClosePana(e.target.value.replace(/\D/g, ""))}
          onPressEnter={() => changed && valid && save()}
          // The close result can only follow an open result that is already saved.
          disabled={id === -1}
          placeholder={id === -1 ? "Save the open result first" : undefined}
        />
      </div>
    </Modal>
  );
};

export default ResultModal;
