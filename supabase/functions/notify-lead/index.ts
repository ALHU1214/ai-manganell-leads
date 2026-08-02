// Edge Function: notify-lead
// Se dispara desde un Database Webhook de Supabase cuando se inserta una fila en "leads".
// Manda una notificación push (Web Push / VAPID) a todos los dispositivos suscritos.
// Ver setup.md, Paso 5, para cómo desplegar esto y configurar el webhook.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")!;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const payload = await req.json();
  const lead = payload.record;
  if (!lead) {
    return new Response("no record in payload", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: subs, error } = await supabase.from("push_subscriptions").select("*");
  if (error) {
    return new Response("error reading subscriptions: " + error.message, { status: 500 });
  }

  const notification = JSON.stringify({
    title: "Nuevo lead: " + (lead.nombre || lead.empresa || "sin nombre"),
    body: [lead.empresa, lead.mensaje].filter(Boolean).join(" · ") || "Toca para ver el detalle.",
    url: "panel.html",
    tag: "lead-" + lead.id,
  });

  const results = await Promise.allSettled(
    (subs || []).map((sub) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          notification,
        )
        .catch(async (err) => {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
          throw err;
        })
    ),
  );

  return new Response(JSON.stringify({ sent: results.length }), {
    headers: { "content-type": "application/json" },
  });
});
