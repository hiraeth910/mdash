import React, { useEffect, useState } from "react";
import { Input } from "antd";
import type { TableImage } from "./utils/tableImage";

const STORAGE_KEY = "payment-details";

export type PaymentInfo = {
  phones: string[]; // PhonePe numbers
  holder: string;
  account: string;
  ifsc: string;
  bank: string;
};

const PHONE_SLOTS = 4;
const EMPTY: PaymentInfo = { phones: Array(PHONE_SLOTS).fill(""), holder: "", account: "", ifsc: "", bank: "" };

const load = (): PaymentInfo => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (parsed) {
      const phones = Array.isArray(parsed.phones) ? parsed.phones.map(String) : [];
      return {
        phones: Array.from({ length: PHONE_SLOTS }, (_, i) => phones[i] ?? ""),
        holder: String(parsed.holder ?? ""),
        account: String(parsed.account ?? ""),
        ifsc: String(parsed.ifsc ?? ""),
        bank: String(parsed.bank ?? ""),
      };
    }
  } catch {
    // start empty
  }
  return EMPTY;
};

// The details are the admin's own, so they are kept in this browser and filled in next time.
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

// Only the fields that were filled in go into a picture.
export const paymentImageSection = (info: PaymentInfo): TableImage["sections"][number] | null => {
  const phones = info.phones.map((p) => p.trim()).filter(Boolean);
  const rows: { cells: string[] }[] = [
    ...phones.map((p, i) => ({ cells: [phones.length > 1 ? `PhonePe ${i + 1}` : "PhonePe", p] })),
    ...(info.holder.trim() ? [{ cells: ["Account name", info.holder.trim()] }] : []),
    ...(info.account.trim() ? [{ cells: ["Account no", info.account.trim()] }] : []),
    ...(info.ifsc.trim() ? [{ cells: ["IFSC", info.ifsc.trim()] }] : []),
    ...(info.bank.trim() ? [{ cells: ["Bank", info.bank.trim()] }] : []),
  ];
  if (rows.length === 0) return null;
  return { heading: "Pay to", badge: "phonepe", columns: [{ header: "Detail" }, { header: "Value" }], rows };
};

export const PhonePeLogo: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="PhonePe" className="payment-logo">
    <rect width="32" height="32" rx="8" fill="#5f259f" />
    <path d="M10 8h9.5a4.5 4.5 0 0 1 0 9H15v7h-3.5V11.5H10V8zm5 3.5V14h4.2a1.25 1.25 0 0 0 0-2.5H15z" fill="#fff" />
  </svg>
);

// The "pay to" form: PhonePe numbers and bank account details. Shown beside a bill that is due.
export const PaymentDetailsForm: React.FC<{ info: PaymentInfo; onChange: (next: PaymentInfo) => void }> = ({ info, onChange }) => {
  const set = (patch: Partial<PaymentInfo>) => onChange({ ...info, ...patch });
  return (
    <div className="payment-details">
      <div className="payment-details__head">
        <PhonePeLogo />
        <strong>PhonePe</strong>
        <span className="payment-details__hint">shown on the picture when filled</span>
      </div>
      <div className="payment-details__phones">
        {info.phones.map((p, i) => (
          <Input
            key={i}
            size="small"
            inputMode="tel"
            maxLength={15}
            placeholder={`Number ${i + 1}`}
            aria-label={`PhonePe number ${i + 1}`}
            value={p}
            onChange={(e) => set({ phones: info.phones.map((x, j) => (j === i ? e.target.value.replace(/[^\d+ ]/g, "") : x)) })}
          />
        ))}
      </div>
      <div className="payment-details__head payment-details__head--bank">
        <strong>Bank account</strong>
      </div>
      <div className="payment-details__bank">
        <Input size="small" placeholder="Account holder name" aria-label="Account holder name" value={info.holder} onChange={(e) => set({ holder: e.target.value })} />
        <Input
          size="small"
          inputMode="numeric"
          maxLength={20}
          placeholder="Account number"
          aria-label="Account number"
          value={info.account}
          onChange={(e) => set({ account: e.target.value.replace(/\D/g, "") })}
        />
        <Input
          size="small"
          maxLength={11}
          placeholder="IFSC"
          aria-label="IFSC"
          value={info.ifsc}
          onChange={(e) => set({ ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
        />
        <Input size="small" placeholder="Bank name" aria-label="Bank name" value={info.bank} onChange={(e) => set({ bank: e.target.value })} />
      </div>
    </div>
  );
};
