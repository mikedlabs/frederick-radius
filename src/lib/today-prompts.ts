export type TodayPrompt = { label: string; query: string };

type PromptContext = {
  hour: number;
  temperature?: number | null;
  shortForecast?: string | null;
  precipitation?: number | null;
};

const ASK = {
  breakfast: { label: "Breakfast nearby", query: "Where can I get a good breakfast sandwich near me?" },
  coffee: { label: "Coffee nearby", query: "Find a good independent coffee shop near me" },
  lunch: { label: "Easy lunch", query: "Where should I go for an easy local lunch nearby?" },
  indoor: { label: "Indoor nearby", query: "What is something good to do indoors near me right now?" },
  coolDinner: { label: "Cool dinner later", query: "Plan an easy dinner somewhere cool and comfortable tonight" },
  water: { label: "Drinking water nearby", query: "Where is the nearest public drinking water point?" },
  rainy: { label: "Rainy-day plan", query: "Plan a fun rainy-day outing nearby" },
  dinner: { label: "Dinner nearby", query: "Find a good local dinner near me tonight" },
  tonight: { label: "What’s on tonight", query: "What events are happening tonight?" },
  date: { label: "Build a date night", query: "Plan a walkable 3 hour date night" },
  afternoon: { label: "Easy afternoon", query: "Plan an easy 3 hour afternoon, surprise me" },
} satisfies Record<string, TodayPrompt>;

export function todayPrompts({ hour, temperature, shortForecast, precipitation }: PromptContext): TodayPrompt[] {
  const forecast = (shortForecast ?? "").toLowerCase();
  const wet = (precipitation ?? 0) >= 45 || /rain|shower|storm|drizzle/.test(forecast);
  const hot = (temperature ?? -Infinity) >= 90;

  if (hot) return [ASK.indoor, ASK.water, ASK.coolDinner];
  if (wet) return [ASK.indoor, ASK.rainy, ASK.dinner];
  if (hour >= 17 || hour < 2) return [ASK.dinner, ASK.tonight, ASK.date];
  if (hour < 11) return [ASK.breakfast, ASK.coffee, ASK.afternoon];
  if (hour < 14) return [ASK.lunch, ASK.coffee, ASK.afternoon];
  return [ASK.afternoon, ASK.tonight, ASK.dinner];
}
