// Service worker do cesta: guarda a página no aparelho para o app abrir sem internet
// (por exemplo, com a lista de compras no mercado).
//
// - Arquivos do próprio site (a página, os ícones, o manifest): tenta a internet primeiro e
//   guarda a cópia mais nova. Sem internet, ou se ela demorar, abre a cópia guardada.
// - Bibliotecas externas que a página espera para abrir (fontes, mapa, login): só pela
//   internet e com prazo. Com sinal fraco, a página abre sem elas em vez de ficar travada.
// - Todo o resto (Supabase: login, feed e fotos; mapa, CEP, mercados) vai direto para a
//   internet e NUNCA é guardado aqui.
// Este arquivo vai público para o GitHub junto com a página criptografada: não coloque dados aqui.
const CACHE = 'cesta-v1';
const ESSENCIAIS = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
const INICIO = new URL('./', self.location.href).href;
const PRAZO_PAGINA = 3500; // ms esperando a internet antes de abrir a cópia guardada
const PRAZO_BIBLIOTECA = 6000; // ms esperando uma biblioteca externa antes de desistir dela
// carregadas no <head> do index.html: a página fica parada até elas chegarem (ou falharem)
const BIBLIOTECAS = [
  'https://unpkg.com/leaflet@1.9.4/dist/',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@',
  'https://fonts.googleapis.com/css2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith('cesta-') && n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin === self.location.origin) e.respondWith(doSite(e));
  else if (BIBLIOTECAS.some((b) => req.url.startsWith(b))) e.respondWith(biblioteca(req));
  // o resto segue direto para a internet, sem passar pelo cache
});

function doSite(e) {
  const req = e.request;
  const url = new URL(req.url);
  const chave = url.origin + url.pathname; // sem o "?…": o código do login com Google não vai para o cache
  const daRede = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') {
      const copia = res.clone();
      e.waitUntil(caches.open(CACHE).then((c) => c.put(chave, copia)));
    }
    return res;
  });
  e.waitUntil(daRede.catch(() => {})); // termina de guardar mesmo se a cópia antiga já foi mostrada
  const guardada = async () => (await caches.match(chave, { ignoreVary: true }))
    || (req.mode === 'navigate' ? caches.match(INICIO, { ignoreVary: true }) : undefined);
  return comPrazo(daRede, PRAZO_PAGINA).catch(async () => (await guardada()) || daRede);
}

function biblioteca(req) {
  return comPrazo(fetch(req), PRAZO_BIBLIOTECA).catch(() => Response.error());
}

function comPrazo(promessa, ms) {
  return new Promise((ok, falha) => {
    const t = setTimeout(() => falha(new Error('a internet demorou')), ms);
    promessa.then((r) => { clearTimeout(t); ok(r); }, (x) => { clearTimeout(t); falha(x); });
  });
}
