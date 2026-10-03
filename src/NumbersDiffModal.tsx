import React, { useEffect, useState } from "react";
import { Modal, Spin, Table } from "antd";
import { apiClient } from "./utils/api";
import { fmt, normName } from "./utils/settlement";

export interface DiffMember {
  groupId: number;
  userName: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  game: string; // game name without the open/close suffix
  side: "open" | "close";
  date: string;
  members: DiffMember[];
}

interface IGameRow {
  gameid: number;
  gamename: string;
}
interface HistoryItem {
  itypeid: number;
  itypename: string;
  inumber: string | number;
  total_amount: number;
}

// Which bet types belong to each side of a game.
const SIDE_TYPES: Record<"open" | "close", number[]> = { open: [2, 3, 4], close: [7, 9] };

interface NumberRow {
  key: string;
  type: string;
  number: string;
  amounts: number[]; // one per member, 0 when the group has no bet on the number
  gap: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Lists the numbers whose accumulated bet amount is not the same in every group (bet amounts only).
const NumbersDiffModal: React.FC<Props> = ({ open, onClose, game, side, date, members }) => {
  const [rows, setRows] = useState<NumberRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setRows([]);
    (async () => {
      try {
        const games = (await apiClient.get<IGameRow[]>("/games")).data;
        const found = games.find((g) => normName(g.gamename) === normName(game));
        if (!found) throw new Error("Game not found");
        const perGroup = await Promise.all(
          members.map((m) =>
            apiClient
              .post<HistoryItem[]>("/summed-history-by-uid", { userid: 0, date, game: found.gameid, groupid: [m.groupId] })
              .then((r) => r.data)
          )
        );
        const byKey = new Map<string, NumberRow>();
        perGroup.forEach((items, mi) => {
          items
            .filter((it) => SIDE_TYPES[side].includes(Number(it.itypeid)))
            .forEach((it) => {
              const key = `${it.itypeid}|${it.inumber}`;
              const row = byKey.get(key) ?? {
                key,
                type: it.itypename,
                number: String(it.inumber),
                amounts: members.map(() => 0),
                gap: 0,
              };
              row.amounts[mi] = round2(row.amounts[mi] + Number(it.total_amount || 0));
              byKey.set(key, row);
            });
        });
        const differing = [...byKey.values()]
          .map((r) => ({ ...r, gap: round2(Math.max(...r.amounts) - Math.min(...r.amounts)) }))
          .filter((r) => r.gap > 0)
          .sort((a, b) => b.gap - a.gap || a.type.localeCompare(b.type) || a.number.localeCompare(b.number, undefined, { numeric: true }));
        if (!cancelled) setRows(differing);
      } catch {
        if (!cancelled) setError("Could not load the numbers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, game, side, date, members]);

  const total = round2(rows.reduce((s, r) => s + r.gap, 0));

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={720} title={`${game} (${side}) — numbers that differ · ${date}`} destroyOnClose>
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spin />
        </div>
      ) : error ? (
        <p>{error}</p>
      ) : rows.length === 0 ? (
        <p>No number has a different bet amount between these groups.</p>
      ) : (
        <>
          <p className="compare-note" data-testid="numbers-diff-total">
            {rows.length} number{rows.length > 1 ? "s" : ""} differ · Total difference <strong>{fmt(total)}</strong>
          </p>
          <Table
            className="settlement-table compare-numbers-table"
            size="small"
            pagination={false}
            scroll={{ y: 420, x: "max-content" }}
            dataSource={rows}
            rowKey="key"
            columns={[
              { title: "Number", dataIndex: "number", key: "number" },
              { title: "Type", dataIndex: "type", key: "type" },
              ...members.map((m, i) => ({
                title: m.userName,
                key: `g${m.groupId}`,
                align: "right" as const,
                render: (_: unknown, r: NumberRow) => fmt(r.amounts[i]),
              })),
              {
                title: "Difference",
                key: "gap",
                align: "right" as const,
                render: (_: unknown, r: NumberRow) => <strong className="compare-gap">{fmt(r.gap)}</strong>,
              },
            ]}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={2 + members.length}>
                    <strong>Total difference</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <strong className="compare-gap">{fmt(total)}</strong>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </>
      )}
    </Modal>
  );
};

export default NumbersDiffModal;
