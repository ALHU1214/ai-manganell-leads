// Service worker del panel de leads — AI Manganell
// Muestra la notificación push que llega, abre el panel al tocarla y avisa al
// panel de que hay un lead nuevo para que recargue la lista (si no, la app se
// queda con la lista de cuando se abrió y el lead nuevo no aparece).

function avisarAlPanel(){
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients){
    clients.forEach(function(client){
      client.postMessage({ type: 'nuevo-lead' });
    });
  });
}

// --- Caché del esqueleto de la app ---
// Antes no se cacheaba nada: cada arranque en frío iba a la red a por el HTML,
// la librería de Supabase y las fuentes, y sin cobertura la app no abría.
// Al subir la versión de CACHE se descartan solas las cachés viejas.
var CACHE = 'am-leads-v2';
var ESQUELETO = [
  'panel.html',
  'manifest.json',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-180.png'
];

// Nada de esto se cachea nunca: los datos y la sesión siempre van a la red.
function esDeSupabase(url){
  return url.hostname.indexOf('supabase.co') !== -1;
}
function esEstaticoExterno(url){
  return url.hostname === 'cdn.jsdelivr.net' ||
         url.hostname === 'fonts.googleapis.com' ||
         url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE).then(function(cache){
      // addAll falla entero si un solo archivo falla; se guardan de uno en uno
      // para que un icono que falte no deje la app sin caché.
      return Promise.all(ESQUELETO.map(function(ruta){
        return cache.add(ruta).catch(function(){});
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(nombres){
      return Promise.all(nombres.map(function(n){
        return n === CACHE ? null : caches.delete(n);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch(e){ return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Supabase (datos, auth, push) siempre a la red, sin tocar.
  if (esDeSupabase(url)) return;

  // El HTML: primero red, para que un despliegue nuevo se vea al momento.
  // Si no hay red, se sirve la última copia guardada y la app abre igual.
  if (req.mode === 'navigate' || url.pathname.indexOf('panel.html') !== -1){
    event.respondWith(
      fetch(req).then(function(res){
        var copia = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copia); });
        return res;
      }).catch(function(){
        return caches.match(req).then(function(hit){
          return hit || caches.match('panel.html');
        });
      })
    );
    return;
  }

  // Librería y fuentes, e iconos propios: se sirve la copia guardada al
  // instante y se refresca por detrás para la próxima vez.
  if (esEstaticoExterno(url) || url.origin === self.location.origin){
    event.respondWith(
      caches.match(req).then(function(hit){
        var red = fetch(req).then(function(res){
          if (res && (res.ok || res.type === 'opaque')){
            var copia = res.clone();
            caches.open(CACHE).then(function(c){ c.put(req, copia); });
          }
          return res;
        }).catch(function(){ return hit; });
        return hit || red;
      })
    );
  }
});

self.addEventListener('push', function(event){
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch(e){}

  var title = data.title || 'Nuevo lead';
  var options = {
    body: data.body || 'Ha entrado un lead nuevo.',
    icon: 'assets/icon-192.png',
    badge: 'assets/icon-192.png',
    data: { url: data.url || 'panel.html' },
    tag: data.tag || 'nuevo-lead',
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(avisarAlPanel)
  );
});

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || 'panel.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients){
      for (var i = 0; i < clients.length; i++){
        var client = clients[i];
        if (client.url.indexOf('panel.html') !== -1 && 'focus' in client){
          // Traerla al frente no basta: hay que pedirle que recargue la lista.
          client.postMessage({ type: 'nuevo-lead' });
          return client.focus();
        }
      }
      if (self.clients.openWindow){
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
