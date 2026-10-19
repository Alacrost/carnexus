"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCustomer } from "./actions";

export function CreateCustomer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("individual");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [eircode, setEircode] = useState("");
  const [address, setAddress] = useState("");
  const [vat, setVat] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function save() {
    setError("");
    start(async () => {
      const res = await createCustomer({
        name,
        type: type as "individual" | "business",
        phone: phone || undefined,
        email: email || undefined,
        eircode: eircode || undefined,
        address_line1: address || undefined,
        vat_number: vat || undefined,
      });
      if (res.error) setError(res.error);
      else {
        setOpen(false);
        setName(""); setPhone(""); setEmail(""); setEircode(""); setAddress(""); setVat("");
        router.refresh();
      }
    });
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="btn-gradient">+ New contact</button>;
  }

  const inp = "mt-1 studio-input";
  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="my-4 w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0f17] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-medium text-slate-100">New contact</h2>
          <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white">✕</button>
        </div>
        <div className="grid gap-3">
          <label className="text-sm"><span className="text-slate-300">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className={inp}>
              <option value="individual">Individual</option>
              <option value="business">Business</option>
            </select></label>
          <label className="text-sm"><span className="text-slate-300">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inp} placeholder="Contact / business name" /></label>
          {type === "business" && (
            <label className="text-sm"><span className="text-slate-300">VAT number</span>
              <input value={vat} onChange={(e) => setVat(e.target.value)} className={inp} /></label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm"><span className="text-slate-300">Phone</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inp} /></label>
            <label className="text-sm"><span className="text-slate-300">Email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className={inp} /></label>
          </div>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <label className="text-sm"><span className="text-slate-300">Address</span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} className={inp} /></label>
            <label className="text-sm"><span className="text-slate-300">Eircode</span>
              <input value={eircode} onChange={(e) => setEircode(e.target.value)} className={inp} /></label>
          </div>
        </div>
        <button type="button" onClick={save} disabled={pending || name.trim().length < 2} className="btn-gradient mt-4 w-full disabled:opacity-50">
          {pending ? "Saving…" : "Save contact"}
        </button>
        {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
      </div>
    </div>
  );
}
