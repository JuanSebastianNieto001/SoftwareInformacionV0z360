import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NoEncontrado() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-4 text-center">
      <FileQuestion className="mb-3 size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-semibold">No encontrado</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        El documento o la página no existe, ya no está vigente o no tienes permiso para verla.
      </p>
      <Button className="mt-5" asChild>
        <Link href="/">Ir a mis áreas</Link>
      </Button>
    </main>
  );
}
