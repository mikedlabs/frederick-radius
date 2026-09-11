import { redirect } from "next/navigation";

/**
 * /find is retired. Send old bookmarks to the dedicated search surface instead
 * of the Today dashboard: the destination now matches the verb in the URL and
 * puts the search field first.
 *
 * We redirect rather than 404 so bookmarks and external links still work.
 */
export default function FindRedirect(): never {
  redirect("/search");
}
