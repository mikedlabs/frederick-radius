import { redirect } from "next/navigation";

/**
 * /wheel was an alternate presentation of the same tool registry as Compass.
 * Keep old links useful without maintaining two competing wayfinding systems.
 */
export default function WheelPage() {
  redirect("/compass");
}
