import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { FAIR_LAYOUT_URL, parseFairLayoutData, type FairLayoutData } from "@/lib/fair/layout";
import FairBoothExplorer from "./FairBoothExplorer";
import { fairBoothFixture } from "./fair-booth-fixture";

function Workshop({ data, selected = false, query: initialQuery = "" }: { data: FairLayoutData; selected?: boolean; query?: string }) {
  const [mapId, setMapId] = useState("9566");
  const [selectedBoothId, setSelected] = useState<string | null>(selected ? "9566:3353619" : null);
  const [query, setQuery] = useState(initialQuery);
  return <div className="mx-auto max-w-6xl p-3"><h2 className="mb-5 text-2xl font-semibold">Fair booth layout</h2><FairBoothExplorer data={data} mapId={mapId} selectedBoothId={selectedBoothId} query={query} onMapChange={(id) => { setMapId(id); setSelected(null); }} onSelectBooth={(id) => { if (id) setMapId(id.split(":")[0]); setSelected(id); }} onQueryChange={setQuery} /></div>;
}

const meta = {
  title: "Fair/Booth explorer",
  component: Workshop,
  parameters: { layout: "fullscreen" },
  args: { data: fairBoothFixture },
  argTypes: { data: { control: false, table: { disable: true } } },
  loaders: [async () => {
    const response = await fetch(FAIR_LAYOUT_URL);
    if (!response.ok) throw new Error("The reviewed booth layout could not load for this story.");
    return { fairLayout: parseFairLayoutData(await response.json()) };
  }],
  render: (args, { loaded }) => <Workshop {...args} data={loaded.fairLayout as FairLayoutData} />,
} satisfies Meta<typeof Workshop>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Overview: Story = {};
export const BrandSearch: Story = { args: { query: "Rad Pies" } };
export const SelectedBooth: Story = { args: { selected: true, query: "Rad Pies" } };
export const NoMatch: Story = { args: { query: "Unavailable vendor" } };
export const Mobile320: Story = { globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } } };
export const Mobile375: Story = { globals: { viewport: { value: "radiusMobileCompact", isRotated: false } }, args: { selected: true } };
export const Mobile390: Story = { globals: { viewport: { value: "radiusMobile", isRotated: false } }, args: { query: "Rad Pies" } };
export const Mobile430: Story = { globals: { viewport: { value: "radiusMobileLarge", isRotated: false } } };
