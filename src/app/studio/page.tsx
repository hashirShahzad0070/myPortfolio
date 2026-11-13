import type { Metadata } from "next";
import { Lanyard } from "@/components/studio/Lanyard";

export const metadata: Metadata = { title: "Studio" };

export default function StudioPage() {
  return (
    <main className="studio">
      <h1 className="u-sr-only">Studio</h1>
      <Lanyard />
    </main>
  );
}
