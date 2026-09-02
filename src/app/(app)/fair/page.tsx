import { redirect } from "next/navigation";

/**
 * Short, spoken, and QR-friendly doorway into the current Fair guide.
 * Keep this temporary so the destination can move to the next year's moment
 * without browsers caching an old seasonal URL.
 */
export default function FairPage() {
  redirect("/moments/great-frederick-fair-2026");
}
