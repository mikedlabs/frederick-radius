// @vitest-environment jsdom
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import EmergencyPage from "@/app/(app)/emergency/page";
import EmergencyVetPage from "@/app/(app)/emergency-vet/page";
import ContactsDirectory from "@/components/contacts/ContactsDirectory";
import { DEPARTMENTS } from "@/data/departments";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";

// Closed client-only sheets have no part in the directory’s server-rendered call links.
vi.mock("@/components/ui/BottomSheet", () => ({ default: () => null, SheetHandle: () => null }));

function renderPage(page: ReactElement) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(page);
  return root;
}

describe("urgent contact links", () => {
  it("shows the national Poison Control number and dials it with one country code on both directories", () => {
    for (const page of [<EmergencyPage key="emergency" />, <ContactsDirectory key="contacts" departments={DEPARTMENTS} tasks={[]} />]) {
      const root = renderPage(page);
      const link = root.querySelector('a[aria-label^="Call Poison Control"]');
      expect(link?.textContent).toContain("1-800-222-1222");
      expect(link?.getAttribute("href")).toBe("tel:+18002221222");
      expect(root.querySelector('a[href="tel:911"]')).not.toBeNull();
      expect(root.querySelector('a[href="tel:988"]')).not.toBeNull();
    }
  });

  it("shows the Toll House entrance, direct number and official clinic site from the published place", () => {
    const website = "https://www.frederickhealth.org/locations/frederick-health-toll-house-urgent-care/";
    const clinic = clientPlaceBySlug("frederick-health-urgent-care");
    expect(clinic).toMatchObject({ phone: "301-698-8374", address: "501 West 7th St, Suite 104", website });

    const root = renderPage(<EmergencyPage />);
    const section = root.querySelector('section[aria-label="Urgent care"]');
    const call = section?.querySelector('a[href="tel:+13016988374"]');
    expect(call?.textContent).toBe("301-698-8374");
    expect(call?.parentElement?.textContent).toContain("501 West 7th St, Suite 104, Frederick");
    expect(call?.parentElement?.querySelector(`a[href="${website}"]`)).not.toBeNull();
    expect(section?.querySelector('a[href="tel:+12405663300"]')).toBeNull();
  });

  it("pairs Mountain View's overnight hours with its call-first policy and the date checked", () => {
    const root = renderPage(<EmergencyVetPage />);
    const limited = root.querySelector('section[aria-label="Emergency rooms with limited hours"]');
    expect(limited?.querySelector("h2")?.textContent).toBe("Emergency rooms with limited hours");
    expect(limited?.textContent).toContain("Daily, 10 a.m. to 2 a.m.");
    expect(limited?.textContent).toContain("Call before you leave");
    expect(limited?.querySelector("time")?.dateTime).toBe("2026-11-24");
    expect(limited?.querySelector('a[href="tel:+13017337339"]')?.textContent).toContain("(301) 733-7339");
    expect(limited?.querySelector('a[href="https://mountainviewemergency.com/"]')).not.toBeNull();
    expect(limited?.textContent).not.toMatch(/midnight/i);
  });
});
