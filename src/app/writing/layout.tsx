import "./writing.css";
import { WritingShelf } from "@/components/writing/WritingShelf";

export default function WritingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WritingShelf />
      {children}
    </>
  );
}
