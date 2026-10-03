import React from "react";
import { Modal, Table } from "antd";
import { fmt } from "./utils/settlement";
import type { NumberDiff } from "./utils/compare";

export interface DiffMember {
  groupId: number;
  userName: string;
}

interface Props {
  onClose: () => void;
  title: string;
  members: DiffMember[];
  numbers: NumberDiff[];
  total: number;
}

// The numbers whose accumulated bet amount is not the same in every group (bet amounts only).
const NumbersDiffModal: React.FC<Props> = ({ onClose, title, members, numbers, total }) => (
  <Modal open onCancel={onClose} footer={null} width={720} title={title} destroyOnClose>
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

export default NumbersDiffModal;
