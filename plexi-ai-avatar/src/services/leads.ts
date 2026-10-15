/**
 * DEMO lead capture. Data is validated and stored ONLY in this browser's localStorage.
 * Nothing is sent to any server. For production, implement `LeadSink` against the
 * Plexus CRM / DGCC backend and replace the active sink via `setLeadSink`.
 */
export interface Lead {
  name: string;
  email: string;
  phone: string;
  company: string;
  requirement: string;
}

export type LeadErrors = Partial<Record<keyof Lead, string>>;

export interface LeadSink {
  submit(lead: Lead): Promise<void>;
}

const STORAGE_KEY = "plexi.demo.leads";

const localDemoSink: LeadSink = {
  async submit(lead) {
    try {
      const existing: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      const list: unknown[] = Array.isArray(existing) ? existing : [];
      list.push({ ...lead, createdAt: new Date().toISOString() });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-20)));
    } catch {
      /* storage unavailable - still treat the demo submit as successful */
    }
  },
};

// FUTURE: replace with a CRM / DGCC / backend sink.
let activeSink: LeadSink = localDemoSink;
export const setLeadSink = (sink: LeadSink): void => {
  activeSink = sink;
};

export function validateLead(lead: Lead): LeadErrors {
  const errors: LeadErrors = {};
  if (lead.name.trim().length < 2) errors.name = "Please enter your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email.trim())) errors.email = "Enter a valid email address.";
  if (!/^[+\d][\d\s()-]{6,17}$/.test(lead.phone.trim())) errors.phone = "Enter a valid phone number.";
  if (lead.requirement.trim().length < 5) errors.requirement = "Tell us briefly what you need.";
  return errors;
}

export const submitLead = (lead: Lead): Promise<void> => activeSink.submit(lead);
