import { parseFairPracticalAnswers } from "@/lib/fair/practical-answers";

const CHECKED_AT = "2026-09-01T20:58:08Z";
const ACCESS_CHECKED_AT = "2026-09-02T13:21:52-04:00";

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

const fairAccessFaq = {
  ...fairFaq,
  checkedAt: ACCESS_CHECKED_AT,
};

const fairGrandstand = {
  publisher: "The Great Frederick Fair",
  label: "Official Grandstand guide",
  url: "https://thegreatfrederickfair.com/grandstand/",
  checkedAt: ACCESS_CHECKED_AT,
};

const fairAccessCarnival = {
  ...fairCarnival,
  checkedAt: ACCESS_CHECKED_AT,
};

const fairAccessGuestServices = {
  ...fairGuestServices,
  checkedAt: ACCESS_CHECKED_AT,
};

const fairAccessPolicies = {
  ...fairPolicies,
  checkedAt: ACCESS_CHECKED_AT,
};

const marylandRelay = {
  publisher: "Frederick County Government",
  label: "Maryland Relay information",
  url: "https://frederickcountymd.gov/3536/Relay-Services",
  checkedAt: ACCESS_CHECKED_AT,
};

const federalServiceAnimalGuidance = {
  publisher: "U.S. Department of Justice",
  label: "Federal service-animal guidance",
  url: "https://www.ada.gov/resources/service-animals-2010-requirements/",
  checkedAt: ACCESS_CHECKED_AT,
};

export const greatFrederickFair2026PracticalAnswers =
  parseFairPracticalAnswers([
    {
      id: "fair-answer-easy-to-miss",
      category: "arrival",
      question: "What is easiest to miss before I leave?",
      answer:
        "Adult admission is $10 online or $15 at the gate. Parking is separate: Lots A through D are $10 cash only, while Gate 3 infield parking is $15 and accepts cash or a credit card. The official gate-admission page says Apple Pay is not accepted. An advance Grandstand entertainment ticket includes Fair admission, but not parking. The current official pages do not clearly confirm re-entry, so ask at the gate before leaving the grounds.",
      evidence: "verified-official",
      usefulBefore: ["leave-home", "park", "enter", "leave"],
      sources: [fairFaq, fairVisit, fairConcert, fairPolicies],
      action: { label: "Open official visitor information", url: fairVisit.url },
    },
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
      id: "fair-answer-asl-grandstand",
      category: "accessibility",
      question: "Where can I see the ASL interpreter at Grandstand shows?",
      answer:
        "The Fair confirms an ASL interpreter for every evening musical Grandstand performance. The interpreter is audience-left. Track Right and Grandstand sections C through F have the best view; the Fair labels limited ASL seating in Track Right, rows 6 and 7, seats 6 through 15. Call the Ticket Office at 301-695-3928 before buying. Wheelchair seating is separate and may not face the interpreter.",
      evidence: "verified-official",
      usefulBefore: ["leave-home", "enter", "inside"],
      sources: [fairAccessFaq, fairGrandstand],
      action: { label: "Open the official Grandstand guide", url: fairGrandstand.url },
    },
    {
      id: "fair-answer-access-contact",
      category: "accessibility",
      question: "Who can help me arrange access before I visit?",
      answer:
        "For general accessibility arrangements, the Fair lists Administration at 301-663-5895. For Grandstand seating, ASL, or help for a guest who is blind or hard of hearing, call the Ticket Office at 301-695-3928. If a voice call is not accessible, Maryland Relay is available at 711 or 800-735-2258. The Fair does not publish an accommodation text or email channel.",
      evidence: "verified-official",
      usefulBefore: ["leave-home", "enter"],
      sources: [fairAccessFaq, fairGrandstand, marylandRelay],
      action: { label: "Check the official Fair FAQ", url: fairAccessFaq.url },
    },
    {
      id: "fair-answer-mobility-help",
      category: "accessibility",
      question: "What mobility help is available?",
      answer:
        "Accessible parking is first come, with the required vehicle placard or plate. A free ADA shuttle runs from Lot D at Monocacy Boulevard to Gate 4A. Mobility scooters, wheelchairs, and strollers are rented between Buildings 12 and 13, subject to availability, and a driver's license is required.",
      evidence: "verified-official",
      usefulBefore: ["leave-home", "park", "inside", "leave"],
      sources: [fairAccessFaq, fairAccessGuestServices],
      action: { label: "Check official accessibility details", url: fairAccessFaq.url },
    },
    {
      id: "fair-answer-sensory-friendly-carnival",
      category: "accessibility",
      question: "When is the sensory-friendly carnival period?",
      answer:
        "On Sunday, September 20, 2026, from noon to 2 p.m., the carnival turns down its lights and music. Regular ride prices and wristband rules still apply. This is a two-hour carnival-area window, not a promise that the full fairground will be low-sensory.",
      evidence: "verified-official",
      usefulBefore: ["leave-home", "inside"],
      sources: [fairAccessCarnival],
      action: { label: "Open official sensory-friendly details", url: fairAccessCarnival.url },
    },
    {
      id: "fair-answer-service-animal",
      category: "accessibility",
      question: "Can I bring a service animal?",
      answer:
        "Yes. The Fair's admission policy permits a service animal trained to perform work or tasks for a person with a disability; pets are otherwise prohibited. Federal ADA guidance says certification, identification, or training documents cannot be required. The Fair does not publish a relief or water-area location.",
      evidence: "verified-official",
      usefulBefore: ["leave-home", "enter", "inside"],
      sources: [fairAccessPolicies, federalServiceAnimalGuidance],
      action: { label: "Read the official admission policy", url: fairAccessPolicies.url },
    },
    {
      id: "fair-answer-sensory-space",
      category: "accessibility",
      question: "Is there a permanent quiet or sensory room?",
      answer:
        "The reviewed official Fair pages do not identify a permanent quiet room, sensory kits, or a re-entry policy for sensory breaks. Do not assume the Family Care Station is a quiet room; the Fair describes it as a nursing and changing area. The confirmed sensory option is the carnival's Sunday noon-to-2 p.m. reduced-light-and-music period.",
      evidence: "not-confirmed",
      usefulBefore: ["leave-home", "inside", "leave"],
      sources: [fairAccessFaq, fairAccessGuestServices, fairAccessCarnival],
      action: { label: "Open official guest services", url: fairAccessGuestServices.url },
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
