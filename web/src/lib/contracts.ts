// Phase-4 contract & handover client types (mirror backend schemas).

export interface ContractParty {
  id: string;
  role: "owner" | "tenant";
  full_name: string;
  phone: string;
  national_id_masked: string;
}

export interface ContractTerms {
  party_names: { owner: string; tenant: string };
  unit_address: string;
  start_date: string;
  duration_months: number;
  monthly_rent: number;
  yearly_increase_pct: number;
  deposit_amount: number;
  deposit_refund_days: number;
  payment_day: number;
  utilities_responsibility: string;
  termination_terms: string;
  extra_notes: string;
  listing_title?: string;
}

export interface ConfirmationEntry {
  party: string;
  user_id: string;
  at: string;
  ip: string;
  device: string;
  otp_verified: boolean;
}

export interface Contract {
  id: string;
  reference_no: string;
  listing_id: string;
  listing_title: string | null;
  template: string;
  status: string;
  terms: Partial<ContractTerms>;
  parties: ContractParty[];
  terms_hash: string | null;
  owner_confirmed_at: string | null;
  tenant_confirmed_at: string | null;
  confirmations_log: ConfirmationEntry[];
  fee_required: boolean;
  fee_amount: number;
  fee_order_id: string | null;
  fee_order_status: string | null;
  pdf_ready: boolean;
  can_edit: boolean;
  can_confirm: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface HandoverItem {
  label: string;
  condition: "good" | "needs_repair" | "damaged" | null;
  note: string;
}

export interface HandoverRoom {
  name: string;
  items: HandoverItem[];
}

export interface HandoverData {
  occurred_at?: string | null;
  rooms: HandoverRoom[];
  meters: Record<string, { value: string }>;
  keys_count?: number | null;
  inventory: HandoverItem[];
  comments?: Record<string, string>;
  created_by?: string;
}

export interface HandoverMedia {
  id: string;
  room: string;
  media_type: string;
  url: string;
  note: string | null;
  added_by: string | null;
}

export interface Handover {
  id: string;
  contract_id: string;
  contract_reference: string | null;
  kind: "check_in" | "check_out";
  status: string;
  data: HandoverData;
  source_handover_id: string | null;
  hash: string | null;
  media: HandoverMedia[];
  confirmations: Record<string, { party: string; at: string; ip: string; device: string; otp_verified: boolean }>;
  can_edit: boolean;
  can_confirm: boolean;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const ROOM_NAMES = [
  "living_room",
  "bedroom_1",
  "bedroom_2",
  "bedroom_3",
  "kitchen",
  "bathroom_1",
  "bathroom_2",
  "balcony",
  "other",
] as const;

export const METER_KEYS = ["electricity", "water", "gas"] as const;
export const CONDITIONS = ["good", "needs_repair", "damaged"] as const;

export function emptyHandoverData(): HandoverData {
  return {
    occurred_at: new Date().toISOString().slice(0, 10),
    rooms: [
      { name: "living_room", items: [] },
      { name: "kitchen", items: [] },
    ],
    meters: { electricity: { value: "" }, water: { value: "" }, gas: { value: "" } },
    keys_count: null,
    inventory: [],
    comments: {},
  };
}

/** Download an authenticated binary (PDF) as a file. */
export async function downloadAuthed(path: string, filename: string): Promise<void> {
  const { getAccess } = await import("@/lib/api");
  const token = getAccess();
  const res = await fetch(`/api/v1${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      msg = (await res.json()).message || msg;
    } catch {
      /* keep */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
