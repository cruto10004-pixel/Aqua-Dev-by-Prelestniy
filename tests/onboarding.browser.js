(async()=>{
const $=s=>document.querySelector(s), wait=()=>new Promise(r=>setTimeout(r,matchMedia('(prefers-reduced-motion: reduce)').matches?60:780));let checks=[];
const assert=(x,m)=>{if(!x)throw Error(m);checks.push(m)};
const current=()=>document.querySelector('.screen:not([hidden])').dataset.step;
const click=async(s)=>{$(s).click();await wait()};
await wait();assert(current()==='0','welcome');
await click('[data-step="0"] [data-next]');assert(current()==='1','policy');assert($('#policy-next').disabled,'consent required');
await click('#policy-next');assert(current()==='1','disabled cannot navigate');$('#consent').click();await click('#policy-next');assert(current()==='2','number step');
await click('#bot-info');assert(!$('#bot-hint').hidden,'bot placeholder');
await click('#number-form button.primary');assert(!!$('#number-error').textContent,'empty number rejected');
$('#bot-number').value='123';await click('#number-form button.primary');assert(current()==='2','short number rejected');
$('#bot-number').value='12345678901';await click('#number-form button.primary');assert(current()==='3','valid number');
let cells=[...$('.otp').children];
cells[0].value='1';cells[0].dispatchEvent(new Event('input',{bubbles:true}));assert(document.activeElement===cells[1],'otp auto advance');
cells[1].dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true}));assert(document.activeElement===cells[0]&&!cells[0].value,'otp backspace');
const paste=value=>{const dt=new DataTransfer();dt.setData('text/plain',value);cells[0].dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))};
paste('999999');await click('#otp-form .keypad-confirm');assert($('.otp').classList.contains('invalid'),'otp error');
paste('123456');assert(cells.map(c=>c.value).join('')==='123456','paste complete code');await click('#otp-form .keypad-confirm');assert(current()==='4','profile step');
await click('#profile-form button.primary');assert(!!$('#profile-error').textContent,'required profile');
$('#display-name').value='Морская волна';$('#display-name').dispatchEvent(new Event('input'));$('#username').value='нет';await click('#profile-form button.primary');assert(current()==='4','invalid username');
// Generate a real image locally to exercise the upload and decode path.
const canvas=document.createElement('canvas');canvas.width=50;canvas.height=50;canvas.getContext('2d').fillRect(0,0,50,50);
const blob=await new Promise(r=>canvas.toBlob(r));const dt=new DataTransfer();dt.items.add(new File([blob],'avatar.png',{type:'image/png'}));$('#photo').files=dt.files;$('#photo').dispatchEvent(new Event('change'));await wait();assert(!!$('#avatar-preview img'),'avatar preview');
await click('#remove-photo');assert(!$('#avatar-preview img'),'remove avatar');
const dt2=new DataTransfer();dt2.items.add(new File([blob],'avatar-again.png',{type:'image/png'}));$('#photo').files=dt2.files;$('#photo').dispatchEvent(new Event('change'));await wait();
$('#username').value='ocean_wave';$('#bio').value='Привет, Aqua!';await click('#profile-form button.primary');assert(current()==='5','complete');assert($('#final-name').textContent==='Морская волна!','name reflected');assert($('#final-username').textContent==='@ocean_wave','username reflected');assert($('#final-bio').textContent==='Привет, Aqua!','bio reflected');assert(!!$('#final-avatar img'),'final avatar');
await click('#back');assert(current()==='4','back profile');assert($('#display-name').value==='Морская волна','profile preserved');await click('#profile-form button.primary');await click('[data-step="5"] [data-next]');assert(current()==='6','demo messenger');
await click('#restart');assert(current()==='0','restart');assert(!$('#consent').checked&&!$('#display-name').value&&!$('#photo').files.length,'restart clears local data');

await click('#start-login');assert(current()==='2','login skips policy');assert(!$('[data-step="2"] h2').textContent.includes('Номер от'),'login heading');assert(!$('#consent').checked,'login needs no consent');
await click('#number-form button.primary');assert(!!$('#number-error').textContent,'empty login number');
$('#bot-number').value='123';await click('#number-form button.primary');assert(current()==='2','malformed login number');
$('#bot-number').value='99999999999';await click('#number-form button.primary');assert($('#number-error').textContent.includes('не найден'),'unknown account');
await click('#back');assert(current()==='0','login number back to welcome');
await click('[data-step="0"] [data-next]');assert(current()==='1','switch back registration');await click('#back');
await click('#start-login');$('#bot-number').value='12345678901';await click('#number-form button.primary');assert(current()==='3','login OTP');assert($('[data-step="3"] h2').textContent==='Подтверждение входа','shared OTP login copy');
paste('999999');await click('#otp-form .keypad-confirm');assert(current()==='3'&&!!$('#otp-error').textContent,'wrong login code stays');
await click('[data-step="3"] [data-prev]');assert(current()==='2'&&$('#bot-number').value==='12345678901','correct number retained');
await click('#number-form button.primary');assert(cells.every(c=>!c.value),'retry clears OTP');
paste('123456');await click('#otp-form .keypad-confirm');assert(current()==='7','login success animation');
await new Promise(r=>setTimeout(r,1800));assert(current()==='6','login direct to messenger');assert($('#home-name').textContent==='Мира Волна'&&$('#home-username').textContent==='@mira_wave','existing demo profile');assert(!$('#display-name').value,'no profile creation');
await click('#home-back');assert(current()==='0','login home back to start');await click('[data-step="0"] [data-next]');assert(current()==='1','registration still available after login');await click('#back');
assert(document.documentElement.scrollWidth<=innerWidth,'no horizontal overflow');
assert(!performance.getEntriesByType('resource').some(r=>/\/api\//.test(r.name)),'no API traffic');return {checks:checks.length,passed:checks};
})()
