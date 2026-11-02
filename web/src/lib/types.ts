// Shared client/server types mirroring backend schemas (OpenAPI is the source of truth).

export type Locale = "ar" | "en";

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface User {
  id: string;
  phone: string;
  full_name: string | null;
  email?: string | null;
  city?: string | null;
  language: string;
  status: string;
  verification_status: string;
  account_type?: string;
  verification_level?: string;
  created_at?: string | null;
}

export interface AuthVerify {
  tokens: TokenPair;
  user: User;
}

export interface OtpRequest {
  message: string;
  expires_in: number;
  dev_code?: string | null;
}

export interface Location {
  id: string;
  level: "governorate" | "city" | "district";
  name_ar: string;
  name_en: string;
}

export interface Geo {
  latitude: number;
  longitude: number;
  accuracy_m: number;
}

export interface Media {
  id: string;
  type: string;
  url: string;
  thumb_url: string | null;
  sort_order: number;
}

export interface SearchItem {
  id: string;
  title: string;
  property_type: string;
  rental_type: string;
  furnished: string;
  rent_monthly: number;
  area_m2: number;
  bedrooms: number;
  bathrooms: number;
  floor: number | null;
  governorate_id: string;
  city_id: string;
  district_id: string | null;
  address_text: string;
  geo: Geo;
  available_from: string | null;
  thumb_url: string | null;
  trust_level?: string | null;
  verified_owner?: boolean;
  trust_label_ar?: string | null;
  office_name_ar?: string | null;
  is_featured?: boolean;
  created_at: string | null;
}

export interface SearchResult {
  items: SearchItem[];
  next_cursor: string | null;
  limit: number;
}

export interface ListingDetail {
  id: string;
  owner_id: string;
  title: string;
  property_type: string;
  rental_type: string;
  furnished: string;
  rent_monthly: number;
  deposit_months: number;
  area_m2: number;
  bedrooms: number;
  bathrooms: number;
  floor: number | null;
  has_elevator: boolean;
  finishing: string | null;
  building_age: number | null;
  amenities: Record<string, boolean>;
  description: string;
  governorate_id: string;
  city_id: string;
  district_id: string | null;
  address_text: string;
  geo: Geo;
  available_from: string | null;
  min_term_months: number;
  status?: string | null;
  reject_reason?: string | null;
  view_count?: number | null;
  verified_badge: boolean;
  trust?: TrustOut | null;
  office?: { id: string; slug: string; name_ar: string; name_en: string; verification_status: string } | null;
  agent?: { id: string; full_name: string } | null;
  is_featured?: boolean;
  is_owner: boolean;
  days_left?: number | null;
  owner_name?: string | null;
  media: Media[];
  created_at?: string | null;
  published_at?: string | null;
}

export interface ContactInfo {
  phone: string;
  full_name: string | null;
  channel: string;
}

export interface ReportOut {
  id: string;
  listing_id: string;
  reason: string;
  status: string;
  created_at: string | null;
}

export interface MeStats {
  view_count: number;
  contact_count: number;
  days_left: number | null;
}

export interface MeListing {
  id: string;
  title: string;
  status: string;
  reject_reason: string | null;
  rent_monthly: number;
  property_type: string;
  governorate_id: string;
  city_id: string;
  district_id: string | null;
  governorate_name: string | null;
  city_name: string | null;
  thumb_url: string | null;
  stats: MeStats;
  created_at: string | null;
  published_at: string | null;
}

export interface Plan {
  id: string;
  name: string;
  price_egp: number;
  duration_days: number;
  priority_weight: number;
}

export interface BankInstructions {
  bank_name: string;
  account_name: string;
  account_number: string;
  iban: string;
  swift: string;
  reference: string;
}

export interface Order {
  id: string;
  listing_id: string;
  weeks: number;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
  method: string;
  gateway: string | null;
  gateway_ref: string | null;
  expires_at: string | null;
  paid_at: string | null;
  created_at: string | null;
  bank_instructions: BankInstructions | null;
  plan_id: string | null;
  checkout_url: string | null;
  payment_reference: string | null;
  receipt_ready: boolean;
}

export interface OrdersPage {
  items: Order[];
  next_cursor: string | null;
  limit: number;
}

export interface PromoValidate {
  valid: boolean;
  code: string;
  discount: number;
  subtotal: number;
  total: number;
  message: string | null;
}

export interface BankReceipt {
  order_id: string;
  status: string;
  receipt_url: string | null;
  reject_reason: string | null;
}

export interface Verification {
  id: string;
  doc_type: string;
  status: string;
  reject_reason: string | null;
  file_url: string | null;
  created_at: string | null;
  reviewed_at: string | null;
}

export interface VerificationList {
  items: Verification[];
  user_verification_status: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  channel: string;
  read_at: string | null;
  created_at: string | null;
}

export interface NotificationsPage {
  items: AppNotification[];
  next_cursor: string | null;
  limit: number;
  unread_count: number;
}

export interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

// Phase 5 — pricing, plans, offices, trust.
export interface TrustBadge {
  code: string;
  label_ar: string;
  label_en: string;
}
export interface TrustOut {
  level: string;
  rank: number;
  label_ar: string;
  label_en: string;
  verified_owner: boolean;
  badges: TrustBadge[];
  documents_reviewed: number;
  note_ar: string;
  note_en: string;
}
export interface AdPackage {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  weeks: number;
  discount_pct: number;
  subtotal: number;
  discount: number;
  total: number;
  priority_weight: number;
  is_featured: boolean;
}
export interface SubscriptionPlan {
  id: string;
  code: string;
  audience: "individual" | "office";
  name_ar: string;
  name_en: string;
  monthly_price_egp: number;
  listing_limit: number;
  seats: number;
  priority_weight: number;
  features: Record<string, boolean>;
  active: boolean;
}
export interface Pricing {
  currency: string;
  weekly_ad: { id: string; price_egp: number; duration_days: number; priority_weight: number };
  ad_plans: { id: string; name: string; price_egp: number; duration_days: number; priority_weight: number }[];
  packages: AdPackage[];
  subscriptions: SubscriptionPlan[];
  principles: Record<string, boolean | string>;
}
export interface OfficeProfile {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  city: string | null;
  public_phone: string;
  public_email: string | null;
  website: string | null;
  verification_status: string;
  verified_at: string | null;
  trust: TrustOut | null;
  logo_url?: string | null;
}
