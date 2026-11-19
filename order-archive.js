'use strict';
// PNGs are already compressed. Store them losslessly in a UTF-8 ZIP.
function orderZip(files) {
  const table=Uint32Array.from({length:256},(_,i)=>{
    for(let bit=0;bit<8;bit++) i=(i>>>1)^((i&1)?0xedb88320:0);
    return i>>>0;
  });
  const local=[],central=[];
  let offset=0,directorySize=0;
  function header(size,signature) {
    const bytes=new Uint8Array(size), view=new DataView(bytes.buffer);
    view.setUint32(0,signature,true);
    return {bytes,u16:(at,v)=>view.setUint16(at,v,true),u32:(at,v)=>view.setUint32(at,v,true)};
  }
  for(const file of files) {
    const name=new TextEncoder().encode(file.name), data=file.bytes;
    let crc=0xffffffff;
    for(const value of data) crc=(crc>>>8)^table[(crc^value)&255];
    crc=(~crc)>>>0;
    const h=header(30,0x04034b50);
    h.u16(4,20);h.u16(6,2048);h.u16(12,33);h.u32(14,crc);h.u32(18,data.length);h.u32(22,data.length);h.u16(26,name.length);
    local.push(h.bytes,name,data);
    const c=header(46,0x02014b50);
    c.u16(4,20);c.u16(6,20);c.u16(8,2048);c.u16(14,33);c.u32(16,crc);c.u32(20,data.length);c.u32(24,data.length);c.u16(28,name.length);c.u32(42,offset);
    central.push(c.bytes,name);directorySize+=46+name.length;offset+=30+name.length+data.length;
  }
  const end=header(22,0x06054b50);
  end.u16(8,files.length);end.u16(10,files.length);end.u32(12,directorySize);end.u32(16,offset);
  return new Blob([...local,...central,end.bytes],{type:'application/zip'});
}

async function captionedJpeg(blob,item) {
  const picture=await createImageBitmap(blob);
  const canvas=document.createElement('canvas');
  canvas.width=picture.width;canvas.height=picture.height;
  const ctx=canvas.getContext('2d');
  const w=canvas.width,h=canvas.height;
  ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);
  ctx.drawImage(picture,0,0,w,h);
  ctx.save();
  ctx.scale(w/1200,h/1600);
  ctx.fillStyle='#68503b';
  function caption(text,y,size,space){
    const letters=Array.from(text);
    ctx.font=size+'px Georgia,serif';
    const widths=letters.map(c=>ctx.measureText(c).width);
    const total=widths.reduce((a,b)=>a+b,0)+Math.max(0,letters.length-1)*space;
    ctx.save();ctx.translate(600,y);const scale=Math.min(1,900/Math.max(1,total));ctx.scale(scale,scale);
    let x=-total/2;
    letters.forEach((c,i)=>{ctx.fillText(c,x,0);x+=widths[i]+space});
    ctx.restore();return total*scale;
  }
  const title=item.caption.trim().toLocaleUpperCase('ru'),year=item.year.trim();
  if(title)caption(title,1360,47,12);
  if(year){const y=title?1422:1360,edge=caption(year,y,30,12)/2+30;
    if(item.yearLines){ctx.fillStyle='#9e7c5e';ctx.fillRect(600-edge-62,y-10,62,1.5);ctx.fillRect(600+edge,y-10,62,1.5);}
  }
  ctx.restore();

  picture.close();
  const output=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?.type==='image/jpeg'?resolve(b):reject(Error('JPEG')), 'image/jpeg', 0.96));
  canvas.width=canvas.height=1;
  return new Uint8Array(await output.arrayBuffer());
}
