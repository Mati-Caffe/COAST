/* Envío anónimo con confirmación de guardado. No se interpreta una respuesta
 * opaca de fetch como éxito: se consulta el registro por ID y token aleatorios.
 */
(() => {
  'use strict';
  const cfg = window.FADU_CONFIG || {};
  const form = document.getElementById('survey');
  const status = document.getElementById('status');
  const button = form.querySelector('button[type="submit"]');
  const consent = document.getElementById('consent');
  const fields = ['horizontal','escalera'].flatMap(s=>[1,2,3,4,5].map(n=>`${s}_q${n}`));
  const key = 'fadu-envio-pendiente-v1';
  let pending = null, busy = false, submitted = false;
  function message(text,kind='') { status.textContent=text;status.className='status '+kind; }
  function randomId() { const a=new Uint8Array(16);crypto.getRandomValues(a);return Array.from(a,x=>x.toString(16).padStart(2,'0')).join(''); }
  function configured() { return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(cfg.endpoint || ''); }
  function remember() { try { sessionStorage.setItem(key,JSON.stringify(pending)); } catch (_) {} }
  function forget() { try { sessionStorage.removeItem(key); } catch (_) {} }
  function lockAnswers() { form.querySelectorAll('input').forEach(el=>el.disabled=true);consent.disabled=true; }
  function jsonp(params) {
    return new Promise((resolve,reject)=>{
      const callback='fadu_cb_'+randomId();const script=document.createElement('script');
      const url=new URL(cfg.endpoint);Object.entries({...params,callback,_:Date.now()}).forEach(([k,v])=>url.searchParams.set(k,v));
      let timer;
      function cleanup(){clearTimeout(timer);script.remove();delete window[callback];}
      window[callback]=data=>{cleanup();resolve(data);};
      script.onerror=()=>{cleanup();reject(new Error('Sin conexión con el registro.'));};
      timer=setTimeout(()=>{cleanup();reject(new Error('Tiempo de espera agotado.'));},8000);
      script.crossOrigin = 'anonymous';
script.src=url.href;document.head.appendChild(script);
    });
  }
  async function confirmed() {
    for(let n=0;n<8;n++) {
      try {
        const r=await jsonp({action:'status',id:pending.id,token:pending.token});
        if(r.ok && r.saved && r.id===pending.id) return true;
      } catch (_) {}
      await new Promise(resolve=>setTimeout(resolve,1200));
    }
    return false;
  }
  function answers() {
    if(!consent.checked){message('Confirmá el consentimiento en “Información y consentimiento”.','error');consent.focus();return null;}
    const values={};
    for(const k of fields) {
      const scenario=k.split('_')[0];
      if(k.endsWith('_q4') && document.getElementById(scenario+'_na').checked){values[k]='NA';continue;}
      const el=form.querySelector(`input[name="${k}"]:checked`);
      if(!el){message(`Falta la pregunta ${k.slice(-1)} de ${scenario==='horizontal'?'superficie plana':'escalera'}.`,'error');form.querySelector(`input[name="${k}"]`).focus();return null;}
      values[k]=Number(el.value);
    }
    return values;
  }
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(busy || submitted)return;
    if(!configured()){message('La encuesta todavía no está habilitada para recibir respuestas.','error');return;}
    if(!pending){
      const values=answers();if(!values)return;
      pending={id:randomId(),token:randomId(),version:cfg.version,consent:true,answers:values};remember();
    }
    busy=true;button.disabled=true;lockAnswers();message('Enviando y comprobando el registro…');
    try {
      // text/plain es una petición simple; el acuse se verifica por separado.
      fetch(cfg.endpoint,{method:'POST',mode:'no-cors',redirect:'follow',credentials:'omit',
        headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(pending)}).catch(()=>{});
      if(!await confirmed())throw new Error('Sin confirmación');
      submitted=true;forget();message('Gracias. Tu respuesta quedó registrada.','ok');button.textContent='Respuesta registrada';
    } catch (_) {
      message('No pudimos confirmar el envío. Tus respuestas se conservan: volvé a intentar.','error');
      button.textContent='Reintentar envío';button.disabled=false;
    } finally { busy=false; }
  });
  try {
    const saved=JSON.parse(sessionStorage.getItem(key)||'null');
    if(saved && saved.version===cfg.version && /^[a-f0-9]{32}$/.test(saved.id) && /^[a-f0-9]{32}$/.test(saved.token) && saved.answers && fields.every(k=>k in saved.answers)) {
      pending=saved;consent.checked=true;
      for(const k of fields){if(saved.answers[k]==='NA'){document.getElementById(k.split('_')[0]+'_na').checked=true;}else{const el=form.querySelector(`input[name="${k}"][value="${saved.answers[k]}"]`);if(el)el.checked=true;}}
      lockAnswers();button.textContent='Reintentar envío';message('Tenés un envío pendiente de confirmar. Volvé a intentarlo.');
      if(typeof progress==='function')progress();
    }
  } catch (_) {forget();}
  if(!configured()){button.disabled=true;message('La encuesta todavía no está habilitada para recibir respuestas.','error');}
  else if(!pending){
    button.disabled=true;message('Comprobando disponibilidad…');
    jsonp({action:'health'}).then(r=>{if(!r.ok || r.version!==cfg.version)throw new Error();button.disabled=false;message('Completá las preguntas y enviá tus respuestas.');})
      .catch(()=>message('No pudimos conectar con el registro. Recargá la página para volver a intentar.','error'));
  }
})();
