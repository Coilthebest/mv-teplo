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
  const poster=TeploIllustration.compose(picture,item.caption,item.year,item.yearLines);
  const product=item.product;
  let ratio=3/4;
  if(product==='frame' || (product==='paper' && item.material!=='sticker')) ratio=2/3;
  if(product==='keychain') ratio=((item.format||'').includes('40 × 56')?576*40/56-26:410)/547;
  if(product==='paper' && item.material==='sticker') ratio=110/147;
  const size=product==='magnet' && (item.format||'').match(/(\d+)\s*×\s*(\d+)/);
  if(size) ratio=Number(size[1])/Number(size[2]);
  canvas.height=picture.height;
  canvas.width=Math.max(1,Math.round(canvas.height*ratio));
  const w=canvas.width,h=canvas.height,ctx=canvas.getContext('2d');
  ctx.fillStyle='#f3e6d7';ctx.fillRect(0,0,w,h);
  placeTeploPrint(ctx,0,0,w,h,item.printLayout,()=>{
    if(product==='paper' && item.material==='sticker') return ctx.drawImage(poster,0,0,w,h);
    if(product==='frame') {
      const crop=poster.height*2/3;
      return ctx.drawImage(poster,(poster.width-crop)/2,0,crop,poster.height,0,0,w,h);
    }
    const factor=Math.min(w/poster.width,h/poster.height);
    const width=poster.width*factor,height=poster.height*factor;
    ctx.drawImage(poster,(w-width)/2,(h-height)/2,width,height);
  });
  picture.close();
  const output=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?.type==='image/jpeg'?resolve(b):reject(Error('JPEG')), 'image/jpeg', 0.96));
  canvas.width=canvas.height=1;
  return new Uint8Array(await output.arrayBuffer());
}
