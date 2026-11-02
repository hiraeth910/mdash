import React, { useEffect, useState } from "react";
import { Button, DatePicker, Input, Popconfirm, Popover, Spin, message } from "antd";
import { DeleteOutlined, FileTextOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { apiClient } from "./utils/api";

type Note = { id: number; content: string; created_at: string };

// A personal, day-wise notepad -- shown to every logged-in role. Notes belong to whoever wrote
// them (see controllers/notes.js on the backend); nothing here is shared across accounts.
const Notepad: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const dateStr = date.format("YYYY-MM-DD");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await apiClient.get<{ notes: Note[] }>("/notes", { params: { date: dateStr } });
        if (!cancelled) setNotes(res.data.notes || []);
      } catch {
        if (!cancelled) message.error("Failed to load notes");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, dateStr]);

  const addNote = async () => {
    const content = draft.trim();
    if (!content) return;
    setAdding(true);
    try {
      const res = await apiClient.post<{ note: Note }>("/notes", { date: dateStr, content });
      setNotes((prev) => [res.data.note, ...prev]);
      setDraft("");
    } catch {
      message.error("Failed to add note");
    } finally {
      setAdding(false);
    }
  };

  const removeNote = async (id: number) => {
    const previous = notes;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await apiClient.delete(`/notes/${id}`);
    } catch {
      setNotes(previous);
      message.error("Failed to delete note");
    }
  };

  const panel = (
    <div className="notepad">
      <DatePicker
        value={date}
        format="DD-MM-YYYY"
        allowClear={false}
        onChange={(d) => d && setDate(d)}
        disabledDate={(d) => d.isAfter(dayjs(), "day")}
        className="notepad__date"
      />
      <div className="notepad__add">
        <Input.TextArea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note for this day"
          autoSize={{ minRows: 1, maxRows: 4 }}
          aria-label="New note text"
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              addNote();
            }
          }}
        />
        <Button type="primary" size="small" loading={adding} onClick={addNote} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
      {loading ? (
        <div className="notepad__loading">
          <Spin size="small" />
        </div>
      ) : notes.length === 0 ? (
        <p className="notepad__empty">No notes for this day.</p>
      ) : (
        <div className="notepad__list">
          {notes.map((n) => (
            <div key={n.id} className="notepad__item">
              <div className="notepad__item-body">
                <span className="notepad__item-text">{n.content}</span>
                <span className="notepad__item-time">{dayjs(n.created_at).format("hh:mm A")}</span>
              </div>
              <Popconfirm title="Delete this note?" onConfirm={() => removeNote(n.id)} okText="Delete" okButtonProps={{ danger: true }} getPopupContainer={() => document.body}>
                <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Delete note" />
              </Popconfirm>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Popover content={panel} title="Notepad" trigger="click" placement="bottom" open={open} onOpenChange={setOpen} getPopupContainer={() => document.body}>
      <Button className="admin-bar__btn admin-bar__btn--notepad" icon={<FileTextOutlined />} aria-label="Notepad">
        Notepad
      </Button>
    </Popover>
  );
};

export default Notepad;
