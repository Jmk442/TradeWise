import axios from "axios";
import { formatDistanceToNow } from "date-fns";

export const api = axios.create({ baseURL: `${process.env.REACT_APP_BACKEND_URL}/api`, timeout: 120000 });

export const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => `${x.loc?.slice(-1)[0]}: ${x.msg}`).join("; ");
  return "Could not reach TradeWise. Check your connection and try again.";
};

export const money = (v, cur = "USD") => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency", currency: cur || "USD", maximumFractionDigits: Math.abs(v) < 1 && v !== 0 ? 4 : 2,
  }).format(v);
};

export const signedMoney = (v, cur) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${money(v, cur)}`);
export const pct = (v) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`);
export const tone = (v) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "text-muted-foreground");

export const ago = (iso) => {
  if (!iso) return "time unknown";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${formatDistanceToNow(d)} ago`;
};

export const stamp = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: SYD })} Syd`;
};

export const SYD = "Australia/Sydney";

export const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
export const currencyOf = (market) => (market === "ASX" ? "AUD" : "USD");
