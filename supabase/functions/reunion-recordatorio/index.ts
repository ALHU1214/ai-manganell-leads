// Edge Function: reunion-recordatorio
// La llama pg_cron cada 15 minutos (ver supabase/migrations/*_recordatorios_reunion.sql).
// Busca leads con una reunión agendada y manda el aviso push que toque:
// uno el día antes y otro una hora antes.
//
// No se apoya en que el cron sea puntual: en vez de "¿falta exactamente
// 1 hora?", pregunta "¿falta 1 hora o menos y todavía no he avisado?".
// Así, si una ejecución se pierde, el aviso sale tarde pero sale.
//
// Variables de entorno (las mismas que notify-lead, más una opcional):
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
//   WEBHOOK_SECRET
//   ZONA_HORARIA  → opcional, por defecto Europe/Madrid. Si estás en
//     Canarias pon Atlantic/Canary, o la hora del aviso saldrá con una
//     hora de más.
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY → las inyecta Supabase sola.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")!;
const ZONA = Deno.env.get("ZONA_HORARIA") ?? "Europe/Madrid";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const MINUTO = 60_000;

function hora(fecha: Date) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit", minute: "2-digit", timeZone: ZONA,
  }).format(fecha);
}

function quien(lead: { nombre?: string; empresa?: string }) {
  return lead.nombre || lead.empresa || "un lead";
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const ahora = new Date();
  const dentroDe24h = new Date(ahora.getTime() + 24 * 60 * MINUTO);

  // Solo reuniones futuras dentro de las próximas 24 h. Las pasadas no
  // interesan: avisar de una reunión que ya ocurrió sería ruido.
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, nombre, empresa, fecha_reunion, aviso_dia_enviado, aviso_hora_enviado")
    .not("fecha_reunion", "is", null)
    .gt("fecha_reunion", ahora.toISOString())
    .lte("fecha_reunion", dentroDe24h.toISOString());

  if (error) {
    return new Response("error leyendo leads: " + error.message, { status: 500 });
  }
  if (!leads || leads.length === 0) {
    return new Response(JSON.stringify({ revisados: 0, avisos: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

  const { data: subs, error: errSubs } = await supabase
    .from("push_subscriptions")
    .select("*");

  if (errSubs) {
    return new Response("error leyendo suscripciones: " + errSubs.message, { status: 500 });
  }
  // Sin ningún dispositivo suscrito no se marca nada como enviado: así el
  // aviso sigue pendiente y saldrá en cuanto haya a quién mandárselo.
  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ revisados: leads.length, avisos: 0, motivo: "sin suscripciones" }), {
      headers: { "content-type": "application/json" },
    });
  }

  let avisos = 0;

  for (const lead of leads) {
    const cuando = new Date(lead.fecha_reunion);
    const minutosQueFaltan = (cuando.getTime() - ahora.getTime()) / MINUTO;

    let titulo: string | null = null;
    const marcar: Record<string, string> = {};

    if (minutosQueFaltan <= 60 && !lead.aviso_hora_enviado) {
      titulo = "En 1 hora: " + quien(lead);
      marcar.aviso_hora_enviado = ahora.toISOString();
      // Si la reunión se agendó con menos de un día de margen, el aviso del
      // día antes ya no tiene sentido: se da por cursado para no duplicar.
      if (!lead.aviso_dia_enviado) marcar.aviso_dia_enviado = ahora.toISOString();
    } else if (minutosQueFaltan <= 24 * 60 && !lead.aviso_dia_enviado) {
      titulo = "Mañana: " + quien(lead);
      marcar.aviso_dia_enviado = ahora.toISOString();
    }

    if (!titulo) continue;

    const cuerpo = [lead.empresa, "Reunión a las " + hora(cuando)]
      .filter(Boolean)
      .join(" · ");

    const notificacion = JSON.stringify({
      title: titulo,
      body: cuerpo,
      url: "panel.html",
      tag: "reunion-" + lead.id,
    });

    await Promise.allSettled(
      subs.map((sub) =>
        webpush
          .sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            notificacion,
          )
          .catch(async (err) => {
            if (err.statusCode === 404 || err.statusCode === 410) {
              await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
            }
            throw err;
          })
      ),
    );

    await supabase.from("leads").update(marcar).eq("id", lead.id);
    avisos++;
  }

  return new Response(JSON.stringify({ revisados: leads.length, avisos }), {
    headers: { "content-type": "application/json" },
  });
});
