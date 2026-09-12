import re

with open("src/app/(app)/today/page.tsx", "r") as f:
    content = f.read()

# I will use a python script to patch the file because it's complex.

def replace_between(content, start_str, end_str, new_str):
    start = content.find(start_str)
    if start == -1: return content
    end = content.find(end_str, start)
    if end == -1: return content
    return content[:start] + new_str + content[end:]

start_str = "            {programGroups.length > 0 && ("
end_str = "            {/* Finished draws collapse to one honest line"

new_str = """            {briefingPicks.length > 0 && (
              <div className="-mx-4 sm:-mx-6 lg:mx-0">
                <SnapCarousel>
                  {briefingPicks.map((e) => (
                    <SnapCarouselItem key={`${e.slug}-${e.starts_at}`} className="w-[85%] max-w-[320px]">
                      <MagicCard className="h-full">
                        <EventCard event={e} variant="glance" nowISO={now.toISOString()} />
                      </MagicCard>
                    </SnapCarouselItem>
                  ))}
                </SnapCarousel>
              </div>
            )}
            
            {remainingAlsoToday.length > 0 && (
              <div className="reveal-up mt-4 grid gap-3 sm:grid-cols-2">
                <MagicCard className="p-4 flex flex-col gap-3 sm:col-span-2">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
                    Later Today
                  </p>
                  <ul className="flex flex-col gap-3">
                    {remainingAlsoToday.map((e) => (
                      <ProgramRow key={`${e.slug}-${e.starts_at}`} event={e} quiet={true} now={now} />
                    ))}
                  </ul>
                </MagicCard>
              </div>
            )}
"""

res = replace_between(content, start_str, end_str, new_str)
with open("src/app/(app)/today/page.tsx", "w") as f:
    f.write(res)
