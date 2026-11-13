import type { Metadata } from "next";
import "./lab.css";
import { LabWheel } from "@/components/lab/LabWheel";

export const metadata: Metadata = { title: "Lab" };

export default function LabPage() {
  return (
    <main className="container">
      <h1 className="u-sr-only">Lab — the stack</h1>
      <LabWheel />
    </main>
  );
}
