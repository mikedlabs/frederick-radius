import { parseFairPracticalAnswers } from "@/lib/fair/practical-answers";

const CHECKED_AT = "2026-09-01T20:58:08Z";

const fairFaq = {
  publisher: "The Great Frederick Fair",
  label: "Official Fair FAQ",
  url: "https://thegreatfrederickfair.com/faq/",
  checkedAt: CHECKED_AT,
};

const fairVisit = {
  publisher: "The Great Frederick Fair",
  label: "Official 2026 visitor information",
  url: "https://thegreatfrederickfair.com/come-to-the-fair/",
  checkedAt: CHECKED_AT,
};

const fairCarnival = {
  publisher: "The Great Frederick Fair",
  label: "Official 2026 carnival information",
  url: "https://thegreatfrederickfair.com/the-carnival/",
  checkedAt: CHECKED_AT,
};

const fairConcert = {
  publisher: "The Great Frederick Fair",
  label: "Official concert guide",
  url: "https://thegreatfrederickfair.com/know-before-you-go/",
  checkedAt: CHECKED_AT,
};

const fairGuestServices = {
  publisher: "The Great Frederick Fair",
  label: "Official guest services",
  url: "https://thegreatfrederickfair.com/guest-services/",
  checkedAt: CHECKED_AT,
};

const fairPolicies = {
  publisher: "The Great Frederick Fair",
  label: "Official general admission policies",
  url: "https://thegreatfrederickfair.com/general-admission-policies/",
  checkedAt: CHECKED_AT,
};

export const greatFrederickFair2026PracticalAnswers =
  parseFairPracticalAnswers([
    {
      id: "fair-answer-parking-cash",
      category: "payment",
      question: "Do any parking lots require cash?",
      answer:
        "Lots A, B, C, and D cost $10 per vehicle and are cash only. Gate 3 infield parking costs $15 and accepts cash or a credit card. Regular parking is not sold in advance for 2026.",
      evidence: "verified-official",
      usefulBefore: ["leave-home", "park"],
      sources: [fairFaq, fairVisit],
      action: { label: "Check official parking details", url: fairVisit.url },
    },
    {
      id: "fair-answer-entertainment-ticket-entry",
      category: "concert",
      question: "Does an advance entertainment ticket include Fair admission?",
      answer:
        "Yes. Scan the advance entertainment ticket at the Fair gate, keep it available, and scan it again at the Grandstand entrance.",
      evidence: "verified-official",
      usefulBefore: ["leave-home", "enter"],
      sources: [fairFaq, fairConcert],
      action: { label: "Read the official concert guide", url: fairConcert.url },
    },
    {
      id: "fair-answer-missing-etix-ticket",
      category: "concert",
      question: "What should I do if I cannot find my Etix ticket?",
      answer:
        "Search your email and text messages for ETIX. The Fair Box Office can resend a ticket at 301-695-3928. For Will Call on a show day, the original purchaser must bring a government-issued ID.",
      evidence: "verified-official",
      usefulBefore: ["leave-home", "enter"],
      sources: [fairFaq, fairConcert],
      action: { label: "Open the official ticket guide", url: fairConcert.url },
    },
    {
      id: "fair-answer-bags-drinks-pets",
      category: "policy",
      question: "What can I bring through the gate?",
      answer:
        "Personal bags are allowed but may be searched. Outside drinks, coolers, and alcohol are prohibited. Pets are not permitted except service animals. Grandstand events have an additional security screening.",
      evidence: "verified-official",
      usefulBefore: ["leave-home", "enter"],
      sources: [fairFaq, fairConcert, fairPolicies],
      action: { label: "Read the official Fair FAQ", url: fairFaq.url },
    },
    {
      id: "fair-answer-child-ticket-ages",
      category: "family",
      question: "Which tickets do children need?",
      answer:
        "Children age 10 and under enter the Fair free. For a Grandstand concert, a child age 2 or younger does not need a separate ticket when sitting on an adult's lap. Children age 3 and older need a Grandstand ticket.",
      evidence: "verified-official",
      usefulBefore: ["leave-home", "enter"],
      sources: [fairFaq],
      action: { label: "Check the official Fair FAQ", url: fairFaq.url },
    },
    {
      id: "fair-answer-family-care",
      category: "family",
      question: "Where can a family handle nursing or diaper changes?",
      answer:
        "The Family Care Station is near Security, across from the Building 3 Administration office. The Fair says every restroom also has a diaper-changing station.",
      evidence: "verified-official",
      usefulBefore: ["inside"],
      sources: [fairFaq, fairGuestServices],
      action: { label: "Open official guest services", url: fairGuestServices.url },
    },
    {
      id: "fair-answer-lost-person-item",
      category: "safety",
      question: "Where do I go for a lost person or item?",
      answer:
        "Go to the Security Trailer at the midway entrance, across from the Building 3 Administration office. The Fair directs both lost people and lost property there.",
      evidence: "verified-official",
      usefulBefore: ["inside"],
      sources: [fairFaq],
      action: { label: "Open the official Fair FAQ", url: fairFaq.url },
    },
    {
      id: "fair-answer-mobility-help",
      category: "accessibility",
      question: "What mobility help is available?",
      answer:
        "Accessible parking is first come, with the required vehicle placard or plate. A free ADA shuttle runs from Lot D at Monocacy Boulevard to Gate 4A. Mobility scooters, wheelchairs, and strollers are rented between Buildings 12 and 13, subject to availability, and a driver's license is required.",
      evidence: "verified-official",
      usefulBefore: ["leave-home", "park", "inside", "leave"],
      sources: [fairFaq, fairGuestServices],
      action: { label: "Check official accessibility details", url: fairFaq.url },
    },
    {
      id: "fair-answer-ride-credits",
      category: "carnival",
      question: "Are ride credits, admission, and parking the same purchase?",
      answer:
        "No. Regular ride wristbands do not include Fair admission or parking. Individual ride credits go on a reloadable card with a one-time $2 initial-card fee. The advance Jack Pass combines one admission and one all-day ride wristband and is scanned once at the gate and once at the wristband office.",
      evidence: "verified-official",
      usefulBefore: ["leave-home", "enter", "inside"],
      sources: [fairCarnival, fairVisit],
      action: { label: "Read official carnival details", url: fairCarnival.url },
    },
    {
      id: "fair-answer-weather-shoes",
      category: "weather",
      question: "What should I wear, and does rain close the Fair?",
      answer:
        "Rain alone does not automatically close the Fair. Check the official site for weather updates before leaving. The Fair recommends low, closed-toe shoes and weather-appropriate layers, sun protection, or rain gear.",
      evidence: "verified-official",
      usefulBefore: ["leave-home"],
      sources: [fairFaq],
      action: { label: "Check the latest official update", url: fairFaq.url },
    },
    {
      id: "fair-answer-reentry",
      category: "policy",
      question: "Can I leave the Fair and come back on the same ticket?",
      answer:
        "The reviewed 2026 official visitor pages do not clearly state a re-entry policy. Ask at the gate before leaving, and do not rely on an old post or third-party guide for this decision.",
      evidence: "not-confirmed",
      usefulBefore: ["enter", "leave"],
      sources: [fairFaq, fairPolicies],
      action: { label: "Check the official Fair FAQ", url: fairFaq.url },
    },
  ]);
