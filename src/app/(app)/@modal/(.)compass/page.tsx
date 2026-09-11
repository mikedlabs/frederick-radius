import { PRODUCT_NAMES } from "@/lib/product-names";
import CompassHub from "@/components/nav/CompassHub";
import InterceptedDrawer from "@/components/nav/InterceptedDrawer";

export const metadata = {
  title: PRODUCT_NAMES.allTools.pageTitle,
};

export default function CompassIntercepted() {
  return (
    <InterceptedDrawer title={PRODUCT_NAMES.allTools.pageTitle} bareHeader>
      <div className="p-4">
        <CompassHub />
      </div>
    </InterceptedDrawer>
  );
}
