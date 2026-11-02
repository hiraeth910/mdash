import React, { useEffect, useState } from "react";
import { Button, Calendar, Input, Modal, Popconfirm, Spin, message } from "antd";
import { DeleteOutlined, FileTextOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { apiClient } from "./utils/api";

type Note = { id: number; content: string; created_at: string };

// A personal, day-wise notepad -- shown to every logged-in role. Notes belong to whoever wrote
// them (see controllers/notes.js on the backend); nothing here is shared across accounts. No day
// is picked by default -- open the calendar, pick a date (any day, not just today), and that
// day's notes load; older days are just as reachable as today.
const Notepad: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Dayjs>(dayjs());
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const dateStr = selectedDate?.format("YYYY-MM-DD") ?? null;

  useEffect(() => {
    if (!open || !dateStr) return;
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
    if (!content || !dateStr) return;
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

  const openModal = () => {
    // Reset every time: never pre-pick today, always starts with an empty calendar prompt.
    setSelectedDate(null);
    setCalendarMonth(dayjs());
    setNotes([]);
    setDraft("");
    setOpen(true);
  };

  const pickDate = (d: Dayjs) => {
    setCalendarMonth(d);
    setSelectedDate(d);
  };

  return (
    <>
      <Button className="admin-bar__btn admin-bar__btn--notepad" icon={<FileTextOutlined />} onClick={openModal}>
        Notepad
      </Button>
      <Modal title="Notepad" open={open} onCancel={() => setOpen(false)} footer={null} width={640} destroyOnClose>
        <div className="notepad">
          <Calendar
            fullscreen={false}
            value={calendarMonth}
            onPanelChange={(d) => setCalendarMonth(d)}
            onSelect={(d) => pickDate(d)}
            disabledDate={(d) => d.isAfter(dayjs(), "day")}
            className="notepad__calendar"
          />
          <div className="notepad__notes">
            {!selectedDate ? (
              <p className="notepad__empty">Pick a date from the calendar to view or add its notes.</p>
            ) : (
              <>
                <h4 className="notepad__notes-title">{selectedDate.format("dddd, DD MMM YYYY")}</h4>
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
              </>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
};

export default Notepad;
