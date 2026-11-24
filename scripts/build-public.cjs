// Build output contains public feedback. Never commit it or write it to source HTML.
'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {renderSnapshot}=require('./feedback-snapshot.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'_site');
const site='https://mv-teplo.ru';
const endpoint='https://functions.yandexcloud.net/d4e6gbqek4evf54etp5m?route=feedback';
async function publicFeedback() {
  let failure;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetch(endpoint,{headers:{Origin:site},signal:AbortSignal.timeout(20000),cache:'no-store'});
      if(!response.ok)throw Error(`Public feedback HTTP ${response.status}`);
      return await response.json();
    }catch(e){failure=e;}
  }
  // A failed build leaves the previous published site intact, instead of erasing reviews.
  throw failure;
}
async function main() {
  const source=await fs.readFile(path.join(root,'index.html'),'utf8');
  const rendered=renderSnapshot(source,await publicFeedback());
  await fs.rm(output,{recursive:true,force:true});await fs.mkdir(output,{recursive:true});
  for(const entry of await fs.readdir(root,{withFileTypes:true})){
    if(entry.isFile()&&(entry.name==='CNAME'||/\.(html|js|css|png|ico|xml|txt)$/.test(entry.name)))await fs.copyFile(path.join(root,entry.name),path.join(output,entry.name));
  }
  for(const directory of ['assets','podarki'])await fs.cp(path.join(root,directory),path.join(output,directory),{recursive:true});
  await fs.writeFile(path.join(output,'index.html'),rendered.html);
  await fs.writeFile(path.join(output,'.nojekyll'),'');
  let changed=true;
  if(process.env.GITHUB_EVENT_NAME==='schedule'){
    try{
      const current=await fetch(site+'/',{cache:'no-store',signal:AbortSignal.timeout(15000)});
      if(current.ok)changed=(await current.text())!==rendered.html;
    }catch{/* Publishing a fresh snapshot is safe if comparison is unavailable. */}
  }
  if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,`changed=${changed}\n`);
  console.log(`Public site built: ${Math.min(5,rendered.count)} initial messages; ${rendered.ratingCount} confirmed ratings. Publish: ${changed}.`);
}
main().catch(error=>{console.error('Public build failed:',error.message);process.exitCode=1;});
