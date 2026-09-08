import { Skeleton } from "@/components/ui/skeleton";

export default function Cargando() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-9 w-full max-w-xl" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
