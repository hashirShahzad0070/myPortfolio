import type { Metadata } from "next";
import { Letter } from "@/components/contact/Letter";
import "./contact.css";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <main className="letterpage">
      <h1 className="u-sr-only">Contact</h1>
      <Letter />
    </main>
  );
}
