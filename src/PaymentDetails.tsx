import React, { useEffect, useState } from "react";
import { Button, Input, message } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { downloadTableImage, renderTableImage, type TableImage } from "./utils/tableImage";

const STORAGE_KEY = "payment-details-v3";
const PHONE_SLOTS = 4;
const BANK_SLOTS = 2;

export type PhoneSlot = { name: string; number: string; include: boolean };
export type BankSlot = { name: string; holder: string; account: string; ifsc: string; bank: string; include: boolean };

// Four PhonePe numbers and two bank accounts, always kept; "include" puts one on the bill picture.
export type PaymentInfo = { phones: PhoneSlot[]; banks: BankSlot[] };

const emptyPhone = (): PhoneSlot => ({ name: "", number: "", include: false });
const emptyBank = (): BankSlot => ({ name: "", holder: "", account: "", ifsc: "", bank: "", include: false });
const fresh = (): PaymentInfo => ({
  phones: Array.from({ length: PHONE_SLOTS }, emptyPhone),
  banks: Array.from({ length: BANK_SLOTS }, emptyBank),
});

const str = (v: unknown) => String(v ?? "");

const load = (): PaymentInfo => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (parsed && Array.isArray(parsed.phones) && Array.isArray(parsed.banks)) {
      return {
        phones: Array.from({ length: PHONE_SLOTS }, (_, i) => {
          const p = parsed.phones[i];
          return p ? { name: str(p.name), number: str(p.number), include: !!p.include } : emptyPhone();
        }),
        banks: Array.from({ length: BANK_SLOTS }, (_, i) => {
          const b = parsed.banks[i];
          return b
            ? { name: str(b.name), holder: str(b.holder), account: str(b.account), ifsc: str(b.ifsc), bank: str(b.bank), include: !!b.include }
            : emptyBank();
        }),
      };
    }
    // the previous version kept a saved list with a separate pick; take the first few over
    const v2 = JSON.parse(localStorage.getItem("payment-details-v2") || "null");
    if (v2 && Array.isArray(v2.phones) && Array.isArray(v2.banks)) {
      const base = fresh();
      v2.phones.slice(0, PHONE_SLOTS).forEach((p: { id: string; name: string; number: string }, i: number) => {
        base.phones[i] = { name: str(p.name), number: str(p.number), include: (v2.pickedPhones || []).includes(p.id) };
      });
      v2.banks.slice(0, BANK_SLOTS).forEach((b: BankSlot & { id: string }, i: number) => {
        base.banks[i] = { name: str(b.name), holder: str(b.holder), account: str(b.account), ifsc: str(b.ifsc), bank: str(b.bank), include: (v2.pickedBanks || []).includes(b.id) };
      });
      return base;
    }
  } catch {
    // start empty
  }
  return fresh();
};

// The details are the admin's own, so they are kept in this browser.
export const usePaymentDetails = () => {
  const [info, setInfo] = useState<PaymentInfo>(load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
    } catch {
      // keeping them is a convenience
    }
  }, [info]);
  return [info, setInfo] as const;
};

type Section = TableImage["sections"][number];

// Only the slots switched to "include" go into a picture, and only their filled fields.
export const paymentImageSections = (info: PaymentInfo): Section[] => {
  const phones = info.phones.filter((p) => p.include && p.number.trim());
  const banks = info.banks.map((b, slot) => ({ b, slot })).filter(({ b }) => b.include);
  const sections: Section[] = [];
  if (phones.length) {
    sections.push({
      heading: "PhonePe",
      beside: true,
      badge: "phonepe",
      columns: [{ header: "Name" }, { header: "PhonePe number" }],
      rows: phones.map((p) => ({ cells: [p.name.trim() || "PhonePe", p.number.trim()] })),
    });
  }
  // each included account is its own table headed "Bank 1" / "Bank 2" (its slot), beside the calculation
  banks.forEach(({ b, slot }) => {
    const lines: [string, string][] = [
      ["Account name", b.holder],
      ["Account no", b.account],
      ["IFSC", b.ifsc],
      ["Bank", b.bank],
    ];
    const filled = lines.filter(([, v]) => v.trim());
    if (filled.length === 0) return;
    sections.push({
      beside: true,
      heading: `Bank ${slot + 1}`,
      columns: [{ header: "Detail" }, { header: "Value" }],
      rows: [
        ...filled.map(([label, v]) => ({ cells: [label, v.trim()] })),
      ],
    });
  });
  return sections;
};

export const PhonePeLogo: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="PhonePe" className="payment-logo">
    <rect width="32" height="32" rx="8" fill="#5f259f" />
    <path d="M10 8h9.5a4.5 4.5 0 0 1 0 9H15v7h-3.5V11.5H10V8zm5 3.5V14h4.2a1.25 1.25 0 0 0 0-2.5H15z" fill="#fff" />
  </svg>
);

const IncludeButton: React.FC<{ on: boolean; onToggle: () => void; label: string }> = ({ on, onToggle, label }) => (
  <Button size="small" type={on ? "primary" : "default"} aria-pressed={on} aria-label={label} onClick={onToggle}>
    {on ? "Included" : "Include"}
  </Button>
);

// Four PhonePe numbers and two bank accounts, each with a name. They stay saved and can be edited
// or cleared; the Include button decides whether one is on the bill picture.
export const PaymentDetailsForm: React.FC<{ info: PaymentInfo; onChange: (next: PaymentInfo) => void }> = ({ info, onChange }) => {
  // A picture of just the included PhonePe numbers and bank accounts, to send on their own.
  const paySections = paymentImageSections(info);
  const copyPhones = async () => {
    if (paySections.length === 0) return;
    const image: TableImage = {
      title: "Pay to",
      fileName: "Pay_to.png",
      // the tables sit side by side, the first one starting the row
      sections: paySections.map((sec, i) => ({ ...sec, beside: i > 0 })),
    };
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": renderTableImage(image) })]);
      message.success("PhonePe image copied.");
    } catch {
      downloadTableImage(image).catch(() => message.error("Could not create the image"));
      message.info("Couldn't copy the image here, so it was downloaded instead.");
    }
  };

  const setPhone = (i: number, patch: Partial<PhoneSlot>) =>
    onChange({ ...info, phones: info.phones.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const setBank = (i: number, patch: Partial<BankSlot>) =>
    onChange({ ...info, banks: info.banks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  return (
    <div className="payment-details">
      <div className="payment-details__head">
        <PhonePeLogo />
        <strong>PhonePe</strong>
        <span className="payment-details__hint">Include puts it on the picture</span>
        <Button size="small" onClick={copyPhones} disabled={paySections.length === 0} aria-label="Copy PhonePe image">
          Copy image
        </Button>
      </div>
      {info.phones.map((p, i) => (
        <div className="payment-details__phone" key={i}>
          <Input size="small" placeholder="Name" aria-label={`PhonePe name ${i + 1}`} value={p.name} onChange={(e) => setPhone(i, { name: e.target.value })} />
          <Input
            size="small"
            inputMode="tel"
            maxLength={15}
            placeholder="Number"
            aria-label={`PhonePe number ${i + 1}`}
            value={p.number}
            onChange={(e) => setPhone(i, { number: e.target.value.replace(/[^\d+ ]/g, "") })}
          />
          <IncludeButton on={p.include} label={`Include PhonePe ${i + 1}`} onToggle={() => setPhone(i, { include: !p.include })} />
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label={`Delete PhonePe ${i + 1}`}
            disabled={!p.name && !p.number}
            onClick={() => setPhone(i, emptyPhone())}
          />
        </div>
      ))}

      {info.banks.map((b, i) => (
        <div className="payment-details__account" key={i}>
          <div className="payment-details__head payment-details__head--bank">
            <strong>Bank {i + 1}</strong>
            <span className="payment-details__actions">
              <IncludeButton on={b.include} label={`Include account ${i + 1}`} onToggle={() => setBank(i, { include: !b.include })} />
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label={`Delete account ${i + 1}`}
                disabled={!b.holder && !b.account && !b.ifsc && !b.bank}
                onClick={() => setBank(i, emptyBank())}
              />
            </span>
          </div>
          <div className="payment-details__bank">
            <Input size="small" placeholder="Account holder name" aria-label={`Account holder name ${i + 1}`} value={b.holder} onChange={(e) => setBank(i, { holder: e.target.value })} />
            <Input
              size="small"
              inputMode="numeric"
              maxLength={20}
              placeholder="Account number"
              aria-label={`Account number ${i + 1}`}
              value={b.account}
              onChange={(e) => setBank(i, { account: e.target.value.replace(/\D/g, "") })}
            />
            <Input
              size="small"
              maxLength={11}
              placeholder="IFSC"
              aria-label={`IFSC ${i + 1}`}
              value={b.ifsc}
              onChange={(e) => setBank(i, { ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
            />
            <Input size="small" placeholder="Bank name" aria-label={`Bank name ${i + 1}`} value={b.bank} onChange={(e) => setBank(i, { bank: e.target.value })} />
          </div>
        </div>
      ))}
    </div>
  );
};
