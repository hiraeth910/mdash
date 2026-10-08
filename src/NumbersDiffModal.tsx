import React from "react";
import { useState } from "react";
import { Button, Modal, Popconfirm, Table, message } from "antd";
import { fmt } from "./utils/settlement";
import type { NumberDiff } from "./utils/compare";

export interface DiffMember {
  groupId: number;
  userName: string;
  userId: number | null;
  groupName: string;
}

interface Props {
  onClose: () => void;
  title: string;
  groupName: string;
  members: DiffMember[];
  numbers: NumberDiff[];
  total: number;
  // Adds the bets that bring the lower groups up to the highest on a number; omitted when unavailable.
  onSettle?: (n: NumberDiff) => Promise<void>;
}

// The numbers whose accumulated bet amount is not the same in every group (bet amounts only).
const NumbersDiffModal: React.FC<Props> = ({ onClose, title, groupName, members, numbers, total, onSettle }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const settle = async (n: NumberDiff) => {
    if (!onSettle) return;
    setBusy(n.key);
    try {
      await onSettle(n);
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : "Could not settle this number");
    } finally {
      setBusy(null);
    }
  };

  const copyDiff = () => {
    const lines = [
      `${groupName} — ${title}`,
      members.map((m) => m.userName).join(" vs "),
      "",
      ...numbers.map((n) => `${n.number}: ${members.map((m, i) => `${m.userName} ${fmt(n.amounts[i])}`).join(", ")} — diff ${fmt(n.gap)}`),
      "",
      `Total difference: ${fmt(total)}`,
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(
      () => message.success("Difference copied to clipboard"),
      () => message.error("Failed to copy to clipboard")
    );
  };

  return (
  <Modal
    open
    onCancel={onClose}
    footer={null}
    width={720}
    title={
      <span className="numbers-diff-modal__title">
        <span>{groupName} — {title}</span>
        {numbers.length > 0 && (
          <Button size="small" onClick={copyDiff}>
            Copy
          </Button>
        )}
      </span>
    }
    destroyOnClose
  >
    {numbers.length === 0 ? (
      <p>No number has a different bet amount between these groups.</p>
    ) : (
      <>
        <p className="compare-note" data-testid="numbers-diff-total">
          {numbers.length} number{numbers.length > 1 ? "s" : ""} differ · Total difference <strong>{fmt(total)}</strong>
        </p>
        <Table
          className="settlement-table compare-numbers-table"
          size="small"
          pagination={false}
          scroll={{ y: 420, x: "max-content" }}
          dataSource={numbers}
          rowKey="key"
          columns={[
            { title: "Number", dataIndex: "number", key: "number" },
            { title: "Type", dataIndex: "type", key: "type" },
            ...members.map((m, i) => ({
              title: m.userName,
              key: `g${m.groupId}`,
              align: "right" as const,
              render: (_: unknown, r: NumberDiff) => fmt(r.amounts[i]),
            })),
            {
              title: "Difference",
              key: "gap",
              align: "right" as const,
              render: (_: unknown, r: NumberDiff) => <strong className="compare-gap">{fmt(r.gap)}</strong>,
            },
            {
              title: "",
              key: "settle",
              render: (_: unknown, r: NumberDiff) => {
                const lower = members.filter((_m, i) => r.amounts[i] < Math.max(...r.amounts)).map((m) => m.userName);
                return (
                  <Popconfirm
                    title={`Settle ${r.number}?`}
                    description={`Adds a bet of the missing amount for ${lower.join(", ")}. It cannot be undone here.`}
                    okText="Settle"
                    onConfirm={() => settle(r)}
                    disabled={!onSettle}
                    getPopupContainer={() => document.body}
                  >
                    <Button size="small" loading={busy === r.key} disabled={!onSettle || busy !== null}>
                      Settle
                    </Button>
                  </Popconfirm>
                );
              },
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
                <Table.Summary.Cell index={2} />
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
