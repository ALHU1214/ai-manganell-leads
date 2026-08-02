// Service worker del panel de leads — AI Manganell
// Solo hace dos cosas: mostrar la notificación push que llega, y abrir el panel al tocarla.

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
    icon: 'assets/icon.svg',
    badge: 'assets/icon.svg',
    data: { url: data.url || 'panel.html' },
    tag: data.tag || 'nuevo-lead',
    renotify: true,
    requireInteraction: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || 'panel.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients){
      for (var i = 0; i < clients.length; i++){
        var client = clients[i];
        if (client.url.indexOf('panel.html') !== -1 && 'focus' in client){
          return client.focus();
        }
      }
      if (self.clients.openWindow){
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
