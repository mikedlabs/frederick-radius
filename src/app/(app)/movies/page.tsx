import { redirect } from "next/navigation";

/**
 * Keep the old, shareable movies door alive while the native cinema picker
 * lives in the shared nearby experience.
 */
export default function MoviesPage() {
  redirect("/nearby?c=movies");
}
