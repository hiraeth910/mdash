import React, { useEffect, useState } from "react";
import { Button, Input, Select } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import type { TableImage } from "./utils/tableImage";
import { searchProps } from "./utils/selectSearch";

const STORAGE_KEY = "payment-details-v2";
const OLD_KEY = "payment-details";

export type SavedPhone = { id: string; name: string; number: string };
export type SavedBank = { id: string; name: string; holder: string; account: string; ifsc: string; bank: string };

export type PaymentInfo = {
  phones: SavedPhone[]; // every PhonePe number saved so far (unique by number)
  banks: SavedBank[]; // every bank account saved so far (unique by account number)
  pickedPhones: string[]; // the ones that go on the picture
  pickedBanks: string[];
};

const EMPTY: PaymentInfo = { phones: [], banks: [], pickedPhones: [], pickedBanks: [] };
const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const str = (v: unknown) => String(v ?? "");

const load = (): PaymentInfo => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (parsed && Array.isArray(parsed.phones) && Array.isArray(parsed.banks)) {
      const phones: SavedPhone[] = parsed.phones.map((p: SavedPhone) => ({ id: str(p.id), name: str(p.name), number: str(p.number) }));
      const banks: SavedBank[] = parsed.banks.map((b: SavedBank) => ({
        id: str(b.id),
        name: str(b.name),
        holder: str(b.holder),
        account: str(b.account),
        ifsc: str(b.ifsc),
        bank: str(b.bank),
      }));
      return {
        phones,
        banks,
        pickedPhones: (parsed.pickedPhones || []).map(str).filter((id: string) => phones.some((p) => p.id === id)),
        pickedBanks: (parsed.pickedBanks || []).map(str).filter((id: string) => banks.some((b) => b.id === id)),
      };
    }
    // the first version kept four loose number boxes and one account; carry them over
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || "null");
    if (old) {
      const phones: SavedPhone[] = (Array.isArray(old.phones) ? old.phones : [])
        .map(str)
        .filter((n: string) => n.trim())
        .map((n: string, i: number) => ({ id: newId(), name: `PhonePe ${i + 1}`, number: n.trim() }));
      const banks: SavedBank[] = str(old.account).trim()
        ? [{ id: newId(), name: str(old.holder) || "Account", holder: str(old.holder), account: str(old.account), ifsc: str(old.ifsc), bank: str(old.bank) }]
        : [];
      return { phones, banks, pickedPhones: phones.map((p) => p.id), pickedBanks: banks.map((b) => b.id) };
    }
  } catch {
    // start empty
  }
  return EMPTY;
};

// The details are the admin's own, so the saved numbers and accounts live in this browser.
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

// Only the numbers and accounts that were picked go into a picture, and only their filled fields.
export const paymentImageSections = (info: PaymentInfo): Section[] => {
  const phones = info.phones.filter((p) => info.pickedPhones.includes(p.id) && p.number.trim());
  const banks = info.banks.filter((b) => info.pickedBanks.includes(b.id));
  const sections: Section[] = [];
  if (phones.length) {
    sections.push({
      heading: "Pay to",
      badge: "phonepe",
      columns: [{ header: "Name" }, { header: "PhonePe number" }],
      rows: phones.map((p) => ({ cells: [p.name.trim() || "PhonePe", p.number.trim()] })),
    });
  }
  const bankRows = banks.flatMap((b) => {
    const lines: [string, string][] = [
      ["Account name", b.holder],
      ["Account no", b.account],
      ["IFSC", b.ifsc],
      ["Bank", b.bank],
    ];
    const filled = lines.filter(([, v]) => v.trim());
    if (filled.length === 0) return [];
    return [
      ...(b.name.trim() ? [{ cells: [b.name.trim(), ""], bold: true, shaded: true }] : []),
      ...filled.map(([label, v]) => ({ cells: [label, v.trim()] })),
    ];
  });
  if (bankRows.length) {
    sections.push({ heading: phones.length ? "Bank account" : "Pay to — bank account", columns: [{ header: "Detail" }, { header: "Value" }], rows: bankRows });
  }
  return sections;
};

export const PhonePeLogo: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="PhonePe" className="payment-logo">
    <rect width="32" height="32" rx="8" fill="#5f259f" />
    <path d="M10 8h9.5a4.5 4.5 0 0 1 0 9H15v7h-3.5V11.5H10V8zm5 3.5V14h4.2a1.25 1.25 0 0 0 0-2.5H15z" fill="#fff" />
  </svg>
);

const emptyBank = { name: "", holder: "", account: "", ifsc: "", bank: "" };

// The "pay to" box: pick any number of saved PhonePe numbers and bank accounts for the picture, or
// save a new one (with a name) that then stays in the lists.
export const PaymentDetailsForm: React.FC<{ info: PaymentInfo; onChange: (next: PaymentInfo) => void }> = ({ info, onChange }) => {
  const [phoneDraft, setPhoneDraft] = useState({ name: "", number: "" });
  const [bankDraft, setBankDraft] = useState(emptyBank);

  const savePhone = () => {
    const number = phoneDraft.number.trim();
    if (!number) return;
    const existing = info.phones.find((p) => p.number.replace(/\s/g, "") === number.replace(/\s/g, ""));
    if (existing) {
      // numbers are unique: update the name and make sure it is picked
      onChange({
        ...info,
        phones: info.phones.map((p) => (p.id === existing.id ? { ...p, name: phoneDraft.name.trim() || p.name } : p)),
        pickedPhones: info.pickedPhones.includes(existing.id) ? info.pickedPhones : [...info.pickedPhones, existing.id],
      });
    } else {
      const id = newId();
      onChange({ ...info, phones: [...info.phones, { id, name: phoneDraft.name.trim(), number }], pickedPhones: [...info.pickedPhones, id] });
    }
    setPhoneDraft({ name: "", number: "" });
  };

  const saveBank = () => {
    const account = bankDraft.account.trim();
    if (!account) return;
    const existing = info.banks.find((b) => b.account === account);
    const entry = { ...bankDraft, name: bankDraft.name.trim(), holder: bankDraft.holder.trim(), bank: bankDraft.bank.trim(), account };
    if (existing) {
      onChange({
        ...info,
        banks: info.banks.map((b) => (b.id === existing.id ? { ...b, ...entry } : b)),
        pickedBanks: info.pickedBanks.includes(existing.id) ? info.pickedBanks : [...info.pickedBanks, existing.id],
      });
    } else {
      const id = newId();
      onChange({ ...info, banks: [...info.banks, { id, ...entry }], pickedBanks: [...info.pickedBanks, id] });
    }
    setBankDraft(emptyBank);
  };

  const removePhone = (id: string) =>
    onChange({ ...info, phones: info.phones.filter((p) => p.id !== id), pickedPhones: info.pickedPhones.filter((x) => x !== id) });
  const removeBank = (id: string) =>
    onChange({ ...info, banks: info.banks.filter((b) => b.id !== id), pickedBanks: info.pickedBanks.filter((x) => x !== id) });

  return (
    <div className="payment-details">
      <div className="payment-details__head">
        <PhonePeLogo />
        <strong>PhonePe</strong>
        <span className="payment-details__hint">picked ones go on the picture</span>
      </div>
      <Select
        {...searchProps}
        mode="multiple"
        allowClear
        placeholder="Pick PhonePe numbers"
        aria-label="PhonePe numbers"
        value={info.pickedPhones}
        onChange={(ids: string[]) => onChange({ ...info, pickedPhones: ids })}
        getPopupContainer={() => document.body}
        style={{ width: "100%" }}
        options={info.phones.map((p) => ({ value: p.id, label: `${p.name ? `${p.name} — ` : ""}${p.number}` }))}
        optionRender={(option) => (
          <span className="payment-details__option">
            <span>{option.label}</span>
            <button
              type="button"
              className="payment-details__delete"
              aria-label={`Delete saved number ${option.label}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                removePhone(String(option.value));
              }}
            >
              <DeleteOutlined />
            </button>
          </span>
        )}
      />
      <div className="payment-details__add">
        <Input size="small" placeholder="Name" aria-label="PhonePe name" value={phoneDraft.name} onChange={(e) => setPhoneDraft({ ...phoneDraft, name: e.target.value })} />
        <Input
          size="small"
          inputMode="tel"
          maxLength={15}
          placeholder="Number"
          aria-label="PhonePe number"
          value={phoneDraft.number}
          onChange={(e) => setPhoneDraft({ ...phoneDraft, number: e.target.value.replace(/[^\d+ ]/g, "") })}
          onPressEnter={savePhone}
        />
        <Button size="small" onClick={savePhone} disabled={!phoneDraft.number.trim()}>
          Save number
        </Button>
      </div>

      <div className="payment-details__head payment-details__head--bank">
        <strong>Bank account</strong>
      </div>
      <Select
        {...searchProps}
        mode="multiple"
        allowClear
        placeholder="Pick bank accounts"
        aria-label="Bank accounts"
        value={info.pickedBanks}
        onChange={(ids: string[]) => onChange({ ...info, pickedBanks: ids })}
        getPopupContainer={() => document.body}
        style={{ width: "100%" }}
        options={info.banks.map((b) => ({ value: b.id, label: `${b.name ? `${b.name} — ` : ""}${b.account}` }))}
        optionRender={(option) => (
          <span className="payment-details__option">
            <span>{option.label}</span>
            <button
              type="button"
              className="payment-details__delete"
              aria-label={`Delete saved account ${option.label}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                removeBank(String(option.value));
              }}
            >
              <DeleteOutlined />
            </button>
          </span>
        )}
      />
      <div className="payment-details__bank">
        <Input size="small" placeholder="Name for this account" aria-label="Account label" value={bankDraft.name} onChange={(e) => setBankDraft({ ...bankDraft, name: e.target.value })} />
        <Input size="small" placeholder="Account holder name" aria-label="Account holder name" value={bankDraft.holder} onChange={(e) => setBankDraft({ ...bankDraft, holder: e.target.value })} />
        <Input
          size="small"
          inputMode="numeric"
          maxLength={20}
          placeholder="Account number"
          aria-label="Account number"
          value={bankDraft.account}
          onChange={(e) => setBankDraft({ ...bankDraft, account: e.target.value.replace(/\D/g, "") })}
        />
        <Input
          size="small"
          maxLength={11}
          placeholder="IFSC"
          aria-label="IFSC"
          value={bankDraft.ifsc}
          onChange={(e) => setBankDraft({ ...bankDraft, ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
        />
        <Input size="small" placeholder="Bank name" aria-label="Bank name" value={bankDraft.bank} onChange={(e) => setBankDraft({ ...bankDraft, bank: e.target.value })} />
        <Button size="small" onClick={saveBank} disabled={!bankDraft.account.trim()}>
          Save account
        </Button>
      </div>
    </div>
  );
};
