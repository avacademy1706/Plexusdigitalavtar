import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, X } from "lucide-react";
import { submitLead, validateLead, type Lead, type LeadErrors } from "../../services/leads";
import { analytics } from "../../services/analytics";

const EMPTY: Lead = { name: "", email: "", phone: "", company: "", requirement: "" };

const FIELDS: { key: keyof Lead; label: string; type: string; autoComplete: string; required: boolean }[] = [
  { key: "name", label: "Name", type: "text", autoComplete: "name", required: true },
  { key: "email", label: "Email", type: "email", autoComplete: "email", required: true },
  { key: "phone", label: "Phone", type: "tel", autoComplete: "tel", required: true },
  { key: "company", label: "Company", type: "text", autoComplete: "organization", required: false },
];

export function LeadForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [lead, setLead] = useState<Lead>(EMPTY);
  const [errors, setErrors] = useState<LeadErrors>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      analytics.track("lead_form_opened");
    }
    if (!open && d.open) d.close();
  }, [open]);

  const close = () => {
    onClose();
    setTimeout(() => {
      setDone(false);
      setErrors({});
    }, 250);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateLead(lead);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    await submitLead(lead);
    setBusy(false);
    analytics.track("lead_submitted");
    setLead(EMPTY);
    setDone(true);
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={close}
      onClick={(e) => e.target === dialogRef.current && close()}
      aria-labelledby="lead-title"
      className="m-auto w-[min(92vw,30rem)] rounded-3xl border border-white/10 bg-charcoal p-0 text-white backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="lead-title" className="text-xl font-semibold">
              Talk to Our Team
            </h2>
            <p className="mt-1 text-xs text-softgray">Demo form: details stay in this browser only and are not sent anywhere.</p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="rounded-full p-1.5 text-softgray hover:bg-white/10">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
            <CheckCircle2 className="size-10 text-plexus-orange" aria-hidden />
            <p className="font-medium">Thanks - we've noted your request.</p>
            <p className="text-sm text-softgray">In the live version, the Plexus Digitals team will reach out shortly.</p>
            <button type="button" onClick={close} className="mt-2 rounded-full bg-plexus-orange px-6 py-2.5 text-sm font-semibold text-black">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-3">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label htmlFor={`lead-${f.key}`} className="mb-1 block text-xs text-softgray">
                  {f.label}
                  {f.required && " *"}
                </label>
                <input
                  id={`lead-${f.key}`}
                  type={f.type}
                  autoComplete={f.autoComplete}
                  value={lead[f.key]}
                  aria-invalid={Boolean(errors[f.key])}
                  aria-describedby={errors[f.key] ? `lead-${f.key}-err` : undefined}
                  onChange={(e) => setLead({ ...lead, [f.key]: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm focus:border-plexus-orange/60 focus:outline-none"
                />
                {errors[f.key] && (
                  <p id={`lead-${f.key}-err`} className="mt-1 text-xs text-red-300">
                    {errors[f.key]}
                  </p>
                )}
              </div>
            ))}
            <div>
              <label htmlFor="lead-requirement" className="mb-1 block text-xs text-softgray">
                Requirement *
              </label>
              <textarea
                id="lead-requirement"
                rows={3}
                value={lead.requirement}
                aria-invalid={Boolean(errors.requirement)}
                onChange={(e) => setLead({ ...lead, requirement: e.target.value })}
                className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm focus:border-plexus-orange/60 focus:outline-none"
              />
              {errors.requirement && <p className="mt-1 text-xs text-red-300">{errors.requirement}</p>}
            </div>
            <button
              type="submit"
              disabled={busy}
              className="mt-1 min-h-11 rounded-full bg-plexus-orange text-sm font-semibold text-black transition-colors hover:bg-plexus-orange-soft disabled:opacity-60"
            >
              {busy ? "Sending..." : "Talk to Our Team"}
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
}
