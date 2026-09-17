import { NextResponse, type NextRequest } from "next/server";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();

  if (!q) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        intent: z.enum(["event", "place", "service", "unknown"]).describe("The primary intent of the search query"),
        lens: z.enum(["today", "tonight", "weekend", "any"]).describe("The timeframe requested, if any"),
        isFree: z.boolean().describe("Whether the user explicitly asked for free things"),
        category: z.string().optional().describe("A specific category like 'music', 'food', 'coffee', 'family'"),
        suggestedPath: z.string().describe("A suggested URL path based on the parsed intent, e.g. '/events?lens=tonight&intent=music' or '/places?intent=eat-drink'"),
        explanation: z.string().describe("A brief, friendly explanation of what you found, e.g. 'Here are free music events tonight.'")
      }),
      prompt: `You are an AI assistant for Frederick Radius, a local guide app for Frederick County, MD. 
      Parse the following natural language search query into structured filters.
      
      User query: "${q}"
      
      Valid lenses for events: today, tonight, weekend.
      Valid intents for events: music, family, arts, civic, outdoors, market.
      Valid intents for places: eat-drink, coffee, shopping, outdoors.
      
      If the user wants events, suggest a path like /events?lens=...
      If the user wants places, suggest a path like /places?intent=...
      `,
    });

    return NextResponse.json(object);
  } catch (error) {
    console.error("AI Search Error:", error);
    return NextResponse.json({ error: "Failed to process smart search" }, { status: 500 });
  }
}
