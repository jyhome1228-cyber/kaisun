// KAISUNCELL inquiry and privacy-conscious analytics API (Cloudflare Workers + D1)
// Required secrets: ADMIN_PASSWORD, SESSION_SECRET
const allowed = new Set(['https://kaisuncell.com','https://www.kaisuncell.com','https://jyhome1228-cyber.github.io']);
const json = (data,status=200,headers={}) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const clean=(s,n=200)=>String(s??'').trim().slice(0,n);
const enc=new TextEncoder();
function toHex(b){return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')}
async function hmac(secret,value){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return toHex(await crypto.subtle.sign('HMAC',key,enc.encode(value)))}
async function isAdmin(req,env){const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');const [expiry,nonce,sig]=token.split('.');if(!expiry||!nonce||!sig||!/^[0-9a-f]{64}$/.test(sig)||!/^\d+$/.test(expiry)||Number(expiry)<Date.now()||Number(expiry)>Date.now()+86400000)return false;const expected=await hmac(env.SESSION_SECRET,expiry+'.'+nonce);let mismatch=0;for(let i=0;i<64;i++)mismatch|=sig.charCodeAt(i)^expected.charCodeAt(i);return mismatch===0}
function dateKST(t=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(t)}
async function body(req){try{return await req.json()}catch{return null}}
function error(msg,status=400){return json({error:msg},status)}
async function aggregate(env){const today=dateKST();const now=new Date();const week=dateKST(new Date(now.getTime()-6*86400000));const month=dateKST(new Date(now.getTime()-29*86400000));const [stats,daily,pages,sources,keywords]=await Promise.all([
env.DB.prepare('SELECT COUNT(*) total, SUM(CASE WHEN date=? THEN 1 ELSE 0 END) today, SUM(CASE WHEN date>=? THEN 1 ELSE 0 END) week, SUM(CASE WHEN date>=? THEN 1 ELSE 0 END) month FROM visits').bind(today,week,month).first(),
env.DB.prepare('SELECT date,COUNT(*) count FROM visits WHERE date>=? GROUP BY date ORDER BY date').bind(month).all(),
env.DB.prepare('SELECT path,COUNT(*) count FROM visits GROUP BY path ORDER BY count DESC LIMIT 10').all(),
env.DB.prepare('SELECT source,COUNT(*) count FROM visits GROUP BY source ORDER BY count DESC LIMIT 12').all(),
env.DB.prepare("SELECT keyword,COUNT(*) count FROM visits WHERE keyword<>'' GROUP BY keyword ORDER BY count DESC LIMIT 12").all()
]);return {today:stats.today||0,week:stats.week||0,month:stats.month||0,total:stats.total||0,daily:daily.results,pages:pages.results,sources:sources.results,keywords:keywords.results}}
export default {async fetch(request,env){
 const origin=request.headers.get('Origin');const headers={'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Vary':'Origin'};
 if(origin&&allowed.has(origin))headers['Access-Control-Allow-Origin']=origin;
 const respond=r=>{const h=new Headers(r.headers);for(const [k,v] of Object.entries(headers))h.set(k,v);return new Response(r.body,{status:r.status,headers:h})};
 if(origin&&!allowed.has(origin))return respond(error('Origin not allowed',403));
 if(request.method==='OPTIONS')return respond(new Response(null,{status:204}));
 try{
 if(!env.DB||!env.ADMIN_PASSWORD||!env.SESSION_SECRET)return respond(error('Server is not configured',503));
 const u=new URL(request.url), path=u.pathname;
 if(path==='/api/health'&&request.method==='GET')return respond(json({ok:true}));
 if(path==='/api/admin/login'&&request.method==='POST'){
   const b=await body(request);if(!b||typeof b.password!=='string'||b.password.length>256)return respond(error('Invalid credentials',401));
   const a=enc.encode(b.password),z=enc.encode(env.ADMIN_PASSWORD);let diff=a.length^z.length;for(let i=0;i<Math.max(a.length,z.length);i++)diff|=(a[i]||0)^(z[i]||0);
   if(diff!==0)return respond(error('Invalid credentials',401));
   const expiry=String(Date.now()+8*3600000),nonce=crypto.randomUUID().replaceAll('-','');const token=expiry+'.'+nonce+'.'+await hmac(env.SESSION_SECRET,expiry+'.'+nonce);
   return respond(json({token,expires_at:new Date(Number(expiry)).toISOString()}))
 }
 if(path==='/api/inquiries'&&request.method==='POST'){
   const b=await body(request);if(!b||!['research','product','distribution','partnership','general'].includes(b.type)||!clean(b.name,80)||!/^\S+@\S+\.\S+$/.test(clean(b.email,200))||!clean(b.subject,150)||clean(b.message,5000).length<10)return respond(error('Invalid inquiry',400));
   if(JSON.stringify(b).length>12000)return respond(error('Payload too large',413));
   const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO inquiries(id,created_at,type,company,name,email,phone,subject,message,status) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,new Date().toISOString(),b.type,clean(b.company,120),clean(b.name,80),clean(b.email,200),clean(b.phone,30),clean(b.subject,150),clean(b.message,5000),'new').run();return respond(json({id},201))
 }
 if(path==='/api/visitors/event'&&request.method==='POST'){
   const b=await body(request);if(!b||typeof b!=='object')return respond(error('Invalid event'));
   // Session-per-day counts, no IP address or user-agent persistence.
   if(!b.isNewSessionToday)return respond(json({ok:true}));
   const pathValue=clean(b.landing,160);if(!pathValue.startsWith('/')||pathValue.startsWith('/admin'))return respond(error('Invalid page'));
   const d=dateKST();await env.DB.prepare('INSERT INTO visits(id,date,created_at,path,source,referrer_host,campaign,medium,keyword) VALUES(?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),d,new Date().toISOString(),pathValue,clean(b.source,80)||'direct',clean(b.referrerHost,120),clean(b.campaign,100),clean(b.medium,80),clean(b.keyword,100)).run();return respond(json({ok:true}))
 }
 if(path.startsWith('/api/admin/')){
   if(!await isAdmin(request,env))return respond(error('Unauthorized',401));
   if(path==='/api/admin/inquiries'&&request.method==='GET'){
     const r=await env.DB.prepare('SELECT * FROM inquiries ORDER BY created_at DESC LIMIT 500').all();
     const s=await env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='new' THEN 1 ELSE 0 END) new_count FROM inquiries").first();
     return respond(json({items:r.results,total:s.total,new_count:s.new_count||0}))
   }
   const match=path.match(/^\/api\/admin\/inquiries\/([0-9a-f-]{36})$/);
   if(match&&request.method==='PATCH'){const b=await body(request);if(!b||!['new','in_progress','done'].includes(b.status))return respond(error('Invalid status'));const r=await env.DB.prepare('UPDATE inquiries SET status=? WHERE id=?').bind(b.status,match[1]).run();return respond(json({ok:r.meta.changes>0}))}
   if(path==='/api/admin/visitors/summary'&&request.method==='GET')return respond(json(await aggregate(env)));
 }
 return respond(error('Not found',404))
 }catch(e){console.error('API error',e);return respond(error('Internal server error',500))}
}};