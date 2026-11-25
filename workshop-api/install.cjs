'use strict';
const fs=require('node:fs');
const path=require('node:path');
function patch(source) {
  if(source.includes("require('./workshop.cjs')"))throw Error('Already installed');
  const replace=(old,next)=>{
    if(source.split(old).length!==2)throw Error('Function source changed: '+old.slice(0,48));
    source=source.replace(old,()=>next);
  };
  replace("  const feedbackRoutes =", `  const workshop=require('./workshop.cjs');
  if (['generation-check','order-track','order-office','credit-create','credit-status'].includes(route)) {
    if(method!==(route==='generation-check'?'GET':'POST'))return reply(405,'{}');
    try {
      if((event.body||'').length>4000)return reply(413,'{}');
      const raw=Buffer.from(event.body||'',event.isBase64Encoded?'base64':'utf8').toString();
      const data=JSON.parse(raw||'{}');
      const result=route==='generation-check'?workshop.challenge(event.requestContext?.identity?.sourceIp,process.env):
        route==='order-track'?await workshop.customer(data):route==='order-office'?await workshop.manage(data,process.env):await workshop.credits(route,data,process.env);
      return reply(200,JSON.stringify(result));
    } catch(e) {return reply(e.status||503,JSON.stringify({error:e.status?e.message:'Сервис временно недоступен.'}));}
  }
  const feedbackRoutes =`);
  replace('const references = await getReferences();',`const references = await getReferences();
          let reservation;
          try {reservation=await env.reserveGeneration(payload);}
          catch(e){return fail('generation_quota',e.status?e.message:'Проверка лимита временно недоступна.',e.status||503);}`);
  replace("const error = providerError(response, details, 'create');",`if(response.status>=400 && response.status<500) await env.releaseGeneration(reservation);
            const error = providerError(response, details, 'create');`);
  replace('}),process.env);',`}),{...process.env,
    reserveGeneration:payload=>workshop.reserve(ip,process.env,context?.token?.access_token,payload.proof,payload.packs),
    releaseGeneration:reservation=>workshop.release(reservation,context?.token?.access_token)});`);
  const start=source.indexOf('          const now = Date.now();\n          for (const [id, row] of rate)');
  const end=source.indexOf('          const references = await getReferences();',start);
  if(start<0||end<start)throw Error('Generation limiter changed');
  return source.slice(0,start)+source.slice(end);
}
module.exports=patch;
if(require.main===module) {
  const dir=process.argv[2],file=path.join(dir,'index.js');
  const output=patch(fs.readFileSync(file,'utf8'));new(require('node:vm').Script)(output);
  fs.copyFileSync(path.join(__dirname,'service.cjs'),path.join(dir,'workshop.cjs'));fs.writeFileSync(file,output);
}
