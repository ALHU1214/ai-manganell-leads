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

self.addEventListener('install', function(event){
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(self.clients.claim());
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
