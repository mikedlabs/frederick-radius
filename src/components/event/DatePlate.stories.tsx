import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import DatePlate from "./DatePlate";

/**
 * The one date mark. Every size uses the same sunken plate, Brick-press month
 * and Ink numeral, and an old category `accent` changes nothing.
 */
const meta = {
  title: "Events/Date plate",
  component: DatePlate,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { month: "OCT", day: "10", weekday: "Sat", size: "sm" },
  argTypes: {
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
  },
} satisfies Meta<typeof DatePlate>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 44 x 52: the plate at the start of every event row. */
export const Row: Story = {};

/** 56 x 64: a lead or sheet plate. */
export const Lead: Story = { args: { size: "md" } };

/** 72 x 84: a moment or date hero. */
export const Large: Story = { args: { size: "lg" } };

/** Two digits and a long month at every size, side by side. */
export const AllSizes: Story = {
  render: () => (
    <div className="flex items-start gap-4">
      <DatePlate month="DEC" day="31" weekday="Thu" size="sm" />
      <DatePlate month="DEC" day="31" weekday="Thu" size="md" />
      <DatePlate month="DEC" day="31" weekday="Thu" size="lg" />
    </div>
  ),
};

/** A legacy category accent is ignored: this plate matches Row exactly. */
export const AccentIgnored: Story = { args: { accent: "#7E2C6F" } };
