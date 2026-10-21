const C='quickchat-v8';const F=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','qrcode.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C&&x!=='qc-share').map(x=>caches.delete(x)))));self.clients.claim()});
async function handleShare(req){
  const p=new URLSearchParams();
  try{
    const fd=await req.formData();
    ['title','text','url'].forEach(k=>{const v=fd.get(k);if(v)p.set(k,v)});
    const f=fd.get('file');
    if(f&&typeof f!=='string'&&f.size){
      const c=await caches.open('qc-share');
      await c.put('shared-file',new Response(f,{headers:{'Content-Type':f.type||'application/octet-stream','X-Name':encodeURIComponent(f.name||'file')}}));
      p.set('file','1');
    }
  }catch(e){}
  return Response.redirect(new URL('./?'+p.toString(),self.registration.scope).href,303);
}
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(e.request.method==='POST'&&url.pathname.endsWith('/share-target')){e.respondWith(handleShare(e.request));return}
  if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request,{ignoreSearch:true})));
});
