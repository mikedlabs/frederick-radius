// Clear the intercepted Tools slot when a destination becomes the main page.
// This null reset has no content to warm. Keep ordinary destination prefetches,
// but do not repeatedly request a separate cached catch-all clearing segment.
export const prefetch = "force-disabled";
export default function ClearToolsModal() { return null; }
