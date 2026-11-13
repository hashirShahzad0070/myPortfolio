import { site } from "@/content/site";

/* Contact letters → your inbox via Resend (https://resend.com).
   Set in .env.local:
     RESEND_API_KEY=re_...
     CONTACT_TO=you@example.com          (defaults to the site email)
     CONTACT_FROM="Portfolio <letters@yourdomain.com>"  (a sender on a domain verified in Resend)
   Without a key the route answers 503 and the letter offers a mailto fallback. */

type Letter = { kind?: string; email?: string; body?: string; name?: string; source?: string; sourceTag?: string; signature?: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return Response.json({ error: "counter closed" }, { status: 503 });

  let data: Letter;
  try { data = (await req.json()) as Letter; } catch { return Response.json({ error: "bad request" }, { status: 400 }); }
  const email = (data.email ?? "").trim(), body = (data.body ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || !body || body.length > 10000) return Response.json({ error: "invalid" }, { status: 422 });

  const job = 1000 + (Date.now() % 9000);
  const kind = (data.kind ?? "Letter").slice(0, 60), name = (data.name ?? "").slice(0, 120), source = (data.source ?? "").slice(0, 120);
  const sig = data.signature?.startsWith("data:image/png;base64,") ? data.signature : "";
  const html = `
    <div style="font-family:ui-monospace,Menlo,monospace;font-size:14px;line-height:1.6;color:#1e1e1e">
      <p><b>RE ::</b> ${esc(kind)} &nbsp; <b>JOB ::</b> N° ${job}</p>
      <p><b>FROM ::</b> ${esc(name || "—")} &lt;${esc(email)}&gt;</p>
      ${source ? `<p><b>VIA ::</b> ${esc(source)} (${esc(data.sourceTag ?? "")})</p>` : ""}
      <hr/>
      <p style="white-space:pre-wrap">${esc(body)}</p>
      ${sig ? `<p>Sincerely,</p><img alt="signature" src="${sig}" width="320"/>` : ""}
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.CONTACT_FROM ?? "Portfolio <onboarding@resend.dev>",
      to: [process.env.CONTACT_TO ?? site.email],
      reply_to: email,
      subject: `${kind} — from ${name || email} (N° ${job})`,
      html,
    }),
  });
  if (!res.ok) return Response.json({ error: "send failed" }, { status: 502 });
  return Response.json({ job });
}
