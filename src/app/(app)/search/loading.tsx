import Skeleton from "@/components/ui/Skeleton";

export default function SearchLoading() {
  return (
    <div className="min-h-[34rem] space-y-5" aria-busy="true">
      <span className="sr-only">Loading search results</span>
      <header className="space-y-2">
        <Skeleton.Block width={92} height={28} />
        <Skeleton.Block height={44} round="var(--app-radius-md)" />
      </header>
      <Skeleton.Block width={78} height={11} />
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton.Row key={index} />
        ))}
      </div>
    </div>
  );
}
