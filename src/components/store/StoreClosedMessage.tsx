import { Link } from "@tanstack/react-router";

export function StoreClosedMessage({ storeName }: { storeName?: string | null }) {
  return (
    <div className="flex min-h-[calc(100dvh-57px)] items-center justify-center px-4 py-16 text-center">
      <div className="w-full max-w-sm border border-border p-6">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {storeName || "This shop"}
        </p>
        <h1 className="mt-2 text-lg font-bold uppercase tracking-wider">Shop Closed</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This shop is closed at the moment. Please check back later.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-10 items-center justify-center bg-foreground px-4 text-xs font-bold uppercase tracking-widest text-background"
        >
          Find another store
        </Link>
      </div>
    </div>
  );
}

