import { site } from "@/content/site";
import { Wheels } from "@/components/home/Wheels";

export default function Home() {
  return (
    <main className="hv2">
      <h1 className="u-sr-only">{site.name}, {site.role}</h1>
      <Wheels />
    </main>
  );
}
