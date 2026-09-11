/**
 * Dear Frederick, the community letter project, brought into the app.
 *
 * People mail handwritten letters about Frederick to a PO box; the scans
 * are the content (the handwriting is the whole point), and each carries a
 * faithful transcription for accessibility, search, and readers who prefer
 * text. Curated, published letters live here as data (the same posture as
 * collections and event seeds); new digital submissions land in the database
 * and are promoted here once approved.
 *
 * Source scans and transcriptions pulled from the original dear-frederick
 * site (owner-provided, 2026-07); optimized copies live in
 * public/dear-frederick/. Unpublished submissions must never enter this static
 * module or the public asset tree.
 */
export type Letter = {
  number: number;
  title: string;
  slug: string;
  /** Optimized scan under public/dear-frederick/. */
  image: string;
  /** Intrinsic pixels of the optimized scan (prevents layout shift). */
  width: number;
  height: number;
  orientation: "portrait" | "landscape";
  /** How the writer signed off, in a display-ready label. */
  signature: string;
  /** Best-effort date the letter carries (YYYY, YYYY-MM, or YYYY-MM-DD); null when none. */
  receivedOn: string | null;
  /** Shown only when true. Unpublished letters stay outside the source tree. */
  published: boolean;
  /** One plain sentence describing the scan, for image alt text. */
  alt: string;
  /** The faithful transcription, one entry per line/paragraph of the letter. */
  body: string[];
};

export const LETTERS: readonly Letter[] = [
  {
    number: 1,
    title: "Who are we?",
    slug: "who-are-we",
    image: "/dear-frederick/01-who-are-we.jpg",
    width: 1091,
    height: 1600,
    orientation: "landscape",
    signature: "Anonymous",
    receivedOn: null,
    published: true,
    alt: "A handwritten note inside a Christmas dove greeting card describing a mother visiting her daughter near Frederick, falling for downtown, and both of them eventually moving to the Lake Linganore area.",
    body: [
      "Hi,",
      "My daughter moved to Greencastle, PA in 2014. A very sleepy town. I visited her in 2015 summer and we drove to downtown Frederick. We walked along the canal and ate at Ayse Meze Lounge for hummus + falafel. I remember standing out on a corner and saying \"Wouldn't it be great if you could live here in such a beautiful community. The restaurant is now closed but it happened! My daughter got married in 2021 and bought a house in Lake Linganore + we bought a condo in Springwater. So now we both live here and we love it! I'm sorry we don't have any history information - we just love it here! Have fun collecting all of these letters!",
    ],
  },
  {
    number: 2,
    title: "Letting go",
    slug: "letting-go",
    image: "/dear-frederick/02-letting-go.jpg",
    width: 1600,
    height: 1148,
    orientation: "landscape",
    signature: "Signed with an initial and a small heart",
    receivedOn: "2025-01",
    published: true,
    alt: "A handwritten letter recalling a sentimental 2016 moment at Baker Park and the creek, when the writer and her now-husband threw away keepsakes from past relationships.",
    body: [
      "Jan 2025",
      "Dear Frederick,",
      "During my first visit to Frederick, or at least the first time I can remember, I had no idea how sentimental this place would be. In 2016, my boyfriend (now husband) and I went to Baker Park so I could take photos for my college photography class.",
      "While walking through the park, we then ended up at the creek. I'm sure it might've smelled some, but we sat by the water with our feet dangling. I think we have only been dating a few months at the time, but in that moment, we did something very sentimental. I don't know what sparked it but little did we know, we both were unintentionally holding onto something from our past relationships. I had an old bracelet that my ex had made me still in my wallet and he still had his ex girlfriend's house key. Now, again, I don't remember much of how it happened, but while we were sitting there, we threw them both in the creek (slightly littering... so sorry).",
      "Every time I walk past that part of the creek or think about it, it just makes me think, life is so weird sometimes. Now, being together for 8 years and going, currently working and living in Frederick, I never would have thought that this place would mean that much to me. That one town can have such a meaningful core memory that I will tell our kids and kids kids about.",
      "Though I wouldn't be living here forever, I will always think of this place as somewhere special in my heart.",
      "Thanks for everything, Frederick!",
    ],
  },
  {
    number: 3,
    title: "Lost and Found",
    slug: "lost-and-found",
    image: "/dear-frederick/03-lost-and-found.jpg",
    width: 1600,
    height: 1176,
    orientation: "landscape",
    signature: "Signed, though the hand is illegible",
    receivedOn: "2025-01-02",
    published: true,
    alt: "A handwritten letter from a longtime Frederick real estate agent recalling moving to town in 1982, getting lost on the one-way streets, and coming to love the old streetscape.",
    body: [
      "1/2/2025",
      "DEAR FREDERICK,",
      "I GREW UP IN THE COUNTRY, IN A TOWN OF 800 PEOPLE WHICH STRADDLED THE FREDERICK/CARROLL COUNTY LINE. SO WHEN I MOVED TO FREDERICK IN 1982 TO LIVE WITH MY MOM AND ATTEND FCC, IT WAS NEW TO ME. I HAD BEEN HERE AS A CHILD, BUT MOSTLY TO THE MALLS, SO LIVING DOWNTOWN AND GETTING AROUND - LET'S JUST SAY IT TOOK A WHILE TO GET USED TO THE ONE-WAY STREETS, SO MUCH SO THAT EVEN AFTER LIVING HERE A YEAR, I GOT LOST ON THE WAY TO MY BROTHER'S WEDDING. AND I WAS BEST MAN.",
      "BASED ON MY INABILITY TO NAVIGATE THE CITY STREETS, YOU WOULD HAVE NEVER PREDICTED THAT I WOULD SOON EMBARK ON A LONG SUCCESSFUL CAREER SELLING FREDERICK REAL ESTATE.",
      "I LEARNED TO GET AROUND TOWN BY SEVERAL LANDMARKS - GRIFF'S LANDING ON SOUTH MARKET TO THE CITY ROOM ON THE NORTH END, EAST TO P.J.'S CARRY OUTS AND WEST TO HANDBALLS AND PLAYERS.",
      "FAST FORWARD 40 YEARS - I'M STILL SELLING REAL ESTATE IN THE NEIGHBORHOODS AND COMMERCIAL AREAS OF FREDERICK. JUST ABOUT EVERY DAY I CAN BE FOUND WALKING ALONG CARROLL CREEK, THROUGH BAKER PARK AND DOWN THE STREET AND ALLEYS. ON ALMOST EVERY WALK I DISCOVER SOME ARCHITECTURAL TREASURE IN THE 200 YEAR OLD STREETSCAPE, SOMETHING I HAVE NEVER NOTICED BEFORE. THAT IS WHAT MAKES FREDERICK SPECIAL.",
      "WITH KINDNESS, PEACE & LOVE)",
    ],
  },
  {
    number: 4,
    title: "Silent belonging",
    slug: "silent-belonging",
    image: "/dear-frederick/04-silent-belonging.jpg",
    width: 1131,
    height: 1600,
    orientation: "portrait",
    signature: "A Little Bit Lonely",
    receivedOn: null,
    published: true,
    alt: "A handwritten letter from an anonymous writer who walks Frederick's streets daily, observing neighbors, trees and nature, and finding a quiet sense of home in simply witnessing the town.",
    body: [
      "Dear Frederick,",
      "Every day I walk these streets, visiting my favorite doorways, gardens & trees. You know the ones- the gingko at Bentz & Dill, the giant gingko on Second, the willow by the creek, the huge ash on Market north of town, the magnolia grandifloras scattered around, all wheeling effortlessly through their seasons, I pass the overworked mothers, the endless parade of people obsessed with their dogs, the young people with their first loves, the retirees getting their steps in. I watch as properties change hands, renovations are made by the ubiquitous Anthony and his cigarettes. I pass the houses of the guy who loves ultimate frisbee, the well-traveled immunologist, the centenarian, the stained glass artist, the drone photographer, the guy who works for the NSA, the gay couple with the gorgeous garden, the cabinet-maker, the hustling immigrant, the hopeful shopkeepers, the alcoholics, the chronically ill. Between the rich lady doing charity work and the unhoused man down on his luck, a world unfolds.",
      "I spent a lifetime wandering, looking for home, and in this town I finally found it. Not through community- nobody knows my name, and nobody asks-but through the opportunity to witness. You don't see me, but I see you, and I am witnessing the rise and fall of all of us against this cyclical backdrop, finding our places, pushing against or shrinking from our growing edges.",
      "Ten minutes out of town, walking through the battlefields with only the deer and cows for company, I discover the eagle's nest at the edge of a beech forest. I check for bones beneath it, among the starflowers carpeting the ground in the spring. I watch the honeysuckle and cheatgrass emerge every spring to slowly overtake everything that lives. I visit the spot with all the violets, and the best places to find nettles and bluebells and blacksnakes living in the hollows of trees. Not too big, not too small, not too tight, not too loose, not too city mouse, not too country mouse-Frederick, you're just right for me. In the ebb and flow and push and pull and rise and fall of a hundred-thousand human waves- I watch, and witness, and love it all, with gratitude.",
      "Love, A Little Bit Lonely- you'll find me talking to the trees, I guess. Thanks, Frederick, for the perennial teaching. xx",
    ],
  },
  {
    number: 5,
    title: "Safe haven",
    slug: "safe-haven",
    image: "/dear-frederick/05-safe-haven.jpg",
    width: 1600,
    height: 1132,
    orientation: "landscape",
    signature: "Anonymous",
    receivedOn: null,
    published: true,
    alt: "A handwritten letter addressed to Frederick as a safe haven, from a single mother who left and returned in 2023 during a divorce and found healing and good memories for her children.",
    body: [
      "Dear Frederick:",
      "Hi it's me again. We have said goodbye a time or two before so maybe this is goodbye for now.",
      "I want to make sure I say thank you this time. You have been good to me. You were always good to me but I couldn't see it the other times.",
      "You have been my safe haven. A place of new beginnings and necessary endings. A place of redemption, revival and transformation. Hopefully when I left, I made room for someone else to experience you the way I have.",
      "My mom came to Frederick in the early 90s as a single mother. You welcomed us with open arms. You were smaller then and so was I. I loved you then and was so attached. When I had to leave you the first time I was heartbroken you were all I ever knew. I became a little bitter about it. Then I got taste of the big city and said I am never looking back.",
      "Then that big city chewed me up and spit me out. I was reluctant but you told me to come home and said welcome back. You also had a Wegmans, so I agreed to come back.",
      "I came back in 2023, as a newly single mother trying to make it through a divorce. You didn't hold it against me. You embraced me. You gave my kids beautiful memories in a time of distress.",
      "Through them I was able to look and remember that my childhood wasn't really all that bad. Good memories that I forgot came back. See I made the mistake of throwing out the good with the bad.",
      "You taught me not to do that. That the bad can be transformed and even redone. I became revitalized just like downtown.",
      "I knew this time together wasn't forever but thank you Frederick for welcoming me back. You were my green pastures and kept me safe through a storm. I hope some else gets to know you the way I have.",
      "From H mart on 40 to Baker Park to Walkersville. You are still beautiful Frederick. You will always have a special place in my heart and my now in my children's hearts.",
      "We have both grown so much and I know this isn't Good bye, this is Thank you Frederick..until we meet again.",
      "Anonymous",
    ],
  },
  {
    number: 7,
    title: "We have it all",
    slug: "we-have-it-all",
    image: "/dear-frederick/07-we-have-it-all.jpg",
    width: 1600,
    height: 1075,
    orientation: "landscape",
    signature: "Anonymous",
    receivedOn: "2025-02-25",
    published: true,
    alt: "A handwritten note on a floral notepad from a 65-year Frederick resident praising the town's natural beauty, seasons, medical care, colleges, artists and people, with a gentle nod to the traffic.",
    body: [
      "02/25/2025",
      "Dear Frederick,",
      "I've lived in Frederick and loved Frederick for 65 years. It's no wonder others have discovered what a wonderful place this is - and now we're bursting at the seams.",
      "We have it all - natural beauty, four distinct seasons and very few natural disasters. We're close to everything - some of the best medical care in the country, colleges and universities in the city and close by, and so many talented artists and musicians. And then there's the Ocean and the mountains. And the People are the best -",
      "We do need to work on the traffic!",
      "Thank you for this fun project you've launched and giving folks a chance to put pen to paper once again.",
    ],
  },
];

/** The letters that actually render, most recent (highest number) first. */
export const PUBLISHED_LETTERS: readonly Letter[] = LETTERS.filter(
  (l) => l.published,
)
  .slice()
  .sort((a, b) => b.number - a.number);

export function letterBySlug(slug: string): Letter | undefined {
  const l = LETTERS.find((x) => x.slug === slug);
  return l && l.published ? l : undefined;
}
