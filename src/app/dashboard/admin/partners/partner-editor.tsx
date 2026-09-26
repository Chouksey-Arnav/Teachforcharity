"use client";
import { useState, useTransition } from "react";
import { Plus, Star } from "lucide-react";
import { savePartner, setCurrentPartner } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { ActionState } from "@/lib/errors";
import type { Database } from "@/lib/database.types";

type Partner = Database["public"]["Tables"]["partners"]["Row"];

function Form({ p, onDone }: { p?: Partner; onDone?: () => void }) {
  const [v, setV] = useState({
    name: p?.name ?? "",
    short_name: p?.short_name ?? "",
    cause_title: p?.cause_title ?? "",
    cause_description: p?.cause_description ?? "",
    donation_url: p?.donation_url ?? "",
    website_url: p?.website_url ?? "",
    partnership_confirmed: p?.partnership_confirmed ?? false,
  });
  const [res, setRes] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await savePartner({ id: p?.id, ...v });
          setRes(r);
          if (r?.ok) onDone?.();
        });
      }}
    >
      <Field label="Nonprofit name" htmlFor={`n-${p?.id}`}><Input id={`n-${p?.id}`} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <Field label="Short name" htmlFor={`s-${p?.id}`} optional><Input id={`s-${p?.id}`} value={v.short_name} onChange={(e) => setV({ ...v, short_name: e.target.value })} /></Field>
      <Field label="Current cause" htmlFor={`c-${p?.id}`} className="sm:col-span-2"><Input id={`c-${p?.id}`} value={v.cause_title} onChange={(e) => setV({ ...v, cause_title: e.target.value })} /></Field>
      <Field label="About the cause" htmlFor={`d-${p?.id}`} className="sm:col-span-2"><Textarea id={`d-${p?.id}`} value={v.cause_description} onChange={(e) => setV({ ...v, cause_description: e.target.value })} rows={3} maxLength={2000} /></Field>
      <Field label="Donation page (their site)" htmlFor={`u-${p?.id}`} optional><Input id={`u-${p?.id}`} value={v.donation_url} onChange={(e) => setV({ ...v, donation_url: e.target.value })} placeholder="https://" /></Field>
      <Field label="Website" htmlFor={`w-${p?.id}`} optional><Input id={`w-${p?.id}`} value={v.website_url} onChange={(e) => setV({ ...v, website_url: e.target.value })} placeholder="https://" /></Field>
      <div className="sm:col-span-2">
        <Checkbox checked={v.partnership_confirmed} onChange={(e) => setV({ ...v, partnership_confirmed: e.target.checked })} label="Partnership confirmed" description="Turn on only once the nonprofit has formally agreed to partner." />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" pending={pending}>{p ? "Save" : "Add partner"}</Button>
        {res && (res.ok ? <span className="text-sm text-pine-800">{res.message}</span> : <Notice tone="danger" className="py-2">{res.error.message}</Notice>)}
      </div>
    </form>
  );
}

export function PartnerEditor({ partners }: { partners: Partner[] }) {
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-5">
      {partners.map((p) => (
        <section key={p.id} className="rounded-2xl border border-line bg-card p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{p.name}</h2>
              {p.is_current && <Badge tone="pine"><Star className="size-3" /> Current</Badge>}
              {!p.partnership_confirmed && <Badge tone="brass">Not confirmed</Badge>}
            </div>
            {!p.is_current && (
              <Button size="sm" variant="secondary" pending={pending} onClick={() => start(async () => void (await setCurrentPartner(p.id)))}>
                Make current
              </Button>
            )}
          </div>
          <Form p={p} />
        </section>
      ))}
      {adding ? (
        <section className="rounded-2xl border border-dashed border-line-2 bg-card p-5 sm:p-6">
          <h2 className="mb-5 text-lg font-semibold">New partner</h2>
          <Form onDone={() => setAdding(false)} />
        </section>
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add another partner
        </Button>
      )}
    </div>
  );
}
