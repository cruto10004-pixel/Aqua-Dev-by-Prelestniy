(async()=>{
 const $=s=>document.querySelector(s), w=()=>new Promise(r=>setTimeout(r,matchMedia('(prefers-reduced-motion:reduce)').matches?60:800)); const checks=[];const ok=(x,m)=>{if(!x)throw Error(m);checks.push(m)};
 document.querySelector('[data-step="0"] [data-next]').click();await w();$('#consent').click();$('#policy-next').click();await w();$('#bot-number').value='12345678901';$('#number-form').requestSubmit();await w();
 const cells=[...document.querySelectorAll('.otp input')], value=()=>cells.map(c=>c.value).join('');const key=k=>$(`[data-key="${k}"]`).click();
 ok(cells.every(c=>c.readOnly&&c.inputMode==='none'),'native input disabled');ok($('.keypad-confirm').disabled,'incomplete confirm disabled');
 '123456'.split('').forEach(key);ok(value()==='123456','keypad fills code');ok(!$('.keypad-confirm').disabled,'full code enabled');key('9');key('9');ok(value()==='123456','extra digits ignored');
 cells[2].click();key('8');ok(value()==='128456','selected digit replaced');key('delete');ok(value()==='12845','delete removes last digit');ok($('.keypad-confirm').disabled,'delete disables submit');key('6');ok(value()==='128456','refill last');
 for(let i=0;i<7;i++)key('delete');ok(value()==='','delete empty safe');
 const dt=new DataTransfer();dt.setData('text/plain','123456');cells[0].dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));ok(value()==='123456','paste event');
 Object.defineProperty(navigator,'clipboard',{value:{readText:async()=> '654321'},configurable:true});$('#otp-paste').click();await w();ok(value()==='654321','paste button');
 $('.keypad-confirm').click();await w();ok(!!$('#otp-error').textContent,'wrong code error');ok($('.shell').scrollHeight<=innerHeight+1,'error fits viewport');
 const top=$('.shell').scrollTop;key('delete');ok($('.shell').scrollTop===top,'no scroll on keypad');
 const button=$('.keypad-confirm').getBoundingClientRect();ok(button.bottom<=innerHeight&&button.top>=0,'keypad inside viewport');ok($('.shell').scrollHeight<=innerHeight+1,'no outer scroll');return {checks:checks.length,passed:checks};
})()
