import { notFound } from "next/navigation";

/** The modal reset can match alone; it must not make unknown URLs valid. */
export default function DefaultAppChildren() {
  notFound();
}
