"use client";

import { useEffect } from "react";
import {
  decisionImpressionFromDataset,
  decisionTelemetryFromDatasets,
  trackDecision,
  type DecisionDataset,
} from "@/lib/decision/telemetry";

const IMPRESSION_SELECTOR = '[data-decision-impression="true"]';
const ACTION_SELECTOR = "[data-decision-action]";
const CONTEXT_SELECTOR = "[data-decision-surface]";

function dataFor(element: HTMLElement): DecisionDataset {
  return element.dataset;
}

function impressionKey(element: HTMLElement): string {
  const d = element.dataset;
  const path = typeof location === "undefined" ? "" : location.pathname;
  return [
    path,
    d.decisionSurface,
    d.decisionEntity,
    d.decisionId,
    d.decisionPosition,
  ].join("|");
}

/**
 * One delegated observer keeps telemetry out of the visual component tree.
 * Dynamic Ask cards and map sheets are discovered through MutationObserver;
 * impressions fire only after at least half the marked card is visible.
 */
export default function DecisionTelemetryObserver() {
  useEffect(() => {
    const seen = new Set<string>();
    const observed = new WeakSet<Element>();
    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue;
              const element = entry.target as HTMLElement;
              const key = impressionKey(element);
              if (seen.has(key)) {
                io?.unobserve(element);
                continue;
              }
              // Clickable cards carry decisionAction=open on the same element.
              // Strip action semantics here so visibility cannot masquerade as an
              // open; the delegated click handler below owns action measurement.
              const payload = decisionImpressionFromDataset(dataFor(element));
              if (payload) {
                seen.add(key);
                trackDecision(payload);
              }
              io?.unobserve(element);
            }
          }, { threshold: 0.5 });

    const observeWithin = (root: ParentNode) => {
      if (!io) return;
      const candidates: Element[] = [];
      if (root instanceof Element && root.matches(IMPRESSION_SELECTOR)) {
        candidates.push(root);
      }
      candidates.push(...root.querySelectorAll(IMPRESSION_SELECTOR));
      for (const candidate of candidates) {
        if (observed.has(candidate)) continue;
        observed.add(candidate);
        io.observe(candidate);
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const actionElement = target?.closest<HTMLElement>(ACTION_SELECTOR);
      if (!actionElement) return;
      const contextElement = actionElement.closest<HTMLElement>(CONTEXT_SELECTOR) ?? actionElement;
      const payload = decisionTelemetryFromDatasets(
        dataFor(actionElement),
        dataFor(contextElement),
      );
      if (payload) trackDecision(payload);
    };

    observeWithin(document);
    document.addEventListener("click", onClick, true);
    const mutations = io
      ? new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes) {
              if (node instanceof Element) observeWithin(node);
            }
          }
        })
      : null;
    if (mutations) {
      mutations.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      document.removeEventListener("click", onClick, true);
      mutations?.disconnect();
      io?.disconnect();
    };
  }, []);

  return null;
}
