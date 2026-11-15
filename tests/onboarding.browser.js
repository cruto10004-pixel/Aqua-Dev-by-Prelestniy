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

await click('#start-login');assert(current()==='2','login screen');assert(!$('#login-form').hidden && $('#number-form').hidden,'login uses credentials');
await click('#login-form button.primary');assert(!!$('#login-error').textContent,'empty credentials rejected');
$('#login-name').value='mira_wave';$('#login-password').value='wrong';await click('#login-form button.primary');assert(current()==='2'&&!!$('#login-error').textContent,'wrong password rejected');
await click('#back');assert(current()==='0'&&!$('#login-password').value,'back clears password');
await click('[data-step="0"] [data-next]');assert(current()==='1','registration still available');await click('#back');
await click('#start-login');$('#login-name').value='mira_wave';$('#login-password').value='Aqua2026';await click('#login-form button.primary');assert(current()==='7','password login success');assert(!$('#login-password').value,'password cleared');
await new Promise(r=>setTimeout(r,1800));assert(current()==='6','login to messenger');assert($('#home-name').textContent==='Мира Волна'&&$('#home-username').textContent==='@mira_wave','existing demo profile');
await click('#home-back');assert(current()==='0','login home back');await click('[data-step="0"] [data-next]');assert(current()==='1','registration after login');await click('#back');
assert(document.documentElement.scrollWidth<=innerWidth,'no horizontal overflow');
assert(!performance.getEntriesByType('resource').some(r=>/\/api\//.test(r.name)),'no API traffic');return {checks:checks.length,passed:checks};
})()
