import PulsePage from "@/app/(app)/pulse/page";
import InterceptedDrawer from "@/components/nav/InterceptedDrawer";
import { PRODUCT_NAMES } from "@/lib/product-names";

export const metadata = {
  title: PRODUCT_NAMES.liveConditions.pageTitle,
};

export default function PulseIntercepted(props: Record<string, unknown>) {
  return (
    <InterceptedDrawer title={PRODUCT_NAMES.liveConditions.pageTitle} bareHeader>
      <div className="bg-[var(--app-bg)] w-full">
        <PulsePage {...props} />
      </div>
    </InterceptedDrawer>
  );
}
