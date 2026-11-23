const headers = { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' };
const encoder = new TextEncoder();
const maxBody = 16384;
const chatIdPattern = /^[1-9]\d{0,15}$/;
const moderationLink = /^https:\/\/mv-teplo\.ru\/feedback-admin\.html#[\da-f-]{36}\.[A-Za-z0-9_-]{43}$/;
let checked;

function json(body, status = 200) {
  return Response.json(body,{status,headers});
}

async function readPayload(request, timestamp) {
  const reader = request.body?.getReader();
  const prefix = encoder.encode(timestamp+'\n');
  const bytes = new Uint8Array(prefix.length+maxBody);
  bytes.set(prefix);
  let size = prefix.length;
  if (reader) {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      if (size+value.byteLength > bytes.length) {
        await reader.cancel();
        return null;
      }
      bytes.set(value,size);
      size += value.byteLength;
    }
  }
  return {signed:bytes.subarray(0,size),body:bytes.subarray(prefix.length,size)};
}

async function telegram(token, method, payload) {
  const response = await fetch('https://api.telegram.org/bot'+token+'/'+method, {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),
    signal:AbortSignal.timeout(method === 'sendMessage' ? 5000 : 3000),redirect:'manual'
  });
  if (response.status >= 300 && response.status < 400) {
    throw Object.assign(Error('telegram_redirect'), {reason:'telegram_redirect'});
  }
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw Object.assign(Error('telegram_rejected'), {
      reason: Number.isInteger(result.error_code) && result.error_code >= 400 && result.error_code <= 599
        ? 'telegram_http_'+result.error_code : 'telegram_rejected'
    });
  }
  return result.result;
}

function checkRecipient(token, chatId) {
  if (checked?.token !== token || checked.chatId !== chatId || checked.until <= Date.now()) {
    const entry = {token,chatId,until:Date.now()+60000};
    entry.result = Promise.all([telegram(token,'getMe',{}),telegram(token,'getChat',{chat_id:chatId})])
      .then(([bot,chat]) => {
        if (bot?.username?.toLowerCase() !== 'mv_teplo_bot') throw Object.assign(Error(),{reason:'wrong_bot'});
        if (chat?.type !== 'private' || String(chat.id) !== chatId) throw Object.assign(Error(),{reason:'wrong_chat'});
      })
      .catch(error => {
        entry.until = Date.now()+10000;
        throw error;
      });
    checked = entry;
  }
  return checked.result;
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/api/notify') return json({error:'not_found'},404);
    if (request.method !== 'POST') return new Response(null,{status:405,headers:{...headers,Allow:'POST'}});
    const secret = env.TELEGRAM_RELAY_KEY || '';
    const timestamp = request.headers.get('x-teplo-timestamp') || '';
    const signature = request.headers.get('x-teplo-signature') || '';
    if (secret.length < 32) return json({error:'relay_not_configured'},503);
    if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now()-Number(timestamp)) > 30000 || !/^[a-f0-9]{64}$/.test(signature)) {
      return json({error:'unauthorized'},401);
    }
    if (Number(request.headers.get('content-length')) > maxBody) return json({error:'request_too_large'},413);
    const payload = await readPayload(request,timestamp);
    if (!payload) return json({error:'request_too_large'},413);
    const key = await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    const mac = Uint8Array.from(signature.match(/../g), hex => parseInt(hex,16));
    if (!await crypto.subtle.verify('HMAC',key,mac,payload.signed)) return json({error:'unauthorized'},401);
    let data;
    try { data = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(payload.body)); } catch { return json({error:'invalid_request'},400); }
    if (typeof data?.chatId !== 'string' || !chatIdPattern.test(data.chatId) || !['ready','send'].includes(data.action)) {
      return json({error:'invalid_request'},400);
    }
    if (data.action === 'send' && (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 4096 ||
        (data.moderationUrl !== undefined && (typeof data.moderationUrl !== 'string' || !moderationLink.test(data.moderationUrl))))) {
      return json({error:'invalid_message'},400);
    }
    const token = env.TELEGRAM_BOT_TOKEN || '';
    if (!/^\d+:[\w-]+$/.test(token)) return json({error:'relay_not_configured'},503);
    try {
      await checkRecipient(token,data.chatId);
      if (data.action === 'ready') return json({ready:true});
      const replyMarkup = data.moderationUrl
        ? {inline_keyboard:[[{text:'Открыть модерацию',url:data.moderationUrl}]]} : undefined;
      const message = await telegram(token,'sendMessage',{
        chat_id:data.chatId,text:data.text,protect_content:true,
        link_preview_options:{is_disabled:true},reply_markup:replyMarkup
      });
      if (!Number.isSafeInteger(message?.message_id)) return json({error:'telegram_delivery_failed'},502);
      return json({messageId:message.message_id});
    } catch (error) {
      const reason = error.reason || (error.name === 'TimeoutError' ? 'telegram_timeout' : 'telegram_unavailable');
      console.warn('Teplo Telegram',data.action,reason);
      return json({error:reason},502);
    }
  }
};
