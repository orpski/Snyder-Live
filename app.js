// SNYDER GOLF v4.47
const SNYDER_GOLF_LOGO='./snyder-golf-logo.png';
const CUP_TEAM_C_STORAGE_PREFIX='[Team C] ';

// =========================================================
// React hooks / runtime aliases
// =========================================================
const{useState,useEffect,useRef}=React;
// =========================================================
// External config / API keys
// Supabase, admin password and golf API configuration
// =========================================================
const SURL='https://qggylmfyrnlwnkhjldjl.supabase.co';
const SKEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnZ3lsbWZ5cm5sd25raGpsZGpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1OTU5ODQsImV4cCI6MjA5MjE3MTk4NH0.StHB-C5UZfxpBTWSmKvGWMGPp0q9O35XGcKtKed4cnw';
const ADMIN_PW='admin2025';
// =========================================================
// App-wide announcement modal
// Shows a blocking message on app open until the user closes it.
// =========================================================
const SHOW_BREAKING_NEWS=false;
const BREAKING_NEWS_MESSAGE='';
// GolfCourseAPI removed from the live frontend in v45; v65.3 uses safe course presets and badges.
// Course data should be added manually or imported later through a safer backend/admin workflow.
const EMOJI={
  golf:'\u26F3\uFE0F',
  scores:'\uD83D\uDCCA',
  trophy:'\uD83C\uDFC6',
  profile:'\uD83D\uDC64',
  friends:'\uD83D\uDC65',
  admin:'\u2699\uFE0F',
  plus:'\u2795',
  live:'\uD83D\uDD34',
  blob:'\uD83D\uDCA5',
  threePutt:'3\uFE0F\u20E3',
  fourPutt:'4\uFE0F\u20E3',
  water:'\uD83D\uDCA7',
  bunker:'\uD83C\uDFD6\uFE0F',
  dnf:'\u274C',
  snake:'\uD83D\uDC0D',
  moneyWings:'\uD83D\uDCB8',
  pound:'\u00A3',
  portugalFlag:'\uD83C\uDDF5\uD83C\uDDF9'
};
// =========================================================
// Supabase client setup
// =========================================================
const sb=supabase.createClient(SURL,SKEY);

// =========================================================
// Snyder Live notification helpers
// Frontend emits only the approved golf events. The Supabase Edge Function
// can fan these out to saved push subscriptions when configured.
// =========================================================
const SNYDER_NOTIFY_EDGE='hyper-handler'; // Supabase deployed function slug shown in dashboard URL
const SNYDER_PUSH_TABLE='live_push_subscriptions';
const SNYDER_VAPID_PUBLIC_KEY='BPhGMHb32v-wFIAdTOihEH4nSfwlRG7lrIxwSIEYlw9DUbS691wcw0fnIbILeQg1VNwsniOTDt3lmy95BIav3IM'; // Snyder Live VAPID public key - separate from Snyder League table/function names.
const SNYDER_TEST_MODE_KEY='snyder_notification_test_mode';
window.SNYDER_NOTIFY_EDGE=SNYDER_NOTIFY_EDGE;
window.SNYDER_PUSH_TABLE=SNYDER_PUSH_TABLE;
window.SNYDER_VAPID_PUBLIC_KEY=SNYDER_VAPID_PUBLIC_KEY;
function snyderNotificationsTestMode(){
  try{return localStorage.getItem(SNYDER_TEST_MODE_KEY)==='true';}catch(e){return false;}
}
function setSnyderNotificationsTestMode(enabled){
  try{localStorage.setItem(SNYDER_TEST_MODE_KEY,enabled?'true':'false');}catch(e){}
  window.dispatchEvent(new CustomEvent('snyder-test-mode-change',{detail:{enabled:!!enabled}}));
}
try{
  const params=new URLSearchParams(window.location.search||'');
  if(params.get('testmode')==='1'||params.get('notifications')==='off')setSnyderNotificationsTestMode(true);
  if(params.get('testmode')==='0'||params.get('notifications')==='on')setSnyderNotificationsTestMode(false);
}catch(e){}
window.snyderNotificationsTestMode=snyderNotificationsTestMode;
window.setSnyderNotificationsTestMode=setSnyderNotificationsTestMode;
const snyderNotifySent=new Set();
function snyderNotifyKey(type,payload){
  return [type,payload&&payload.roundId,payload&&payload.groupId,payload&&payload.hole,payload&&payload.playerId,payload&&payload.status].filter(v=>v!==undefined&&v!==null).join('|');
}
function snyderNotifyStorageKey(type,payload){
  return 'snyder_notify_'+snyderNotifyKey(type,payload||{});
}
function snyderNotifyAlreadyStored(type,payload){
  try{return !!localStorage.getItem(snyderNotifyStorageKey(type,payload));}catch(e){return false;}
}
function storeSnyderNotifySent(type,payload){
  try{localStorage.setItem(snyderNotifyStorageKey(type,payload),new Date().toISOString());}catch(e){}
}
function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const rawData=window.atob(base64);
  const outputArray=new Uint8Array(rawData.length);
  for(let i=0;i<rawData.length;++i)outputArray[i]=rawData.charCodeAt(i);
  return outputArray;
}
function pushSubscriptionUsesKey(subscription,publicKey){
  try{
    const current=subscription&&subscription.options&&subscription.options.applicationServerKey;
    if(!current||!publicKey)return true;
    const desired=urlBase64ToUint8Array(publicKey);
    const actual=new Uint8Array(current);
    if(actual.length!==desired.length)return false;
    for(let i=0;i<actual.length;i++)if(actual[i]!==desired[i])return false;
    return true;
  }catch(e){return true;}
}
async function registerSnyderServiceWorker(){
  if(!('serviceWorker' in navigator))return null;
  try{return await navigator.serviceWorker.register('./sw-live.js');}
  catch(e){return null;}
}
async function enableSnyderLiveNotifications(user){
  if(!('Notification' in window))return {ok:false,error:'Notifications are not supported on this device/browser'};
  if(!SNYDER_VAPID_PUBLIC_KEY)return {ok:false,error:'Missing Snyder Live VAPID public key'};
  const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
  if(permission!=='granted')return {ok:false,error:'Notifications were not allowed'};
  const registration=await registerSnyderServiceWorker();
  if(!registration||!registration.pushManager)return {ok:false,error:'Push notifications are not available on this browser'};

  let sub=await registration.pushManager.getSubscription();
  if(sub&&!pushSubscriptionUsesKey(sub,SNYDER_VAPID_PUBLIC_KEY)){
    try{await sub.unsubscribe();}catch(e){}
    sub=null;
  }
  if(!sub){
    sub=await registration.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:urlBase64ToUint8Array(SNYDER_VAPID_PUBLIC_KEY)
    });
  }

  const json=sub.toJSON();
  if(!json.endpoint||!json.keys||!json.keys.p256dh||!json.keys.auth)return {ok:false,error:'Browser did not return a valid push subscription'};

  const {error}=await sb.from(SNYDER_PUSH_TABLE).upsert({
    endpoint:json.endpoint,
    p256dh:json.keys.p256dh,
    auth:json.keys.auth,
    user_id:user&&user.id||null,
    app:'snyder-live',
    source:'snyder-live-pwa',
    user_agent:navigator.userAgent||null,
    updated_at:new Date().toISOString()
  },{onConflict:'endpoint'});
  if(error)return {ok:false,error:error.message||'Could not save push subscription'};

  return {ok:true,permission};
}
async function sendSnyderLiveNotification(type,payload){
  try{
    const key=snyderNotifyKey(type,payload||{});
    if(key&&snyderNotifySent.has(key))return {ok:true,skipped:true};
    if(key){
      snyderNotifySent.add(key);
      setTimeout(()=>snyderNotifySent.delete(key),1000*60*20);
    }
    const body={type,app:'snyder-live',subscriptionTable:SNYDER_PUSH_TABLE,version:'v4.47',createdAt:new Date().toISOString(),...(payload||{})};
    delete body.mutedRoundIds;
    if(snyderNotificationsTestMode()){
      console.log('[Snyder Notify] TEST MODE blocked',type,body);
      return {ok:true,skipped:true,testMode:true};
    }
    console.log('[Snyder Notify] sending',type,'to',SNYDER_NOTIFY_EDGE,body);
    if(body.body&&!body.message)body.message=body.body;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),6000);
    let res;
    try{
      res=await fetch(`${SURL}/functions/v1/${SNYDER_NOTIFY_EDGE}`,{
        method:'POST',
        mode:'cors',
        signal:controller.signal,
        headers:{'Content-Type':'application/json','apikey':SKEY,'Authorization':'Bearer '+SKEY},
        body:JSON.stringify(body)
      });
    }finally{
      clearTimeout(timeout);
    }
    let data=null;
    try{data=await res.json();}catch(err){}
    if(!res.ok||data&&data.success===false){
      return {ok:false,status:res.status,error:data&&data.error||'Notification send failed'};
    }
    if(localStorage.getItem('liveNotificationsMuted')!=='true'&&'Notification' in window&&Notification.permission==='granted'&&document.visibilityState!=='visible'){
      const reg=await registerSnyderServiceWorker();
      const title=body.title||'Snyder Golf';
      const options={body:body.body||body.message||'',icon:'./icon-golf-192.png',badge:'./notification-badge-v2.png',tag:'snyder-golf-'+(key||type),renotify:true,vibrate:[120,70,120],timestamp:Date.now(),data:{url:'./',type,roundId:body.roundId,app:'snyder-golf'}};
      if(reg&&reg.showNotification)reg.showNotification(title,options);
      else new Notification(title,options);
    }
    return {ok:true,data};
  }catch(e){
    return {ok:false,error:e&&e.message||String(e)};
  }
}
function snyderLeagueScoreNotificationText(name,points){
  const pts=Number(points)||0;
  if(pts>=40)return{title:'Score submitted',body:`🔥 ${name} has submitted ${pts} points. Bandit behaviour.`};
  if(pts>=36)return{title:'Score submitted',body:`⭐ ${name} has submitted ${pts} points. Solid knock.`};
  if(pts>=30)return{title:'Score submitted',body:`🏌️ ${name} has submitted ${pts} points.`};
  if(pts>=25)return{title:'Score submitted',body:`😬 ${name} has submitted ${pts} points. Bit of a grind.`};
  return{title:'Score submitted',body:`💩 ${name} has submitted ${pts} points. Disaster class.`};
}
async function sendSnyderLeagueNotification(payload){
  try{
    const body={type:'league_score_submitted',app:'snyder-live',source:'snyder-league',subscriptionTable:SNYDER_PUSH_TABLE,version:'v4.47',createdAt:new Date().toISOString(),...(payload||{})};
    if(body.body&&!body.message)body.message=body.body;
    if(snyderNotificationsTestMode()){
      console.log('[Snyder League Notify] TEST MODE blocked',body);
      return {ok:true,skipped:true,testMode:true};
    }
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),6000);
    let res,data=null;
    try{
      res=await fetch(`${SURL}/functions/v1/${SNYDER_NOTIFY_EDGE}`,{
        method:'POST',
        mode:'cors',
        signal:controller.signal,
        headers:{'Content-Type':'application/json','apikey':SKEY,'Authorization':'Bearer '+SKEY},
        body:JSON.stringify(body)
      });
    }finally{
      clearTimeout(timeout);
    }
    try{data=await res.json();}catch(err){}
    if(res&&res.ok&&!(data&&data.success===false))return {ok:true,data};
    const legacy=await sb.functions.invoke('send-league-notification',{body:payload});
    if(legacy&&legacy.error)throw legacy.error;
    return {ok:true,legacy:true};
  }catch(e){
    console.warn('Snyder League notification failed',e);
    return {ok:false,error:e};
  }
}
window.sendSnyderLeagueNotification=sendSnyderLeagueNotification;
window.sendSnyderLiveNotification=sendSnyderLiveNotification;
function mutedScorecardNotificationIds(){
  try{return JSON.parse(localStorage.getItem('mutedScorecardNotifications')||'[]').map(String).filter(Boolean);}catch(e){return [];}
}
function scorecardNotificationsMuted(roundId){
  if(!roundId)return false;
  return mutedScorecardNotificationIds().includes(String(roundId));
}
function syncMutedScorecardsToServiceWorker(){
  try{
    if(!('serviceWorker' in navigator))return;
    const ids=mutedScorecardNotificationIds();
    const msg={type:'snyder-live-muted-rounds',roundIds:ids};
    if(navigator.serviceWorker.controller)navigator.serviceWorker.controller.postMessage(msg);
    navigator.serviceWorker.ready.then(reg=>{if(reg&&reg.active)reg.active.postMessage(msg);}).catch(()=>{});
  }catch(e){}
}
function setScorecardNotificationsMuted(roundId,muted){
  if(!roundId)return;
  const set=new Set(mutedScorecardNotificationIds());
  if(muted)set.add(String(roundId)); else set.delete(String(roundId));
  try{localStorage.setItem('mutedScorecardNotifications',JSON.stringify(Array.from(set)));}catch(e){}
  syncMutedScorecardsToServiceWorker();
}
// =========================================================
// Embedded assets
// Logo image used throughout the app
// =========================================================
const LOGO='data:image/png;base64,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';



// =========================================================
// Built-in course presets / badges
// These are safe local presets that can be imported into Supabase from Admin.
// =========================================================
const WHITLEY_BAY_BADGE='course-whitley-bay.png';
const WHITLEY_BAY_PRESETS=[
  {name:'Whitley Bay Golf Club - White Tee',location:'Whitley Bay',image_url:WHITLEY_BAY_BADGE,course_rating:72.7,slope_rating:135,holes:[
    {hole:1,par:5,stroke_index:12,yards:476},{hole:2,par:4,stroke_index:2,yards:422},{hole:3,par:3,stroke_index:18,yards:172},{hole:4,par:4,stroke_index:14,yards:377},{hole:5,par:4,stroke_index:4,yards:391},{hole:6,par:5,stroke_index:8,yards:515},{hole:7,par:4,stroke_index:6,yards:374},{hole:8,par:4,stroke_index:16,yards:352},{hole:9,par:3,stroke_index:10,yards:155},{hole:10,par:4,stroke_index:15,yards:356},{hole:11,par:4,stroke_index:5,yards:414},{hole:12,par:5,stroke_index:1,yards:582},{hole:13,par:3,stroke_index:17,yards:162},{hole:14,par:4,stroke_index:11,yards:390},{hole:15,par:4,stroke_index:9,yards:384},{hole:16,par:4,stroke_index:3,yards:409},{hole:17,par:3,stroke_index:13,yards:189},{hole:18,par:5,stroke_index:7,yards:459}
  ]},
  {name:'Whitley Bay Golf Club - Yellow Tee',location:'Whitley Bay',image_url:WHITLEY_BAY_BADGE,course_rating:71.5,slope_rating:127,holes:[
    {hole:1,par:5,stroke_index:12,yards:465},{hole:2,par:4,stroke_index:2,yards:406},{hole:3,par:3,stroke_index:18,yards:157},{hole:4,par:4,stroke_index:14,yards:368},{hole:5,par:4,stroke_index:4,yards:374},{hole:6,par:5,stroke_index:8,yards:501},{hole:7,par:4,stroke_index:6,yards:366},{hole:8,par:4,stroke_index:16,yards:334},{hole:9,par:3,stroke_index:10,yards:146},{hole:10,par:4,stroke_index:15,yards:337},{hole:11,par:4,stroke_index:5,yards:401},{hole:12,par:5,stroke_index:1,yards:566},{hole:13,par:3,stroke_index:17,yards:156},{hole:14,par:4,stroke_index:11,yards:381},{hole:15,par:4,stroke_index:9,yards:364},{hole:16,par:4,stroke_index:3,yards:400},{hole:17,par:3,stroke_index:13,yards:176},{hole:18,par:4,stroke_index:7,yards:406}
  ]},
  {name:'Whitley Bay Golf Club - Red Tee',location:'Whitley Bay',image_url:WHITLEY_BAY_BADGE,course_rating:74.1,slope_rating:134,holes:[
    {hole:1,par:5,stroke_index:10,yards:375},{hole:2,par:5,stroke_index:14,yards:388},{hole:3,par:3,stroke_index:16,yards:149},{hole:4,par:4,stroke_index:18,yards:310},{hole:5,par:4,stroke_index:8,yards:340},{hole:6,par:5,stroke_index:4,yards:458},{hole:7,par:4,stroke_index:2,yards:358},{hole:8,par:4,stroke_index:6,yards:322},{hole:9,par:3,stroke_index:12,yards:142},{hole:10,par:4,stroke_index:9,yards:319},{hole:11,par:4,stroke_index:13,yards:340},{hole:12,par:5,stroke_index:1,yards:522},{hole:13,par:3,stroke_index:15,yards:161},{hole:14,par:4,stroke_index:3,yards:372},{hole:15,par:4,stroke_index:5,yards:326},{hole:16,par:5,stroke_index:7,yards:370},{hole:17,par:3,stroke_index:17,yards:118},{hole:18,par:5,stroke_index:11,yards:384}
  ]}
];
const TYNEMOUTH_BADGE='course-tynemouth.svg';
const TYNEMOUTH_PRESETS=[
  {name:'Tynemouth Golf Club - White Tee',location:'North Shields',image_url:TYNEMOUTH_BADGE,course_rating:70.4,slope_rating:137,holes:[
    {hole:1,par:4,stroke_index:8,yards:386},{hole:2,par:4,stroke_index:16,yards:343},{hole:3,par:3,stroke_index:10,yards:176},{hole:4,par:4,stroke_index:2,yards:381},{hole:5,par:4,stroke_index:14,yards:407},{hole:6,par:4,stroke_index:4,yards:366},{hole:7,par:3,stroke_index:18,yards:156},{hole:8,par:5,stroke_index:6,yards:510},{hole:9,par:4,stroke_index:12,yards:358},{hole:10,par:4,stroke_index:5,yards:356},{hole:11,par:3,stroke_index:11,yards:182},{hole:12,par:5,stroke_index:3,yards:549},{hole:13,par:4,stroke_index:13,yards:379},{hole:14,par:4,stroke_index:1,yards:380},{hole:15,par:4,stroke_index:15,yards:356},{hole:16,par:4,stroke_index:7,yards:356},{hole:17,par:3,stroke_index:17,yards:166},{hole:18,par:4,stroke_index:9,yards:375}
  ]},
  {name:'Tynemouth Golf Club - Yellow Men Tee',location:'North Shields',image_url:TYNEMOUTH_BADGE,course_rating:68.7,slope_rating:133,holes:[
    {hole:1,par:4,stroke_index:8,yards:383},{hole:2,par:4,stroke_index:16,yards:321},{hole:3,par:3,stroke_index:10,yards:169},{hole:4,par:4,stroke_index:2,yards:371},{hole:5,par:4,stroke_index:14,yards:378},{hole:6,par:4,stroke_index:4,yards:322},{hole:7,par:3,stroke_index:18,yards:140},{hole:8,par:5,stroke_index:6,yards:500},{hole:9,par:4,stroke_index:12,yards:350},{hole:10,par:4,stroke_index:5,yards:348},{hole:11,par:3,stroke_index:11,yards:171},{hole:12,par:5,stroke_index:3,yards:534},{hole:13,par:4,stroke_index:13,yards:364},{hole:14,par:4,stroke_index:1,yards:365},{hole:15,par:4,stroke_index:15,yards:347},{hole:16,par:4,stroke_index:7,yards:328},{hole:17,par:3,stroke_index:17,yards:153},{hole:18,par:4,stroke_index:9,yards:351}
  ]},
  {name:'Tynemouth Golf Club - Red Men Tee',location:'North Shields',image_url:TYNEMOUTH_BADGE,course_rating:66.9,slope_rating:121,holes:[
    {hole:1,par:4,stroke_index:8,yards:378},{hole:2,par:4,stroke_index:16,yards:306},{hole:3,par:3,stroke_index:10,yards:155},{hole:4,par:4,stroke_index:2,yards:361},{hole:5,par:4,stroke_index:14,yards:401},{hole:6,par:4,stroke_index:4,yards:304},{hole:7,par:3,stroke_index:18,yards:120},{hole:8,par:5,stroke_index:6,yards:459},{hole:9,par:4,stroke_index:12,yards:320},{hole:10,par:4,stroke_index:5,yards:296},{hole:11,par:3,stroke_index:11,yards:156},{hole:12,par:5,stroke_index:3,yards:490},{hole:13,par:4,stroke_index:13,yards:354},{hole:14,par:4,stroke_index:1,yards:346},{hole:15,par:4,stroke_index:15,yards:314},{hole:16,par:4,stroke_index:7,yards:274},{hole:17,par:3,stroke_index:17,yards:118},{hole:18,par:4,stroke_index:9,yards:343}
  ]},
  {name:'Tynemouth Golf Club - Red Women Tee',location:'North Shields',image_url:TYNEMOUTH_BADGE,course_rating:73.2,slope_rating:131,holes:[
    {hole:1,par:5,stroke_index:8,yards:378},{hole:2,par:4,stroke_index:16,yards:306},{hole:3,par:3,stroke_index:10,yards:155},{hole:4,par:4,stroke_index:2,yards:361},{hole:5,par:5,stroke_index:14,yards:401},{hole:6,par:4,stroke_index:4,yards:304},{hole:7,par:3,stroke_index:18,yards:120},{hole:8,par:5,stroke_index:6,yards:459},{hole:9,par:4,stroke_index:12,yards:320},{hole:10,par:4,stroke_index:5,yards:296},{hole:11,par:3,stroke_index:11,yards:156},{hole:12,par:5,stroke_index:3,yards:490},{hole:13,par:4,stroke_index:13,yards:354},{hole:14,par:4,stroke_index:1,yards:346},{hole:15,par:4,stroke_index:15,yards:314},{hole:16,par:4,stroke_index:7,yards:274},{hole:17,par:3,stroke_index:17,yards:118},{hole:18,par:4,stroke_index:9,yards:343}
  ]},
  {name:'Tynemouth Golf Club - Red Women Alt Tee',location:'North Shields',image_url:TYNEMOUTH_BADGE,course_rating:72.8,slope_rating:130,holes:[
    {hole:1,par:5,stroke_index:8,yards:378},{hole:2,par:4,stroke_index:16,yards:306},{hole:3,par:3,stroke_index:10,yards:155},{hole:4,par:4,stroke_index:2,yards:361},{hole:5,par:5,stroke_index:14,yards:401},{hole:6,par:4,stroke_index:4,yards:304},{hole:7,par:3,stroke_index:18,yards:120},{hole:8,par:5,stroke_index:6,yards:459},{hole:9,par:4,stroke_index:12,yards:320},{hole:10,par:4,stroke_index:5,yards:296},{hole:11,par:3,stroke_index:11,yards:156},{hole:12,par:5,stroke_index:3,yards:490},{hole:13,par:4,stroke_index:13,yards:354},{hole:14,par:4,stroke_index:1,yards:346},{hole:15,par:4,stroke_index:15,yards:314},{hole:16,par:4,stroke_index:7,yards:274},{hole:17,par:3,stroke_index:17,yards:118},{hole:18,par:4,stroke_index:9,yards:343}
  ]}
];

const QUINTA_DO_LAGO_BADGE='course-quinta-do-lago.png';
const QUINTA_DO_LAGO_PRESETS=[
  {name:'Quinta do Lago North Course - White Tee',location:'Algarve, Portugal',image_url:QUINTA_DO_LAGO_BADGE,course_rating:72.8,slope_rating:133,holes:[
    {hole:1,par:4,stroke_index:15,yards:342},{hole:2,par:3,stroke_index:11,yards:196},{hole:3,par:5,stroke_index:9,yards:523},{hole:4,par:4,stroke_index:1,yards:370},{hole:5,par:4,stroke_index:5,yards:312},{hole:6,par:4,stroke_index:13,yards:334},{hole:7,par:5,stroke_index:7,yards:501},{hole:8,par:3,stroke_index:17,yards:171},{hole:9,par:4,stroke_index:3,yards:369},{hole:10,par:4,stroke_index:12,yards:345},{hole:11,par:5,stroke_index:10,yards:473},{hole:12,par:4,stroke_index:4,yards:372},{hole:13,par:4,stroke_index:6,yards:405},{hole:14,par:3,stroke_index:16,yards:160},{hole:15,par:4,stroke_index:2,yards:376},{hole:16,par:3,stroke_index:18,yards:145},{hole:17,par:4,stroke_index:14,yards:317},{hole:18,par:5,stroke_index:8,yards:445}
  ]},
  {name:'Quinta do Lago North Course - Yellow Tee',location:'Algarve, Portugal',image_url:QUINTA_DO_LAGO_BADGE,course_rating:71.8,slope_rating:131,holes:[
    {hole:1,par:4,stroke_index:15,yards:321},{hole:2,par:3,stroke_index:11,yards:166},{hole:3,par:5,stroke_index:9,yards:500},{hole:4,par:4,stroke_index:1,yards:349},{hole:5,par:4,stroke_index:5,yards:290},{hole:6,par:4,stroke_index:13,yards:300},{hole:7,par:5,stroke_index:7,yards:482},{hole:8,par:3,stroke_index:17,yards:139},{hole:9,par:4,stroke_index:3,yards:341},{hole:10,par:4,stroke_index:12,yards:325},{hole:11,par:5,stroke_index:10,yards:437},{hole:12,par:4,stroke_index:4,yards:340},{hole:13,par:4,stroke_index:6,yards:380},{hole:14,par:3,stroke_index:16,yards:131},{hole:15,par:4,stroke_index:2,yards:350},{hole:16,par:3,stroke_index:18,yards:113},{hole:17,par:4,stroke_index:14,yards:287},{hole:18,par:5,stroke_index:8,yards:410}
  ]},
  {name:'Quinta do Lago South Course - White Tee',location:'Algarve, Portugal',image_url:QUINTA_DO_LAGO_BADGE,course_rating:73.6,slope_rating:138,holes:[
    {hole:1,par:4,stroke_index:13,yards:368},{hole:2,par:5,stroke_index:7,yards:500},{hole:3,par:4,stroke_index:5,yards:387},{hole:4,par:3,stroke_index:17,yards:171},{hole:5,par:5,stroke_index:1,yards:500},{hole:6,par:4,stroke_index:9,yards:348},{hole:7,par:3,stroke_index:15,yards:175},{hole:8,par:4,stroke_index:3,yards:363},{hole:9,par:4,stroke_index:11,yards:355},{hole:10,par:4,stroke_index:6,yards:406},{hole:11,par:3,stroke_index:16,yards:184},{hole:12,par:5,stroke_index:12,yards:460},{hole:13,par:4,stroke_index:18,yards:325},{hole:14,par:4,stroke_index:2,yards:383},{hole:15,par:3,stroke_index:8,yards:196},{hole:16,par:4,stroke_index:14,yards:372},{hole:17,par:5,stroke_index:4,yards:510},{hole:18,par:4,stroke_index:10,yards:413}
  ]},
  {name:'Quinta do Lago South Course - Yellow Tee',location:'Algarve, Portugal',image_url:QUINTA_DO_LAGO_BADGE,course_rating:71.0,slope_rating:133,holes:[
    {hole:1,par:4,stroke_index:13,yards:377},{hole:2,par:5,stroke_index:7,yards:513},{hole:3,par:4,stroke_index:5,yards:382},{hole:4,par:3,stroke_index:17,yards:147},{hole:5,par:5,stroke_index:1,yards:524},{hole:6,par:4,stroke_index:9,yards:344},{hole:7,par:3,stroke_index:15,yards:175},{hole:8,par:4,stroke_index:3,yards:383},{hole:9,par:4,stroke_index:11,yards:350},{hole:10,par:4,stroke_index:6,yards:410},{hole:11,par:3,stroke_index:16,yards:175},{hole:12,par:5,stroke_index:12,yards:465},{hole:13,par:4,stroke_index:18,yards:312},{hole:14,par:4,stroke_index:2,yards:383},{hole:15,par:3,stroke_index:8,yards:175},{hole:16,par:4,stroke_index:14,yards:361},{hole:17,par:5,stroke_index:4,yards:536},{hole:18,par:4,stroke_index:10,yards:405}
  ]}
];

const OMBRIA_BADGE='course-ombria.png';
const OMBRIA_PRESETS=[
  {name:'Ombria Golf Course - White Tee',location:'Algarve, Portugal',image_url:OMBRIA_BADGE,course_rating:71.0,slope_rating:132,holes:[
    {hole:1,par:5,stroke_index:5,yards:468},{hole:2,par:5,stroke_index:3,yards:566},{hole:3,par:4,stroke_index:17,yards:377},{hole:4,par:3,stroke_index:13,yards:157},{hole:5,par:3,stroke_index:15,yards:200},{hole:6,par:5,stroke_index:7,yards:487},{hole:7,par:3,stroke_index:9,yards:175},{hole:8,par:4,stroke_index:11,yards:323},{hole:9,par:4,stroke_index:1,yards:423},{hole:10,par:4,stroke_index:4,yards:431},{hole:11,par:3,stroke_index:8,yards:229},{hole:12,par:5,stroke_index:2,yards:548},{hole:13,par:3,stroke_index:14,yards:160},{hole:14,par:4,stroke_index:16,yards:376},{hole:15,par:4,stroke_index:6,yards:348},{hole:16,par:5,stroke_index:10,yards:562},{hole:17,par:3,stroke_index:12,yards:192},{hole:18,par:4,stroke_index:18,yards:323}
  ]},
  {name:'Ombria Golf Course - Yellow Tee',location:'Algarve, Portugal',image_url:OMBRIA_BADGE,course_rating:68.6,slope_rating:127,holes:[
    {hole:1,par:5,stroke_index:5,yards:457},{hole:2,par:5,stroke_index:3,yards:489},{hole:3,par:4,stroke_index:17,yards:343},{hole:4,par:3,stroke_index:13,yards:137},{hole:5,par:3,stroke_index:15,yards:178},{hole:6,par:5,stroke_index:7,yards:463},{hole:7,par:3,stroke_index:9,yards:163},{hole:8,par:4,stroke_index:11,yards:301},{hole:9,par:4,stroke_index:1,yards:397},{hole:10,par:4,stroke_index:4,yards:410},{hole:11,par:3,stroke_index:8,yards:178},{hole:12,par:5,stroke_index:2,yards:493},{hole:13,par:3,stroke_index:14,yards:149},{hole:14,par:4,stroke_index:16,yards:350},{hole:15,par:4,stroke_index:6,yards:325},{hole:16,par:5,stroke_index:10,yards:539},{hole:17,par:3,stroke_index:12,yards:179},{hole:18,par:4,stroke_index:18,yards:300}
  ]}
];


function cleanCourseName(name){return String(name||'').replace(/\s*-\s*[^-]+?\s*Tee\s*$/i,'').trim();}
function courseTeeFromName(name){const m=String(name||'').match(/\s*-\s*([^-]+?)\s*Tee\s*$/i);return m?m[1].trim().replace(/\s+/g,' ').replace(/\b\w/g,c=>c.toUpperCase()):'';}
function getCourseName(course,round){return cleanCourseName((course&&course.name)||(round&&round.course_name)||'');}
function getCourseDisplayName(course,round){return getCourseName(course,round);}
function courseKey(course){return cleanCourseName(course&&course.name).toLowerCase()+'|'+(courseTeeFromName(course&&course.name)||course&&course.tee||'White').toLowerCase();}
function isProtectedCourse(course){const name=cleanCourseName(course&&course.name).toLowerCase();return name==='whitley bay golf club'||name.includes('whitley bay golf club')||name==='tynemouth golf club'||name.includes('tynemouth golf club')||name==='quinta do lago north course'||name.includes('quinta do lago north course')||name==='quinta do lago south course'||name.includes('quinta do lago south course')||name==='ombria golf course'||name.includes('ombria golf course');}
function presetIdForCourse(preset){return 'preset-'+cleanCourseName(preset.name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+(courseTeeFromName(preset.name)||preset.tee||'white').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function isRealDbId(id){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id||''));}
function safeCourseIdForDb(course,setupCourseId){const id=(course&&course.id)||setupCourseId||null;return isRealDbId(id)?id:null;}
function courseSummaryLine(course,round,holes){
  const list=holes||course&&course.holes||[];
  const totalPar=list.reduce((t,h)=>t+(parseInt(h.par)||0),0);
  const totalYards=list.reduce((t,h)=>t+(parseInt(h.yards)||0),0);
  const slope=course&&course.slope_rating;
  const rating=course&&course.course_rating;
  const bits=[];
  if(totalPar)bits.push('Par '+totalPar);
  if(totalYards)bits.push(totalYards+'y');
  bits.push((round&&round.tee||course&&course.tee||'White')+' tee');
  if(slope)bits.push('Slope '+slope);
  if(rating)bits.push('Rating '+rating);
  return bits.join(' - ');
}
function hasCourseRatingValue(value){return Number.isFinite(parseFloat(value));}
function hasCourseHoles(course){return Array.isArray(course&&course.holes)&&course.holes.length>0;}
function mergePresetCourses(dbCourses){
  const presets=[...WHITLEY_BAY_PRESETS,...TYNEMOUTH_PRESETS,...QUINTA_DO_LAGO_PRESETS,...OMBRIA_PRESETS].map(preset=>{
    const tee=courseTeeFromName(preset.name)||preset.tee||'White';
    return {...preset,id:preset.id||presetIdForCourse(preset),tee};
  });
  const presetByKey=new Map(presets.map(p=>[courseKey(p),p]));
  const merged=(dbCourses||[]).map(course=>{
    const preset=presetByKey.get(courseKey(course));
    if(!preset)return course;
    return {
      ...course,
      tee:course.tee||preset.tee,
      image_url:course.image_url||preset.image_url,
      holes:hasCourseHoles(course)?course.holes:preset.holes,
      course_rating:hasCourseRatingValue(course.course_rating)?course.course_rating:preset.course_rating,
      slope_rating:hasCourseRatingValue(course.slope_rating)?course.slope_rating:preset.slope_rating,
    };
  });
  const keys=new Set(merged.map(courseKey));
  presets.forEach(preset=>{if(!keys.has(courseKey(preset))){merged.push(preset);keys.add(courseKey(preset));}});
  return merged;
}
function getCourseOptions(courses){const byName=new Map();(courses||[]).forEach(c=>{if(!c)return;const base=cleanCourseName(c.name);if(!base)return;const tee=courseTeeFromName(c.name)||c.tee||'White';if(!byName.has(base))byName.set(base,{name:base,course:c,tees:{}});const item=byName.get(base);item.tees[tee]=c;if(!item.course||tee==='White')item.course=c;});return Array.from(byName.values()).sort((a,b)=>a.name.localeCompare(b.name));}
function normaliseTeeName(tee){return String(tee||'').trim().replace(/\s+/g,' ').toLowerCase();}
function findCourseForTee(courses,baseName,tee){
  const cleanBase=cleanCourseName(baseName);
  const wanted=normaliseTeeName(tee||'White');
  const option=getCourseOptions(courses).find(o=>o.name===cleanBase);
  if(!option)return null;
  const exactKey=Object.keys(option.tees||{}).find(k=>normaliseTeeName(k)===wanted);
  if(exactKey&&option.tees[exactKey])return option.tees[exactKey];
  const fallbackKey=Object.keys(option.tees||{}).find(k=>normaliseTeeName(k)==='white');
  return (fallbackKey&&option.tees[fallbackKey])||option.course||Object.values(option.tees||{})[0]||null;
}
function cupDayCourseStorageKey(cupId,day){return 'snyder_cup_day_course_'+String(cupId||'default')+'_'+String(parseInt(day)||1);}
function saveLocalCupDayCourse(cupId,day,course){try{if(course)localStorage.setItem(cupDayCourseStorageKey(cupId,day),JSON.stringify({course_id:course.id||'',course_db_id:safeCourseIdForDb(course,course.id),course_name:cleanCourseName(course.name)||course.name||'',tee:course.tee||courseTeeFromName(course.name)||'White'}));}catch(e){}}
function getLocalCupDayCourse(cupId,day){try{return JSON.parse(localStorage.getItem(cupDayCourseStorageKey(cupId,day))||'null');}catch(e){return null;}}
function resolveCupDayCourse(courses,cupDays,cupId,day){
  const dayNum=parseInt(day)||1;
  const row=(cupDays||[]).find(d=>String(d.cup_id||'')===String(cupId||'')&&(parseInt(d.day_number)||1)===dayNum)||{};
  const stored=getLocalCupDayCourse(cupId,dayNum)||{};
  const source={
    course_id:stored.course_id||row.course_id||'',
    course_db_id:stored.course_db_id||row.course_id||'',
    course_name:stored.course_name||row.course_name||'',
    tee:stored.tee||row.tee||'White'
  };
  if(source.course_id){const byId=(courses||[]).find(c=>String(c.id)===String(source.course_id));if(byId)return byId;}
  if(source.course_db_id){const byDbId=(courses||[]).find(c=>String(c.id)===String(source.course_db_id));if(byDbId)return byDbId;}
  if(source.course_name){const byName=findCourseForTee(courses,source.course_name,source.tee||'White');if(byName)return byName;}
  return (courses||[]).find(c=>hasCourseHoles(c))||(courses||[])[0]||null;
}
function idMatches(a,b){return a!=null&&b!=null&&String(a)===String(b);}
function userCanScoreRound(currentUser,group,roundPlayers){
  if(!currentUser)return false;
  const uid=currentUser.id;
  const groupIds=(group&&group.player_ids)||[];
  if(groupIds.some(id=>idMatches(id,uid)))return true;
  return (roundPlayers||[]).some(rp=>idMatches(rp.user_id,uid)||idMatches(rp.id,uid)&&rp.is_host);
}
function myRoundsForUser(rounds,groups,currentUser){
  if(!currentUser)return [];
  return sortRoundsNewestFirst((rounds||[]).filter(r=>(groups||[]).some(g=>g.round_id===r.id&&((g.player_ids||[]).some(pid=>idMatches(pid,currentUser.id))))));
}
function getCourseBadge(course,round){
  if(course&&course.image_url)return course.image_url;
  const name=getCourseName(course,round).toLowerCase();
  if(name.includes('whitley bay'))return WHITLEY_BAY_BADGE;
  if(name.includes('tynemouth'))return TYNEMOUTH_BADGE;
  if(name.includes('quinta'))return QUINTA_DO_LAGO_BADGE;
  if(name.includes('ombria'))return OMBRIA_BADGE;
  return '';
}
function getCourseInitials(course,round){
  const name=getCourseName(course,round)||'Golf';
  return name.split(' ').filter(Boolean).map(w=>w[0]).join('').slice(0,4).toUpperCase();
}
function CourseBadge({course,round,size=38}){
  const src=getCourseBadge(course,round);
  return <div style={{width:size,height:size,borderRadius:size>=70?'50%':10,overflow:'hidden',flexShrink:0,background:'linear-gradient(135deg,#0a3d6b,#0070BB)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:Math.max(9,Math.round(size/4)),fontWeight:700,color:'rgba(255,255,255,0.7)',border:'1px solid rgba(255,255,255,0.18)',boxShadow:size>=70?'0 10px 24px rgba(0,0,0,0.25)':'none'}}>
    {src?<img src={src} alt='' style={{width:'100%',height:'100%',objectFit:'contain',background:'transparent',padding:size>=70?4:2,boxSizing:'border-box'}} onError={e=>{e.currentTarget.style.display='none';}}/>:<div style={{textAlign:'center',lineHeight:1.1,padding:2}}>{getCourseInitials(course,round)}</div>}
  </div>;
}

function cupRoundInfoFromName(round){
  const name=String((round&&round.name)||'');
  const m=name.match(/(?:Snyder|Synder) Cup.*?Day\s+(\d+)\s+Group\s+(\d+)/i);
  return m?{day:parseInt(m[1])||1,group:parseInt(m[2])||1}:null;
}
function isSnyderCupRound(round){
  if(!round)return false;
  return !!cupRoundInfoFromName(round)||String(round.name||'').toLowerCase().includes('snyder cup')||String(round.name||'').toLowerCase().includes('synder cup');
}
function cupRoundDayNumber(round){
  const info=cupRoundInfoFromName(round);
  return parseInt((info&&info.day)||round&&round.day_number)||1;
}
function cupRoundGroupNumber(round){
  const info=cupRoundInfoFromName(round);
  return parseInt(info&&info.group)||1;
}
function cupGroupsForDay(cupMatches,day){
  const dayMatches=(cupMatches||[]).filter(m=>(parseInt(m.day_number)||1)===(parseInt(day)||1));
  const doubles=dayMatches.filter(m=>String(m.match_type||'').toLowerCase()==='doubles');
  const singles=dayMatches.filter(m=>String(m.match_type||'').toLowerCase()!=='doubles');
  const usedSingles=new Set();
  const groups=doubles.map((dbl,idx)=>{
    const ids=new Set([...(dbl.gold_player_ids||[]),...(dbl.navy_player_ids||[])].map(normaliseId));
    const linked=singles.filter(s=>{
      const sIds=[...(s.gold_player_ids||[]),...(s.navy_player_ids||[])].map(normaliseId);
      const ok=sIds.every(id=>ids.has(id));
      if(ok)usedSingles.add(s.id);
      return ok;
    });
    return{day,idx:idx+1,doubles:dbl,singles:linked,players:[...(dbl.gold_player_ids||[]),...(dbl.navy_player_ids||[])]};
  });
  singles.filter(s=>!usedSingles.has(s.id)).forEach(s=>groups.push({day,idx:groups.length+1,doubles:null,singles:[s],players:[...(s.gold_player_ids||[]),...(s.navy_player_ids||[])]}));
  return groups;
}
function cupMatchesDayReleased(cupMatches,day){
  const rows=(cupMatches||[]).filter(m=>(parseInt(m.day_number)||1)===(parseInt(day)||1));
  return rows.length>0&&rows.some(m=>String(m.status||'locked').toLowerCase()==='live'||String(m.status||'').toLowerCase()==='released');
}
async function refreshSnyderLiveNotificationSubscription(user){
  if(!('Notification' in window)||Notification.permission!=='granted')return {ok:false,skipped:true};
  if(localStorage.getItem('liveNotificationsMuted')==='true')return {ok:false,skipped:true};
  return enableSnyderLiveNotifications(user);
}
function cleanCupStoredDisplayName(name){
  const text=String(name||'');
  return text.startsWith(CUP_TEAM_C_STORAGE_PREFIX)?text.slice(CUP_TEAM_C_STORAGE_PREFIX.length):text;
}
function markCupTeamCDisplayName(name){
  const text=String(name||'').trim();
  return text.startsWith(CUP_TEAM_C_STORAGE_PREFIX)?text:CUP_TEAM_C_STORAGE_PREFIX+text;
}
function normaliseCupPlayerRow(row){
  if(!row)return row;
  const storedName=String(row.display_name||'');
  const legacyTeamC=storedName.startsWith(CUP_TEAM_C_STORAGE_PREFIX);
  return {...row,_stored_team_key:row.team_key,team_key:legacyTeamC?'red':row.team_key,display_name:cleanCupStoredDisplayName(storedName)};
}
function normaliseCupPlayerRows(rows){
  return (rows||[]).map(normaliseCupPlayerRow);
}
function isCupTeamKeyConstraintError(error){
  const msg=String(error&&error.message||'').toLowerCase();
  return (error&&String(error.code)==='23514')||msg.includes('team_key')&&msg.includes('check constraint');
}
function cupPlayerDisplayName(p){
  return cleanCupStoredDisplayName((p&&(p.display_name||p.name||p.username||p.full_name))||'Player');
}
function cupPlayersForGroupData(group,cupPlayers){
  const ids=[
    ...((group&&group.players)||[]),
    ...((group&&group.doubles&&group.doubles.gold_player_ids)||[]),
    ...((group&&group.doubles&&group.doubles.navy_player_ids)||[]),
    ...(((group&&group.singles)||[]).flatMap(m=>[...(m.gold_player_ids||[]),...(m.navy_player_ids||[])]))
  ];
  const seen=new Set();
  return ids.map(id=>{
    const key=normaliseId(id);
    return (cupPlayers||[]).find(p=>normaliseId(p.id)===key||normaliseId(p.user_id)===key||normaliseId(p.guest_id)===key);
  }).filter(Boolean).filter(p=>{const key=normaliseId(p.id||p.user_id||p.guest_id);if(seen.has(key))return false;seen.add(key);return true;});
}
function currentUserCanScoreCupGroup(currentUser,group,cupPlayers){
  if(!currentUser||!group)return false;
  const uid=normaliseId(currentUser.id);
  const name=String(currentUser.display_name||currentUser.name||currentUser.username||'').trim().toLowerCase();
  const first=name&&name.split(/\s+/)[0];
  return cupPlayersForGroupData(group,cupPlayers).some(p=>{
    if([p.id,p.user_id,p.guest_id].filter(Boolean).some(id=>normaliseId(id)===uid))return true;
    const playerName=String(cupPlayerDisplayName(p)).trim().toLowerCase();
    return !!name&&(playerName===name||(first&&playerName.split(/\s+/)[0]===first));
  });
}
function roundPlayerPrimaryId(rp,isCup){
  return isCup?(rp.id):(rp.user_id||rp.guest_id||rp.id);
}
function mapRoundPlayerForScorecard(rp,isCup){
  const id=roundPlayerPrimaryId(rp,isCup);
  return {id,name:rp.display_name,display_name:rp.display_name,current_handicap:rp.playing_handicap||0,handicap:rp.playing_handicap||0,user_id:rp.user_id,guest_id:rp.guest_id,cup_player_id:rp.cup_player_id,round_player_id:rp.id,avatar_image:rp.avatar_image,avatar_url:rp.avatar_url};
}
function scoreAliasesForPerson(person){
  return [person&&person.id,person&&person.user_id,person&&person.guest_id,person&&person.cup_player_id,person&&person.round_player_id].filter(Boolean).map(String);
}
function aliasesForSavedScoreId(savedId,people){
  const key=normaliseId(savedId);
  const person=(people||[]).find(p=>scoreAliasesForPerson(p).some(id=>normaliseId(id)===key));
  return person?scoreAliasesForPerson(person):[savedId];
}
function addRoundPlayerHandicaps(map,rp,isCup){
  const ids=isCup?[rp.id,rp.user_id,rp.guest_id,rp.cup_player_id]:[rp.user_id,rp.guest_id,rp.id];
  ids.filter(Boolean).forEach(id=>{map[id]=rp.playing_handicap||0;});
}

// =========================================================
// Shared inline style tokens
// Reusable button, card, input and label style objects
// =========================================================
const S={
  pri:{cursor:'pointer',borderRadius:10,fontSize:14,fontWeight:600,letterSpacing:'0.02em',padding:'10px 20px',border:'none',background:'linear-gradient(135deg,#0070BB,#005a96)',color:'#fff'},
  gho:{cursor:'pointer',borderRadius:10,fontSize:14,padding:'8px 16px',border:'1px solid rgba(255,255,255,0.2)',background:'rgba(255,255,255,0.06)',color:'#90ccf0'},
  dan:{cursor:'pointer',borderRadius:10,fontSize:14,padding:'8px 16px',border:'1px solid rgba(239,68,68,0.4)',background:'rgba(239,68,68,0.15)',color:'#fca5a5'},
  inp:{width:'100%',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.25)',borderRadius:8,color:'#fff',padding:'10px 12px',fontSize:14,outline:'none'},
  lbl:{fontSize:12,color:'#60b8f0',letterSpacing:'0.08em',textTransform:'uppercase',display:'block',marginBottom:6},
  card:{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:14,padding:16},
};
const NO_SELECT={userSelect:'none',WebkitUserSelect:'none',WebkitTouchCallout:'none',touchAction:'manipulation'};

// =========================================================
// Golf scoring helpers
// Stableford calculation and score colour helpers
// =========================================================
function isGivenGross(gross){
  const n=parseInt(gross);
  return Number.isFinite(n)&&n<-1;
}
function grossScoreValue(gross){
  const n=parseInt(gross);
  if(!Number.isFinite(n)||n===-1)return 0;
  return Math.abs(n);
}
function hasEnteredGross(gross){
  const n=parseInt(gross);
  return Number.isFinite(n)&&(n>0||n===-1||n<-1);
}
function grossDisplay(gross){
  const n=parseInt(gross);
  if(!Number.isFinite(n))return '.';
  if(n===-1)return '0';
  if(n<-1)return Math.abs(n)+'*';
  return String(n);
}
function grossTotalDisplay(total,hasGiven){
  const n=parseInt(total);
  if(!Number.isFinite(n))return '-';
  return String(n)+(hasGiven?'*':'');
}
function grossWithOverParDisplay(total,hasGiven,par){
  const grossText=grossTotalDisplay(total,hasGiven);
  const overText=overParDisplay(total,par);
  return grossTotalWithOverParText(grossText,overText);
}
function grossTotalWithOverParText(grossText,overText){
  if(!grossText||grossText==='-')return '-';
  if(!overText||overText==='-')return grossText;
  return `${grossText} (${overText})`;
}
function shotsOnHole(playingShots,strokeIndex){
  const shots=Math.max(0,Math.round(parseFloat(playingShots)||0));
  const si=Math.max(1,Math.min(18,parseInt(strokeIndex)||18));
  return Math.floor(shots/18)+((shots%18)>=si?1:0);
}
function formatMatchplayShortLabel(winner,diff,remaining){
  const d=Math.abs(parseInt(diff)||0);
  const r=Math.max(0,parseInt(remaining)||0);
  if(!d)return 'A/S';
  if(r>0)return d+'&'+r;
  return d+' UP';
}
function overParDisplay(gross,par){
  const g=parseInt(gross);
  const p=parseInt(par);
  if(!Number.isFinite(g)||!Number.isFinite(p)||g<=0||p<=0)return '-';
  const diff=g-p;
  if(diff===0)return 'E';
  return (diff>0?'+':'')+diff;
}
function pickupGrossForNoStableford(par,si,hcp){
  const shots=Math.floor((parseFloat(hcp)||0)/18)+((((parseFloat(hcp)||0)%18)>=si)?1:0);
  return (parseInt(par)||0)+shots+2;
}
function calcStableford(gross,par,si,hcp){
  if(gross===-1||isGivenGross(gross))return 0;
  if(!gross||gross<1)return null;
  const shots=Math.floor(hcp/18)+((hcp%18)>=si?1:0);
  const diff=par-(gross-shots);
  return Math.max(0,diff+2);
}
function addLeaderboardScore(totals,holes,holePoints,seen,pid,holeNum,pts){
  if(!pid||!holeNum)return;
  const key=pid+'|'+holeNum;
  if(seen&&seen.has(key))return;
  if(seen)seen.add(key);
  const points=stablefordPointsValue(pts);
  totals[pid]=(totals[pid]||0)+points;
  if(!holes[pid])holes[pid]=new Set();
  holes[pid].add(Number(holeNum));
  if(!holePoints[pid])holePoints[pid]={};
  holePoints[pid][Number(holeNum)]=points;
}
function recentLeaderboardPoints(row,count){
  const hp=row&&row._holePoints?row._holePoints:{};
  return Object.keys(hp).map(Number).filter(Number.isFinite).sort((a,b)=>b-a).slice(0,count).reduce((sum,h)=>sum+(parseInt(hp[h])||0),0);
}
function compareStablefordLeaderboardRows(a,b){
  const totalDiff=(b.total||0)-(a.total||0);
  if(totalDiff)return totalDiff;
  const holesDiff=(a.holes||0)-(b.holes||0);
  if(holesDiff)return holesDiff;
  for(const count of [3,6,9,12,15,18]){
    const diff=recentLeaderboardPoints(b,count)-recentLeaderboardPoints(a,count);
    if(diff)return diff;
  }
  return String(a.name||'').localeCompare(String(b.name||''));
}

function sweepstakeCountbackStages(key){
  const k=String(key||'overall').toLowerCase();
  if(k==='front'||k==='frontlive')return [
    {label:'last 6 of front 9',start:4,end:9},
    {label:'last 3 of front 9',start:7,end:9},
    {label:'last hole of front 9',start:9,end:9}
  ];
  if(k==='back'||k==='backlive')return [
    {label:'last 6 of back 9',start:13,end:18},
    {label:'last 3 of back 9',start:16,end:18},
    {label:'last hole of back 9',start:18,end:18}
  ];
  return [
    {label:'last 6 holes',start:13,end:18},
    {label:'last 3 holes',start:16,end:18},
    {label:'last hole',start:18,end:18},
    {label:'best front 9',start:1,end:9},
    {label:'last 6 of front 9',start:4,end:9},
    {label:'last 3 of front 9',start:7,end:9},
    {label:'last hole of front 9',start:9,end:9}
  ];
}
function resolveSweepstakeCountback(candidates,key,rangeScore){
  const tied=(candidates||[]).filter(Boolean);
  if(tied.length<=1)return {winner:tied[0]||null,winners:tied,reason:'',unresolved:false};
  let active=tied.slice();
  for(const stage of sweepstakeCountbackStages(key)){
    const scores=active.map(row=>({row,score:parseInt(rangeScore(row,stage.start,stage.end))||0}));
    const best=scores.length?Math.max(...scores.map(x=>x.score)):0;
    const next=scores.filter(x=>x.score===best).map(x=>x.row);
    if(next.length===1){
      return {winner:next[0],winners:[next[0]],reason:'Won on countback, '+stage.label,reasonShort:stage.label,unresolved:false};
    }
    active=next;
  }
  return {winner:null,winners:active,reason:'Still tied after countback',reasonShort:'countback tied',unresolved:true};
}
function sweepstakeWinnerText(pot){
  if(!pot)return 'Waiting for scores';
  if(pot.rollover)return 'Rolled over to overall';
  if(pot.manualDecision)return 'Manual decision needed';
  const winner=pot.winner||((pot.winners||[])[0]);
  return winner?(winner.displayName||gameFirstName(winner.name||'Player')):'Waiting for scores';
}
function sweepstakeReasonText(pot){
  if(!pot)return '';
  if(pot.rollover)return 'Still tied after countback — pot rolls over to overall winner';
  if(pot.manualDecision)return 'Still tied after all countback checks';
  return pot.reason||'';
}
function daySweepstakeWinnerText(pot,dayClosed){
  const text=sweepstakeWinnerText(pot);
  if(dayClosed||!pot||!pot.winner||text==='Waiting for scores'||text==='Rolled over to overall'||text==='Manual decision needed')return text;
  return 'Winning: '+text;
}
function daySweepstakeReasonText(pot,dayClosed){
  const text=sweepstakeReasonText(pot);
  if(dayClosed||!text)return text;
  if(/^Won on countback/i.test(text))return text.replace(/^Won on countback/i,'Leading on countback');
  if(text.indexOf('Still tied after countback')===0)return 'Currently tied after countback';
  if(text.indexOf('Still tied after all countback checks')===0)return 'Currently tied after all countback checks';
  return text;
}
function rawCourseHandicap(handicapIndex,course){
  const hi=parseFloat(handicapIndex)||0;
  const slope=parseFloat(course&&course.slope_rating)||113;
  const rating=parseFloat(course&&course.course_rating);
  const par=(course&&course.holes||[]).reduce((t,h)=>t+(parseInt(h.par)||0),0)||0;
  const ratingAdjust=Number.isFinite(rating)&&par?rating-par:0;
  return Math.max(0,(hi*slope/113)+ratingAdjust);
}
function calcCourseHandicap(handicapIndex,course){
  return Math.round(rawCourseHandicap(handicapIndex,course));
}
function calcPlayingHandicap(handicapIndex,course,allowance=1){
  return Math.max(0,Math.round(rawCourseHandicap(handicapIndex,course)*(parseFloat(allowance)||1)));
}
function handicapIndexFromPlayingHandicap(playingHandicap,course,allowance=1){
  const ph=Math.max(0,parseFloat(playingHandicap)||0);
  const slope=parseFloat(course&&course.slope_rating)||113;
  const rating=parseFloat(course&&course.course_rating);
  const par=(course&&course.holes||[]).reduce((t,h)=>t+(parseInt(h.par)||0),0)||0;
  const ratingAdjust=Number.isFinite(rating)&&par?rating-par:0;
  const allowed=ph/(parseFloat(allowance)||1);
  return Math.max(0,Math.round(((allowed-ratingAdjust)*113/slope)*10)/10);
}

function ptsColor(pts){
  if(pts===null||pts===undefined)return 'rgba(255,255,255,0.08)';
  if(pts>=4)return '#b8860b';
  if(pts===3)return '#1565C0';
  if(pts===2)return '#1b5e20';
  if(pts===1)return '#8B0000';
  return '#1a0a0a';
}

function gameName(name){
  return String(name||'Player').toUpperCase();
}
function gameFirstName(name){
  return gameName(String(name||'Player').split(' ')[0]);
}
function splitPlayerNameParts(name){
  const parts=String(name||'Player').trim().split(/\s+/).filter(Boolean);
  return {first:gameName(parts[0]||'Player'),second:gameName(parts.slice(1).join(' ')||parts[0]||'Player'),full:gameName(parts.join(' ')||'Player')};
}
function contextualPlayerName(name,allNames){
  const parts=splitPlayerNameParts(name);
  const firstCounts={};
  (allNames||[]).forEach(n=>{const f=splitPlayerNameParts(n).first;firstCounts[f]=(firstCounts[f]||0)+1;});
  return (firstCounts[parts.first]||0)>1?parts.full:parts.first;
}
function contextualNameMapFromRows(rows){
  const list=(rows||[]).filter(Boolean);
  const names=list.map(r=>r.display_name||r.name||'Player');
  const map={};
  list.forEach(r=>{if(r&&r.id)map[normaliseId(r.id)]=contextualPlayerName(r.display_name||r.name||'Player',names);});
  return map;
}
function contextualNameMapFromPlayers(players){
  const list=(players||[]).filter(Boolean);
  const names=list.map(p=>p.display_name||p.name||'Player');
  const map={};
  list.forEach(p=>{if(p&&p.id)map[normaliseId(p.id)]=contextualPlayerName(p.display_name||p.name||'Player',names);});
  return map;
}
function nameFromContextMap(map,id,fallback){
  return (map&&map[normaliseId(id)])||gameFirstName(fallback||'Player');
}


// =========================================================
// Score cloud save helpers
// Keeps local scoring fast, but makes Supabase failures visible/recoverable
// =========================================================
function newId(){
  try{if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();}catch(e){}
  return 'id_'+Date.now()+'_'+Math.random().toString(36).slice(2);
}
function cleanScoreRow(row){
  return {
    round_id:row.round_id,
    player_id:row.player_id,
    hole_number:parseInt(row.hole_number),
    gross_score:parseInt(row.gross_score),
    stableford_points:parseInt(row.stableford_points)||0,
    par:parseInt(row.par)||4,
    stroke_index:parseInt(row.stroke_index)||parseInt(row.hole_number)||1
  };
}
async function saveScoreRowsToCloud(sb,rows){
  const cleanRows=(rows||[]).map(cleanScoreRow).filter(r=>r.round_id&&r.player_id&&r.hole_number&&Number.isFinite(r.gross_score));
  if(!cleanRows.length)return {ok:true,count:0};

  // First try a proper batch upsert. This is what makes other players/spectators see scores.
  let res;
  try{
    res=await sb.from('cup_scores').upsert(cleanRows,{onConflict:'round_id,player_id,hole_number'});
  }catch(e){
    return {ok:false,error:'Network/cloud request failed: '+(e&&e.message?e.message:String(e))};
  }
  if(!res.error)return {ok:true,count:cleanRows.length};
  const first=res.error.message||String(res.error);

  // If the unique constraint is missing or old rows exist, fall back to update-then-insert per row.
  for(const row of cleanRows){
    const upd=await sb.from('cup_scores')
      .update(row)
      .eq('round_id',row.round_id)
      .eq('player_id',row.player_id)
      .eq('hole_number',row.hole_number)
      .select('round_id');
    if(upd.error)return {ok:false,error:upd.error.message||first};
    if(!upd.data||upd.data.length===0){
      let ins=await sb.from('cup_scores').insert(row);
      if(ins.error){
        const msg=ins.error.message||first;
        if(msg.toLowerCase().includes('null value')&&msg.toLowerCase().includes('id')){
          ins=await sb.from('cup_scores').insert({...row,id:newId()});
        }
      }
      if(ins.error)return {ok:false,error:(ins.error.message||first)+' | row='+JSON.stringify(row)};
    }
  }
  return {ok:true,count:cleanRows.length};
}
async function saveScoreRowToCloud(sb,row){
  return saveScoreRowsToCloud(sb,[row]);
}


// =========================================================
// Round date / archive helpers
// Round start display, week grouping and monthly grouping
// =========================================================
function roundStartValue(round){
  return round&&round.started_at||round&&round.round_started_at||round&&round.created_at||Date.now();
}
function parseRoundDateValue(value){
  if(value instanceof Date)return value;
  if(typeof value==='string'){
    const s=value.trim();
    if(/^\d{4}-\d{2}-\d{2}T/.test(s)&&!/(Z|[+-]\d{2}:?\d{2})$/i.test(s))return new Date(s+'Z');
  }
  return value?new Date(value):new Date();
}
function roundStartDate(round){
  return parseRoundDateValue(roundStartValue(round));
}
function formatRoundStart(round){
  return roundStartDate(round).toLocaleString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'});
}
const DAY_COMP_RE=/\s*\[DAY:([A-Z0-9]{5,8})\]\s*/;
function dayCompKeyFromRound(round){
  const fields=[round&&round.name,round&&round.course_name,round&&round.notes,round&&round.description,round&&round.metadata&&JSON.stringify(round.metadata)];
  for(const value of fields){
    const m=String(value||'').match(DAY_COMP_RE);
    if(m&&m[1])return m[1];
  }
  return null;
}
function stripDayCompMarker(name){
  return String(name||'').replace(DAY_COMP_RE,'').trim();
}
function roundDisplayName(round){
  return stripDayCompMarker((round&&round.name)||'')||(round&&round.course_name)||'Round';
}
function makeDayCompKey(){
  return Math.random().toString(36).replace(/[^a-z0-9]/gi,'').substring(2,7).toUpperCase();
}
function appendDayCompMarker(name,key){
  return stripDayCompMarker(name)+' [DAY:'+key+']';
}
function isDayCompBoardRound(round){
  return !!(round&&dayCompKeyFromRound(round)&&String(round.course_name||'')==='Day Leaderboard');
}
function dayCompRoundsFor(rounds,round){
  const key=dayCompKeyFromRound(round);
  if(!key)return [round].filter(Boolean);
  return (rounds||[]).filter(r=>dayCompKeyFromRound(r)===key);
}
function dayCompBoardFor(rounds,round){
  const list=dayCompRoundsFor(rounds,round);
  return list.find(isDayCompBoardRound)||list.slice().sort((a,b)=>roundStartDate(a)-roundStartDate(b))[0]||round;
}
function dayCompDisplayName(rounds,round){
  return roundDisplayName(dayCompBoardFor(rounds,round));
}
function playableDayCompRounds(rounds,round){
  return dayCompRoundsFor(rounds,round).filter(r=>!isDayCompBoardRound(r));
}
function liveDataRoundIds(rounds,visibleRounds){
  const ids=new Set();
  (visibleRounds||[]).forEach(r=>{
    if(r&&r.id)ids.add(r.id);
    if(dayCompKeyFromRound(r))dayCompRoundsFor(rounds,r).forEach(x=>{if(x&&x.id)ids.add(x.id);});
  });
  return Array.from(ids);
}
async function fetchDayCompRoundsFromCloud(dayKey,fallbackRounds=[]){
  const key=String(dayKey||'').trim().toUpperCase();
  const merged=new Map();
  (fallbackRounds||[]).filter(r=>dayCompKeyFromRound(r)===key).forEach(r=>{if(r&&r.id)merged.set(r.id,r);});
  if(!key||!sb)return Array.from(merged.values()).sort((a,b)=>roundStartDate(a)-roundStartDate(b));
  const marker='[DAY:'+key+']';
  const fields=['name','course_name','notes','description'];
  for(const field of fields){
    try{
      const res=await sb.from('cup_rounds').select('*').ilike(field,'%'+marker+'%');
      if(!res.error&&Array.isArray(res.data)){
        res.data.filter(r=>dayCompKeyFromRound(r)===key).forEach(r=>{if(r&&r.id)merged.set(r.id,r);});
      }
    }catch(e){}
  }
  return Array.from(merged.values()).sort((a,b)=>roundStartDate(a)-roundStartDate(b));
}
function startOfLocalDay(value){
  const d=value?parseRoundDateValue(value):new Date();
  d.setHours(0,0,0,0);
  return d;
}
function isSameLocalDay(a,b){
  return startOfLocalDay(a).getTime()===startOfLocalDay(b).getTime();
}
function monthKey(dateValue){
  return parseRoundDateValue(dateValue).toLocaleString('en-GB',{month:'long',year:'numeric',timeZone:'Europe/London'});
}
function startOfThisWeek(){
  const d=new Date();
  const day=d.getDay();
  const diff=(day===0?-6:1-day);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate()+diff);
  return d;
}
function isLiveRound(round){
  return round&&round.status==='live';
}
function uniqueVisibleLiveRounds(rounds,currentUser){
  const visible=(rounds||[]).filter(r=>{
    if(!isLiveRound(r))return false;
    if(!r.is_private)return true;
    return currentUser!=null;
  });
  const byKey=new Map();
  sortRoundsNewestFirst(visible).forEach(r=>{
    const dayKey=dayCompKeyFromRound(r);
    const key=dayKey?('day-comp-'+dayKey):(isSnyderCupRound(r)?('cup-day-'+cupRoundDayNumber(r)+'-group-'+cupRoundGroupNumber(r)):(r.id||('round-'+roundStartValue(r)+'-'+(r.name||r.course_name||''))));
    if(!byKey.has(key)||isDayCompBoardRound(r))byKey.set(key,r);
  });
  return Array.from(byKey.values());
}
function isCompletedRound(round){
  return round&&(round.status==='complete'||round.status==='completed');
}
function sortRoundsNewestFirst(list){
  return [...list].sort((a,b)=>roundStartDate(b)-roundStartDate(a));
}
function groupRoundsByMonth(list){
  return list.reduce((acc,r)=>{const key=monthKey(roundStartValue(r));if(!acc[key])acc[key]=[];acc[key].push(r);return acc;},{});
}

// =========================================================
// Shared UI components
// Toasts and player/avatar presentation
// =========================================================
function Toast({toast}){
  if(!toast)return null;
  return(
    <div style={{position:'fixed',bottom:80,left:'50%',transform:'translateX(-50%)',background:toast.type==='error'?'#ef4444':'#0070BB',color:'#fff',padding:'10px 20px',borderRadius:10,fontSize:13,zIndex:2000,maxWidth:'90vw'}}>
      {toast.msg}
    </div>
  );
}

function localAvatarKey(user){
  return user&&user.id?'snyder_avatar_'+user.id:null;
}
function userAvatarImage(user){
  if(!user)return '';
  if(user.avatar_image)return user.avatar_image;
  if(user.avatar_url)return user.avatar_url;
  const key=localAvatarKey(user);
  if(key){try{return localStorage.getItem(key)||'';}catch(e){}}
  return '';
}
function resizeAvatarFile(file){
  return new Promise((resolve,reject)=>{
    if(!file||!/^image\//.test(file.type||'')){reject(new Error('Choose an image file'));return;}
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const size=360;
        const canvas=document.createElement('canvas');
        canvas.width=size;canvas.height=size;
        const ctx=canvas.getContext('2d');
        const scale=Math.max(size/img.width,size/img.height);
        const sw=size/scale,sh=size/scale;
        const sx=(img.width-sw)/2,sy=(img.height-sh)/2;
        ctx.fillStyle='#0d2548';
        ctx.fillRect(0,0,size,size);
        ctx.drawImage(img,sx,sy,sw,sh,0,0,size,size);
        resolve(canvas.toDataURL('image/jpeg',0.78));
      };
      img.onerror=()=>reject(new Error('Could not read image'));
      img.src=reader.result;
    };
    reader.onerror=()=>reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

function Avatar({user,size=36}){
  const colors=['#0070BB','#1a4a5a','#2a3a1a','#4a1a3a','#3a2a1a'];
  const name=(user&&user.display_name)||'?';
  const img=userAvatarImage(user);
  const col=colors[name.charCodeAt(0)%colors.length];
  return(
    <div style={{width:size,height:size,borderRadius:'50%',background:col,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.4,color:'#fff',flexShrink:0,fontWeight:'bold'}}>
      {img?<img src={img} alt="" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover',display:'block'}}/>:name[0].toUpperCase()}
    </div>
  );
}

function formatHeaderHandicap(value){
  const n=parseFloat(value);
  if(!Number.isFinite(n))return '0';
  return Number.isInteger(n)?String(n):n.toFixed(1);
}

function handicapTrendFromHistory(row){
  if(!row)return null;
  const oldHandicap=parseFloat(row.old_handicap);
  const newHandicap=parseFloat(row.new_handicap);
  if(!Number.isFinite(oldHandicap)||!Number.isFinite(newHandicap))return null;
  const delta=newHandicap-oldHandicap;
  if(Math.abs(delta)<0.05)return null;
  return {direction:delta<0?'down':'up',delta:Math.abs(delta),oldHandicap,newHandicap};
}

function HandicapTrendBadge({trend}){
  if(!trend)return null;
  const improved=trend.direction==='down';
  const tone=improved
    ?{fg:'#9df6bb',bg:'rgba(34,197,94,0.14)',border:'rgba(34,197,94,0.30)',arrow:'↓'}
    :{fg:'#ffb1b1',bg:'rgba(239,68,68,0.15)',border:'rgba(248,113,113,0.32)',arrow:'↑'};
  return(
    <span aria-label={improved?'Handicap came down':'Handicap went up'} title={(improved?'Down ':'Up ')+formatHeaderHandicap(trend.delta)} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:4,padding:'4px 8px',borderRadius:999,border:'1px solid '+tone.border,background:tone.bg,color:tone.fg,fontSize:12,fontWeight:950,lineHeight:1,verticalAlign:'middle',boxShadow:'inset 0 1px 0 rgba(255,255,255,0.12)',textShadow:'none'}}>
      <span style={{fontSize:14,lineHeight:'12px',fontWeight:950}}>{tone.arrow}</span>
      <span style={{fontSize:11,lineHeight:'12px'}}>{formatHeaderHandicap(trend.delta)}</span>
    </span>
  );
}

function EnglandGolfMarker({user,size='1em',style={}}){
  if(!user||!user.england_golf_member_no)return null;
  return <span aria-label="England Golf linked" title="England Golf linked" style={{fontSize:size,lineHeight:1,textShadow:'none',display:'inline-flex',alignItems:'center',...style}}>&#x1F3F4;&#xE0067;&#xE0062;&#xE0065;&#xE006E;&#xE0067;&#xE007F;</span>;
}

function handicapBannerTone(trend){
  if(!trend)return {
    border:'rgba(245,215,110,0.34)',
    background:'linear-gradient(100deg,rgba(0,112,187,0.36) 0%,rgba(16,48,98,0.92) 44%,rgba(152,30,42,0.44) 100%)',
    glow:'0 10px 26px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.16)'
  };
  if(trend.direction==='down')return {
    border:'rgba(74,222,128,0.38)',
    background:'linear-gradient(100deg,rgba(0,112,187,0.34) 0%,rgba(16,48,98,0.92) 42%,rgba(22,101,52,0.58) 100%)',
    glow:'0 10px 26px rgba(0,0,0,0.25),0 0 18px rgba(34,197,94,0.12), inset 0 1px 0 rgba(255,255,255,0.16)'
  };
  return {
    border:'rgba(248,113,113,0.38)',
    background:'linear-gradient(100deg,rgba(0,112,187,0.34) 0%,rgba(16,48,98,0.92) 42%,rgba(153,27,27,0.62) 100%)',
    glow:'0 10px 26px rgba(0,0,0,0.25),0 0 18px rgba(239,68,68,0.12), inset 0 1px 0 rgba(255,255,255,0.16)'
  };
}

function handicapHistoryPoints(rows,currentHandicap){
  const clean=(rows||[]).slice().sort((a,b)=>new Date(a.synced_at||0)-new Date(b.synced_at||0));
  const points=[];
  clean.forEach((row,idx)=>{
    const oldValue=parseFloat(row.old_handicap);
    const newValue=parseFloat(row.new_handicap);
    const when=row.synced_at||null;
    if(idx===0&&Number.isFinite(oldValue))points.push({value:oldValue,date:when,label:'Before'});
    if(Number.isFinite(newValue))points.push({value:newValue,date:when,label:when?new Date(when).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}):'Sync'});
  });
  if(!points.length&&Number.isFinite(parseFloat(currentHandicap)))points.push({value:parseFloat(currentHandicap),date:null,label:'Now'});
  return points;
}

function HandicapHistoryModal({open,onClose,user,rows,loading,error}){
  if(!open)return null;
  const points=handicapHistoryPoints(rows,user&&user.handicap);
  const values=points.map(p=>p.value).filter(Number.isFinite);
  const minValue=values.length?Math.min(...values):0;
  const maxValue=values.length?Math.max(...values):0;
  const pad=Math.max(0.3,(maxValue-minValue)*0.22);
  const minScale=minValue-pad;
  const maxScale=maxValue+pad;
  const range=Math.max(0.1,maxScale-minScale);
  const w=320,h=170,padX=24,padY=22;
  const chartPoints=points.map((p,i)=>{
    const x=points.length===1?w/2:padX+(i*(w-(padX*2))/(points.length-1));
    const y=padY+((maxScale-p.value)/range)*(h-(padY*2));
    return {...p,x,y};
  });
  const line=chartPoints.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
  const latest=points[points.length-1];
  const first=points[0];
  const moved=first&&latest&&Number.isFinite(first.value)&&Number.isFinite(latest.value)?latest.value-first.value:0;
  const movedDown=moved<0;
  const movedColor=Math.abs(moved)<0.05?'#9fb6c9':movedDown?'#86efac':'#fca5a5';
  return(
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(2,8,23,0.82)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={e=>{if(e.target===e.currentTarget)onClose&&onClose();}}>
      <div role="dialog" aria-modal="true" aria-label="Handicap history" style={{width:'100%',maxWidth:420,borderRadius:20,border:'1px solid rgba(96,184,240,0.24)',background:'linear-gradient(180deg,rgba(13,37,72,0.98),rgba(8,24,48,0.98))',boxShadow:'0 24px 70px rgba(0,0,0,0.55)',overflow:'hidden'}}>
        <div style={{padding:'16px 16px 10px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
          <div style={{minWidth:0}}>
            <div style={{fontSize:18,fontWeight:950,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{(user&&(user.display_name||user.username))||'Player'}</div>
            <div style={{fontSize:12,color:'#90ccf0',fontWeight:800,marginTop:2}}>England Golf handicap history</div>
          </div>
          <button onClick={onClose} aria-label="Close handicap history" style={{width:34,height:34,borderRadius:999,border:'1px solid rgba(255,255,255,0.18)',background:'rgba(255,255,255,0.07)',color:'#fff',fontSize:18,fontWeight:900,cursor:'pointer'}}>x</button>
        </div>
        <div style={{padding:'0 16px 16px'}}>
          {loading?<div style={{...S.card,textAlign:'center',fontSize:13,color:'#90ccf0'}}>Loading handicap history...</div>:error?<div style={{...S.card,textAlign:'center',fontSize:13,color:'#fca5a5'}}>{error}</div>:points.length<2?<div style={{...S.card,textAlign:'center',fontSize:13,color:'rgba(255,255,255,0.65)'}}>No handicap changes recorded yet. The graph will build as the daily England Golf sync records changes.</div>:(
            <>
              <div style={{border:'1px solid rgba(255,255,255,0.12)',borderRadius:16,background:'rgba(255,255,255,0.045)',padding:10,overflow:'hidden'}}>
                <svg viewBox={`0 0 ${w} ${h}`} style={{display:'block',width:'100%',height:'auto'}}>
                  {[0,1,2,3].map(i=>{const y=padY+(i*(h-(padY*2))/3);const value=maxScale-(i*range/3);return <g key={'grid-'+i}><line x1={padX} x2={w-padX} y1={y} y2={y} stroke="rgba(255,255,255,0.10)" strokeWidth="1"/><text x={4} y={y+4} fill="rgba(255,255,255,0.50)" fontSize="9" fontWeight="700">{formatHeaderHandicap(value)}</text></g>;})}
                  <polyline points={line} fill="none" stroke="#F5D76E" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                  {chartPoints.map((p,i)=><g key={'pt-'+i}><circle cx={p.x} cy={p.y} r="5" fill={i===chartPoints.length-1?'#F5D76E':'#90ccf0'} stroke="#0d2548" strokeWidth="2"/>{(i===0||i===chartPoints.length-1)&&<text x={p.x} y={p.y-11} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="900">{formatHeaderHandicap(p.value)}</text>}</g>)}
                </svg>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginTop:10}}>
                <div style={{border:'1px solid rgba(255,255,255,0.10)',borderRadius:12,padding:10,background:'rgba(255,255,255,0.045)'}}><div style={{fontSize:10,color:'#9fb6c9',fontWeight:900}}>START</div><div style={{fontSize:18,color:'#fff',fontWeight:950}}>{formatHeaderHandicap(first.value)}</div></div>
                <div style={{border:'1px solid rgba(255,255,255,0.10)',borderRadius:12,padding:10,background:'rgba(255,255,255,0.045)'}}><div style={{fontSize:10,color:'#9fb6c9',fontWeight:900}}>NOW</div><div style={{fontSize:18,color:'#F5D76E',fontWeight:950}}>{formatHeaderHandicap(latest.value)}</div></div>
                <div style={{border:'1px solid rgba(255,255,255,0.10)',borderRadius:12,padding:10,background:'rgba(255,255,255,0.045)'}}><div style={{fontSize:10,color:'#9fb6c9',fontWeight:900}}>MOVE</div><div style={{fontSize:18,color:movedColor,fontWeight:950}}>{Math.abs(moved)<0.05?'0':(moved>0?'+':'')+formatHeaderHandicap(moved)}</div></div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function HandicapPicker({value,onChange,style={},buttonStyle={},label='Handicap',step=1,min=-6,max=54,defaultValue=8}){
  const[open,setOpen]=useState(false);
  const hasValue=!(value===''||value==null||Number.isNaN(parseFloat(value)));
  const current=hasValue?parseFloat(value):defaultValue;
  const count=Math.round((max-min)/step)+1;
  const values=Array.from({length:count},(_,i)=>parseFloat((min+(i*step)).toFixed(step<1?1:0)));
  const display=step<1?current.toFixed(1):current;
  const listRef=useRef(null);
  useEffect(()=>{
    if(!open||!listRef.current)return;
    const idx=Math.max(0,values.findIndex(v=>Math.abs(v-current)<(step/2)));
    listRef.current.scrollTop=Math.max(0,idx*54-92);
  },[open,current]);
  function pick(v){onChange(v);setOpen(false);}
  return(
    <>
      <button type="button" onClick={()=>setOpen(true)} style={{...S.inp,cursor:'pointer',textAlign:'center',fontWeight:800,...buttonStyle,...style}}>{display}</button>
      {open&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={e=>{if(e.target===e.currentTarget)setOpen(false);}}>
          <div style={{width:'100%',maxWidth:420,background:'#0d2548',border:'1px solid rgba(255,255,255,0.16)',borderRadius:18,padding:16,boxShadow:'0 24px 60px rgba(0,0,0,0.45)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <div style={{fontSize:18,color:'#fff',fontWeight:900}}>{label}</div>
              <button type="button" onClick={()=>setOpen(false)} style={{...S.gho,padding:'5px 10px',fontSize:16,lineHeight:1}}>x</button>
            </div>
            <div ref={listRef} style={{height:260,overflowY:'auto',scrollSnapType:'y mandatory',border:'1px solid rgba(255,255,255,0.12)',borderRadius:14,background:'rgba(255,255,255,0.05)',padding:'92px 12px'}}>
              {values.map(v=>(
                <button type="button" key={v} onClick={()=>pick(v)} style={{width:'100%',height:48,marginBottom:6,borderRadius:10,border:Math.abs(v-current)<(step/2)?'1px solid rgba(96,184,240,0.75)':'1px solid rgba(255,255,255,0.08)',background:Math.abs(v-current)<(step/2)?'rgba(0,112,187,0.38)':'rgba(255,255,255,0.06)',color:'#fff',fontSize:22,fontWeight:900,scrollSnapAlign:'center',cursor:'pointer'}}>{step<1?v.toFixed(1):v}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// =========================================================
// User authentication modal
// Login, signup and guest entry handling
// =========================================================
function UserAuth({onLogin,onClose,initialMode='login',promptTitle,promptText,signupButtonText,guests=[],onRefresh}){
  const[mode,setMode]=useState(initialMode);
  const[username,setUsername]=useState('');
  const[pin,setPin]=useState('');
  const[name,setName]=useState('');
  const[hcp,setHcp]=useState('18.0');
  const[claimGuestId,setClaimGuestId]=useState('');
  const[err,setErr]=useState('');
  const[loading,setLoading]=useState(false);
  const claimableGuests=(guests||[]).filter(g=>g&&g.id&&g.name).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  const selectedGuest=claimableGuests.find(g=>normaliseId(g.id)===normaliseId(claimGuestId));

  function chooseGuest(id){
    setClaimGuestId(id||'');
    const guest=claimableGuests.find(g=>normaliseId(g.id)===normaliseId(id));
    if(guest){
      setName(guest.name||'');
      setHcp(String(Number.isFinite(parseFloat(guest.handicap))?parseFloat(guest.handicap):18));
    }
  }

  async function claimGuestForUser(guest,user){
    if(!guest||!guest.id||!user||!user.id)return;
    const guestId=guest.id;
    const userId=user.id;
    const displayName=user.display_name||guest.name||user.username||'Player';
    await sb.from('cup_round_players').update({user_id:userId,guest_id:null,display_name:displayName}).eq('guest_id',guestId);
    await sb.from('cup_scores').update({player_id:userId}).eq('player_id',guestId);
    const{data:allGroups}=await sb.from('cup_groups').select('*');
    const linkedGroups=(allGroups||[]).filter(grp=>(grp.player_ids||[]).some(pid=>normaliseId(pid)===normaliseId(guestId)));
    for(const grp of linkedGroups||[]){
      const nextIds=(grp.player_ids||[]).map(pid=>normaliseId(pid)===normaliseId(guestId)?userId:pid);
      const nextHcps={...(grp.playing_handicaps||{})};
      if(Object.prototype.hasOwnProperty.call(nextHcps,guestId)){
        nextHcps[userId]=nextHcps[guestId];
        delete nextHcps[guestId];
      }
      await sb.from('cup_groups').update({player_ids:nextIds,playing_handicaps:nextHcps}).eq('id',grp.id);
    }
    await sb.from('cup_guests').delete().eq('id',guestId);
    if(onRefresh)await onRefresh();
  }

  async function submit(){
    setErr('');setLoading(true);
    try{
      if(mode==='login'){
        const{data,error}=await sb.from('cup_users').select('*').eq('username',username.toLowerCase().trim()).eq('pin',pin.trim()).single();
        if(error||!data){setErr('Wrong username or PIN');setLoading(false);return;}
        localStorage.setItem('snyder_user',JSON.stringify(data));
        onLogin(data);
      } else {
        const{data:ex}=await sb.from('cup_users').select('id').eq('username',username.toLowerCase().trim()).single();
        if(ex){setErr('Username taken');setLoading(false);return;}
        const parsedHandicap=Number.isFinite(parseFloat(hcp))?parseFloat(hcp):18;
        const userPayload={
          username:username.toLowerCase().trim(),pin:pin.trim(),
          display_name:name.trim()||username,handicap:parsedHandicap,
          avatar_initial:(name.trim()||username||'?')[0]?.toUpperCase()||'?'
        };
        const{data,error}=await sb.from('cup_users').insert(userPayload).select().single();
        if(error){setErr(error.message);setLoading(false);return;}
        const savedUser={...data,handicap:Number.isFinite(parseFloat(data.handicap))?parseFloat(data.handicap):parsedHandicap};
        if(savedUser.handicap!==parsedHandicap){
          await sb.from('cup_users').update({handicap:parsedHandicap}).eq('id',savedUser.id);
          savedUser.handicap=parsedHandicap;
        }
        if(selectedGuest)await claimGuestForUser(selectedGuest,savedUser);
        localStorage.setItem('snyder_user',JSON.stringify(savedUser));
        onLogin(savedUser);
      }
    }catch(e){setErr(e.message);}
    setLoading(false);
  }

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:16}}>
      <div style={{...S.card,width:'100%',maxWidth:380}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontSize:18,color:'#fff'}}>{promptTitle||(mode==='login'?'Sign In':'Create Account')}</div>
          <button onClick={onClose} style={{...S.gho,padding:'4px 10px',fontSize:16}}>x</button>
        </div>
        {promptText&&<div style={{background:'rgba(0,112,187,0.14)',border:'1px solid rgba(96,184,240,0.28)',borderRadius:10,padding:'10px 12px',fontSize:13,color:'#dbeafe',lineHeight:1.35,marginBottom:12}}>{promptText}</div>}
        {err&&<div style={{background:'rgba(239,68,68,0.15)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'#fca5a5',marginBottom:12}}>{err}</div>}
        {mode==='signup'&&(
          <div>
            {claimableGuests.length>0&&(
              <div style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:12,padding:12,marginBottom:12}}>
                <div style={{fontSize:13,color:'#fff',fontWeight:800,marginBottom:4}}>Are you already on the guest list?</div>
                <div style={{fontSize:12,color:'rgba(255,255,255,0.65)',lineHeight:1.35,marginBottom:10}}>Choose yourself here and your guest entry will become this account.</div>
                <select value={claimGuestId} onChange={e=>chooseGuest(e.target.value)} style={{...S.inp,marginBottom:selectedGuest?8:0}}>
                  <option value="">No, create a new user</option>
                  {claimableGuests.map(g=><option key={g.id} value={g.id}>{g.name} - HCP {g.handicap||0}</option>)}
                </select>
                {selectedGuest&&<div style={{fontSize:12,color:'#90ccf0'}}>Selected guest: {selectedGuest.name}. This will remove them from the guest list.</div>}
              </div>
            )}
            <label style={S.lbl}>Display Name</label>
            <input style={{...S.inp,marginBottom:12}} value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/>
            <label style={S.lbl}>EG Handicap</label>
            <HandicapPicker value={hcp} onChange={setHcp} style={{marginBottom:12}} label="EG Handicap" step={0.1} min={0} max={54} defaultValue={18}/>
          </div>
        )}
        <label style={S.lbl}>Username</label>
        <input style={{...S.inp,marginBottom:12}} value={username} onChange={e=>setUsername(e.target.value)} placeholder="username" autoCapitalize="none"/>
        <label style={S.lbl}>PIN</label>
        <input style={{...S.inp,marginBottom:16}} type="password" value={pin} onChange={e=>setPin(e.target.value)} placeholder="PIN" inputMode="numeric"/>
        <button onClick={submit} disabled={loading} style={{...S.pri,width:'100%',marginBottom:10,opacity:loading?0.6:1}}>
          {loading?'...':(mode==='login'?'Sign In':(signupButtonText||'Create Account'))}
        </button>
        <button onClick={()=>{setMode(m=>m==='login'?'signup':'login');setErr('');}} style={{...S.gho,width:'100%',fontSize:13}}>
          {mode==='login'?'New? Create account':'Already have account? Sign in'}
        </button>
      </div>
    </div>
  );
}

// =========================================================
// People picker / player selection
// Friends, guests and ad-hoc player management
// =========================================================
function PeoplePicker({currentUser,cupUsers,guests,flash,onAdd,onClose,alreadyAdded}){
  const[tab,setTab]=useState('friends');
  const[search,setSearch]=useState('');
  const[memberList,setMemberList]=useState(cupUsers||[]);
  const[friends,setFriends]=useState([]);
  const[refreshingMembers,setRefreshingMembers]=useState(false);
  const[guestName,setGuestName]=useState('');
  const[guestHcp,setGuestHcp]=useState('');
  const[guestCasual,setGuestCasual]=useState(false);

  useEffect(()=>{
    setMemberList(cupUsers||[]);
  },[cupUsers]);

  useEffect(()=>{
    loadFriends(memberList);
  },[currentUser&&currentUser.id,memberList.length]);

  async function loadFriends(users=memberList){
    if(!currentUser){setFriends([]);return;}
    const{data}=await sb.from('cup_friendships').select('friend_id').eq('user_id',currentUser.id);
    const ids=[...new Set((data||[]).map(f=>f.friend_id))];
    setFriends((users||[]).filter(u=>ids.includes(u.id)));
  }

  async function refreshPlayers(){
    setRefreshingMembers(true);
    const{data,error}=await sb.from('cup_users').select('*').order('display_name',{ascending:true});
    if(error){flash(error.message||'Could not refresh players','error');setRefreshingMembers(false);return;}
    const users=data||[];
    setMemberList(users);
    await loadFriends(users);
    setRefreshingMembers(false);
    flash('Players refreshed');
  }

  const searchTerm=search.trim().toLowerCase();
  const searchRes=searchTerm.length>1?memberList.filter(u=>{
    const username=(u.username||'').toLowerCase();
    const displayName=(u.display_name||u.name||'').toLowerCase();
    return u.id!==currentUser?.id&&(username.includes(searchTerm)||displayName.includes(searchTerm));
  }).slice(0,8):[];
  const myGuests=guests.filter(g=>!currentUser||g.created_by===currentUser.id);
  const isAdded=id=>alreadyAdded&&alreadyAdded.some(existing=>normaliseId(existing)===normaliseId(id));

  async function addFriend(u){
    if(!currentUser)return;
    if(friends.some(f=>normaliseId(f.id)===normaliseId(u.id))){flash((u.display_name||u.username||'Player')+' is already your friend');return;}
    const pairs=[
      {user_id:currentUser.id,friend_id:u.id},
      {user_id:u.id,friend_id:currentUser.id}
    ];
    for(const pair of pairs){
      const{data:existing}=await sb.from('cup_friendships').select('id').eq('user_id',pair.user_id).eq('friend_id',pair.friend_id).limit(1);
      if(!existing||existing.length===0)await sb.from('cup_friendships').insert(pair);
    }
    setFriends(prev=>prev.some(f=>normaliseId(f.id)===normaliseId(u.id))?prev:[...prev,u]);
    flash((u.display_name||u.username||'Player')+' is now your friend');
  }

  async function createGuest(){
    if(!guestName.trim())return;
    const{data}=await sb.from('cup_guests').insert({created_by:currentUser?.id,name:guestName.trim(),handicap:parseFloat(guestHcp)||0}).select().single();
    if(data){onAdd({...data,is_guest:true,display_name:data.name,is_casual:guestCasual,fixed_playing_handicap:guestCasual?(parseInt(guestHcp,10)||0):undefined});setGuestName('');setGuestHcp('');setGuestCasual(false);}
  }

  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.82)',display:'flex',alignItems:'flex-start',justifyContent:'center',zIndex:150,padding:'max(24px,8vh) 14px 14px'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#0d2548',border:'1px solid rgba(255,255,255,0.16)',borderRadius:18,width:'100%',maxWidth:500,maxHeight:'min(78vh,680px)',display:'flex',flexDirection:'column',boxShadow:'0 24px 60px rgba(0,0,0,0.45)',overflow:'hidden'}}>
        <div style={{padding:'14px 16px 12px',display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
          <div>
            <div style={{fontSize:18,color:'#fff',fontWeight:900}}>Add player</div>
            <div style={{fontSize:12,color:'#90ccf0',marginTop:3}}>Add friends quickly, search members or add a guest</div>
          </div>
          <button onClick={onClose} style={{...S.gho,padding:'5px 10px',fontSize:16,lineHeight:1}}>x</button>
        </div>
        <div style={{display:'flex',gap:6,padding:'10px 16px',borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
          {[['friends','Friends'],['search','Search'],['guests','Guests']].map(([key,label])=>(
            <button key={key} onClick={()=>setTab(key)} style={{...(tab===key?S.pri:S.gho),flex:1,padding:'8px 4px',fontSize:12}}>{label}</button>
          ))}
        </div>
        <div style={{flex:1,overflow:'auto',padding:16}}>
          {tab==='friends'&&(
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:10}}>
                <div style={{fontSize:12,color:'#90ccf0'}}>Refresh if someone has just signed up.</div>
                <button onClick={refreshPlayers} disabled={refreshingMembers} style={{...S.gho,padding:'6px 10px',fontSize:12,opacity:refreshingMembers?0.6:1}}>{refreshingMembers?'Refreshing...':'Refresh'}</button>
              </div>
              {friends.length===0
                ?<div style={{color:'rgba(255,255,255,0.4)',fontSize:13,textAlign:'center',padding:20}}>No friends yet - use Search tab to add some</div>
                :friends.map(u=>(
                <div key={u.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,padding:'10px 12px',background:'rgba(255,255,255,0.06)',borderRadius:10}}>
                  <div>
                    <div style={{fontSize:14,color:'#fff'}}>{u.display_name}</div>
                    <div style={{fontSize:11,color:'#60b8f0'}}>HCP {u.handicap}</div>
                  </div>
                  <button onClick={()=>onAdd({...u,is_guest:false})} disabled={isAdded(u.id)} style={{...S.pri,padding:'6px 14px',fontSize:12,opacity:isAdded(u.id)?0.4:1}}>{isAdded(u.id)?'Added':'Add'}</button>
                </div>
              ))}
            </div>
          )}
          {tab==='search'&&(
            <div>
              <input style={{...S.inp,marginBottom:12,fontSize:16,padding:'12px 14px'}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search username or name..." autoCapitalize="none" autoFocus/>
              {searchTerm.length<=1&&<div style={{...S.card,fontSize:13,color:'rgba(255,255,255,0.58)',textAlign:'center',padding:18}}>Start typing a name or username</div>}
              {searchRes.map(u=>(
                <div key={u.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,padding:'10px 12px',background:'rgba(255,255,255,0.06)',borderRadius:10}}>
                  <div>
                    <div style={{fontSize:14,color:'#fff'}}>{u.display_name}</div>
                    <div style={{fontSize:11,color:'#60b8f0'}}>@{u.username} - HCP {u.handicap}</div>
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={()=>addFriend(u)} disabled={friends.some(f=>normaliseId(f.id)===normaliseId(u.id))} style={{...S.gho,padding:'6px 10px',fontSize:11,opacity:friends.some(f=>normaliseId(f.id)===normaliseId(u.id))?0.45:1}}>{friends.some(f=>normaliseId(f.id)===normaliseId(u.id))?'Friend':'+Friend'}</button>
                    <button onClick={()=>onAdd({...u,is_guest:false})} disabled={isAdded(u.id)} style={{...S.pri,padding:'6px 14px',fontSize:12,opacity:isAdded(u.id)?0.4:1}}>{isAdded(u.id)?'Added':'Add'}</button>
                  </div>
                </div>
              ))}
              {searchTerm.length>1&&searchRes.length===0&&<div style={{...S.card,fontSize:13,color:'rgba(255,255,255,0.58)',textAlign:'center',padding:18}}>No matching members found</div>}
            </div>
          )}
          {tab==='guests'&&(
            <div>
              <div style={{...S.card,marginBottom:12,background:'rgba(0,112,187,0.10)',borderColor:'rgba(96,184,240,0.22)'}}>
                <label style={S.lbl}>Guest Name</label>
                <input style={{...S.inp,marginBottom:8}} value={guestName} onChange={e=>setGuestName(e.target.value)} placeholder="Name"/>
                <label style={S.lbl}>{guestCasual?'Playing shots':'EG Handicap'}</label>
                <HandicapPicker value={guestHcp} onChange={setGuestHcp} style={{marginBottom:8}} label={guestCasual?'Guest playing shots':'Guest EG handicap'} step={guestCasual?1:0.1} min={0} max={54} defaultValue={guestCasual?25:18}/>
                <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:'#fff',margin:'4px 0 12px'}}><input type="checkbox" checked={guestCasual} onChange={e=>setGuestCasual(e.target.checked)}/> Casual golfer - use fixed playing shots</label>
                <button onClick={createGuest} style={{...S.pri,width:'100%'}}>Add guest to round</button>
              </div>
              {myGuests.map(g=>(
                <div key={g.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,padding:'10px 12px',background:'rgba(255,255,255,0.06)',borderRadius:10}}>
                  <div>
                    <div style={{fontSize:14,color:'#fff'}}>{g.name}</div>
                    <div style={{fontSize:11,color:'#60b8f0'}}>Guest - HCP {g.handicap}</div>
                  </div>
                  <button onClick={()=>onAdd({...g,is_guest:true,display_name:g.name})} style={{...S.pri,padding:'6px 14px',fontSize:12}}>Add</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =========================================================
// Main app controller
// Top-level state, routing, data loading and dashboard rendering
// =========================================================
function App(){
  // v2.34: no startup splash/loading gate. Render the app immediately.
  const splash=false;
  const setSplash=()=>{};
  const[view,setViewRaw]=useState('home');
  const[toast,setToast]=useState(null);
  const[notifPermission,setNotifPermission]=useState(('Notification' in window)?Notification.permission:'unsupported');
  const[notificationsEnabled,setNotificationsEnabled]=useState(()=>localStorage.getItem('liveNotificationsEnabled')==='true'||(('Notification' in window)&&Notification.permission==='granted'&&localStorage.getItem('liveNotificationsEnabled')==='true'));
  const[currentUser,setCurrentUser]=useState(null);
  const[showAuth,setShowAuth]=useState(false);
  const[authPrompt,setAuthPrompt]=useState(null);
  const[appData,setAppData]=useState({players:[],courses:[],rounds:[],groups:[],competitions:[],scores:[],cupUsers:[],guests:[],cupEvents:[],cupTeams:[],cupEventPlayers:[],cupDays:[],cupMatches:[]});
  const[selectedRound,setSelectedRound]=useState(null);
  const[selectedComp,setSelectedComp]=useState(null);
  const[holeScores,setHoleScores]=useState({});
  const[homePull,setHomePull]=useState(0);
  const[homeRefreshing,setHomeRefreshing]=useState(false);
  const[handicapHistoryOpen,setHandicapHistoryOpen]=useState(false);
  const[handicapHistoryRows,setHandicapHistoryRows]=useState([]);
  const[handicapHistoryLoading,setHandicapHistoryLoading]=useState(false);
  const[handicapHistoryError,setHandicapHistoryError]=useState('');
  const[avatarUploading,setAvatarUploading]=useState(false);
  const[testMode,setTestMode]=useState(()=>snyderNotificationsTestMode());
  const[testModeTapCount,setTestModeTapCount]=useState(0);
  const viewRef=useRef(view);
  const currentUserRef=useRef(null);
  const avatarInputRef=useRef(null);
  const homeRefreshRef=useRef(false);
  const pullRef=useRef({active:false,startX:0,startY:0,dy:0,view:'home'});
  const isAdmin=true; // Admin panel is password protected internally
  useEffect(()=>{
    const handler=e=>setTestMode(!!(e&&e.detail&&e.detail.enabled)||snyderNotificationsTestMode());
    window.addEventListener('snyder-test-mode-change',handler);
    return()=>window.removeEventListener('snyder-test-mode-change',handler);
  },[]);

  function pullRefreshLabel(v){
    if(v==='play')return 'scorecard';
    if(v==='live')return 'live scores';
    if(v==='league')return 'league';
    return 'home';
  }
  function canPullRefreshView(v){
    return v==='home'||v==='play'||v==='live'||v==='league';
  }
  function applyCurrentUserUpdate(user,row){
    if(!user||!row||normaliseId(user.id)!==normaliseId(row.id))return user||null;
    const updated={...user,...row};
    setCurrentUser(updated);
    try{localStorage.setItem('snyder_user',JSON.stringify(updated));}catch(e){}
    return updated;
  }
  async function refreshCurrentUserFromCloud(user=currentUserRef.current){
    if(!user||!user.id)return user||null;
    try{
      const[userResult,historyResult]=await Promise.all([
        sb.from('cup_users').select('*').eq('id',user.id).single(),
        sb.from('handicap_sync_history').select('old_handicap,new_handicap,synced_at').eq('user_id',user.id).order('synced_at',{ascending:false}).limit(1).maybeSingle()
      ]);
      const{data,error}=userResult||{};
      const history=historyResult&&!historyResult.error?historyResult.data:null;
      if(error||!data)return user;
      return applyCurrentUserUpdate(user,{...data,_handicapTrend:handicapTrendFromHistory(history)});
    }catch(e){
      return user;
    }
  }
  async function openHandicapHistory(){
    const user=currentUserRef.current||currentUser;
    if(!user||!user.id)return;
    setHandicapHistoryOpen(true);
    setHandicapHistoryLoading(true);
    setHandicapHistoryError('');
    try{
      const{data,error}=await sb.from('handicap_sync_history').select('old_handicap,new_handicap,synced_at').eq('user_id',user.id).order('synced_at',{ascending:true}).limit(80);
      if(error)throw error;
      setHandicapHistoryRows(data||[]);
    }catch(e){
      setHandicapHistoryRows([]);
      setHandicapHistoryError('Could not load handicap history');
    }finally{
      setHandicapHistoryLoading(false);
    }
  }
  async function handleAvatarUpload(e){
    const file=e&&e.target&&e.target.files&&e.target.files[0];
    if(e&&e.target)e.target.value='';
    const user=currentUserRef.current||currentUser;
    if(!file||!user||!user.id)return;
    setAvatarUploading(true);
    try{
      const image=await resizeAvatarFile(file);
      const updated={...user,avatar_image:image};
      setCurrentUser(updated);
      currentUserRef.current=updated;
      try{localStorage.setItem('snyder_user',JSON.stringify(updated));}catch(err){}
      try{const key=localAvatarKey(user);if(key)localStorage.setItem(key,image);}catch(err){}
      const{error}=await sb.from('cup_users').update({avatar_image:image}).eq('id',user.id);
      if(error)throw error;
      flash('Profile photo updated');
      loadAll();
    }catch(err){
      const msg=err&&err.message?err.message:String(err);
      flash(msg&&msg.toLowerCase().includes('avatar_image')?'Photo saved on this phone. Add the avatar_image SQL column to sync it.':'Could not save photo: '+msg,'error');
    }finally{
      setAvatarUploading(false);
    }
  }

  useEffect(()=>{viewRef.current=view;},[view]);
  useEffect(()=>{currentUserRef.current=currentUser;},[currentUser]);
  useEffect(()=>{
    let alive=true;
    const permission=('Notification' in window)?Notification.permission:'unsupported';
    setNotifPermission(permission);
    if(permission==='granted'&&localStorage.getItem('liveNotificationsMuted')!=='true'){
      localStorage.setItem('liveNotificationsEnabled','true');
      setNotificationsEnabled(true);
      refreshSnyderLiveNotificationSubscription(currentUser).then(res=>{
        if(!alive)return;
        if(res&&res.ok)setNotificationsEnabled(true);
      }).catch(()=>{});
    }
    return()=>{alive=false;};
  },[currentUser&&currentUser.id]);

  function setView(v){
    if(v!=='home')window.history.pushState({view:v},'',null);
    setViewRaw(v);
  }
  function promptStartRoundAuth(){
    setAuthPrompt('startRound');
    setShowAuth(true);
  }
  async function disableNotificationsFromHome(){
    try{
      if('serviceWorker' in navigator){
        const registration=await navigator.serviceWorker.getRegistration('./sw-live.js').catch(()=>null)||await navigator.serviceWorker.ready.catch(()=>null);
        const sub=registration&&registration.pushManager?await registration.pushManager.getSubscription():null;
        if(sub){
          const endpoint=sub.endpoint;
          await sub.unsubscribe().catch(()=>false);
          if(endpoint){
            await sb.from(SNYDER_PUSH_TABLE).delete().eq('endpoint',endpoint);
          }
        }
      }
      localStorage.removeItem('liveNotificationsEnabled');
      localStorage.setItem('liveNotificationsMuted','true');
      setNotificationsEnabled(false);
      setNotifPermission(('Notification' in window)?Notification.permission:'unsupported');
      flash('Notifications turned off on this phone');
    }catch(e){
      localStorage.removeItem('liveNotificationsEnabled');
      localStorage.setItem('liveNotificationsMuted','true');
      setNotificationsEnabled(false);
      flash('Notifications turned off locally. You may also need to block them in browser settings.','error');
    }
  }
  async function toggleNotificationsFromHome(){
    if(notificationsEnabled&&notifPermission==='granted'){
      await disableNotificationsFromHome();
      return;
    }
    localStorage.removeItem('liveNotificationsMuted');
    const res=await enableSnyderLiveNotifications(currentUser);
    const permission=('Notification' in window)?Notification.permission:'unsupported';
    setNotifPermission(permission);
    if(res.ok){
      localStorage.setItem('liveNotificationsEnabled','true');
      setNotificationsEnabled(true);
      flash('Notifications enabled');
    }else{
      localStorage.removeItem('liveNotificationsEnabled');
      setNotificationsEnabled(false);
      flash('Notifications not enabled: '+(res.error||'permission denied'),'error');
    }
  }

  useEffect(()=>{
    // Check for watch link ?watch=CODE
    const params=new URLSearchParams(window.location.search);
    const watchCode=params.get('watch');
    if(watchCode){
      setSplash(false);
      // Load and go straight to watch mode
      sb.from('cup_rounds').select('*').eq('join_code',watchCode.toUpperCase()).single().then(async({data:rd})=>{
        if(!rd){flash('Round not found','error');return;}
        const{data:rps}=await sb.from('cup_round_players').select('*').eq('round_id',rd.id);
        const roundPlayers=(rps||[]);
        const isCupRound=isSnyderCupRound(rd);
        const po=roundPlayers.map(rp=>mapRoundPlayerForScorecard(rp,isCupRound));
        const hm={};roundPlayers.forEach(rp=>addRoundPlayerHandicaps(hm,rp,isCupRound));
        const{data:grps}=await sb.from('cup_groups').select('*').eq('round_id',rd.id);
        const grp=grps&&grps[0];
        if(grp){
          const selected={...rd,_spectator:true,_watchLink:true,_group:{...grp,participants:po,playing_handicaps:hm,player_ids:(grp.player_ids&&grp.player_ids.length?grp.player_ids:po.map(p=>p.id))}};
          if(isCupRound){
            const[{data:cupRows},{data:teamRows},{data:cupPlayerRows},{data:matchRows},{data:roundRows}]=await Promise.all([
              sb.from('snyder_cups').select('*').order('created_at',{ascending:false}).catch(()=>({data:[]})),
              sb.from('snyder_cup_teams').select('*').catch(()=>({data:[]})),
              sb.from('snyder_cup_players').select('*').catch(()=>({data:[]})),
              sb.from('snyder_cup_matches').select('*').catch(()=>({data:[]})),
              sb.from('cup_rounds').select('*').catch(()=>({data:[]}))
            ]);
            const cup=(cupRows||[])[0];
            const cupDay=cupRoundDayNumber(rd);
            const cupGroup=cupRoundGroupNumber(rd);
            const dayGroups=cupGroupsForDay(matchRows||[],cupDay);
            const groupData=dayGroups.find(g=>parseInt(g.idx)===cupGroup)||{day:cupDay,idx:cupGroup,players:po.map(p=>p.id),doubles:null,singles:[]};
            selected._cupScoring=true;
            selected._spectator=!currentUserCanScoreCupGroup(currentUser,groupData,normaliseCupPlayerRows(cupPlayerRows||[]).filter(p=>!cup||p.cup_id===cup.id));
            selected._cupTeams=cup?getCupTeams(cup,teamRows||[]):{};
            selected._cupDayNumber=cupDay;
            selected._cupDayReleased=cupMatchesDayReleased(matchRows||[],cupDay);
            selected._cupGroupData=groupData;
            selected._cupDayAllPlayers=normaliseCupPlayerRows(cupPlayerRows||[]).filter(p=>!cup||p.cup_id===cup.id);
            selected._cupDayRounds=(roundRows||[]).filter(r=>isSnyderCupRound(r)&&cupRoundDayNumber(r)===cupDay);
            selected._cupDayGroups=dayGroups.length?dayGroups:[groupData];
            try{sessionStorage.setItem('cupReturnDay',String(cupDay));}catch(e){}
          }
          setSelectedRound(selected);
          setViewRaw('play');
        }
      });
    } else {
      setSplash(false);
    }
    const saved=localStorage.getItem('snyder_user');
    if(saved){
      try{
        const savedUser=JSON.parse(saved);
        setCurrentUser(savedUser);
        refreshCurrentUserFromCloud(savedUser);
      }catch(e){}
    }
    loadAll();
    registerSnyderServiceWorker();
    let lastPopTime=0;
    function handlePop(e){lastPopTime=Date.now();setViewRaw(e.state&&e.state.view||'home');}
    let swipeStartX=0,swipeStartY=0,swipeStartT=0;
    function handleTouchStart(e){
      const t=e.touches&&e.touches[0];
      if(!t)return;
      swipeStartX=t.clientX;swipeStartY=t.clientY;swipeStartT=Date.now();
      const pullView=viewRef.current;
      const canPull=canPullRefreshView(pullView)&&window.scrollY<=2&&!homeRefreshRef.current;
      pullRef.current={active:canPull,startX:t.clientX,startY:t.clientY,dy:0,view:pullView};
    }
    function handleTouchMove(e){
      const t=e.touches&&e.touches[0];
      const p=pullRef.current;
      if(!t||!p.active)return;
      const dx=Math.abs(t.clientX-p.startX);
      const dy=t.clientY-p.startY;
      if(dy<=0||dx>70){setHomePull(0);return;}
      if(dy>12&&window.scrollY<=2){try{e.preventDefault();}catch(err){}}
      const resisted=Math.min(92,Math.round((dy-10)*0.46));
      setHomePull(Math.max(0,resisted));
      p.dy=dy;
    }
    async function handlePullRefresh(targetView){
      if(homeRefreshRef.current)return;
      const label=pullRefreshLabel(targetView);
      homeRefreshRef.current=true;
      setHomeRefreshing(true);
      setHomePull(92);
      try{
        await loadAll();
        await refreshCurrentUserFromCloud(currentUserRef.current);
        try{window.dispatchEvent(new CustomEvent('snyderPullRefresh',{detail:{view:targetView}}));}catch(err){}
        flash(label.charAt(0).toUpperCase()+label.slice(1)+' refreshed');
      }
      catch(err){flash('Could not refresh '+label,'error');}
      setTimeout(()=>{setHomeRefreshing(false);setHomePull(0);homeRefreshRef.current=false;},450);
    }
    function handleTouchEnd(e){
      const t=e.changedTouches&&e.changedTouches[0];
      if(!t)return;
      const p=pullRef.current;
      const pullDy=p&&p.active?p.dy:0;
      pullRef.current={active:false,startX:0,startY:0,dy:0,view:'home'};
      const targetView=p&&p.view||viewRef.current;
      if(canPullRefreshView(targetView)&&pullDy>135&&Math.abs(t.clientX-(p.startX||t.clientX))<80&&window.scrollY<=6){
        handlePullRefresh(targetView);
        return;
      }
      if(!homeRefreshRef.current)setHomePull(0);
      const dx=t.clientX-swipeStartX;
      const dy=Math.abs(t.clientY-swipeStartY);
      const quick=Date.now()-swipeStartT<900;
      if(swipeStartX<36&&dx>90&&dy<70&&quick&&(Date.now()-lastPopTime>350)){
        try{window.history.back();}catch(err){setViewRaw('home');}
      }
    }
    window.addEventListener('popstate',handlePop);
    window.addEventListener('touchstart',handleTouchStart,{passive:true});
    window.addEventListener('touchmove',handleTouchMove,{passive:false});
    window.addEventListener('touchend',handleTouchEnd,{passive:true});
    return()=>{
      window.removeEventListener('popstate',handlePop);
      window.removeEventListener('touchstart',handleTouchStart);
      window.removeEventListener('touchmove',handleTouchMove);
      window.removeEventListener('touchend',handleTouchEnd);
    };
  },[]);

  function flash(msg,type){
    setToast({msg,type});
    const delay=type==='error'?11000:3600;
    setTimeout(()=>setToast(current=>current&&current.msg===msg?null:current),delay);
  }

    // ---------------------------------------------------------
  // Data loading / Supabase reads
  // ---------------------------------------------------------
  async function loadAll(){
    const[players,courses,rounds,groups,competitions,scores,cupUsers,guests,cupEvents,cupTeams,cupEventPlayers,cupDays,cupMatches]=await Promise.all([
      sb.from('cup_players').select('*').then(r=>r.data||[]),
      sb.from('cup_courses').select('*').then(r=>r.data||[]),
      sb.from('cup_rounds').select('*').order('created_at',{ascending:false}).then(r=>r.data||[]),
      sb.from('cup_groups').select('*').then(r=>r.data||[]),
      sb.from('cup_competitions').select('*').then(r=>r.data||[]),
      sb.from('cup_scores').select('*').then(r=>r.data||[]),
      sb.from('cup_users').select('*').then(r=>r.data||[]),
      sb.from('cup_guests').select('*').then(r=>r.data||[]),
      sb.from('snyder_cups').select('*').order('created_at',{ascending:false}).then(r=>r.data||[]).catch(()=>[]),
      sb.from('snyder_cup_teams').select('*').then(r=>r.data||[]).catch(()=>[]),
      sb.from('snyder_cup_players').select('*').then(r=>normaliseCupPlayerRows(r.data||[])).catch(()=>[]),
      sb.from('snyder_cup_days').select('*').then(r=>r.data||[]).catch(()=>[]),
      sb.from('snyder_cup_matches').select('*').then(r=>r.data||[]).catch(()=>[]),
    ]);
    setAppData({players,courses:mergePresetCourses(courses),rounds,groups,competitions,scores,cupUsers,guests,cupEvents,cupTeams,cupEventPlayers,cupDays,cupMatches});
    const activeUser=currentUserRef.current||currentUser;
    if(activeUser&&activeUser.id){
      const freshUser=(cupUsers||[]).find(u=>normaliseId(u.id)===normaliseId(activeUser.id));
      if(freshUser)applyCurrentUserUpdate(activeUser,freshUser);
    }
  }

  const{players,courses,rounds,groups,competitions,scores,cupUsers,guests,cupEvents,cupTeams,cupEventPlayers,cupDays,cupMatches}=appData;
  const activeComp=competitions.find(c=>c.status==='active')||competitions[0];

  function rowsToHoleScores(rows){
    const m={};
    (rows||[]).filter(r=>!isMetaScoreRow(r)).forEach(s=>{
      if(!m[s.hole_number])m[s.hole_number]={};
      m[s.hole_number][s.player_id]=s.gross_score;
    });
    return m;
  }

  async function hydrateRoundScores(roundId){
    if(!roundId){setHoleScores({});return;}
    let local={};
    try{local=JSON.parse(localStorage.getItem('scores_'+roundId)||'{}')||{};}catch(e){local={};}
    const{data:dbScores}=await sb.from('cup_scores').select('*').eq('round_id',roundId);
    const dbMap=rowsToHoleScores(dbScores||[]);
    const merged={...local,...dbMap};
    setHoleScores(merged);
    try{if(Object.keys(dbMap).length>0)localStorage.setItem('scores_'+roundId,JSON.stringify(merged));}catch(e){}
  }
    // ---------------------------------------------------------
  // Live vs completed round grouping
  // ---------------------------------------------------------
  const liveRounds=uniqueVisibleLiveRounds(rounds,currentUser);
  const liveRoundIds=liveDataRoundIds(rounds,liveRounds);
  const[publicScores,setPublicScores]=useState([]);
  const[publicRoundPlayers,setPublicRoundPlayers]=useState({});
  const publicLiveSigRef=useRef('');
  useEffect(()=>{
    let alive=true;
    async function refreshLiveRoundData(){
      if(!liveRoundIds.length){setPublicScores([]);setPublicRoundPlayers({});return;}
      const[{data:scoreRows},{data:roundPlayers}]=await Promise.all([
        sb.from('cup_scores').select('*').in('round_id',liveRoundIds),
        sb.from('cup_round_players').select('*').in('round_id',liveRoundIds)
      ]);
      if(!alive)return;
      const sig=[
        stableLiveDataSignature(scoreRows||[],['round_id','player_id','hole_number','gross_score','stableford_points']),
        stableLiveDataSignature(roundPlayers||[],['round_id','id','user_id','guest_id','display_name','name'])
      ].join('||');
      if(sig===publicLiveSigRef.current)return;
      publicLiveSigRef.current=sig;
      setPublicScores(scoreRows||[]);
      const byRound={};
      (roundPlayers||[]).forEach(rp=>{
        if(!byRound[rp.round_id])byRound[rp.round_id]=[];
        byRound[rp.round_id].push(rp);
      });
      setPublicRoundPlayers(byRound);
    }
    refreshLiveRoundData();
    const timer=setInterval(refreshLiveRoundData,15000);
    function onPullRefresh(e){if(e&&e.detail&&e.detail.view==='live')refreshLiveRoundData();}
    window.addEventListener('snyderPullRefresh',onPullRefresh);
    return()=>{alive=false;clearInterval(timer);window.removeEventListener('snyderPullRefresh',onPullRefresh);};
  },[liveRoundIds.join('|')]);
  const completedRounds=sortRoundsNewestFirst(rounds.filter(isCompletedRound));
  const myRounds=myRoundsForUser(rounds,groups,currentUser);
  const thisWeekStart=startOfThisWeek();
  const thisWeeksCards=completedRounds.filter(r=>roundStartDate(r)>=thisWeekStart);
  const olderCards=completedRounds.filter(r=>roundStartDate(r)<thisWeekStart);
  const olderCardsByMonth=groupRoundsByMonth(olderCards);
    // ---------------------------------------------------------
  // Round opening / scorecard hydration
  // ---------------------------------------------------------
  async function openRound(rd){
    setDayScorecardRound(null);
    try{const{data:dbRound}=await sb.from('cup_rounds').select('*').eq('id',rd.id).single();if(dbRound)rd={...rd,...dbRound};}catch(e){}
    let rdGroups=(groups||[]).filter(g=>g.round_id===rd.id);
    try{const{data:dbGroups}=await sb.from('cup_groups').select('*').eq('round_id',rd.id).order('group_number',{ascending:true});if(dbGroups&&dbGroups.length)rdGroups=dbGroups;}catch(e){}
    const{data:rps}=await sb.from('cup_round_players').select('*').eq('round_id',rd.id);
    const roundPlayers=(rps||[]);
    const isCupRound=isSnyderCupRound(rd);
    if(!rdGroups.length){const rpGroup=groupFromRoundPlayers(rd,roundPlayers,isCupRound);if(rpGroup)rdGroups=[rpGroup];}
    const po=roundPlayers.map(rp=>mapRoundPlayerForScorecard(rp,isCupRound));
    const hm={};roundPlayers.forEach(rp=>addRoundPlayerHandicaps(hm,rp,isCupRound));
    await hydrateRoundScores(rd.id);
    const{data:latestDbScores}=await sb.from('cup_scores').select('*').eq('round_id',rd.id);
    const groupMetaRows=(rdGroups||[]).flatMap(g=>foursomesScoreRowsFromGroupMeta(rd.id,g));
    const latestRows=normaliseFoursomesScoreRows([...(scores||[]),...(publicScores||[]),...(latestDbScores||[]),...groupMetaRows,...localScoreRowsForRound(rd.id)]).filter(r=>r&&r.round_id===rd.id);
    const latestMatchplay=foursomesConfigForLiveSnapshot(rd,rdGroups,latestRows)||matchplayConfigFromRows(latestRows,rd,rdGroups[0]||{id:'group',group_number:1});
    const fallbackGroup=(latestMatchplay&&latestMatchplay.enabled&&latestMatchplay.mode==='foursomes')?foursomesFallbackGroup(rd,latestMatchplay):null;
    if(fallbackGroup){const metaScores=foursomesHoleScoresFromGroupMeta(rdGroups[0]||{});if(Object.keys(metaScores).length&&setHoleScores)setHoleScores(prev=>({...prev,...metaScores}));}
    const userGroup=fallbackGroup||(currentUser&&rdGroups.find(g=>Array.isArray(g.player_ids)&&g.player_ids.includes(currentUser.id)))||rdGroups[0];
    if(userGroup){
      const canScore=(fallbackGroup&&userGroup===fallbackGroup)?userCanScoreFoursomesRound(currentUser,rd,rdGroups[0],roundPlayers):userCanScoreRound(currentUser,userGroup,roundPlayers);
      const finalParticipants=fallbackGroup&&userGroup===fallbackGroup?fallbackGroup.participants:po;
      const finalHandicaps=fallbackGroup&&userGroup===fallbackGroup?fallbackGroup.playing_handicaps:hm;
      const selected={...rd,_spectator:!canScore,_extraScores:latestRows,_matchplay:latestMatchplay,_group:{...userGroup,participants:finalParticipants,playing_handicaps:finalHandicaps,player_ids:(userGroup.player_ids&&userGroup.player_ids.length?userGroup.player_ids:finalParticipants.map(p=>p.id))}};
      if(isCupRound){
        const cup=(cupEvents||[])[0];
        const cupDay=cupRoundDayNumber(rd);
        const cupGroup=cupRoundGroupNumber(rd);
        const dayGroups=cupGroupsForDay(cupMatches,cupDay);
        const groupData=dayGroups.find(g=>parseInt(g.idx)===cupGroup)||{day:cupDay,idx:cupGroup,players:po.map(p=>p.id),doubles:null,singles:[]};
        selected._cupScoring=true;
        selected._cupTeams=cup?getCupTeams(cup,cupTeams||[]):{};
        selected._cupDayNumber=cupDay;
        selected._cupDayReleased=cupMatchesDayReleased(cupMatches,cupDay);
        selected._cupGroupData=groupData;
        selected._cupDayAllPlayers=(cupEventPlayers||[]).filter(p=>!cup||p.cup_id===cup.id);
        selected._cupDayRounds=(rounds||[]).filter(r=>isSnyderCupRound(r)&&cupRoundDayNumber(r)===cupDay);
        selected._cupDayGroups=dayGroups.length?dayGroups:[groupData];
        try{sessionStorage.setItem('cupReturnDay',String(cupDay));}catch(e){}
      }
      setSelectedRound(selected);
      setView('play');
    }
  }
    // ---------------------------------------------------------
  // Completed scorecard summary card
  // ---------------------------------------------------------
  function getDisplayName(pid){
    const person=(cupUsers||[]).find(u=>u.id===pid)||(players||[]).find(p=>p.id===pid);
    return (person&&(person.display_name||person.name||person.username))||'Player';
  }
  function leaderboardForRound(rd){
    const totals={};const holes={};const holePoints={};const seen=new Set();
    const boardRounds=dayCompKeyFromRound(rd)?dayCompRoundsFor(rounds,rd):[rd];
    const boardRoundIds=new Set(boardRounds.map(r=>r&&r.id).filter(Boolean));
    const rdGroups=groups.filter(g=>boardRoundIds.has(g.round_id));
    const hcpMap={};
    rdGroups.forEach(g=>{
      Object.assign(hcpMap,g.playing_handicaps||{});
      (g.player_ids||[]).forEach(pid=>{if(totals[pid]==null)totals[pid]=0;});
    });
    function addScore(pid,holeNum,pts){
      addLeaderboardScore(totals,holes,holePoints,seen,pid,holeNum,pts);
    }
    normaliseFoursomesScoreRows(scores||[]).filter(sc=>boardRoundIds.has(sc.round_id)&&!isMetaScoreRow(sc)&&!isFoursomesTeamPlayerId(sc.player_id)).forEach(sc=>{
      addScore(sc.player_id,sc.hole_number,sc.stableford_points);
    });
    // Scores saved in this browser are instant; appData.scores may not have refreshed yet after exiting a round.
    try{
      boardRounds.forEach(boardRound=>{
        const local=JSON.parse(localStorage.getItem('scores_'+boardRound.id)||'{}');
        const course=courses.find(co=>co.id===boardRound.course_id)||findCourseForTee(courses,boardRound.course_name,boardRound.tee);
        const courseHoles=(course&&Array.isArray(course.holes))?course.holes:[];
        Object.keys(local||{}).forEach(h=>{
          const holeNum=parseInt(h);
          const hd=courseHoles.find(x=>parseInt(x.hole)===holeNum)||{par:4,stroke_index:holeNum};
          Object.keys(local[h]||{}).forEach(pid=>{
            const gross=parseInt(local[h][pid]);
            const pts=calcStableford(gross,parseInt(hd.par)||4,parseInt(hd.stroke_index)||holeNum,parseFloat(hcpMap[pid]||0));
            addScore(pid,holeNum,pts);
          });
        });
      });
    }catch(e){}
    return Object.keys(totals).map(pid=>({id:pid,name:getDisplayName(pid),total:totals[pid]||0,holes:holes[pid]?holes[pid].size:0,_holePoints:holePoints[pid]||{}})).sort(compareStablefordLeaderboardRows);
  }
  function foursomesMatchplaySummaryForRound(rd){
    const rdGroups=(groups||[]).filter(g=>g.round_id===rd.id);
    return buildFoursomesMatchplaySummary(rd,rdGroups,[...(scores||[]),...(publicScores||[]),...localScoreRowsForRound(rd.id)],courses||[]);
  }

  function CompletedCard({rd}){
    const isDay=isDayCompBoardRound(rd);
    return(
      <div style={{...S.card,...NO_SELECT,marginBottom:8,cursor:'pointer',opacity:0.9}} onClick={()=>isDay?setDayScorecardRound(rd):openRound(rd)}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
          <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
            <CourseBadge course={courses.find(co=>co.id===rd.course_id)} round={rd} size={34}/>
            <div style={{minWidth:0}}>
              <div style={{fontSize:14,color:'#fff',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{isDay?dayCompDisplayName(rounds,rd):roundDisplayName(rd)}</div>
              <div style={{fontSize:11,color:'#60b8f0'}}>{isDay?'Final sweepstake results':'Round started: '+formatRoundStart(rd)}</div>
            </div>
          </div>
          <div style={{fontSize:11,color:isDay?'#92400e':'#1b5e20',background:isDay?'rgba(245,158,11,0.16)':'rgba(27,94,32,0.15)',borderRadius:6,padding:'3px 8px',fontWeight:600,flexShrink:0}}>{isDay?'Sweepstake':'Completed'}</div>
        </div>
      </div>
    );
  }

  const props={...appData,sb,flash,setView,load:loadAll,isAdmin,currentUser,setSelectedRound,selectedRound,holeScores,setHoleScores,promptStartRoundAuth};
  const pullLabel=pullRefreshLabel(view);
  const pullIndicator=(
    <div style={{position:'fixed',top:8,left:'50%',transform:`translateX(-50%) translateY(${homePull?0:-54}px)`,opacity:homePull?1:0,transition:homeRefreshing?'none':'transform 0.18s ease, opacity 0.18s ease',zIndex:9998,pointerEvents:'none'}}>
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 13px',borderRadius:999,background:'rgba(13,37,72,0.96)',border:'1px solid rgba(96,184,240,0.26)',boxShadow:'0 12px 28px rgba(0,0,0,0.32)',fontSize:12,color:'#fff',fontWeight:900}}>
        <span style={{fontSize:15}}>{homeRefreshing?'⟳':homePull>76?'↻':'↓'}</span>
        <span>{homeRefreshing?'Refreshing '+pullLabel:homePull>76?'Release to refresh':'Pull down to refresh'}</span>
      </div>
    </div>
  );

  if(view==='play')return <>{pullIndicator}<PlayGolf {...props}/></>;
  if(view==='league'){
    const LeagueSection=window.LeagueView;
    return <>{pullIndicator}{LeagueSection?<LeagueSection onExit={()=>setView('home')} cupUsers={cupUsers}/>:<div style={{minHeight:'100vh',background:'#0a1528',color:'#fff',padding:18}}><button onClick={()=>setView('home')} style={{...S.gho,padding:'7px 12px'}}>Back</button><div style={{marginTop:18,fontWeight:900}}>League is still loading. Try again in a moment.</div></div>}</>;
  }
  if(view==='admin')return <AdminPanel {...props}/>;
  if(view==='profile')return <ProfileView {...props} setCurrentUser={setCurrentUser}/>;
  if(view==='friends')return <FriendsView {...props}/>;
  if(view==='live')return <>{pullIndicator}<LiveScoringView {...props} selectedComp={selectedComp} activeComp={activeComp}/></>;
  if(view==='tournaments')return <TournamentsView {...props} activeComp={activeComp} selectedComp={selectedComp} setSelectedComp={setSelectedComp}/>;

  const homeLiveCount=liveRounds.length;
  const homeLatestLive=homeLiveCount?liveRounds[0]:null;
  const homeLatestCourse=homeLatestLive?courses.find(co=>co.id===homeLatestLive.course_id):null;
  const bottomTabStyle=color=>({flex:1,background:'none',border:'none',cursor:'pointer',display:'grid',gridTemplateRows:'24px 12px 9px',justifyItems:'center',alignItems:'center',rowGap:2,color,padding:0,minWidth:0});
  const bottomIconStyle={height:24,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,lineHeight:1};
  const bottomLabelStyle={fontSize:10,fontWeight:700,letterSpacing:'0.08em',lineHeight:'12px'};
  const bottomSpacer=<span aria-hidden="true" style={{height:9,lineHeight:'9px',fontSize:8}}></span>;
  function tapVersionForTestMode(e){
    if(e&&e.stopPropagation)e.stopPropagation();
    const next=testModeTapCount+1;
    if(next>=5){
      const enabled=!snyderNotificationsTestMode();
      setSnyderNotificationsTestMode(enabled);
      setTestMode(enabled);
      setTestModeTapCount(0);
      flash(enabled?'Test Mode on - notifications muted on this device':'Test Mode off - notifications live');
    }else{
      setTestModeTapCount(next);
      setTimeout(()=>setTestModeTapCount(0),2500);
    }
  }
  const homeHandicapTone=handicapBannerTone(currentUser&&currentUser._handicapTrend);
  const homeAvatarImage=userAvatarImage(currentUser);

  return(
    <div style={{minHeight:'100vh',paddingBottom:60,background:'linear-gradient(180deg,#0d2548 0%,#0a1f3d 100%)'}}>
      {pullIndicator}
      {/* Top nav */}
      <div style={{background:'#0d2548',padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
        <img src={SNYDER_GOLF_LOGO} onError={e=>{e.currentTarget.onerror=null;e.currentTarget.src=LOGO;}} alt="Snyder Golf" style={{width:38,height:38,objectFit:'contain',background:'transparent',borderRadius:0,display:'block'}}/>
        <div style={{minWidth:74}}></div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8,minWidth:74}}>
          {notifPermission!=='unsupported'&&(
            <button onClick={toggleNotificationsFromHome} aria-label={notificationsEnabled?'Turn notifications off':'Enable notifications'} title={notificationsEnabled?'Turn notifications off':'Enable notifications'} style={{...NO_SELECT,width:34,height:34,borderRadius:'50%',border:notificationsEnabled?'1px solid rgba(34,197,94,0.55)':'1px solid rgba(212,175,55,0.40)',background:notificationsEnabled?'linear-gradient(135deg,rgba(34,197,94,0.22),rgba(15,23,42,0.88))':'rgba(255,255,255,0.06)',color:notificationsEnabled?'#86efac':'#f5d76e',display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,cursor:'pointer',boxShadow:notificationsEnabled?'0 0 0 3px rgba(34,197,94,0.08)':'none',position:'relative'}}>
              🔔
              {notificationsEnabled&&<span style={{position:'absolute',right:2,top:2,width:8,height:8,borderRadius:'50%',background:'#22c55e',boxShadow:'0 0 8px rgba(34,197,94,0.85)'}}/>}
            </button>
          )}
          {currentUser
            ?<button onClick={()=>setView('profile')} aria-label="Open profile" title="Open profile" style={{background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:8,padding:0}}>
              <Avatar user={currentUser} size={32}/>
            </button>
            :<button onClick={()=>{setAuthPrompt(null);setShowAuth(true);}} style={{...S.pri,padding:'7px 10px',fontSize:11,lineHeight:1.15,boxShadow:'0 6px 18px rgba(0,112,187,0.28)',whiteSpace:'nowrap'}}>Sign In</button>
          }
        </div>
      </div>

      <div style={{padding:'14px 16px 0',minHeight:'calc(100vh - 132px)',display:'flex',flexDirection:'column'}}>
        <div style={{textAlign:'center',padding:'4px 0 12px'}}>
          <img src={SNYDER_GOLF_LOGO} onError={e=>{e.currentTarget.onerror=null;e.currentTarget.src=LOGO;}} alt="Snyder Golf" style={{width:'min(122px,34vw)',height:'auto',objectFit:'contain',filter:'drop-shadow(0 8px 20px rgba(96,184,240,0.26))'}}/>
          {currentUser
            ?<div role="button" tabIndex={0} onClick={openHandicapHistory} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openHandicapHistory();}}} aria-label="Open handicap history graph" title="Open handicap history graph" style={{width:'100%',boxSizing:'border-box',margin:'9px 0 0',position:'relative',borderRadius:12,padding:'10px 13px',border:'1px solid '+homeHandicapTone.border,background:homeHandicapTone.background,boxShadow:homeHandicapTone.glow,overflow:'hidden',cursor:'pointer',minHeight:112,textAlign:'left',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div aria-hidden="true" style={{position:'absolute',top:0,left:10,right:10,height:2,background:'linear-gradient(90deg,transparent,#F5D76E,transparent)',opacity:0.9}}></div>
              <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{display:'none'}}/>
              <div style={{position:'relative',display:'grid',gridTemplateColumns:'86px minmax(0,auto)',gap:14,alignItems:'center',justifyContent:'center',width:'100%',maxWidth:340}}>
                <button type="button" onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onClick={e=>{e.preventDefault();e.stopPropagation();if(!avatarUploading&&avatarInputRef.current)avatarInputRef.current.click();}} title={homeAvatarImage?'Change profile photo':'Upload profile photo'} aria-label={homeAvatarImage?'Change profile photo':'Upload profile photo'} style={{position:'relative',width:86,height:86,borderRadius:'50%',border:'2px solid rgba(245,215,110,0.55)',background:'rgba(13,37,72,0.85)',boxShadow:'0 10px 24px rgba(0,0,0,0.34)',padding:0,overflow:'hidden',cursor:avatarUploading?'default':'pointer',color:'#fff',fontSize:28,fontWeight:950,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {homeAvatarImage?<img src={homeAvatarImage} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>:<span>{((currentUser.display_name||currentUser.username||'P').trim()[0]||'P').toUpperCase()}</span>}
                  {avatarUploading&&<span style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(2,8,23,0.62)',fontSize:10,fontWeight:950,color:'#fff'}}>Saving</span>}
                </button>
                <div style={{minWidth:0,textAlign:'left'}}>
                  <div style={{fontSize:'clamp(25px,7.6vw,34px)',lineHeight:1.02,fontWeight:950,color:'#eaf6ff',fontStyle:'italic',letterSpacing:0,textShadow:'0 2px 0 rgba(3,12,28,0.85),0 0 10px rgba(96,184,240,0.34)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{currentUser.display_name||currentUser.username||'Player'}</div>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginTop:7,flexWrap:'wrap'}}>
                    <span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:'clamp(22px,6.4vw,32px)',lineHeight:1,fontWeight:950,color:'#F5D76E',letterSpacing:0,textShadow:'0 2px 0 rgba(3,12,28,0.92),0 0 12px rgba(245,215,110,0.32)'}}><EnglandGolfMarker user={currentUser} size="0.62em"/>{formatHeaderHandicap(currentUser.handicap)}</span>
                    <HandicapTrendBadge trend={currentUser._handicapTrend}/>
                  </div>
                </div>
              </div>
            </div>
            :<div className="sg-pop-title" style={{fontSize:27,lineHeight:1,marginTop:7}}>SNYDER GOLF</div>
          }
        </div>
        <div style={{display:'grid',gap:11,marginBottom:14,flex:1,gridTemplateRows:'1.2fr 1fr 1fr'}}>
          <section style={{border:'1px solid rgba(96,184,240,0.24)',borderRadius:22,background:'linear-gradient(135deg,rgba(0,112,187,0.24),rgba(13,37,72,0.96))',padding:14,boxShadow:'0 16px 34px rgba(0,112,187,0.18)',display:'flex',flexDirection:'column',justifyContent:'space-between',minHeight:142}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
              <img src={LOGO} alt="Live" style={{width:50,height:50,objectFit:'contain',flex:'0 0 auto',filter:'drop-shadow(0 4px 10px rgba(0,0,0,0.24))'}}/>
              <div style={{minWidth:0,flex:1}}>
                <div className="sg-pop-heading" style={{fontSize:23,lineHeight:1}}>Live</div>
                <div style={{fontSize:12,color:'rgba(255,255,255,0.70)',marginTop:4}}>Start rounds, follow live scoreboards and view scorecards.</div>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <button onClick={()=>currentUser?setView('play'):promptStartRoundAuth()} style={{...NO_SELECT,...S.pri,padding:'13px 10px',fontSize:14,fontWeight:950}}><span className="sg-pop-button">Start Round</span></button>
              <button onClick={()=>{window.history.replaceState({view:'home'},'',null);setView('live');}} style={{...NO_SELECT,border:'1px solid rgba(248,113,113,0.52)',borderRadius:12,background:'linear-gradient(135deg,rgba(239,68,68,0.92),rgba(127,29,29,0.88))',color:'#fff',boxShadow:'0 10px 22px rgba(239,68,68,0.22), inset 0 1px 0 rgba(255,255,255,0.18)',padding:'13px 10px',fontSize:14,fontWeight:950,cursor:'pointer'}}><span className="sg-pop-button">Live Scoreboards ({homeLiveCount})</span></button>
            </div>
          </section>

          <button onClick={()=>setView('league')} style={{...NO_SELECT,border:'1px solid rgba(96,184,240,0.24)',borderRadius:22,background:'rgba(255,255,255,0.065)',padding:14,textAlign:'left',cursor:'pointer',color:'#fff',display:'flex',alignItems:'center',gap:13,minHeight:108,boxShadow:'0 12px 28px rgba(0,0,0,0.12)'}}>
            <img src={window.SUMMER_LEAGUE_LOGO||LOGO} alt="League" style={{width:50,height:50,objectFit:'contain',flex:'0 0 auto',filter:'drop-shadow(0 4px 10px rgba(0,0,0,0.24))'}}/>
            <div style={{minWidth:0,flex:1}}>
              <div className="sg-pop-heading" style={{fontSize:23,lineHeight:1}}>League</div>
              <div style={{fontSize:12,color:'rgba(255,255,255,0.70)',marginTop:5,lineHeight:1.3}}>League table, scores, money and rules.</div>
            </div>
            <div style={{fontSize:22,color:'#60b8f0',fontWeight:900}}>{'>'}</div>
          </button>

          <button onClick={()=>setView('tournaments')} style={{...NO_SELECT,border:'1px solid rgba(212,175,55,0.34)',borderRadius:22,background:'linear-gradient(135deg,rgba(212,175,55,0.16),rgba(11,31,77,0.92))',padding:14,textAlign:'left',cursor:'pointer',color:'#fff',display:'flex',alignItems:'center',gap:13,minHeight:108,boxShadow:'0 14px 30px rgba(212,175,55,0.10)'}}>
            <div style={{width:50,height:50,display:'flex',alignItems:'center',justifyContent:'center',fontSize:30,fontWeight:950,color:'#F5E6A3',flex:'0 0 auto',filter:'drop-shadow(0 4px 10px rgba(0,0,0,0.24))'}}>{EMOJI.trophy}</div>
            <div style={{minWidth:0,flex:1}}>
              <div className="sg-pop-heading" style={{fontSize:23,lineHeight:1}}>Cup</div>
              <div style={{fontSize:12,color:'rgba(255,255,255,0.70)',marginTop:5,lineHeight:1.3}}>Team score, singles, fines and events.</div>
            </div>
            <div style={{fontSize:22,color:'#D4AF37',fontWeight:900}}>{'>'}</div>
          </button>
        </div>
      </div>

      {/* Bottom tab bar */}
      <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#0d2548',borderTop:'1px solid rgba(255,255,255,0.1)',display:'flex',padding:'8px 0 20px'}}>
        <button onClick={()=>setView('play')} style={bottomTabStyle('#0070BB')}>
          <div style={bottomIconStyle}>{EMOJI.golf}</div>
          <div style={bottomLabelStyle}>PLAY</div>
          {bottomSpacer}
        </button>
        <button onClick={()=>{window.history.replaceState({view:'home'},'',null);setView('live');}} style={bottomTabStyle('rgba(255,255,255,0.4)')}>
          <div style={bottomIconStyle}>{EMOJI.scores}</div>
          <div style={bottomLabelStyle}>SCORES</div>
          {bottomSpacer}
        </button>
        <button onClick={()=>setView('tournaments')} style={bottomTabStyle('rgba(255,255,255,0.4)')}>
          <div style={{...bottomIconStyle,color:'#D4AF37',fontWeight:900}}>{EMOJI.trophy}</div>
          <div style={{...bottomLabelStyle,fontWeight:800}}>CUP</div>
          {bottomSpacer}
        </button>
        <button onClick={()=>setView('league')} style={bottomTabStyle('rgba(255,255,255,0.4)')}>
          <div style={bottomIconStyle}>
            <img src={window.SUMMER_LEAGUE_LOGO||LOGO} alt="" style={{width:20,height:20,objectFit:'contain',display:'block'}}/>
          </div>
          <div style={{...bottomLabelStyle,fontWeight:800}}>LEAGUE</div>
          {bottomSpacer}
        </button>
        <button onClick={()=>currentUser?setView('friends'):(setAuthPrompt(null),setShowAuth(true))} style={bottomTabStyle('rgba(255,255,255,0.4)')}>
          <div style={bottomIconStyle}>{EMOJI.friends}</div>
          <div style={bottomLabelStyle}>FRIENDS</div>
          {bottomSpacer}
        </button>
        <button onClick={()=>currentUser?setView('profile'):(setAuthPrompt(null),setShowAuth(true))} style={bottomTabStyle('rgba(255,255,255,0.4)')}>
          <div style={bottomIconStyle}>{EMOJI.profile}</div>
          <div style={bottomLabelStyle}>PROFILE</div>
          {bottomSpacer}
        </button>
        <button onClick={()=>setView('admin')} style={bottomTabStyle('rgba(255,255,255,0.4)')}>
          <div style={bottomIconStyle}>{EMOJI.admin}</div>
          <div style={bottomLabelStyle}>ADMIN</div>
          <span onClick={tapVersionForTestMode} aria-label="App version v4.47" title="Version" style={{fontSize:8,fontWeight:700,letterSpacing:'0.06em',lineHeight:'9px',color:testMode?'#fbbf24':'rgba(255,255,255,0.32)',padding:'2px 4px',marginTop:-2}}>v4.47</span>
        </button>
      </div>
      {testMode&&<div style={{position:'fixed',left:10,right:10,bottom:78,zIndex:1300,padding:'8px 10px',borderRadius:10,background:'rgba(245,158,11,0.94)',color:'#1f1300',fontSize:12,fontWeight:950,textAlign:'center',boxShadow:'0 8px 20px rgba(0,0,0,0.28)'}}>TEST MODE - notifications muted on this device</div>}

      {showAuth&&<UserAuth
        initialMode={authPrompt==='startRound'?'signup':'login'}
        promptTitle={authPrompt==='startRound'?'Quick register to start a round':null}
        promptText={authPrompt==='startRound'?'It only takes a moment. Once one player is signed in, you can add guests to play with you and keep the round tied to a real scorer.':null}
        signupButtonText={authPrompt==='startRound'?'Quick Register':null}
        guests={guests}
        onRefresh={loadAll}
        onLogin={async u=>{setCurrentUser(u);const fresh=await refreshCurrentUserFromCloud(u);setShowAuth(false);if(authPrompt==='startRound')setView('play');setAuthPrompt(null);flash('Welcome '+((fresh&&fresh.display_name)||u.display_name));}}
        onClose={()=>{setShowAuth(false);setAuthPrompt(null);}}
      />}
      <HandicapHistoryModal open={handicapHistoryOpen} onClose={()=>setHandicapHistoryOpen(false)} user={currentUser} rows={handicapHistoryRows} loading={handicapHistoryLoading} error={handicapHistoryError}/>
      <Toast toast={toast}/>
    </div>
  );
}

// =========================================================
// Live scores and completed scores view
// Lists active rounds, this week's cards and older monthly cards
// =========================================================
function LiveScoringView({rounds,groups,scores,players,courses,cupUsers,cupEvents,cupTeams,cupEventPlayers,cupDays,cupMatches,sb,flash,setView,selectedComp,activeComp,setSelectedRound,currentUser,setHoleScores,holeScores}){
  const liveRounds=uniqueVisibleLiveRounds(rounds,currentUser);
  const liveRoundIds=liveDataRoundIds(rounds,liveRounds);
  const[publicScores,setPublicScores]=useState([]);
  const[publicRoundPlayers,setPublicRoundPlayers]=useState({});
  const[publicGroups,setPublicGroups]=useState([]);
  const[dayScorecardRound,setDayScorecardRound]=useState(null);
  const groupsForRound=rd=>{
    const rid=rd&&rd.id;
    const merged=[...(groups||[]),...(publicGroups||[])].filter(g=>g&&g.round_id===rid);
    const byId={};
    merged.forEach(g=>{byId[g.id||('g'+g.group_number)]=g;});
    return Object.values(byId).sort((a,b)=>(parseInt(a.group_number)||0)-(parseInt(b.group_number)||0));
  };
  const modalRoundIds=dayScorecardRound?liveDataRoundIds(rounds,[dayScorecardRound]):[];
  const dataRoundIds=Array.from(new Set([...(liveRoundIds||[]),...(modalRoundIds||[])].filter(Boolean)));
  const liveDataSigRef=useRef('');
  useEffect(()=>{
    let alive=true;
    async function refreshLiveRoundData(){
      if(!dataRoundIds.length){setPublicScores([]);setPublicRoundPlayers({});setPublicGroups([]);return;}
      const[{data:scoreRows},{data:roundPlayers},{data:groupRows}]=await Promise.all([
        sb.from('cup_scores').select('*').in('round_id',dataRoundIds),
        sb.from('cup_round_players').select('*').in('round_id',dataRoundIds),
        sb.from('cup_groups').select('*').in('round_id',dataRoundIds)
      ]);
      if(!alive)return;
      const sig=[
        stableLiveDataSignature(scoreRows||[],['round_id','player_id','hole_number','gross_score','stableford_points']),
        stableLiveDataSignature(roundPlayers||[],['round_id','id','user_id','guest_id','display_name','name']),
        stableLiveDataSignature(groupRows||[],['round_id','id','group_number','player_ids','playing_handicaps'])
      ].join('||');
      if(sig===liveDataSigRef.current)return;
      liveDataSigRef.current=sig;
      setPublicScores(scoreRows||[]);
      setPublicGroups(groupRows||[]);
      const byRound={};
      (roundPlayers||[]).forEach(rp=>{
        if(!byRound[rp.round_id])byRound[rp.round_id]=[];
        byRound[rp.round_id].push(rp);
      });
      setPublicRoundPlayers(byRound);
    }
    refreshLiveRoundData();
    const timer=setInterval(refreshLiveRoundData,15000);
    function onPullRefresh(e){if(e&&e.detail&&e.detail.view==='live')refreshLiveRoundData();}
    window.addEventListener('snyderPullRefresh',onPullRefresh);
    return()=>{alive=false;clearInterval(timer);window.removeEventListener('snyderPullRefresh',onPullRefresh);};
  },[dataRoundIds.join('|')]);
  const completedRounds=sortRoundsNewestFirst(rounds.filter(isCompletedRound));
  const completedDayBoards=completedRounds.filter(isDayCompBoardRound);
  const completedScorecards=completedRounds.filter(r=>!isDayCompBoardRound(r));
  const thisWeekStart=startOfThisWeek();
  const thisWeeksCards=completedScorecards.filter(r=>roundStartDate(r)>=thisWeekStart);
  const olderCards=completedScorecards.filter(r=>roundStartDate(r)<thisWeekStart);
  const olderCardsByMonth=groupRoundsByMonth(olderCards);
  async function buildCupSummaryForLiveOpen(cup,teams,currentRound){
    const cupRounds=(rounds||[]).filter(isSnyderCupRound);
    const roundIds=cupRounds.map(r=>r&&r.id).filter(Boolean);
    const emptySummary=()=>CUP_TEAM_KEYS.reduce((acc,k)=>({...acc,[k]:0,[k+'Name']:(teams[k]&&teams[k].name)||CUP_THEME[k].name}),{});
    if(!roundIds.length)return emptySummary();
    let scoreRows=(scores||[]).filter(s=>roundIds.includes(s.round_id)&&!isMetaScoreRow(s));
    let roundPlayerRows=[];
    try{
      const [{data:scoreData},{data:rpData}]=await Promise.all([
        sb.from('cup_scores').select('*').in('round_id',roundIds),
        sb.from('cup_round_players').select('*').in('round_id',roundIds)
      ]);
      if(scoreData)scoreRows=(scoreData||[]).filter(s=>!isMetaScoreRow(s));
      roundPlayerRows=rpData||[];
    }catch(e){}
    const cupPlayers=(cupEventPlayers||[]).filter(p=>!cup||p.cup_id===cup.id);
    const playerByKey={};
    cupPlayers.forEach(p=>[p.id,p.user_id,p.guest_id].filter(Boolean).forEach(id=>{playerByKey[normaliseId(id)]=p;}));
    roundPlayerRows.forEach(rp=>{
      const name=String(rp.display_name||'').trim().toLowerCase();
      const cp=(cupPlayers||[]).find(p=>String(cupPlayerDisplayName(p)).trim().toLowerCase()===name);
      if(cp)playerByKey[normaliseId(rp.id)]=cp;
    });
    const scoreIdsFor=id=>{
      const cp=playerByKey[normaliseId(id)]||(cupPlayers||[]).find(p=>normaliseId(p.id)===normaliseId(id));
      const ids=new Set([id,cp&&cp.id,cp&&cp.user_id,cp&&cp.guest_id].filter(Boolean).map(normaliseId));
      roundPlayerRows.filter(rp=>{
        const nm=String(rp.display_name||'').trim().toLowerCase();
        return cp&&nm&&nm===String(cupPlayerDisplayName(cp)).trim().toLowerCase();
      }).forEach(rp=>ids.add(normaliseId(rp.id)));
      return ids;
    };
    const pointsForHole=(rd,id,h)=>{
      const ids=scoreIdsFor(id);
      const row=scoreRows.find(s=>s.round_id===rd.id&&parseInt(s.hole_number)===parseInt(h)&&ids.has(normaliseId(s.player_id)));
      return row?stablefordPointsValue(row.stableford_points):null;
    };
    const stablefordTotal=(rd,id)=>{
      const ids=scoreIdsFor(id);
      return scoreRows.filter(s=>s.round_id===rd.id&&ids.has(normaliseId(s.player_id))).reduce((t,s)=>t+stablefordPointsValue(s.stableford_points),0);
    };
    const teamKeyForId=id=>{
      const cp=playerByKey[normaliseId(id)]||(cupPlayers||[]).find(p=>normaliseId(p.id)===normaliseId(id));
      return (cp&&cp.team_key)||'gold';
    };
    const sideKey=ids=>{
      const counts={};
      (ids||[]).forEach(id=>{const k=teamKeyForId(id);counts[k]=(counts[k]||0)+1;});
      return Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0]||'gold';
    };
    const totals={gold:0,navy:0,red:0};
    const dayNums=Array.from(new Set((cupMatches||[]).map(m=>parseInt(m.day_number)||1))).sort((a,b)=>a-b);
    dayNums.forEach(day=>cupGroupsForDay(cupMatches,day).forEach(group=>{
      const rd=cupRounds.find(r=>cupRoundDayNumber(r)===day&&cupRoundGroupNumber(r)===(parseInt(group.idx)||1));
      if(!rd||!isCompletedRound(rd))return;
      [group.doubles,...(group.singles||[])].filter(Boolean).filter(isCupTeamScoringMatch).forEach(match=>{
        const goldIds=match.gold_player_ids||[];
        const navyIds=match.navy_player_ids||[];
        const leftKey=sideKey(goldIds);
        const rightKey=sideKey(navyIds);
        let winner='tie';
        if(String(match.match_type||'').toLowerCase()==='doubles'){
          let gHoles=0,nHoles=0;
          for(let h=1;h<=18;h++){
            const gPts=goldIds.map(id=>pointsForHole(rd,id,h)).filter(v=>v!==null&&v!==undefined);
            const nPts=navyIds.map(id=>pointsForHole(rd,id,h)).filter(v=>v!==null&&v!==undefined);
            if(!gPts.length||!nPts.length)continue;
            const g=Math.max(...gPts),n=Math.max(...nPts);
            if(g>n)gHoles++; else if(n>g)nHoles++;
          }
          winner=gHoles>nHoles?leftKey:nHoles>gHoles?rightKey:'tie';
        }else{
          const g=goldIds.reduce((t,id)=>t+stablefordTotal(rd,id),0);
          const n=navyIds.reduce((t,id)=>t+stablefordTotal(rd,id),0);
          winner=g>n?leftKey:n>g?rightKey:'tie';
        }
        if(winner==='tie'){totals[leftKey]=(totals[leftKey]||0)+0.5;totals[rightKey]=(totals[rightKey]||0)+0.5;}
        else totals[winner]=(totals[winner]||0)+1;
      });
    }));
    return CUP_TEAM_KEYS.reduce((acc,k)=>({...acc,[k]:totals[k]||0,[k+'Name']:(teams[k]&&teams[k].name)||CUP_THEME[k].name}),{});
  }
  async function openRound(rd){
    try{const{data:dbRound}=await sb.from('cup_rounds').select('*').eq('id',rd.id).single();if(dbRound)rd={...rd,...dbRound};}catch(e){}
    let rdGroups=groupsForRound(rd);
    try{const{data:dbGroups}=await sb.from('cup_groups').select('*').eq('round_id',rd.id).order('group_number',{ascending:true});if(dbGroups&&dbGroups.length)rdGroups=dbGroups;}catch(e){}
    const{data:rps}=await sb.from('cup_round_players').select('*').eq('round_id',rd.id);
    const roundPlayers=(rps||[]);
    const isCup=isSnyderCupRound(rd);
    if(!rdGroups.length){const rpGroup=groupFromRoundPlayers(rd,roundPlayers,isCup);if(rpGroup)rdGroups=[rpGroup];}
    const po=roundPlayers.map(rp=>mapRoundPlayerForScorecard(rp,isCup));
    const hm={};roundPlayers.forEach(rp=>addRoundPlayerHandicaps(hm,rp,isCup));
    {
      let local={};
      try{local=JSON.parse(localStorage.getItem('scores_'+rd.id)||'{}')||{};}catch(e){local={};}
      const{data:dbScores}=await sb.from('cup_scores').select('*').eq('round_id',rd.id);
      const dbMap={};
      normaliseFoursomesScoreRows(dbScores||[]).filter(r=>!isMetaScoreRow(r)).forEach(s=>{
        if(!dbMap[s.hole_number])dbMap[s.hole_number]={};
        aliasesForSavedScoreId(s.player_id,po).forEach(pid=>{dbMap[s.hole_number][pid]=s.gross_score;});
      });
      const merged={...local,...dbMap};
      if(setHoleScores)setHoleScores(merged);
      try{if(Object.keys(dbMap).length>0)localStorage.setItem('scores_'+rd.id,JSON.stringify(merged));}catch(e){}
      const cup=(cupEvents||[])[0];
      const teams=cup?getCupTeams(cup,cupTeams||[]):{};
      const cupDay=cupRoundDayNumber(rd);
      const cupGroup=cupRoundGroupNumber(rd);
      const cupDayRounds=isCup?(rounds||[]).filter(r=>cupRoundDayNumber(r)===cupDay&&isSnyderCupRound(r)):[];
      const groupMetaRows=(rdGroups||[]).flatMap(g=>foursomesScoreRowsFromGroupMeta(rd.id,g));
      const latestRows=normaliseFoursomesScoreRows([...(scores||[]),...(publicScores||[]),...(dbScores||[]),...groupMetaRows,...localScoreRowsForRound(rd.id)]).filter(r=>r&&r.round_id===rd.id);
      const latestMatchplay=foursomesConfigForLiveSnapshot(rd,rdGroups,latestRows)||matchplayConfigFromRows(latestRows,rd,rdGroups[0]||{id:'group',group_number:1});
      const fallbackGroup=(latestMatchplay&&latestMatchplay.enabled&&latestMatchplay.mode==='foursomes')?foursomesFallbackGroup(rd,latestMatchplay):null;
      if(fallbackGroup){const metaScores=foursomesHoleScoresFromGroupMeta(rdGroups[0]||{});if(Object.keys(metaScores).length&&setHoleScores)setHoleScores(prev=>({...prev,...metaScores}));}
      const userGroup=fallbackGroup||(rdGroups.find(g=>currentUser&&Array.isArray(g.player_ids)&&(g.player_ids||[]).some(pid=>normaliseId(pid)===normaliseId(currentUser.id)))||rdGroups[0]);
      if(!userGroup){flash('No scorecard group found for this round','error');return;}
      const canScore=(fallbackGroup&&userGroup===fallbackGroup)?userCanScoreFoursomesRound(currentUser,rd,rdGroups[0],roundPlayers):userCanScoreRound(currentUser,userGroup,roundPlayers);
      const finalParticipants=fallbackGroup&&userGroup===fallbackGroup?fallbackGroup.participants:po;
      const finalHandicaps=fallbackGroup&&userGroup===fallbackGroup?fallbackGroup.playing_handicaps:hm;
      const selected={...rd,_spectator:!canScore,_extraScores:latestRows,_matchplay:latestMatchplay,_group:{...userGroup,participants:finalParticipants,playing_handicaps:finalHandicaps,player_ids:(userGroup.player_ids&&userGroup.player_ids.length?userGroup.player_ids:finalParticipants.map(p=>p.id))}};
      if(isCup){
        const dayGroups=cupGroupsForDay(cupMatches,cupDay);
        const groupData=dayGroups.find(g=>parseInt(g.idx)===cupGroup)||{day:cupDay,idx:cupGroup,players:po.map(p=>p.id),doubles:null,singles:[]};
        const cupGroupPlayers=cupPlayersForGroupData(groupData,(cupEventPlayers||[]).filter(p=>!cup||p.cup_id===cup.id));
        if(cupGroupPlayers.length){
          const cupParticipants=cupGroupPlayers.map(p=>({id:p.id,name:cupPlayerDisplayName(p),display_name:cupPlayerDisplayName(p),current_handicap:p.playing_handicap||p.handicap||0,handicap:p.playing_handicap||p.handicap||0,user_id:p.user_id,guest_id:p.guest_id,cup_player_id:p.id}));
          const cupHm={};cupParticipants.forEach(p=>{cupHm[p.id]=p.current_handicap||0;});
          selected._group={...selected._group,participants:cupParticipants,player_ids:cupParticipants.map(p=>p.id),playing_handicaps:{...selected._group.playing_handicaps,...cupHm}};
        }
        selected._cupScoring=true;
        selected._spectator=!currentUserCanScoreCupGroup(currentUser,groupData,(cupEventPlayers||[]).filter(p=>!cup||p.cup_id===cup.id));
        selected._cupTeams=teams;
        selected._cupSummary=await buildCupSummaryForLiveOpen(cup,teams,rd);
        selected._cupDayNumber=cupDay;
        selected._cupDayReleased=cupMatchesDayReleased(cupMatches,cupDay);
        selected._cupGroupData=groupData;
        selected._cupDayAllPlayers=(cupEventPlayers||[]).filter(p=>!cup||p.cup_id===cup.id);
        selected._cupDayRounds=cupDayRounds.length?cupDayRounds:[rd];
        selected._cupDayGroups=dayGroups.length?dayGroups:[groupData];
        try{sessionStorage.setItem('cupReturnDay',String(cupDay));}catch(e){}
      }
      setSelectedRound(selected);
      setView('play');
    }
  }
  function getDisplayName(pid){
    const key=normaliseId(pid);
    const person=(cupEventPlayers||[]).find(p=>normaliseId(p.id)===key||normaliseId(p.user_id)===key||normaliseId(p.guest_id)===key)||(cupUsers||[]).find(u=>normaliseId(u.id)===key)||(players||[]).find(p=>normaliseId(p.id)===key);
    return (person&&(person.display_name||person.name||person.username))||'Player';
  }
  function leaderboardForRound(rd){
    const totals={};const holes={};const holePoints={};const seen=new Set();
    const boardRounds=dayCompKeyFromRound(rd)?dayCompRoundsFor(rounds,rd):[rd];
    const boardRoundIds=new Set(boardRounds.map(r=>r&&r.id).filter(Boolean));
    const rdGroups=boardRounds.flatMap(r=>groupsForRound(r));
    const rdRoundPlayers=boardRounds.flatMap(r=>(publicRoundPlayers[r&&r.id]||[]));
    const isCupRound=isSnyderCupRound(rd);
    const cup=(cupEvents||[])[0];
    const cupDay=cupRoundDayNumber(rd);
    const cupGroup=cupRoundGroupNumber(rd);
    const dayGroups=isCupRound?cupGroupsForDay(cupMatches,cupDay):[];
    const groupData=dayGroups.find(g=>parseInt(g.idx)===cupGroup)||null;
    const allowedCupPlayers=isCupRound?cupPlayersForGroupData(groupData,(cupEventPlayers||[]).filter(p=>!cup||p.cup_id===cup.id)):[];
    const aliasMap={};
    const hcpMap={};const nameMap={};
    function setAlias(alias,canonical){
      if(alias&&canonical)aliasMap[normaliseId(alias)]=canonical;
    }
    function canonicalId(pid){
      const key=normaliseId(pid);
      return aliasMap[key]||pid;
    }
    function cupPlayerForRoundPlayer(rp){
      const nm=String(rp&&rp.display_name||'').trim().toLowerCase();
      return (allowedCupPlayers||[]).find(p=>
        normaliseId(p.id)===normaliseId(rp&&rp.cup_player_id)||
        normaliseId(p.user_id)===normaliseId(rp&&rp.user_id)||
        normaliseId(p.guest_id)===normaliseId(rp&&rp.guest_id)||
        (nm&&nm!=='player'&&String(cupPlayerDisplayName(p)).trim().toLowerCase()===nm)
      );
    }
    if(isCupRound&&allowedCupPlayers.length){
      allowedCupPlayers.forEach(p=>{
        const canonical=p.id;
        if(totals[canonical]==null)totals[canonical]=0;
        nameMap[canonical]=cupPlayerDisplayName(p);
        hcpMap[canonical]=p.playing_handicap||p.handicap||0;
        [p.id,p.user_id,p.guest_id].filter(Boolean).forEach(id=>setAlias(id,canonical));
      });
    }
    rdRoundPlayers.forEach(rp=>{
      const rowIdx=rdRoundPlayers.indexOf(rp);
      const cp=isCupRound?(cupPlayerForRoundPlayer(rp)||(allowedCupPlayers.length===rdRoundPlayers.length?allowedCupPlayers[rowIdx]:null)):null;
      const canonical=isCupRound?((cp&&cp.id)||rp.cup_player_id||rp.id):(rp.user_id||rp.guest_id||rp.id);
      [rp.id,rp.user_id,rp.guest_id,rp.cup_player_id,cp&&cp.id].filter(Boolean).forEach(id=>setAlias(id,canonical));
      if(canonical){
        if(totals[canonical]==null)totals[canonical]=0;
        hcpMap[canonical]=rp.playing_handicap||hcpMap[canonical]||0;
        nameMap[canonical]=(cp&&cupPlayerDisplayName(cp))||(rp.display_name&&rp.display_name!=='Player'?rp.display_name:null)||nameMap[canonical];
      }
    });
    rdGroups.forEach(g=>{
      Object.keys(g.playing_handicaps||{}).forEach(pid=>{hcpMap[canonicalId(pid)]=(g.playing_handicaps||{})[pid];});
      (g.player_ids||[]).forEach(pid=>{
        const id=canonicalId(pid);
        if(id&&totals[id]==null)totals[id]=0;
      });
    });
    function addScore(pid,holeNum,pts){
      addLeaderboardScore(totals,holes,holePoints,seen,canonicalId(pid),holeNum,pts);
    }
    normaliseFoursomesScoreRows([...(scores||[]),...(publicScores||[])]).filter(sc=>boardRoundIds.has(sc.round_id)&&!isMetaScoreRow(sc)&&!isFoursomesTeamPlayerId(sc.player_id)).forEach(sc=>{
      addScore(sc.player_id,sc.hole_number,sc.stableford_points);
    });
    // Scores saved in this browser are instant; appData.scores may not have refreshed yet after exiting a round.
    try{
      boardRounds.forEach(boardRound=>{
        const local=JSON.parse(localStorage.getItem('scores_'+boardRound.id)||'{}');
        const course=courses.find(co=>co.id===boardRound.course_id)||findCourseForTee(courses,boardRound.course_name,boardRound.tee);
        const courseHoles=(course&&Array.isArray(course.holes))?course.holes:[];
        Object.keys(local||{}).forEach(h=>{
          const holeNum=parseInt(h);
          const hd=courseHoles.find(x=>parseInt(x.hole)===holeNum)||{par:4,stroke_index:holeNum};
          Object.keys(local[h]||{}).forEach(pid=>{
            const gross=parseInt(local[h][pid]);
            const id=canonicalId(pid);
            const pts=calcStableford(gross,parseInt(hd.par)||4,parseInt(hd.stroke_index)||holeNum,parseFloat(hcpMap[id]||0));
            addScore(pid,holeNum,pts);
          });
        });
      });
    }catch(e){}
    return Object.keys(totals).map(pid=>({id:pid,name:nameMap[pid]||getDisplayName(pid),total:totals[pid]||0,holes:holes[pid]?holes[pid].size:0,_holePoints:holePoints[pid]||{}})).sort(compareStablefordLeaderboardRows);
  }
  function daySweepstakeConfigForLive(rd,sourceRows=null,sourceRounds=null){
    const key=dayCompKeyFromRound(rd);
    const dayRounds=(sourceRounds&&sourceRounds.length)?sourceRounds:(key?dayCompRoundsFor(rounds,rd):[rd]);
    const board=dayCompBoardFor(dayRounds,rd);
    const boardRounds=key?dayRounds:[rd];
    const allRows=sourceRows?normaliseFoursomesScoreRows(sourceRows):normaliseFoursomesScoreRows([...(scores||[]),...(publicScores||[])]);
    const boardCfg=board?sweepstakeConfigFromRows(allRows,board):null;
    if(boardCfg&&boardCfg.enabled)return boardCfg;
    for(const r of boardRounds){
      const cfg=sweepstakeConfigFromRows(allRows,r);
      if(cfg&&cfg.enabled)return cfg;
    }
    return {enabled:!!dayCompKeyFromRound(rd),amountPence:200,scope:'round'};
  }
  function sumRowHoles(row,start,end){
    const hp=row&&row._holePoints||{};
    let total=0;
    for(let h=start;h<=end;h++)total+=stablefordPointsValue(hp[h]||0);
    return total;
  }
  function canonicalDaySweepstakeEntryState(rd,state,sourceRounds=null,sourceRoundPlayers=null){
    if(!state||!state.size)return state||null;
    const key=dayCompKeyFromRound(rd);
    if(sourceRoundPlayers){
      const allPlayers=Array.isArray(sourceRoundPlayers)?sourceRoundPlayers:Object.values(sourceRoundPlayers||{}).flat();
      return canonicalSweepstakeEntryStateFromRoundPlayers(state,allPlayers);
    }
    const dayRounds=(sourceRounds&&sourceRounds.length)?sourceRounds:(key?dayCompRoundsFor(rounds,rd):[rd]);
    const boardRounds=key?dayRounds.filter(r=>!isDayCompBoardRound(r)):[rd];
    const aliasToCanonical={};
    function addAlias(alias,canonical){
      const a=normaliseId(alias);const c=normaliseId(canonical);
      if(a&&c)aliasToCanonical[a]=c;
    }
    boardRounds.forEach(r=>{
      const isCup=isSnyderCupRound(r);
      (publicRoundPlayers[r&&r.id]||[]).map(x=>mapRoundPlayerForScorecard(x,isCup)).forEach(rp=>{
        const canonical=normaliseId((!isCup&&(rp.user_id||rp.guest_id))||rp.cup_player_id||rp.user_id||rp.guest_id||rp.id);
        [rp.id,rp.user_id,rp.guest_id,rp.cup_player_id,canonical].filter(Boolean).forEach(id=>addAlias(id,canonical));
      });
      groupsForRound(r).forEach(g=>{
        (g.player_ids||[]).forEach(pid=>addAlias(pid,pid));
        Object.keys(g.playing_handicaps||{}).forEach(pid=>addAlias(pid,pid));
      });
    });
    const out=new Map();
    state.forEach((included,id)=>{
      const raw=normaliseId(id);
      const canonical=aliasToCanonical[raw]||raw;
      if(!canonical)return;
      if(!out.has(canonical))out.set(canonical,!!included);
      else if(!included)out.set(canonical,false);
    });
    return out.size?out:null;
  }
  function daySweepstakeEntrantIdSet(rd,sourceRows=null,sourceRounds=null,sourceRoundPlayers=null){
    const key=dayCompKeyFromRound(rd);
    if(!key)return null;
    const allRows=sourceRows?normaliseFoursomesScoreRows(sourceRows):normaliseFoursomesScoreRows([...(scores||[]),...(publicScores||[])]);
    const dayRounds=(sourceRounds&&sourceRounds.length)?sourceRounds:dayCompRoundsFor(rounds,rd);
    const board=dayCompBoardFor(dayRounds,rd);
    const boardRounds=dayRounds.filter(r=>!isDayCompBoardRound(r));
    // v4.33: restore the v4.20 local opt-out behaviour, then sync it to the board. Linked scorecards plus local choices are the source of truth for who actually opted in.
    // The Day Leaderboard board is only a shared cache. A stale board-level opt-in must
    // never pull an opted-out player (e.g. James Milner) back into the sweepstake.
    const linkedState=canonicalDaySweepstakeEntryState(rd,linkedDaySweepstakeEntryStateFromRows(allRows,boardRounds,{includeLocal:true}),dayRounds,sourceRoundPlayers);
    const boardState=canonicalDaySweepstakeEntryState(rd,board?sweepstakeEntryStateFromRows(allRows,board):null,dayRounds,sourceRoundPlayers);
    // v4.33: linked scorecards are the source of truth. The board row is only a cache,
    // so a stale board-level opt-in must not pull an opted-out player back in.
    const mergedSourceState=linkedState||boardState;
    const mergedSourceIds=sweepstakeEntryIdsFromState(mergedSourceState);
    if(mergedSourceState&&mergedSourceState.size)return mergedSourceIds||new Set();
    const ids=new Set();
    let hasExplicit=false;
    boardRounds.forEach(r=>{
      const explicitState=canonicalDaySweepstakeEntryState(rd,mergeSweepstakeEntryStateMaps(sweepstakeEntryStateFromRows(allRows,r),sourceRows?null:loadLocalSweepstakeEntryState(r&&r.id)),dayRounds,sourceRoundPlayers);
      const explicit=sweepstakeEntryIdsFromState(explicitState);
      if(explicit){hasExplicit=true;explicit.forEach(id=>ids.add(normaliseId(id)));}
      else if(!hasExplicit){
        const sourceRp=sourceRoundPlayers?(sourceRoundPlayers[r.id]||[]):(publicRoundPlayers[r.id]||[]);
        const rp=(sourceRp||[]).map(x=>mapRoundPlayerForScorecard(x,isSnyderCupRound(r)));
        rp.forEach(p=>{const id=normaliseId((p.user_id||p.guest_id||p.id));if(id)ids.add(id);});
      }
    });
    return hasExplicit?ids:(ids.size?ids:null);
  }
  function daySweepstakePotRows(rd,boardRows,sourceRows=null,sourceRounds=null,sourceRoundPlayers=null){
    const cfg=daySweepstakeConfigForLive(rd,sourceRows,sourceRounds);
    const amountPence=parseInt(cfg&&cfg.amountPence)||200;
    const entrantIds=daySweepstakeEntrantIdSet(rd,sourceRows,sourceRounds,sourceRoundPlayers)
    const sweepRows=(boardRows||[]).filter(r=>r&&r.id&&(!entrantIds||entrantIds.has(normaliseId(r.id))));
    const dayNameMap=contextualNameMapFromRows(boardRows||[]);
    const sweepNameMap=contextualNameMapFromRows(sweepRows||[]);
    const rowsForRange=(start,end)=>sweepRows.map(r=>({...r,displayName:nameFromContextMap(sweepNameMap,r.id,r.name),potTotal:sumRowHoles(r,start,end)})).filter(r=>r.holes>0);
    const makePot=(def,rolloverIn=0)=>{
      const rows=rowsForRange(def.start,def.end);
      const best=rows.length?Math.max(...rows.map(r=>r.potTotal)):0;
      const tied=best>0?rows.filter(r=>r.potTotal===best):[];
      const resolved=resolveSweepstakeCountback(tied,def.key,(row,start,end)=>sumRowHoles(row,start,end));
      const unresolved=!!(best>0&&resolved.unresolved);
      const rollover=unresolved&&(def.key==='front'||def.key==='back');
      const manualDecision=unresolved&&def.key==='overall';
      const entrantCount=(sweepRows||[]).filter(r=>r&&r.id).length||0;
      const basePotTotal=amountPence*entrantCount;
      const payoutAmountPence=rollover?0:(manualDecision?0:(basePotTotal+(parseInt(rolloverIn)||0)));
      const winner=resolved.winner?{...resolved.winner,displayName:nameFromContextMap(sweepNameMap,resolved.winner.id,resolved.winner.name)}:null;
      const winners=(resolved.winners||[]).map(w=>({...w,displayName:nameFromContextMap(sweepNameMap,w.id,w.name)}));
      return {...def,amountPence,best,winners,winner,reason:resolved.reason||'',reasonShort:resolved.reasonShort||'',rollover,manualDecision,basePotTotal,payoutAmountPence,rolloverIn:parseInt(rolloverIn)||0,entrantCount,winnerUpPence:winner?Math.max(0,payoutAmountPence-amountPence):0};
    };
    const front=makePot({key:'front',label:'Front 9',start:1,end:9});
    const back=makePot({key:'back',label:'Back 9',start:10,end:18});
    const rolloverIn=(front.rollover?front.basePotTotal:0)+(back.rollover?back.basePotTotal:0);
    const overall=makePot({key:'overall',label:'Overall',start:1,end:18},rolloverIn);
    return [front,back,overall];
  }
  function compactDaySweepstakeSettlement(rd,boardRows,potRows,sourceRows=null,sourceRounds=null,sourceRoundPlayers=null){
    const cfg=daySweepstakeConfigForLive(rd,sourceRows,sourceRounds);
    const amountPence=parseInt(cfg&&cfg.amountPence)||200;
    const entrantIds=daySweepstakeEntrantIdSet(rd,sourceRows,sourceRounds,sourceRoundPlayers)
    const nameMap=contextualNameMapFromRows(boardRows||[]);
    const rows=(boardRows||[]).filter(r=>r&&r.id&&(!entrantIds||entrantIds.has(normaliseId(r.id)))).map(r=>({id:r.id,name:nameFromContextMap(nameMap,r.id,r.name||'Player'),wins:[],owes:0,receives:0,net:0}));
    const byId={};
    rows.forEach(r=>{byId[normaliseId(r.id)]=r;});
    const board=dayCompBoardFor(rounds,rd);
    const dayClosed=board&&!isLiveRound(board);
    const payments=[];
    (potRows||[]).forEach(pot=>{
      if(!pot||pot.rollover||pot.manualDecision)return;
      // The balance preview must match the displayed pot rows.
      // It is still only projected until Admin presses Day Finished.
      const winner=pot.winner||(pot.winners||[])[0];
      const winnerRow=winner&&byId[normaliseId(winner.id)];
      if(!winnerRow)return;
      const entrants=rows.filter(r=>normaliseId(r.id)!==normaliseId(winnerRow.id));
      if(!entrants.length)return;
      winnerRow.wins.push({label:pot.label,amount:amountPence*entrants.length,points:winner.potTotal,reason:pot.reason||''});
      winnerRow.receives+=amountPence*entrants.length;
      entrants.forEach(payer=>{
        payer.owes+=amountPence;
        payments.push({from:payer.name,to:winnerRow.name,fromId:payer.id,toId:winnerRow.id,amount:amountPence,potKey:pot.key,potLabel:pot.label});
      });
    });
    rows.forEach(r=>{r.net=(parseInt(r.receives)||0)-(parseInt(r.owes)||0);});
    const grouped=[];
    payments.forEach(pay=>{
      let group=grouped.find(g=>normaliseId(g.toId)===normaliseId(pay.toId));
      if(!group){group={to:pay.to,toId:pay.toId,total:0,from:[]};grouped.push(group);}
      group.total+=pay.amount;
      const existing=group.from.find(x=>normaliseId(x.id)===normaliseId(pay.fromId));
      if(existing)existing.amount+=pay.amount;
      else group.from.push({name:pay.from,id:pay.fromId,amount:pay.amount});
    });
    grouped.forEach(g=>g.from.sort((a,b)=>b.amount-a.amount||String(a.name).localeCompare(String(b.name))));
    return {rows,payments,grouped,totalEntry:amountPence*3,playerCount:rows.length,amountPence};
  }
  function compactPayersText(group,totalPlayers=0){
    const from=group&&group.from||[];
    const to=group&&group.to||'winner';
    if(!from.length)return '';
    const same=from.every(x=>x.amount===from[0].amount);
    if(same){
      const amount=moneyFromPence(from[0].amount);
      if(from.length===1)return `${from[0].name} owes ${to} ${amount}`;
      if(totalPlayers>5&&from.length>=totalPlayers-1)return `Everyone owes ${to} ${amount}`;
      return `${from.map(x=>x.name).join(', ')} owe ${to} ${amount} each`;
    }
    return from.map(x=>`${x.name} owes ${to} ${moneyFromPence(x.amount)}`).join(' · ');
  }
  function DayLeaderboardModal({rd}){
    if(!rd)return null;
    const dayKey=dayCompKeyFromRound(rd);
    const board=dayCompBoardFor(rounds,rd);
    const playable=playableDayCompRounds(rounds,rd).sort((a,b)=>roundStartDate(a)-roundStartDate(b));
    const [freshDayRows,setFreshDayRows]=useState(null);
    const [freshDayRounds,setFreshDayRounds]=useState(null);
    const [freshDayGroups,setFreshDayGroups]=useState(null);
    const [freshDayRoundPlayers,setFreshDayRoundPlayers]=useState(null);
    const [dayRefreshTick,setDayRefreshTick]=useState(0);
    const [dayRefreshing,setDayRefreshing]=useState(false);
    const freshDaySigRef=useRef('');
    const daySnakeIdsRef=useRef(new Set());
    const dayScrollRef=useRef(null);
    const dayTouchYRef=useRef(0);
    const effectiveDayRounds=(freshDayRounds&&freshDayRounds.length)?freshDayRounds:dayCompRoundsFor(rounds,rd);
    const effectiveBoard=effectiveDayRounds.find(isDayCompBoardRound)||board;
    const effectivePlayable=effectiveDayRounds.filter(r=>r&&!isDayCompBoardRound(r)).sort((a,b)=>roundStartDate(a)-roundStartDate(b));
    function freshDayLeaderboardRows(){
      if(!freshDayRows||!freshDayRounds||!freshDayRounds.length)return null;
      const boardRoundIds=new Set(freshDayRounds.map(r=>r&&r.id).filter(Boolean));
      const totals={};const holes={};const holePoints={};const seen=new Set();
      const aliasMap={};const nameMap={};
      function setAlias(alias,canonical){const a=normaliseId(alias);const c=normaliseId(canonical);if(a&&c)aliasMap[a]=c;}
      function canonicalId(pid){const key=normaliseId(pid);return aliasMap[key]||key;}
      Object.values(freshDayRoundPlayers||{}).flat().forEach(raw=>{
        const rp=mapRoundPlayerForScorecard(raw,isSnyderCupRound((freshDayRounds||[]).find(r=>r&&r.id===raw.round_id)));
        const canonical=normaliseId(rp.user_id||rp.guest_id||rp.cup_player_id||rp.id||raw.user_id||raw.guest_id||raw.id);
        [rp.id,rp.user_id,rp.guest_id,rp.cup_player_id,raw.id,raw.user_id,raw.guest_id].filter(Boolean).forEach(id=>setAlias(id,canonical));
        if(canonical){
          if(totals[canonical]==null)totals[canonical]=0;
          nameMap[canonical]=(rp.display_name&&rp.display_name!=='Player'?rp.display_name:null)||rp.name||nameMap[canonical];
        }
      });
      (freshDayGroups||[]).forEach(g=>{
        (g.player_ids||[]).forEach(pid=>{const id=canonicalId(pid);if(id&&totals[id]==null)totals[id]=0;});
      });
      normaliseFoursomesScoreRows(freshDayRows||[]).filter(sc=>boardRoundIds.has(sc.round_id)&&!isMetaScoreRow(sc)&&!isFoursomesTeamPlayerId(sc.player_id)).forEach(sc=>{
        addLeaderboardScore(totals,holes,holePoints,seen,canonicalId(sc.player_id),sc.hole_number,sc.stableford_points);
      });
      return Object.keys(totals).map(pid=>({id:pid,name:nameMap[pid]||getDisplayName(pid),total:totals[pid]||0,holes:holes[pid]?holes[pid].size:0,_holePoints:holePoints[pid]||{}})).sort(compareStablefordLeaderboardRows);
    }
    useEffect(()=>{
      let cancelled=false;
      async function refreshDaySweepstakeSource(){
        try{
          if(!rd||!sb||!dayKey)return;
          if(!cancelled)setDayRefreshing(true);
          const allDayRounds=await fetchDayCompRoundsFromCloud(dayKey,dayCompRoundsFor(rounds,rd));
          const freshBoard=allDayRounds.find(isDayCompBoardRound)||board||rd;
          const freshPlayable=allDayRounds.filter(r=>r&&!isDayCompBoardRound(r));
          const ids=Array.from(new Set([freshBoard&&freshBoard.id,...freshPlayable.map(r=>r&&r.id)].filter(Boolean)));
          if(!ids.length)return;
          const [res,rpRes,groupRes]=await Promise.all([
            sb.from('cup_scores').select('*').in('round_id',ids),
            sb.from('cup_round_players').select('*').in('round_id',ids),
            sb.from('cup_groups').select('*').in('round_id',ids)
          ]);
          if(cancelled)return;
          if(res.error){setFreshDayRows(null);return;}
          let rows=normaliseFoursomesScoreRows(res.data||[]);
          const roundPlayers=(rpRes&&!rpRes.error&&rpRes.data)||[];
          const groupRows=(groupRes&&!groupRes.error&&groupRes.data)||[];
          const sig=[
            stableLiveDataSignature(allDayRounds||[],['id','name','course_name','status','started_at','created_at']),
            stableLiveDataSignature(rows||[],['round_id','player_id','hole_number','gross_score','stableford_points']),
            stableLiveDataSignature(roundPlayers||[],['round_id','id','user_id','guest_id','display_name','name']),
            stableLiveDataSignature(groupRows||[],['round_id','id','group_number','player_ids','playing_handicaps'])
          ].join('||');
          if(sig===freshDaySigRef.current)return;
          freshDaySigRef.current=sig;
          const roundPlayerMap={};
          roundPlayers.forEach(rp=>{const rid=rp&&rp.round_id;if(!rid)return;(roundPlayerMap[rid]=roundPlayerMap[rid]||[]).push(rp);});
          if(!cancelled){
            setFreshDayRounds(allDayRounds);
            setFreshDayGroups(groupRows);
            setFreshDayRoundPlayers(roundPlayerMap);
            setFreshDayRows(rows);
          }
        }catch(e){if(!cancelled){setFreshDayRows(null);setFreshDayRounds(null);}}
        finally{if(!cancelled)setDayRefreshing(false);}
      }
      refreshDaySweepstakeSource();
      return()=>{cancelled=true;};
    },[rd&&rd.id,dayKey,dayRefreshTick]);
    useEffect(()=>{
      if(typeof document==='undefined')return;
      const body=document.body;
      const html=document.documentElement;
      const scrollY=(typeof window!=='undefined'&&window.scrollY)||0;
      const previousBodyOverflow=body&&body.style&&body.style.overflow;
      const previousBodyPosition=body&&body.style&&body.style.position;
      const previousBodyTop=body&&body.style&&body.style.top;
      const previousBodyWidth=body&&body.style&&body.style.width;
      const previousHtmlOverscroll=html&&html.style&&html.style.overscrollBehaviorY;
      if(body&&body.style)body.style.overflow='hidden';
      if(body&&body.style)body.style.position='fixed';
      if(body&&body.style)body.style.top=`-${scrollY}px`;
      if(body&&body.style)body.style.width='100%';
      if(html&&html.style)html.style.overscrollBehaviorY='none';
      return()=>{
        if(body&&body.style)body.style.overflow=previousBodyOverflow||'';
        if(body&&body.style)body.style.position=previousBodyPosition||'';
        if(body&&body.style)body.style.top=previousBodyTop||'';
        if(body&&body.style)body.style.width=previousBodyWidth||'';
        if(html&&html.style)html.style.overscrollBehaviorY=previousHtmlOverscroll||'';
        try{if(typeof window!=='undefined')window.scrollTo(0,scrollY);}catch(e){}
      };
    },[]);
    function handleDayScrollTouchStart(e){
      const el=dayScrollRef.current;
      if(el&&el.scrollHeight>el.clientHeight){
        if(el.scrollTop<=0)el.scrollTop=1;
        else if(Math.ceil(el.scrollTop+el.clientHeight)>=el.scrollHeight)el.scrollTop=el.scrollHeight-el.clientHeight-1;
      }
      dayTouchYRef.current=(e.touches&&e.touches[0])?e.touches[0].clientY:0;
    }
    function handleDayScrollTouchMove(e){
      const el=dayScrollRef.current;
      if(!el||!e.touches||!e.touches[0])return;
      if(!el.contains(e.target))return;
      const y=e.touches[0].clientY;
      const dy=y-dayTouchYRef.current;
      const canScroll=el.scrollHeight>el.clientHeight+1;
      if(!canScroll){
        e.preventDefault();
        return;
      }
      const atTop=el.scrollTop<=1;
      const atBottom=Math.ceil(el.scrollTop+el.clientHeight)>=el.scrollHeight-1;
      if(atTop&&dy>0){
        el.scrollTop=1;
        e.preventDefault();
        return;
      }
      if(atBottom&&dy<0){
        el.scrollTop=Math.max(1,el.scrollHeight-el.clientHeight-1);
        e.preventDefault();
        return;
      }
      dayTouchYRef.current=y;
    }
    useEffect(()=>{
      const el=dayScrollRef.current;
      if(!el)return;
      if(el.scrollHeight>el.clientHeight&&el.scrollTop<=0)el.scrollTop=1;
      const onStart=e=>handleDayScrollTouchStart(e);
      const onMove=e=>handleDayScrollTouchMove(e);
      const onScroll=()=>{
        if(el.scrollHeight<=el.clientHeight+1)return;
        if(el.scrollTop<=0)el.scrollTop=1;
        else if(Math.ceil(el.scrollTop+el.clientHeight)>=el.scrollHeight)el.scrollTop=el.scrollHeight-el.clientHeight-1;
      };
      el.addEventListener('touchstart',onStart,{passive:true});
      el.addEventListener('touchmove',onMove,{passive:false});
      el.addEventListener('scroll',onScroll,{passive:true});
      document.addEventListener('touchmove',onMove,{passive:false,capture:true});
      return()=>{
        el.removeEventListener('touchstart',onStart);
        el.removeEventListener('touchmove',onMove);
        el.removeEventListener('scroll',onScroll);
        document.removeEventListener('touchmove',onMove,true);
      };
    },[]);
    function refreshDayLeaderboardNow(){
      freshDaySigRef.current='';
      setDayRefreshTick(t=>t+1);
    }
    const daySourceRows=freshDayRows||null;
    const boardRows=freshDayLeaderboardRows()||leaderboardForRound(rd);
    const dayNameMap=contextualNameMapFromRows(boardRows||[]);
    const potRows=daySweepstakePotRows(rd,boardRows,daySourceRows,effectiveDayRounds,freshDayRoundPlayers);
    const compactSettlement=compactDaySweepstakeSettlement(rd,boardRows,potRows,daySourceRows,effectiveDayRounds,freshDayRoundPlayers);
    const cfg=daySweepstakeConfigForLive(rd,daySourceRows,effectiveDayRounds);
    const allDone=effectivePlayable.length>0&&effectivePlayable.every(isCompletedRound);
    const dayClosed=effectiveBoard&&!isLiveRound(effectiveBoard);
    const rawSnakeIds=dayClosed?new Set():snakeHolderIdsFromScoreRows(daySourceRows||[],18,new Set(effectivePlayable.map(r=>r&&r.id).filter(Boolean)));
    if(dayClosed)daySnakeIdsRef.current=new Set();
    else if(rawSnakeIds.size)daySnakeIdsRef.current=new Set(rawSnakeIds);
    const currentSnakeIds=rawSnakeIds.size?rawSnakeIds:daySnakeIdsRef.current;
    const displaySettlementRows=(compactSettlement.rows||[]).map(r=>{
      const snakePenalty=currentSnakeIds.has(normaliseId(r.id))?SNAKE_SWEEPSTAKE_PENALTY_PENCE:0;
      return {...r,snakePenalty,displayNet:parseInt(r.net)||0};
    });
    const currentSnakeRows=(boardRows||[])
      .filter(r=>r&&currentSnakeIds.has(normaliseId(r.id)))
      .map(r=>({id:r.id,name:nameFromContextMap(dayNameMap,r.id,r.name||'Player'),snakePenalty:SNAKE_SWEEPSTAKE_PENALTY_PENCE}));
    return(
      <div style={{position:'fixed',inset:0,background:'linear-gradient(180deg,rgba(4,12,28,0.94),rgba(2,8,23,0.88))',zIndex:1200,overflow:'hidden',overscrollBehavior:'none',touchAction:'none'}}>
        <div ref={dayScrollRef} style={{height:'100dvh',maxHeight:'100vh',overflowY:'auto',overscrollBehaviorY:'none',WebkitOverflowScrolling:'touch',touchAction:'pan-y',padding:'max(10px,env(safe-area-inset-top)) 10px 10px'}}>
        <div style={{maxWidth:540,margin:'0 auto'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:8}}>
            <div>
              <div style={{fontSize:18,color:'#fff',fontWeight:950,textShadow:'0 0 18px rgba(96,184,240,0.22)'}}>{dayCompDisplayName(rounds,rd)}</div>
              <div style={{fontSize:12,color:'#90ccf0',fontWeight:800}}>Day leaderboard · {effectivePlayable.length} scorecard{effectivePlayable.length===1?'':'s'} joined</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:7,flexShrink:0}}>
              <button onClick={refreshDayLeaderboardNow} disabled={dayRefreshing} style={{...S.gho,padding:'6px 9px',fontSize:12,opacity:dayRefreshing?0.62:1}}>{dayRefreshing?'Syncing':'Refresh'}</button>
              <button onClick={()=>setDayScorecardRound(null)} style={{...S.gho,padding:'6px 11px',fontSize:12}}>Close</button>
            </div>
          </div>
          <div style={{...S.card,padding:12,marginBottom:8,borderColor:'rgba(96,184,240,0.42)',background:'linear-gradient(180deg,rgba(14,60,105,0.42),rgba(13,37,72,0.86))',boxShadow:'0 14px 30px rgba(0,112,187,0.16)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:6}}>
              <div>
                <div style={{fontSize:15,color:'#fff',fontWeight:950}}>Full day table</div>
                <div style={{fontSize:11,color:'#90ccf0'}}>{allDone?'All linked scorecards are in. Admin can press Day Finished.':'Live until admin presses Day Finished.'}</div>
              </div>
              <div style={{fontSize:10,color:isLiveRound(board)?'#86efac':'#8ea0ad',fontWeight:950,letterSpacing:'0.08em'}}>{isLiveRound(effectiveBoard)?'OPEN':'FINISHED'}</div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'24px minmax(0,1fr) 36px 36px 42px 36px',gap:5,padding:'5px 0',borderBottom:'1px solid rgba(96,184,240,0.22)',fontSize:9,color:'#90ccf0',fontWeight:950,letterSpacing:'0.05em'}}>
              <div>#</div><div>Player</div><div style={{textAlign:'right'}}>F9</div><div style={{textAlign:'right'}}>B9</div><div style={{textAlign:'right'}}>Total</div><div style={{textAlign:'right'}}>Holes</div>
            </div>
            {boardRows.length?boardRows.map((r,idx)=>(
              <div key={r.id} style={{display:'grid',gridTemplateColumns:'24px minmax(0,1fr) 36px 36px 42px 36px',gap:5,alignItems:'center',padding:'6px 0',borderBottom:idx===boardRows.length-1?'none':'1px solid rgba(255,255,255,0.07)',background:idx===0?'linear-gradient(90deg,rgba(245,191,36,0.13),rgba(96,184,240,0.04))':'transparent',borderRadius:idx===0?8:0}}>
                <div style={{fontSize:12,color:idx===0?'#fbbf24':'rgba(255,255,255,0.58)',fontWeight:950}}>{idx+1}</div>
                <div style={{fontSize:12,color:'#fff',fontWeight:850,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{nameFromContextMap(dayNameMap,r.id,r.name||'Player')}</div>
                <div style={{fontSize:12,color:'#dbeafe',textAlign:'right',fontWeight:900}}>{sumRowHoles(r,1,9)}</div>
                <div style={{fontSize:12,color:'#dbeafe',textAlign:'right',fontWeight:900}}>{sumRowHoles(r,10,18)}</div>
                <div style={{fontSize:15,color:'#60b8f0',textAlign:'right',fontWeight:950}}>{r.total}</div>
                <div style={{fontSize:11,color:'rgba(255,255,255,0.62)',textAlign:'right',fontWeight:800}}>{r.holes}</div>
              </div>
            )):<div style={{padding:14,textAlign:'center',fontSize:12,color:'rgba(255,255,255,0.58)'}}>No scores entered yet.</div>}
          </div>
          <div style={{...S.card,padding:12,marginBottom:8,borderColor:'rgba(245,158,11,0.28)',background:'linear-gradient(180deg,rgba(75,50,12,0.38),rgba(8,24,48,0.94))',boxShadow:'0 12px 26px rgba(245,158,11,0.08)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8,marginBottom:7}}>
              <div style={{fontSize:15,color:'#fff',fontWeight:950}}>Sweepstake</div>
              <div style={{fontSize:11,color:'#90ccf0',fontWeight:900,textAlign:'right'}}>{compactSettlement.playerCount} entered · {moneyFromPence(parseInt(cfg&&cfg.amountPence)||200)} each pot</div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr',gap:6}}>
              {potRows.map(pot=>(
                <div key={pot.key} style={{display:'grid',gridTemplateColumns:'72px minmax(0,1fr) auto',gap:8,alignItems:'center',padding:'9px 10px',borderRadius:12,background:pot.winner?'rgba(245,158,11,0.10)':'rgba(255,255,255,0.055)',border:'1px solid '+(pot.winner?'rgba(245,158,11,0.22)':'rgba(255,255,255,0.08)')}}>
                  <div style={{fontSize:12,color:pot.winner?'#fbbf24':'#90ccf0',fontWeight:950}}>{pot.label}</div>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:12,color:pot.rollover?'#fbbf24':'#fff',fontWeight:950,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{daySweepstakeWinnerText(pot,dayClosed)}</div>
                    {daySweepstakeReasonText(pot,dayClosed)&&<div style={{fontSize:10,color:'rgba(255,255,255,0.68)',fontWeight:800,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{daySweepstakeReasonText(pot,dayClosed)}</div>}
                  </div>
                  <div style={{fontSize:16,color:pot.winnerUpPence>0?'#86efac':'rgba(255,255,255,0.45)',fontWeight:950,textAlign:'right'}}>{pot.winnerUpPence>0?`+${moneyFromPence(pot.winnerUpPence).replace('£','£')}`:'-'}</div>
                </div>
              ))}
            </div>
            <div style={{marginTop:9,padding:'8px 9px',borderRadius:12,background:'rgba(96,184,240,0.08)',border:'1px solid rgba(96,184,240,0.16)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:6}}>
                <div style={{fontSize:12,color:'#fff',fontWeight:950}}>Sweepstake balance</div>
                <div style={{fontSize:10,color:'rgba(255,255,255,0.58)',fontWeight:800,textAlign:'right'}}>{dayClosed?'Final League balance effect':'Projected until Day Finished'}</div>
              </div>
              {displaySettlementRows.filter(r=>r.displayNet!==0).length?displaySettlementRows.filter(r=>r.displayNet!==0).slice().sort((a,b)=>b.displayNet-a.displayNet||String(a.name).localeCompare(String(b.name))).map(r=>(
                <div key={r.id} style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',padding:'8px 0',borderTop:'1px solid rgba(255,255,255,0.08)'}}>
                  <div style={{fontSize:12,color:'#dbeafe',fontWeight:850,lineHeight:1.35,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</div>
                  <div style={{fontSize:15,color:r.displayNet>0?'#86efac':r.displayNet<0?'#f87171':'#e5e7eb',fontWeight:950,whiteSpace:'nowrap'}}>{r.displayNet>0?'+':''}{moneyFromPence(r.displayNet)}</div>
                </div>
              )):<div style={{padding:'8px 0',borderTop:'1px solid rgba(255,255,255,0.08)',fontSize:12,color:'rgba(255,255,255,0.62)'}}>No sweepstake balance changes yet.</div>}
              {currentSnakeRows.length>0&&<div style={{marginTop:7,paddingTop:7,borderTop:'1px solid rgba(245,191,36,0.20)'}}>
                <div style={{fontSize:10,color:'#fbbf24',fontWeight:950,letterSpacing:'0.05em',marginBottom:4}}>CURRENT SNAKE</div>
                {currentSnakeRows.map(r=>(
                  <div key={'snake-'+r.id} style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',padding:'4px 0'}}>
                    <div style={{fontSize:12,color:'#fbbf24',fontWeight:850,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</div>
                    <div style={{fontSize:13,color:'#fbbf24',fontWeight:950,whiteSpace:'nowrap'}}>-{moneyFromPence(r.snakePenalty)}</div>
                  </div>
                ))}
              </div>}
              <div style={{fontSize:9,color:'rgba(255,255,255,0.54)',lineHeight:1.3,marginTop:6}}>Sweepstake balances stay zero-sum. Snake is shown separately and is only added if admin confirms it.</div>
            </div>
          </div>
          <div style={{fontSize:11,color:'#90ccf0',fontWeight:900,letterSpacing:'0.10em',margin:'9px 0 6px'}}>SCORECARDS</div>
          {playable.map((r,idx)=>(
            <button key={r.id} onClick={()=>openRound(r)} style={{...S.card,padding:11,width:'100%',textAlign:'left',marginBottom:8,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,borderColor:'rgba(96,184,240,0.24)',background:idx%2===0?'linear-gradient(135deg,rgba(96,184,240,0.14),rgba(255,255,255,0.055))':'linear-gradient(135deg,rgba(245,158,11,0.10),rgba(255,255,255,0.05))'}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:13,color:'#fff',fontWeight:900,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{roundDisplayName(r)}</div>
                <div style={{fontSize:10,color:'#90ccf0',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{dayRoundSummary(r)||formatRoundStart(r)}</div>
              </div>
              <div style={{width:26,height:26,borderRadius:999,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,color:'#fff',fontWeight:950,background:'rgba(96,184,240,0.24)',border:'1px solid rgba(96,184,240,0.34)'}}>&gt;</div>
            </button>
          ))}
          {!playable.length&&<div style={{...S.card,fontSize:13,color:'#8ea0ad',textAlign:'center'}}>No scorecards have joined this board yet.</div>}
        </div>
        </div>
      </div>
    );
  }
  function foursomesMatchplaySummaryForLiveRound(rd){
    const rdGroups=groupsForRound(rd);
    const allRows=[...(scores||[]),...(publicScores||[]),...localScoreRowsForRound(rd.id)];
    const foursomes=buildFoursomesMatchplaySummary(rd,rdGroups,allRows,courses||[]);
    if(foursomes)return foursomes;
    try{
      const g=(rdGroups&&rdGroups[0])||{id:'group',group_number:1,participants:[]};
      const publicParts=(publicRoundPlayers[rd.id]||[]).map(rp=>mapRoundPlayerForScorecard(rp,isSnyderCupRound(rd)));
      const savedCfg=matchplayConfigFromRows(allRows,rd,g);
      const cfg=(savedCfg&&savedCfg.enabled)?savedCfg:inferSinglesMatchplayConfig(rd,{...g,participants:[...((g&&g.participants)||[]),...publicParts]},allRows,true);
      if(!cfg||!cfg.enabled||cfg.mode==='foursomes')return null;
      const mode=normaliseMatchplayMode(cfg.mode);
      const teamA=(cfg.teamA||[]).map(normaliseId).filter(Boolean);
      const teamB=(cfg.teamB||[]).map(normaliseId).filter(Boolean);
      if(!teamA.length||!teamB.length)return null;
      const parts=[...((g&&g.participants)||[]),...((rd&&rd._allParticipants)||[]),...publicParts];
      const nameFor=id=>{const p=parts.find(x=>scoreAliasesForPerson(x).some(alias=>normaliseId(alias)===normaliseId(id)));return gameFirstName((p&&(p.display_name||p.name))||getDisplayName(id)||'Player');};
      const teamName=ids=>ids.map(nameFor).filter(Boolean).join(' & ');
      const course=(courses||[]).find(co=>co.id===(rd&&rd.course_id))||findCourseForTee(courses||[],rd&&rd.course_name,rd&&rd.tee)||{};
      const holeList=(course&&Array.isArray(course.holes)&&course.holes.length)?course.holes:Array.from({length:18},(_,i)=>({hole:i+1,par:4,stroke_index:i+1}));
      const rowMap={};
      (allRows||[]).filter(r=>r&&r.round_id===rd.id&&!isMetaScoreRow(r)).forEach(r=>{const h=parseInt(r.hole_number);if(!rowMap[h])rowMap[h]={};aliasesForSavedScoreId(r.player_id,parts).forEach(pid=>{rowMap[h][normaliseId(pid)]=r;});});
      let lead=0,played=0,lastHole=0;const holeRows=[];
      holeList.filter(h=>parseInt(h.hole)>=1&&parseInt(h.hole)<=18).forEach(hd=>{
        const h=parseInt(hd.hole);
        if(mode==='singles'){
          const aPid=teamA[0];
          const bPid=teamB[0];
          const aRow=rowMap[h]&&rowMap[h][aPid];
          const bRow=rowMap[h]&&rowMap[h][bPid];
          if(!aRow||!bRow||!hasEnteredGross(aRow.gross_score)||!hasEnteredGross(bRow.gross_score))return;
          const markedAWon=isFoursomesWonMarker(aRow.gross_score)||isFoursomesConcededMarker(bRow.gross_score);
          const markedBWon=isFoursomesWonMarker(bRow.gross_score)||isFoursomesConcededMarker(aRow.gross_score);
          const aShot=shotsOnHole(cfg.teamAShots||0,hd.stroke_index);
          const bShot=shotsOnHole(cfg.teamBShots||0,hd.stroke_index);
          const aNet=isFoursomesOutcomeMarker(aRow.gross_score)?null:(parseInt(aRow.gross_score)||0)-aShot;
          const bNet=isFoursomesOutcomeMarker(bRow.gross_score)?null:(parseInt(bRow.gross_score)||0)-bShot;
          let winner='halve';
          if(markedAWon&&!markedBWon){lead+=1;winner='A';}
          else if(markedBWon&&!markedAWon){lead-=1;winner='B';}
          else if(aNet!==null&&bNet!==null&&aNet<bNet){lead+=1;winner='A';}
          else if(aNet!==null&&bNet!==null&&bNet<aNet){lead-=1;winner='B';}
          played+=1;lastHole=h;holeRows.push({hole:h,aNet,bNet,winner,lead});
          return;
        }
        const scored=[...teamA,...teamB].every(pid=>rowMap[h]&&rowMap[h][pid]&&hasEnteredGross(rowMap[h][pid].gross_score));
        if(!scored)return;
        const pts=pid=>stablefordPointsValue(rowMap[h][pid].stableford_points||0);
        const aBest=Math.max(...teamA.map(pts));
        const bBest=Math.max(...teamB.map(pts));
        let winner='halve';
        if(aBest>bBest){lead+=1;winner='A';}
        else if(bBest>aBest){lead-=1;winner='B';}
        played+=1;lastHole=h;holeRows.push({hole:h,aBest,bBest,winner,lead});
      });
      const remaining=Math.max(0,18-played);const abs=Math.abs(lead);const isFinished=played&&lead!==0&&abs>remaining;const isDormie=played&&lead!==0&&remaining>0&&abs===remaining;
      const aName=teamName(teamA)||'Player 1';const bName=teamName(teamB)||'Player 2';const winningTeam=lead>0?'A':lead<0?'B':null;const winningName=winningTeam==='A'?aName:winningTeam==='B'?bName:'';const finalScore=isFinished?(abs+'&'+remaining):'';
      let label='A/S',sub=played?'Thru '+lastHole:'Not started yet';
      if(played&&lead!==0){if(isFinished){label=winningName+' win '+finalScore;sub='Match finished';}else{label=winningName+' '+abs+'UP';sub='Thru '+lastHole;}}
      return {mode,aName,bName,label,sub,lead,played,lastHole,remaining,abs,isFinished,isDormie,winningTeam,winningName,finalScore,holeRows,teamA,teamB,teamAShots:parseInt(cfg.teamAShots)||0,teamBShots:parseInt(cfg.teamBShots)||0,keepStableford:cfg.keepStableford!==false};
    }catch(e){return null;}
  }
  function dayRoundSummary(rd){
    const rps=publicRoundPlayers[rd&&rd.id]||[];
    if(rps.length)return rps.map(rp=>rp.display_name).filter(Boolean).join(', ');
    const grps=groupsForRound(rd);
    const ids=grps.flatMap(g=>g.player_ids||[]);
    if(ids.length)return ids.map(id=>{
      const p=(cupUsers||[]).find(u=>normaliseId(u.id)===normaliseId(id))||(players||[]).find(x=>normaliseId(x.id)===normaliseId(id));
      return p&&(p.display_name||p.name||p.username);
    }).filter(Boolean).join(', ');
    return rd&&rd.course_name||'Scorecard';
  }
  function CompletedCard({rd}){
    const isSweepstakeBoard=isDayCompBoardRound(rd);
    const title=isSweepstakeBoard?dayCompDisplayName(rounds,rd):roundDisplayName(rd);
    const open=()=>isSweepstakeBoard?setDayScorecardRound(rd):openRound(rd);
    return(
      <div style={{...S.card,...NO_SELECT,marginBottom:8,cursor:'pointer',opacity:0.9,borderColor:isSweepstakeBoard?'rgba(251,191,36,0.28)':undefined}} onClick={open}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
          <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
            <CourseBadge course={courses.find(co=>co.id===rd.course_id)} round={rd} size={34}/>
            <div style={{minWidth:0}}>
              <div style={{fontSize:14,color:'#fff',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{title}</div>
              <div style={{fontSize:11,color:isSweepstakeBoard?'#fbbf24':'#60b8f0'}}>{isSweepstakeBoard?'Final sweepstake results':'Round started: '+formatRoundStart(rd)}</div>
            </div>
          </div>
          <div style={{fontSize:11,color:isSweepstakeBoard?'#fff':'#1b5e20',background:isSweepstakeBoard?'rgba(251,191,36,0.36)':'rgba(27,94,32,0.15)',border:isSweepstakeBoard?'1px solid rgba(251,191,36,0.55)':'none',borderRadius:6,padding:'3px 8px',fontWeight:800,flexShrink:0,textShadow:isSweepstakeBoard?'0 1px 2px rgba(0,0,0,0.45)':'none'}}>{isSweepstakeBoard?'Results':'Completed'}</div>
        </div>
      </div>
    );
  }
  return(
    <div style={{minHeight:'100vh',paddingBottom:40}}>
      <div style={{padding:'12px 16px',display:'flex',alignItems:'center',gap:12,borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
        <button onClick={()=>setView('home')} style={{...S.gho,padding:'6px 12px',fontSize:13}}>Back</button>
        <div style={{fontSize:16,color:'#fff'}}>Live Scoring</div>
      </div>
      <div style={{padding:10}}>
        {liveRounds.length===0
          ?<div style={{...S.card,textAlign:'center',padding:40}}>
            <div style={{fontSize:16,color:'#fff',marginBottom:8}}>No live rounds</div>
            <button onClick={()=>setView('play')} style={S.pri}>Play Golf</button>
          </div>
          :liveRounds.map(rd=>{
            const rdGroups=groupsForRound(rd);
            const mp=foursomesMatchplaySummaryForLiveRound(rd);
            const board=mp?[]:leaderboardForRound(rd);
            const isDayBoard=!!dayCompKeyFromRound(rd);
            return(
              <div key={rd.id} style={{...S.card,...NO_SELECT,marginBottom:16,cursor:'pointer',borderColor:isDayBoard?'rgba(245,158,11,0.36)':'rgba(239,68,68,0.3)',background:isDayBoard?'linear-gradient(135deg,rgba(245,158,11,0.13),rgba(0,112,187,0.12),rgba(255,255,255,0.055))':S.card.background,boxShadow:isDayBoard?'0 14px 30px rgba(0,112,187,0.12)':'none'}} onClick={()=>isDayBoard?setDayScorecardRound(rd):openRound(rd)}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10,marginBottom:10}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
                    <CourseBadge course={courses.find(co=>co.id===rd.course_id)} round={rd} size={38}/>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:16,color:'#fff',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{isDayBoard?dayCompDisplayName(rounds,rd):roundDisplayName(rd)}</div>
                      <div style={{fontSize:11,color:isDayBoard?'#fbbf24':'#60b8f0',fontWeight:isDayBoard?850:400}}>{isDayBoard?'Day sweepstake board':'Round started: '+formatRoundStart(rd)}</div>
                      <div style={{display:'flex',alignItems:'center',gap:5,marginTop:4,minWidth:0}}>
                        <CourseBadge course={courses.find(co=>co.id===rd.course_id)} round={rd} size={20}/>
                        <div style={{fontSize:10,color:'rgba(255,255,255,0.58)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{rd.course_name||rd.name||'Course'}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{fontSize:10,color:'#fff',background:'#ef4444',borderRadius:20,padding:'4px 8px',fontWeight:700,letterSpacing:'0.08em',flexShrink:0}}>LIVE</div>
                </div>
                {mp? <>
                  {(()=>{
                    const leadTeam=mp.lead>0?'A':mp.lead<0?'B':'tie';
                    const resultText=mp.lead===0?'A/S':(mp.isFinished?mp.finalScore||mp.label.replace(mp.aName,'').replace(mp.bName,'').replace('win','').trim():(Math.abs(mp.lead)+' UP'));
                    const aScore=leadTeam==='A'?resultText:'';
                    const bScore=leadTeam==='B'?resultText:'';
                    const centerScore=leadTeam==='tie'?resultText:'';
                    const aShots=parseInt(mp.teamAShots)||0;
                    const bShots=parseInt(mp.teamBShots)||0;
                    const shotsText=(aShots||bShots)?(aShots&&bShots?((mp.aName+' get '+aShots+' shot'+(aShots===1?'':'s'))+' · '+(mp.bName+' get '+bShots+' shot'+(bShots===1?'':'s'))):(aShots?(mp.aName+' get '+aShots+' shot'+(aShots===1?'':'s')):(mp.bName+' get '+bShots+' shot'+(bShots===1?'':'s')))):'No shots given';
                    const stableRows=mp.mode==='singles'&&mp.keepStableford!==false?leaderboardForRound(rd):[];
                    const stableFor=id=>{const row=stableRows.find(r=>normaliseId(r.id)===normaliseId(id));return row?row.total:0;};
                    const aStable=mp.mode==='singles'?stableFor((mp.teamA||[])[0]):0;
                    const bStable=mp.mode==='singles'?stableFor((mp.teamB||[])[0]):0;
                    const bg=leadTeam==='A'?'linear-gradient(90deg,rgba(251,191,36,0.20),rgba(0,112,187,0.16))':leadTeam==='B'?'linear-gradient(90deg,rgba(251,191,36,0.12),rgba(0,112,187,0.28))':'linear-gradient(90deg,rgba(251,191,36,0.12),rgba(0,112,187,0.18))';
                    return <>
                      <div style={{marginBottom:10,padding:'10px 12px',borderRadius:13,border:'1px solid '+(leadTeam==='A'?'rgba(251,191,36,0.42)':leadTeam==='B'?'rgba(96,184,240,0.46)':'rgba(255,255,255,0.13)'),background:bg,display:'grid',gridTemplateColumns:'58px minmax(0,1fr) 58px',gap:8,alignItems:'center',boxShadow:'inset 0 0 0 1px rgba(255,255,255,0.04)'}}>
                        <div style={{minWidth:0,textAlign:'left',fontSize:20,color:leadTeam==='A'?'#fbbf24':'rgba(255,255,255,0.18)',fontWeight:950,lineHeight:1}}>{aScore}</div>
                        <div style={{textAlign:'center',minWidth:0}}>
                          <div style={{fontSize:10,color:'#90ccf0',fontWeight:950,letterSpacing:'0.11em'}}>MATCHPLAY</div>
                          <div style={{fontSize:12,color:'#fff',fontWeight:950,whiteSpace:'normal',overflowWrap:'anywhere',lineHeight:1.12}}><span style={{color:'#fbbf24'}}>{mp.aName}</span> <span style={{color:'rgba(255,255,255,0.48)',fontWeight:900}}>v</span> <span style={{color:'#60b8f0'}}>{mp.bName}</span></div>
                          <div style={{fontSize:10,color:'#90ccf0',fontWeight:850,marginTop:2}}>{leadTeam==='tie'?centerScore+' · '+mp.sub:mp.sub}</div>
                          <div style={{fontSize:9,color:'rgba(255,255,255,0.58)',fontWeight:800,marginTop:3,whiteSpace:'normal',overflowWrap:'anywhere'}}>{shotsText}</div>
                          {mp.mode==='singles'&&mp.keepStableford!==false&&<div style={{marginTop:6,display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                            <div style={{border:'1px solid rgba(251,191,36,0.24)',background:'rgba(251,191,36,0.10)',borderRadius:9,padding:'5px 6px'}}><div style={{fontSize:9,color:'#fbbf24',fontWeight:950,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{mp.aName}</div><div style={{fontSize:16,color:'#fff',fontWeight:950,lineHeight:1}}>{aStable} <span style={{fontSize:9,color:'#90ccf0'}}>pts</span></div></div>
                            <div style={{border:'1px solid rgba(96,184,240,0.24)',background:'rgba(96,184,240,0.10)',borderRadius:9,padding:'5px 6px'}}><div style={{fontSize:9,color:'#60b8f0',fontWeight:950,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{mp.bName}</div><div style={{fontSize:16,color:'#fff',fontWeight:950,lineHeight:1}}>{bStable} <span style={{fontSize:9,color:'#90ccf0'}}>pts</span></div></div>
                          </div>}
                        </div>
                        <div style={{minWidth:0,textAlign:'right',fontSize:20,color:leadTeam==='B'?'#60b8f0':'rgba(255,255,255,0.18)',fontWeight:950,lineHeight:1}}>{bScore}</div>
                      </div>
                    </>;
                  })()}
                </> : <>
                  <div style={{fontSize:10,color:'#60b8f0',letterSpacing:'0.14em',fontWeight:600,marginBottom:8}}>LIVE LEADERBOARD</div>
                  <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:10}}>
                    {(board.length?board:[{id:'empty',name:'Waiting for scores',total:0,holes:0}]).slice(0,4).map((p,rank)=>(
                      <div key={p.id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',background:rank===0&&board.length?'rgba(184,134,11,0.15)':'rgba(255,255,255,0.05)',borderRadius:9}}>
                        <div style={{width:22,textAlign:'center',fontSize:15,fontWeight:700,color:rank===0&&board.length?'#fbbf24':'rgba(255,255,255,0.45)'}}>{board.length?rank+1:'-'}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,color:'#fff',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</div>
                          <div style={{fontSize:10,color:'rgba(255,255,255,0.45)'}}>{p.holes} hole{p.holes===1?'':'s'} scored</div>
                        </div>
                        <div style={{fontSize:20,color:'#fff',fontWeight:700}}>{p.total}</div>
                        <div style={{fontSize:9,color:'#60b8f0',letterSpacing:'0.08em'}}>PTS</div>
                      </div>
                    ))}
                  </div>
                </>}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderTop:'1px solid rgba(255,255,255,0.08)',paddingTop:10}}>
                  <div style={{fontSize:11,color:'rgba(255,255,255,0.5)'}}>{mp?((mp.mode==='foursomes'?'Foursomes matchplay':mp.mode==='singles'?'Singles matchplay':'Matchplay')+' - Tap to view'):(dayCompKeyFromRound(rd)?(playableDayCompRounds(rounds,rd).length+' scorecards on sweepstake board - Tap to view'):(rdGroups.length+' group'+(rdGroups.length!==1?'s':'')+' live - Tap to view'))}</div>
                  <button onClick={e=>{e.stopPropagation();dayCompKeyFromRound(rd)?setDayScorecardRound(rd):openRound(rd);}} style={{...S.pri,padding:'7px 10px',fontSize:11}}>{dayCompKeyFromRound(rd)?'Day Table':'Check Scorecard'}</button>
                </div>
              </div>
            );
          })
        }
{dayScorecardRound&&<DayLeaderboardModal rd={dayScorecardRound}/>}
        {/* Completed rounds */}
        {completedRounds.length>0&&(
          <div style={{marginTop:20}}>
            <div style={{fontSize:18,color:'#fff',fontWeight:700,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.03em',marginBottom:10}}>Completed Scores</div>
            {completedDayBoards.length>0&&(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,color:'#fbbf24',letterSpacing:'0.15em',fontWeight:700,marginBottom:10}}>SWEEPSTAKES</div>
                {completedDayBoards.map(rd=><CompletedCard key={rd.id} rd={rd}/>)}
              </div>
            )}
            {thisWeeksCards.length>0&&(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,color:'#60b8f0',letterSpacing:'0.15em',fontWeight:600,marginBottom:10}}>THIS WEEK'S CARDS</div>
                {thisWeeksCards.map(rd=><CompletedCard key={rd.id} rd={rd}/>)}
              </div>
            )}
            {olderCards.length>0&&(
              <div>
                <div style={{fontSize:11,color:'#60b8f0',letterSpacing:'0.15em',fontWeight:600,marginBottom:10}}>OLDER CARDS</div>
                {Object.entries(olderCardsByMonth).map(([month,cards])=>(
                  <div key={month} style={{marginBottom:14}}>
                    <div style={{fontSize:12,color:'rgba(255,255,255,0.55)',fontWeight:600,marginBottom:8}}>{month}</div>
                    {cards.map(rd=><CompletedCard key={rd.id} rd={rd}/>)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =========================================================
// Profile view
// User handicap, personal rounds and sign-out controls
// =========================================================
function ProfileView({currentUser,rounds,groups,sb,flash,setView,load,setCurrentUser}){
  const[editing,setEditing]=useState(false);
  const[hcp,setHcp]=useState(currentUser&&currentUser.handicap||0);
  const[egUsername,setEgUsername]=useState(currentUser&&currentUser.england_golf_member_no||'');
  const[egPassword,setEgPassword]=useState('');
  const[egShowPassword,setEgShowPassword]=useState(false);
  const[egConnecting,setEgConnecting]=useState(false);
  const[egConnectStatus,setEgConnectStatus]=useState('');
  const[egEditingLogin,setEgEditingLogin]=useState(!(currentUser&&currentUser.england_golf_member_no));
  const myRounds=rounds.filter(r=>groups.some(g=>g.round_id===r.id&&(g.player_ids||[]).includes(currentUser&&currentUser.id)));
  const englandGolfPending=!!(currentUser&&/saved new login details/i.test(String(currentUser.england_golf_sync_error||'')));
  const englandGolfProblem=!!(currentUser&&currentUser.england_golf_sync_error&&!englandGolfPending);
  const englandGolfStatusError=/incorrect|rejected|error|failed|not accept|could not verify/i.test(String(egConnectStatus||''));

  useEffect(()=>{
    let cancelled=false;
    async function refreshProfileUser(){
      if(!currentUser||!currentUser.id)return;
      try{
        const {data,error}=await sb.from('cup_users').select('*').eq('id',currentUser.id).single();
        if(error||!data||cancelled)return;
        const updated={...currentUser,...data};
        setCurrentUser(updated);
        setHcp(data.handicap||0);
        setEgUsername(data.england_golf_member_no||'');
        setEgEditingLogin(!data.england_golf_member_no);
        try{localStorage.setItem('snyder_user',JSON.stringify(updated));}catch(e){}
      }catch(e){}
    }
    refreshProfileUser();
    return()=>{cancelled=true;};
  },[currentUser&&currentUser.id]);

  async function saveHcp(){
    await sb.from('cup_users').update({handicap:parseFloat(hcp)||0}).eq('id',currentUser.id);
    const updated={...currentUser,handicap:parseFloat(hcp)||0};
    setCurrentUser(updated);
    localStorage.setItem('snyder_user',JSON.stringify(updated));
    flash('Handicap updated');setEditing(false);
  }

  async function connectEnglandGolf(){
    if(!currentUser||!currentUser.id)return;
    if(!egUsername.trim()||!egPassword.trim()){flash('Enter your England Golf login details','error');return;}
    setEgConnecting(true);
    setEgConnectStatus('Checking your England Golf login...');
    try{
      const payload={
        userId:currentUser.id,
        playerPin:currentUser.pin,
        username:egUsername.trim(),
        password:egPassword
      };
      const invokePromise=sb.functions.invoke('england-golf-connect',{body:payload});
      const timeoutPromise=new Promise((_,reject)=>setTimeout(()=>reject(new Error('Connection timed out while checking England Golf. Please try again.')),45000));
      const {data,error}=await Promise.race([invokePromise,timeoutPromise]);
      if(error){
        let functionMessage='';
        try{
          if(error.context&&typeof error.context.json==='function'){
            const body=await error.context.json();
            functionMessage=body&&body.error||'';
          }
        }catch(_e){}
        throw new Error(functionMessage||error.message||error.name||String(error));
      }
      if(data&&data.error)throw new Error(data.error);
      const nextHandicap=Number.isFinite(parseFloat(data&&data.handicap))?parseFloat(data.handicap):parseFloat(currentUser.handicap)||0;
      const updated={
        ...currentUser,
        handicap:nextHandicap,
        england_golf_member_no:egUsername.trim(),
        england_golf_last_sync_at:(data&&data.synced_at)||new Date().toISOString(),
        england_golf_sync_error:data&&data.needs_sync_confirmation?'Saved new login details. Waiting for next sync to confirm at 2am.':null
      };
      setCurrentUser(updated);
      try{localStorage.setItem('snyder_user',JSON.stringify(updated));}catch(e){}
      setHcp(nextHandicap);
      setEgPassword('');
      setEgShowPassword(false);
      setEgConnectStatus(data&&data.needs_sync_confirmation?'':'Username and password verified. Daily sync will update your handicap.');
      setEgEditingLogin(false);
      flash(data&&data.needs_sync_confirmation?'England Golf login saved':'England Golf connected');
      load&&load();
    }catch(e){
      const msg=e.message||String(e);
      setEgConnectStatus(msg);
      flash(msg,'error');
    }finally{
      setEgConnecting(false);
    }
  }

  return(
    <div style={{minHeight:'100vh',paddingBottom:40}}>
      <div style={{padding:'12px 16px',display:'flex',alignItems:'center',gap:12,borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
        <button onClick={()=>setView('home')} style={{...S.gho,padding:'6px 12px',fontSize:13}}>Back</button>
        <div style={{fontSize:16,color:'#fff'}}>Profile</div>
      </div>
      <div style={{padding:16}}>
        <div style={{...S.card,marginBottom:16,textAlign:'center'}}>
          <Avatar user={currentUser} size={60}/>
          <div style={{fontSize:20,color:'#fff',marginTop:12}}>{currentUser&&currentUser.display_name}</div>
          <div style={{fontSize:13,color:'#60b8f0',marginTop:4}}>@{currentUser&&currentUser.username}</div>
          <div style={{fontSize:13,color:'#fff',marginTop:8}}>HCP {currentUser&&currentUser.handicap}</div>
          {editing
            ?<div style={{marginTop:12}}>
              <HandicapPicker value={hcp} onChange={setHcp} style={{marginBottom:8}} label="Your EG Handicap" step={0.1} min={0} max={54} defaultValue={parseFloat(currentUser&&currentUser.handicap)||18}/>
              <button onClick={saveHcp} style={{...S.pri,marginRight:8}}>Save</button>
              <button onClick={()=>setEditing(false)} style={S.gho}>Cancel</button>
            </div>
            :<button onClick={()=>setEditing(true)} style={{...S.gho,marginTop:12,fontSize:13}}>Edit Handicap</button>
          }
        </div>
        <div style={{...S.card,marginBottom:16}}>
          <div style={{fontSize:16,color:'#fff',fontWeight:900,marginBottom:6}}>England Golf</div>
          <div style={{fontSize:12,color:'#90ccf0',lineHeight:1.45,marginBottom:12}}>Connect once and the server can refresh your handicap index daily. Your password is checked with England Golf, encrypted on the secure backend, and never saved in this app.</div>
          {currentUser&&currentUser.england_golf_member_no&&!egEditingLogin&&<div style={{padding:'10px 12px',borderRadius:10,background:'rgba(34,197,94,0.12)',border:'1px solid rgba(34,197,94,0.28)',marginBottom:10}}>
            <div style={{fontSize:13,color:'#86efac',fontWeight:900}}>Connected</div>
            <div style={{fontSize:11,color:'#bbf7d0',marginTop:3}}>Member no: {currentUser.england_golf_member_no} - daily sync runs automatically.</div>
          </div>}
          {egEditingLogin&&<>
            <label style={S.lbl}>England Golf username / member number</label>
            <input value={egUsername} onChange={e=>setEgUsername(e.target.value)} inputMode="numeric" autoComplete="username" style={{...S.inp,marginBottom:10}} placeholder="e.g. 1009120266"/>
            <label style={S.lbl}>England Golf password</label>
            <div style={{position:'relative',marginBottom:10}}>
              <input value={egPassword} onChange={e=>setEgPassword(e.target.value)} type={egShowPassword?'text':'password'} autoComplete="current-password" style={{...S.inp,paddingRight:78}} placeholder={currentUser&&currentUser.england_golf_member_no?'Enter password to update saved login':'Password'}/>
              <button type="button" onClick={()=>setEgShowPassword(v=>!v)} aria-label={egShowPassword?'Hide England Golf password':'Show England Golf password'} style={{position:'absolute',right:6,top:6,bottom:6,minWidth:58,border:'1px solid rgba(255,255,255,0.14)',borderRadius:8,background:'rgba(255,255,255,0.08)',color:'#90ccf0',fontSize:11,fontWeight:900}}>
                {egShowPassword?'Hide':'Show'}
              </button>
            </div>
            <button onClick={connectEnglandGolf} disabled={egConnecting} style={{...S.pri,width:'100%',padding:13,opacity:egConnecting?0.65:1}}>{egConnecting?'Connecting...':(currentUser&&currentUser.england_golf_member_no?'Update England Golf Login':'Connect England Golf')}</button>
          </>}
          {currentUser&&currentUser.england_golf_member_no&&!egEditingLogin&&<button onClick={()=>setEgEditingLogin(true)} style={{...S.gho,width:'100%',padding:11,fontSize:13}}>Update England Golf Login</button>}
          {egConnectStatus&&<div style={{fontSize:12,color:englandGolfStatusError?'#fca5a5':'#86efac',marginTop:10,lineHeight:1.45}}>{egConnectStatus}</div>}
          <div style={{fontSize:11,color:englandGolfPending?'#86efac':englandGolfProblem?'#fca5a5':'rgba(255,255,255,0.55)',marginTop:10,lineHeight:1.45}}>
            {englandGolfPending?'Saved new login details. Waiting for next sync to confirm at 2am.':currentUser&&currentUser.england_golf_last_sync_at?'Last sync: '+new Date(currentUser.england_golf_last_sync_at).toLocaleString('en-GB'):'Not connected yet'}
            {englandGolfProblem?' - '+currentUser.england_golf_sync_error:''}
          </div>
        </div>
        <div style={{fontSize:12,color:'#60b8f0',marginBottom:8}}>MY ROUNDS ({myRounds.length})</div>
        {myRounds.slice(0,5).map(r=>(
          <div key={r.id} style={{...S.card,marginBottom:8}}>
            <div style={{fontSize:14,color:'#fff'}}>{r.name||r.course_name}</div>
            <div style={{fontSize:11,color:'#60b8f0'}}>Round start: {formatRoundStart(r)}</div>
          </div>
        ))}
        <button onClick={()=>{localStorage.removeItem('snyder_user');setCurrentUser(null);setView('home');}} style={{...S.dan,width:'100%',marginTop:16,fontSize:13}}>Sign Out</button>
      </div>
    </div>
  );
}

function FriendsView({currentUser,cupUsers,sb,flash,setView,load}){
  const[friends,setFriends]=useState([]);
  const[loading,setLoading]=useState(false);
  const[searchOpen,setSearchOpen]=useState(false);
  const[search,setSearch]=useState('');
  const[adding,setAdding]=useState('');

  async function loadFriends(){
    if(!currentUser||!currentUser.id){setFriends([]);return;}
    setLoading(true);
    try{
      const [{data:links,error},{data:users}]=await Promise.all([
        sb.from('cup_friendships').select('friend_id').eq('user_id',currentUser.id),
        sb.from('cup_users').select('*').order('display_name',{ascending:true})
      ]);
      if(error)throw error;
      const ids=(links||[]).map(x=>normaliseId(x.friend_id));
      const allUsers=users||cupUsers||[];
      setFriends(allUsers
        .filter(u=>ids.includes(normaliseId(u.id)))
        .sort((a,b)=>String(a.display_name||a.username||'').localeCompare(String(b.display_name||b.username||'')))
      );
    }catch(e){
      setFriends([]);
      flash&&flash('Could not load friends','error');
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{loadFriends();},[currentUser&&currentUser.id]);

  const friendIds=new Set((friends||[]).map(f=>normaliseId(f.id)));
  const q=search.trim().toLowerCase();
  const results=q.length>1?(cupUsers||[]).filter(u=>{
    if(!u)return false;
    if(normaliseId(u.id)===normaliseId(currentUser&&currentUser.id))return false;
    if(friendIds.has(normaliseId(u.id)))return false;
    return String(u.display_name||'').toLowerCase().includes(q)||String(u.username||'').toLowerCase().includes(q);
  }).slice(0,8):[];

  async function addFriend(user){
    if(!currentUser||!currentUser.id||!user||!user.id)return;
    setAdding(user.id);
    try{
      const pairs=[
        {user_id:currentUser.id,friend_id:user.id},
        {user_id:user.id,friend_id:currentUser.id}
      ];
      for(const pair of pairs){
        const {data:existing}=await sb.from('cup_friendships').select('id').eq('user_id',pair.user_id).eq('friend_id',pair.friend_id).limit(1);
        if(!existing||existing.length===0)await sb.from('cup_friendships').insert(pair);
      }
      setSearch('');
      await loadFriends();
      load&&load();
      flash&&flash((user.display_name||user.username||'Player')+' added');
    }catch(e){
      flash&&flash('Could not add friend','error');
    }finally{
      setAdding('');
    }
  }

  const rowStyle={display:'grid',gridTemplateColumns:'1fr auto',alignItems:'center',gap:10,padding:'12px 13px',borderTop:'1px solid rgba(255,255,255,0.08)'};

  return(
    <div style={{minHeight:'100vh',paddingBottom:76,background:'linear-gradient(180deg,#0d2548 0%,#0a1f3d 100%)'}}>
      <div style={{background:'#0d2548',padding:'13px 16px',display:'flex',alignItems:'center',gap:12,borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
        <button onClick={()=>setView('home')} style={{...S.gho,padding:'6px 12px',fontSize:13}}>Back</button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:18,color:'#fff',fontWeight:950}}>Friends</div>
          <div style={{fontSize:11,color:'#90ccf0',fontWeight:800}}>Names, handicaps and England Golf links</div>
        </div>
        <button onClick={()=>setSearchOpen(v=>!v)} aria-label="Search friends" title="Search friends" style={{width:36,height:36,borderRadius:999,border:'1px solid rgba(96,184,240,0.30)',background:searchOpen?'rgba(0,112,187,0.30)':'rgba(255,255,255,0.06)',color:'#90ccf0',fontSize:17,fontWeight:950,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>&#x1F50D;</button>
      </div>
      <div style={{padding:16}}>
        {searchOpen&&(
          <div style={{...S.card,marginBottom:12,padding:12}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or username..." autoCapitalize="none" autoFocus style={{...S.inp,fontSize:16,marginBottom:10}}/>
            {q.length<=1&&<div style={{fontSize:12,color:'rgba(255,255,255,0.55)',textAlign:'center',padding:8}}>Type at least 2 letters</div>}
            {results.map(u=>(
              <div key={u.id} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,alignItems:'center',padding:'9px 0',borderTop:'1px solid rgba(255,255,255,0.08)'}}>
                <div style={{minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,fontSize:14,color:'#fff',fontWeight:900,overflow:'hidden'}}>
                    <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.display_name||u.username||'Player'}</span>
                    <EnglandGolfMarker user={u} size="14px"/>
                  </div>
                  <div style={{fontSize:11,color:'#90ccf0'}}>@{u.username||'user'} - {formatHeaderHandicap(u.handicap)}</div>
                </div>
                <button onClick={()=>addFriend(u)} disabled={adding===u.id} style={{...S.pri,padding:'7px 11px',fontSize:12,opacity:adding===u.id?0.6:1}}>{adding===u.id?'Adding':'Add'}</button>
              </div>
            ))}
            {q.length>1&&!results.length&&<div style={{fontSize:12,color:'rgba(255,255,255,0.55)',textAlign:'center',padding:10}}>No matching players found</div>}
          </div>
        )}
        <div style={{border:'1px solid rgba(96,184,240,0.22)',borderRadius:16,background:'rgba(255,255,255,0.055)',overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,padding:'10px 13px',background:'rgba(0,112,187,0.14)',fontSize:11,color:'#90ccf0',fontWeight:950,letterSpacing:'0.08em',textTransform:'uppercase'}}>
            <div>Friend</div>
            <div>Handicap</div>
          </div>
          {loading
            ?<div style={{padding:18,textAlign:'center',fontSize:13,color:'#90ccf0'}}>Loading friends...</div>
            :friends.length?friends.map(f=>(
              <div key={f.id} style={rowStyle}>
                <div style={{minWidth:0,display:'flex',alignItems:'center',gap:9}}>
                  <Avatar user={f} size={34}/>
                  <div style={{minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,fontSize:14,color:'#fff',fontWeight:950,minWidth:0}}>
                      <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.display_name||f.username||'Player'}</span>
                      <EnglandGolfMarker user={f} size="14px"/>
                    </div>
                    <div style={{fontSize:11,color:'rgba(255,255,255,0.48)'}}>@{f.username||'user'}</div>
                  </div>
                </div>
                <div style={{fontSize:18,color:'#F5D76E',fontWeight:950,textAlign:'right'}}>{formatHeaderHandicap(f.handicap)}</div>
              </div>
            ))
            :<div style={{padding:18,textAlign:'center',fontSize:13,color:'rgba(255,255,255,0.62)'}}>No friends yet. Tap the search icon to add someone.</div>
          }
        </div>
      </div>
    </div>
  );
}


const GROUP_COLOURS=['#60a5fa','#34d399','#f59e0b','#a78bfa','#f472b6','#22d3ee'];
function groupLetter(i){return String.fromCharCode(65+(parseInt(i,10)||1)-1);}
function groupNameFromNumber(n){return 'Group '+groupLetter(n||1);}
function groupColour(n){return GROUP_COLOURS[((parseInt(n,10)||1)-1)%GROUP_COLOURS.length];}
function groupCountForRange(range){
  if(range==='5-8')return 2;
  if(range==='9-12')return 3;
  if(range==='13-16'||range==='more')return 4;
  return 1;
}
function normaliseId(v){return v==null?'':String(v);}

const LEAGUE_PLAYER_LINKS_STORAGE_KEY='snyder_league_player_links_v1';
function leagueLinkLiveId(person){
  return normaliseId(person&&(person.user_id||person.guest_id||person.id||person.round_player_id));
}
function leagueLinkLiveName(person){
  return String((person&&(person.display_name||person.name||person.username))||'Player').trim();
}
function readLocalLeaguePlayerLinks(){
  try{
    const raw=JSON.parse(localStorage.getItem(LEAGUE_PLAYER_LINKS_STORAGE_KEY)||'{}');
    return raw&&typeof raw==='object'?raw:{};
  }catch(e){return {};}
}
function writeLocalLeaguePlayerLink(link){
  const liveId=normaliseId(link&&link.live_user_id);
  if(!liveId)return;
  const all=readLocalLeaguePlayerLinks();
  all[liveId]={...link,live_user_id:liveId,updated_at:new Date().toISOString()};
  try{localStorage.setItem(LEAGUE_PLAYER_LINKS_STORAGE_KEY,JSON.stringify(all));}catch(e){}
}
function normaliseLeaguePlayerLinks(rows){
  const out={...readLocalLeaguePlayerLinks()};
  (rows||[]).forEach(r=>{
    const liveId=normaliseId(r&&r.live_user_id);
    if(liveId)out[liveId]={
      live_user_id:liveId,
      live_name:r.live_name||'',
      league_player_id:r.league_player_id,
      league_player_name:r.league_player_name||'',
      updated_at:r.updated_at||''
    };
  });
  return out;
}
async function fetchLeaguePlayerLinks(sb){
  try{
    const {data,error}=await sb.from('league_player_links').select('*').order('live_name',{ascending:true});
    if(error)throw error;
    return {links:normaliseLeaguePlayerLinks(data||[]),cloudAvailable:true,error:null};
  }catch(e){
    return {links:readLocalLeaguePlayerLinks(),cloudAvailable:false,error:e};
  }
}
async function saveLeaguePlayerLink(sb,link){
  const clean={
    live_user_id:normaliseId(link&&link.live_user_id),
    live_name:String(link&&link.live_name||'').trim(),
    league_player_id:link&&link.league_player_id,
    league_player_name:String(link&&link.league_player_name||'').trim(),
    updated_at:new Date().toISOString()
  };
  if(!clean.live_user_id||!clean.league_player_id)throw new Error('Missing live player or League player');
  try{
    const {error}=await sb.from('league_player_links').upsert(clean,{onConflict:'live_user_id'});
    if(error)throw error;
    writeLocalLeaguePlayerLink(clean);
    return {cloudAvailable:true};
  }catch(e){
    writeLocalLeaguePlayerLink(clean);
    return {cloudAvailable:false,error:e};
  }
}

const SNAKE_SCORE_PREFIX='__snake__|';
const SNAKE_STABLEFORD_OFFSET=1000;
const SNAKE_SWEEPSTAKE_PENALTY_PENCE=1000;
function stablefordPointsValue(v){
  const n=parseInt(v)||0;
  return n>=SNAKE_STABLEFORD_OFFSET?n-SNAKE_STABLEFORD_OFFSET:n;
}
function stablefordPointsWithSnake(pts,hasSnake){
  const base=stablefordPointsValue(pts);
  return hasSnake?base+SNAKE_STABLEFORD_OFFSET:base;
}
function rowHasSnakeFlag(row){return (parseInt(row&&row.stableford_points)||0)>=SNAKE_STABLEFORD_OFFSET;}
function makeSnakeScorePlayerId(groupKey,pid){return SNAKE_SCORE_PREFIX+encodeURIComponent(normaliseId(groupKey))+'|'+encodeURIComponent(normaliseId(pid));}
function parseSnakeScorePlayerId(v){
  const txt=String(v||'');
  if(!txt.startsWith(SNAKE_SCORE_PREFIX))return null;
  const parts=txt.split('|');
  if(parts.length<3)return null;
  try{return {groupKey:decodeURIComponent(parts[1]||''),pid:decodeURIComponent(parts.slice(2).join('|')||'')};}
  catch(e){return null;}
}
function isSnakeScoreRow(row){return !!parseSnakeScorePlayerId(row&&row.player_id);}

const FINE_SCORE_PREFIX='__fine__|';
const FINE_HOLE_BASE=900;
const CUP_FINE_DEFS=[
  {key:'blob',label:'Blob',emoji:EMOJI.blob,amount:2,type:'toggle'},
  {key:'threePutt',label:'3 putt',emoji:EMOJI.threePutt,amount:2,type:'toggle'},
  {key:'fourPutt',label:'4 putt',emoji:EMOJI.fourPutt,amount:5,type:'toggle'},
  {key:'water',label:'Water',emoji:EMOJI.water,amount:3,type:'toggle'},
  {key:'bunker',label:'Bunker',emoji:EMOJI.bunker,amount:2,type:'counter'},
  {key:'dnf',label:'DNF',emoji:EMOJI.dnf,amount:5,type:'toggle'}
];
function makeFineScorePlayerId(pid,key){return FINE_SCORE_PREFIX+encodeURIComponent(normaliseId(pid))+'|'+encodeURIComponent(normaliseId(key));}
function parseFineScorePlayerId(v){
  const txt=String(v||'');
  if(!txt.startsWith(FINE_SCORE_PREFIX))return null;
  const parts=txt.split('|');
  if(parts.length<3)return null;
  try{return {pid:decodeURIComponent(parts[1]||''),key:decodeURIComponent(parts.slice(2).join('|')||'')};}
  catch(e){return null;}
}
function fineDef(key){return CUP_FINE_DEFS.find(f=>f.key===key)||null;}
function fineIndexForKey(key){return Math.max(0,CUP_FINE_DEFS.findIndex(f=>f.key===key));}
function makeFineScoreHoleNumber(h,key){return FINE_HOLE_BASE+(fineIndexForKey(key)*100)+(parseInt(h)||0);}
function parseFineScoreHoleNumber(v){
  const n=parseInt(v)||0;
  if(n<=FINE_HOLE_BASE)return null;
  const raw=n-FINE_HOLE_BASE;
  const idx=Math.floor(raw/100);
  const hole=raw-(idx*100);
  const def=CUP_FINE_DEFS[idx];
  if(!def||hole<1||hole>18)return null;
  return {key:def.key,hole};
}
function parseFineScoreRow(row){
  if(!row)return null;
  const legacy=parseFineScorePlayerId(row.player_id);
  if(legacy)return {pid:legacy.pid,key:legacy.key,hole:parseInt(row.hole_number)||0,legacy:true};
  const parsedHole=parseFineScoreHoleNumber(row.hole_number);
  if(!parsedHole)return null;
  return {pid:normaliseId(row.player_id),key:parsedHole.key,hole:parsedHole.hole,legacy:false};
}
function isFineScoreRow(row){return !!parseFineScoreRow(row);}
const SWEEPSTAKE_SCORE_PREFIX='__sweepstake__|';
const SWEEPSTAKE_CONFIG_HOLE=950001;
const SWEEPSTAKE_ENTRY_HOLE=950002;
function makeSweepstakeScorePlayerId(key){return SWEEPSTAKE_SCORE_PREFIX+encodeURIComponent(key||'config');}
function sweepstakeEntryKeyForPlayer(playerId){return 'entry_'+encodeURIComponent(normaliseId(playerId));}
function parseSweepstakeEntryRow(row){
  if(parseInt(row&&row.hole_number)===SWEEPSTAKE_ENTRY_HOLE&&!String(row&&row.player_id||'').startsWith(SWEEPSTAKE_SCORE_PREFIX)){
    const playerId=normaliseId(row&&row.player_id);
    return playerId?{playerId,included:(parseInt(row&&row.gross_score)||0)>0}:null;
  }
  const parsed=parseSweepstakeScoreRow(row);
  if(!parsed||!String(parsed.key||'').startsWith('entry_'))return null;
  try{return {playerId:normaliseId(decodeURIComponent(String(parsed.key).slice(6))),included:(parseInt(row&&row.gross_score)||0)>0};}
  catch(e){return null;}
}
function sweepstakeEntryStateFromRows(rows,round){
  const entries=(rows||[]).filter(r=>r&&(!round||r.round_id===round.id)&&parseInt(r.hole_number)===SWEEPSTAKE_ENTRY_HOLE).map(parseSweepstakeEntryRow).filter(Boolean);
  if(!entries.length)return null;
  const state=new Map();
  entries.forEach(e=>{if(e&&e.playerId)state.set(normaliseId(e.playerId),!!e.included);});
  return state.size?state:null;
}
function sweepstakeEntryIdsFromState(state){
  if(!state||!state.size)return null;
  const ids=new Set();
  state.forEach((included,id)=>{if(included&&id)ids.add(normaliseId(id));});
  return ids;
}
function sweepstakeEntryIdsFromRows(rows,round){
  return sweepstakeEntryIdsFromState(sweepstakeEntryStateFromRows(rows,round));
}
function mergeSweepstakeEntryStateMaps(){
  const merged=new Map();
  Array.from(arguments||[]).forEach(state=>{
    if(!state||!state.size)return;
    state.forEach((included,id)=>{
      const key=normaliseId(id);
      if(!key)return;
      if(!merged.has(key))merged.set(key,!!included);
      else if(!included)merged.set(key,false); // an explicit opt-out always wins over an opt-in
    });
  });
  return merged.size?merged:null;
}
function sweepstakeEntryStatesEqual(a,b){
  if(!a&&!b)return true;
  if(!a||!b||a.size!==b.size)return false;
  let same=true;
  a.forEach((included,id)=>{if(b.get(normaliseId(id))!==!!included)same=false;});
  return same;
}
function mergedDaySweepstakeEntryStateFromRows(rows,board,linkedRounds,{includeLocal=false}={}){
  const states=[];
  if(board){
    const cloudBoard=sweepstakeEntryStateFromRows(rows||[],board);
    if(cloudBoard)states.push(cloudBoard);
    if(includeLocal){const localBoard=loadLocalSweepstakeEntryState(board.id);if(localBoard)states.push(localBoard);}
  }
  (linkedRounds||[]).filter(r=>r&&r.id&&!isDayCompBoardRound(r)).forEach(r=>{
    const cloud=sweepstakeEntryStateFromRows(rows||[],r);
    if(cloud)states.push(cloud);
    if(includeLocal){const local=loadLocalSweepstakeEntryState(r.id);if(local)states.push(local);}
  });
  return mergeSweepstakeEntryStateMaps.apply(null,states);
}

function linkedDaySweepstakeEntryStateFromRows(rows,linkedRounds,{includeLocal=false}={}){
  const states=[];
  (linkedRounds||[]).filter(r=>r&&r.id&&!isDayCompBoardRound(r)).forEach(r=>{
    const cloud=sweepstakeEntryStateFromRows(rows||[],r);
    if(cloud)states.push(cloud);
    if(includeLocal){const local=loadLocalSweepstakeEntryState(r.id);if(local)states.push(local);}
  });
  return mergeSweepstakeEntryStateMaps.apply(null,states);
}

function canonicalSweepstakeEntryStateFromRoundPlayers(state,roundPlayers){
  if(!state||!state.size)return state||null;
  const aliasToCanonical={};
  function addAlias(alias,canonical){
    const a=normaliseId(alias);const c=normaliseId(canonical);
    if(a&&c)aliasToCanonical[a]=c;
  }
  (roundPlayers||[]).forEach(rp=>{
    const person=mapRoundPlayerForScorecard(rp,false);
    const canonical=normaliseId(person.id||person.user_id||person.guest_id||person.round_player_id||rp.user_id||rp.guest_id||rp.id);
    [person.id,person.user_id,person.guest_id,person.round_player_id,rp.id,rp.user_id,rp.guest_id,canonical].filter(Boolean).forEach(id=>addAlias(id,canonical));
  });
  const out=new Map();
  state.forEach((included,id)=>{
    const raw=normaliseId(id);
    const canonical=aliasToCanonical[raw]||raw;
    if(!canonical)return;
    if(!out.has(canonical))out.set(canonical,!!included);
    else if(!included)out.set(canonical,false);
  });
  return out.size?out:null;
}
function sweepstakeEntryStorageKey(roundId){return 'sweepstake_entries_'+roundId;}
function loadLocalSweepstakeEntryState(roundId){
  try{
    const raw=roundId?localStorage.getItem(sweepstakeEntryStorageKey(roundId)):null;
    if(!raw)return null;
    const data=JSON.parse(raw);
    if(!data||!Array.isArray(data.included))return null;
    const included=new Set(data.included.map(normaliseId).filter(Boolean));
    const all=Array.isArray(data.all)&&data.all.length?data.all:data.included;
    const state=new Map();
    all.map(normaliseId).filter(Boolean).forEach(id=>state.set(id,included.has(id)));
    return state.size?state:null;
  }catch(e){return null;}
}
function loadLocalSweepstakeEntryIds(roundId){
  return sweepstakeEntryIdsFromState(loadLocalSweepstakeEntryState(roundId));
}
function saveLocalSweepstakeEntryIds(roundId,includedIds,allIds){
  try{
    if(!roundId)return;
    localStorage.setItem(sweepstakeEntryStorageKey(roundId),JSON.stringify({included:(includedIds||[]).map(normaliseId).filter(Boolean),all:(allIds||[]).map(normaliseId).filter(Boolean),savedAt:new Date().toISOString()}));
  }catch(e){}
}
async function saveSweepstakeEntryIdsToCloud(roundId,playerIds,allPlayerIds){
  if(!roundId||!Array.isArray(playerIds))return {ok:true,count:0};
  const included=new Set(playerIds.map(normaliseId).filter(Boolean));
  const all=Array.from(new Set(((Array.isArray(allPlayerIds)&&allPlayerIds.length)?allPlayerIds:playerIds).map(normaliseId).filter(Boolean)));
  saveLocalSweepstakeEntryIds(roundId,Array.from(included),all);
  if(!all.length)return {ok:true,count:0};
  return saveScoreRowsToCloud(sb,all.map(id=>{
    const isIn=included.has(id);
    return {
      round_id:roundId,
      player_id:id,
      hole_number:SWEEPSTAKE_ENTRY_HOLE,
      gross_score:isIn?1:0,
      stableford_points:isIn?1:0,
      par:4,
      stroke_index:1
    };
  }));
}
async function mergeSweepstakeEntryIdsToCloud(roundId,newIncludedIds,newAllPlayerIds){
  if(!roundId)return {ok:true,count:0};
  const newAll=Array.from(new Set((newAllPlayerIds||[]).map(normaliseId).filter(Boolean)));
  const newIncluded=new Set((newIncludedIds||[]).map(normaliseId).filter(Boolean));
  let existingState=null;
  try{
    const {data}=await sb.from('cup_scores').select('*').eq('round_id',roundId).eq('hole_number',SWEEPSTAKE_ENTRY_HOLE);
    existingState=sweepstakeEntryStateFromRows(data||[],{id:roundId});
  }catch(e){}
  if(!existingState)existingState=loadLocalSweepstakeEntryState(roundId);
  const merged=new Map(existingState||[]);
  newAll.forEach(id=>{
    const isIncluded=newIncluded.has(id);
    if(!merged.has(id))merged.set(id,isIncluded);
    else if(!isIncluded)merged.set(id,false);
    // Explicit opt-out wins. This stops a later joined scorecard or stale device
    // from re-adding someone who opted out of the day sweepstake.
  });
  const all=Array.from(merged.keys());
  const included=all.filter(id=>merged.get(id));
  return saveSweepstakeEntryIdsToCloud(roundId,included,all);
}
function parseSweepstakeScoreRow(row){
  const txt=String(row&&row.player_id||'');
  if(!txt.startsWith(SWEEPSTAKE_SCORE_PREFIX))return null;
  try{return {key:decodeURIComponent(txt.slice(SWEEPSTAKE_SCORE_PREFIX.length)||'config'),amountPence:parseInt(row.gross_score)||0,enabled:(parseInt(row.stableford_points)||0)>0,scope:parseInt(row.par)===5?'round':'group'};}
  catch(e){return {key:'config',amountPence:parseInt(row&&row.gross_score)||0,enabled:(parseInt(row&&row.stableford_points)||0)>0,scope:parseInt(row&&row.par)===5?'round':'group'};}
}
function isSweepstakeScoreRow(row){
  const hole=parseInt(row&&row.hole_number)||0;
  return hole===SWEEPSTAKE_CONFIG_HOLE||hole===SWEEPSTAKE_ENTRY_HOLE||!!parseSweepstakeScoreRow(row);
}
function sweepstakeConfigFromRows(rows,round){
  const row=(rows||[]).filter(r=>r&&(!round||r.round_id===round.id)).map(parseSweepstakeScoreRow).filter(Boolean).find(x=>x.key==='config');
  const local=round&&round.id?loadLocalSweepstakeConfig(round.id):null;
  const fallback=round&&round._sweepstake;
  const amountPence=row?row.amountPence:(local&&local.amountPence)||(fallback&&fallback.amountPence)||0;
  const enabled=row?row.enabled:local?!!local.enabled:!!(fallback&&fallback.enabled);
  const scope=row?row.scope:(local&&local.scope)||(fallback&&fallback.scope)||'round';
  return {enabled:!!enabled&&amountPence>0,amountPence:amountPence>0?amountPence:200,scope:scope==='group'?'group':'round'};
}
function sweepstakeStorageKey(roundId){return 'sweepstake_config_'+roundId;}
function loadLocalSweepstakeConfig(roundId){
  try{const raw=localStorage.getItem(sweepstakeStorageKey(roundId));return raw?JSON.parse(raw):null;}catch(e){return null;}
}
function saveLocalSweepstakeConfig(roundId,cfg){
  try{if(roundId&&cfg)localStorage.setItem(sweepstakeStorageKey(roundId),JSON.stringify({enabled:!!cfg.enabled,amountPence:parseInt(cfg.amountPence)||200,scope:cfg.scope==='group'?'group':'round'}));}catch(e){}
}
async function saveSweepstakeConfigToCloud(roundId,cfg){
  if(!roundId||!cfg||!cfg.enabled)return {ok:true,count:0};
  const clean={enabled:!!cfg.enabled,amountPence:parseInt(cfg.amountPence)||200,scope:cfg.scope==='group'?'group':'round'};
  saveLocalSweepstakeConfig(roundId,clean);
  return saveScoreRowsToCloud(sb,[{
    round_id:roundId,
    player_id:makeSweepstakeScorePlayerId('config'),
    hole_number:SWEEPSTAKE_CONFIG_HOLE,
    gross_score:clean.amountPence,
    stableford_points:clean.enabled?1:0,
    par:clean.scope==='group'?4:5,
    stroke_index:1
  }]);
}

const MATCHPLAY_SCORE_PREFIX='__matchplay__|';
const MATCHPLAY_META_PREFIX='__matchplay_meta__|';
const MATCHPLAY_FOURSOMES_A='__foursomes_team_a';
const MATCHPLAY_FOURSOMES_B='__foursomes_team_b';
const MATCHPLAY_FOURSOMES_A_ALIASES=[MATCHPLAY_FOURSOMES_A,'foursomes_team_1','foursomes_team_a','__foursomes_team_1'];
const MATCHPLAY_FOURSOMES_B_ALIASES=[MATCHPLAY_FOURSOMES_B,'foursomes_team_2','foursomes_team_b','__foursomes_team_2'];
const FOURSOMES_WON_MARKER=-9001;
const FOURSOMES_CONCEDED_MARKER=-9002;
const MATCHPLAY_CONFIG_HOLE=960001;
function parseMaybeJsonObject(v){
  if(!v)return null;
  if(typeof v==='object')return v;
  if(typeof v==='string'){try{const parsed=JSON.parse(v);return parsed&&typeof parsed==='object'?parsed:null;}catch(e){}}
  return null;
}
function canonicalFoursomesPlayerId(pid){
  const key=normaliseId(pid);
  if(MATCHPLAY_FOURSOMES_A_ALIASES.map(normaliseId).includes(key))return MATCHPLAY_FOURSOMES_A;
  if(MATCHPLAY_FOURSOMES_B_ALIASES.map(normaliseId).includes(key))return MATCHPLAY_FOURSOMES_B;
  return pid;
}
function isFoursomesTeamPlayerId(pid){
  const key=normaliseId(pid);
  return MATCHPLAY_FOURSOMES_A_ALIASES.map(normaliseId).includes(key)||MATCHPLAY_FOURSOMES_B_ALIASES.map(normaliseId).includes(key);
}
function isFoursomesWonMarker(v){return parseInt(v)===FOURSOMES_WON_MARKER;}
function isFoursomesConcededMarker(v){return parseInt(v)===FOURSOMES_CONCEDED_MARKER;}
function isFoursomesOutcomeMarker(v){return isFoursomesWonMarker(v)||isFoursomesConcededMarker(v);}
function normaliseFoursomesScoreRows(rows){
  return (rows||[]).map(r=>r&&isFoursomesTeamPlayerId(r.player_id)?{...r,player_id:canonicalFoursomesPlayerId(r.player_id)}:r);
}
function makeMatchplayMetaPlayerId(groupKey,key){return MATCHPLAY_META_PREFIX+encodeURIComponent(normaliseId(groupKey||'group'))+'|'+encodeURIComponent(key||'config');}
function parseMatchplayMetaRow(row){
  const txt=String(row&&row.player_id||'');
  if(!txt.startsWith(MATCHPLAY_META_PREFIX))return null;
  const parts=txt.split('|');
  if(parts.length<3)return null;
  try{return {groupKey:decodeURIComponent(parts[1]||'group'),key:decodeURIComponent(parts.slice(2).join('|')||'config'),gross:parseInt(row&&row.gross_score)||0,stableford:parseInt(row&&row.stableford_points)||0};}
  catch(e){return null;}
}
function isMatchplayMetaScoreRow(row){return !!parseMatchplayMetaRow(row);}
function makeMatchplayScorePlayerId(groupKey,team,pid){return MATCHPLAY_SCORE_PREFIX+encodeURIComponent(normaliseId(groupKey||'group'))+'|'+encodeURIComponent(team||'A')+'|'+encodeURIComponent(normaliseId(pid));}
function parseMatchplayScoreRow(row){
  const txt=String(row&&row.player_id||'');
  if(!txt.startsWith(MATCHPLAY_SCORE_PREFIX))return null;
  const parts=txt.split('|');
  if(parts.length<4)return null;
  try{return {groupKey:decodeURIComponent(parts[1]||'group'),team:decodeURIComponent(parts[2]||'A'),pid:decodeURIComponent(parts.slice(3).join('|')||''),enabled:(parseInt(row&&row.stableford_points)||0)>0||(parseInt(row&&row.gross_score)||0)>0};}
  catch(e){return null;}
}
function isMatchplayScoreRow(row){return !!parseMatchplayScoreRow(row);}
function matchplayStorageKey(roundId,groupKey){return 'matchplay_config_'+roundId+'_'+normaliseId(groupKey||'group');}
function loadLocalMatchplayConfig(roundId,groupKey){
  try{const raw=localStorage.getItem(matchplayStorageKey(roundId,groupKey));return raw?JSON.parse(raw):null;}catch(e){return null;}
}
function normaliseMatchplayMode(mode){
  if(mode==='foursomes')return 'foursomes';
  if(mode==='singles')return 'singles';
  return 'doubles';
}
function matchplayModeCode(mode){
  mode=normaliseMatchplayMode(mode);
  return mode==='foursomes'?2:(mode==='singles'?3:1);
}
function matchplayModeFromCode(code){
  code=parseInt(code)||0;
  return code===2?'foursomes':(code===3?'singles':'doubles');
}
function saveLocalMatchplayConfig(roundId,groupKey,cfg){
  try{if(roundId&&cfg)localStorage.setItem(matchplayStorageKey(roundId,groupKey),JSON.stringify({enabled:!!cfg.enabled,mode:normaliseMatchplayMode(cfg.mode),teamA:(cfg.teamA||[]).map(String),teamB:(cfg.teamB||[]).map(String),teamAName:cfg.teamAName||'Team 1',teamBName:cfg.teamBName||'Team 2',teamAShots:Math.max(0,parseInt(cfg.teamAShots)||0),teamBShots:Math.max(0,parseInt(cfg.teamBShots)||0),keepStableford:cfg.keepStableford!==false}));}catch(e){}
}
function matchplayMetaFromRows(rows,round,groupKey){
  const all=(rows||[]).filter(r=>r&&(!round||r.round_id===round.id)).map(parseMatchplayMetaRow).filter(Boolean);
  let meta=all.filter(x=>normaliseId(x.groupKey)===normaliseId(groupKey||'group'));
  if(!meta.length){
    const generic=all.filter(x=>normaliseId(x.groupKey)==='group');
    if(generic.length)meta=generic;
  }
  if(!meta.length){const keys=Array.from(new Set(all.map(x=>normaliseId(x.groupKey)).filter(Boolean)));if(keys.length===1)meta=all;}
  // Spectator scorecards can be opened through the round_players fallback group, while
  // the matchplay setup was saved against the real cup_groups id and a generic "group"
  // fallback. If the current group key does not match either, still use the saved
  // matchplay meta rather than falling back to a normal Stableford spectator board.
  if(!meta.length&&all.length)meta=all;
  const get=k=>meta.find(x=>x.key===k);
  if(!meta.length)return null;
  const nameA=meta.find(x=>String(x.key||'').startsWith('teamAName:'));
  const nameB=meta.find(x=>String(x.key||'').startsWith('teamBName:'));
  return {mode:matchplayModeFromCode(get('mode')&&get('mode').gross),teamAName:nameA?decodeURIComponent(String(nameA.key).slice(10)):'',teamBName:nameB?decodeURIComponent(String(nameB.key).slice(10)):'',teamAShots:get('teamAShots')?get('teamAShots').gross:0,teamBShots:get('teamBShots')?get('teamBShots').gross:0,keepStableford:get('keepStableford')?get('keepStableford').gross!==0:true};
}
function hasFoursomesScoreRows(rows,round){
  return (rows||[]).some(r=>r&&(!round||r.round_id===round.id)&&isFoursomesTeamPlayerId(r.player_id));
}
function foursomesFallbackGroup(round,cfg){
  const clean=cfg&&cfg.enabled?cfg:{enabled:true,mode:'foursomes',teamAName:'Team 1',teamBName:'Team 2',teamAShots:0,teamBShots:0};
  const parts=[
    {id:MATCHPLAY_FOURSOMES_A,name:clean.teamAName||'Team 1',display_name:clean.teamAName||'Team 1',current_handicap:0,handicap:0,playing_handicap:0,is_foursomes_team:true},
    {id:MATCHPLAY_FOURSOMES_B,name:clean.teamBName||'Team 2',display_name:clean.teamBName||'Team 2',current_handicap:0,handicap:0,playing_handicap:0,is_foursomes_team:true}
  ];
  return {id:'foursomes',round_id:round&&round.id,group_number:1,player_ids:parts.map(p=>p.id),participants:parts,playing_handicaps:{[MATCHPLAY_FOURSOMES_A]:0,[MATCHPLAY_FOURSOMES_B]:0},_foursomesFallback:true};
}
function groupFromRoundPlayers(round,roundPlayers,isCupRound){
  const participants=(roundPlayers||[]).map(rp=>mapRoundPlayerForScorecard(rp,!!isCupRound));
  const playing_handicaps={};
  (roundPlayers||[]).forEach(rp=>addRoundPlayerHandicaps(playing_handicaps,rp,!!isCupRound));
  return participants.length?{
    id:'round_players',
    round_id:round&&round.id,
    group_number:1,
    player_ids:participants.map(p=>p.id),
    participants,
    playing_handicaps,
    _roundPlayersFallback:true
  }:null;
}

function inferSinglesMatchplayConfig(round,group,rows,force=false){
  if(!group||round&&round._cupScoring)return null;
  if(!force&&!(round&&round._spectator))return null;
  const people=[
    ...((group&&group.participants)||[]),
    ...((group&&group.player_ids)||[]).map(id=>({id,name:'Player'}))
  ].filter(p=>p&&p.id&&!isFoursomesTeamPlayerId(p.id));
  const byKey={};
  people.forEach(p=>{
    const key=normaliseId(p.id);
    if(key&&!byKey[key])byKey[key]=p;
  });
  const list=Object.values(byKey);
  if(list.length!==2)return null;
  const scoreRows=(rows||[]).filter(r=>r&&(!round||r.round_id===round.id)&&!isMetaScoreRow(r));
  if(scoreRows.length){
    const known=list.flatMap(scoreAliasesForPerson).map(normaliseId);
    const unknown=scoreRows.some(r=>!known.includes(normaliseId(r.player_id)));
    if(unknown)return null;
  }
  const ph=(group&&group.playing_handicaps)||{};
  const hcpFor=p=>parseInt(ph[p.id]??ph[normaliseId(p.id)]??p.playing_handicap??p.current_handicap??p.handicap??0)||0;
  const aH=hcpFor(list[0]);
  const bH=hcpFor(list[1]);
  const diff=Math.abs(aH-bH);
  const nameFor=p=>gameFirstName((p&&p.display_name)||(p&&p.name)||'Player');
  return {enabled:true,mode:'singles',teamA:[String(list[0].id)],teamB:[String(list[1].id)],teamAName:nameFor(list[0]),teamBName:nameFor(list[1]),teamAShots:aH>bH?diff:0,teamBShots:bH>aH?diff:0,keepStableford:false,_inferred:true};
}

function foursomesConfigFromGroupMeta(group){
  const ph=(group&&group.playing_handicaps)||{};
  const foursomesEmbedded=parseMaybeJsonObject(group&&group.foursomesConfig)||parseMaybeJsonObject(group&&group.foursomes_config);
  const matchplayEmbedded=parseMaybeJsonObject(group&&group.matchplay);
  const embedded=foursomesEmbedded||matchplayEmbedded;
  const embeddedIsFoursomes=!!(foursomesEmbedded||(matchplayEmbedded&&(matchplayEmbedded.mode==='foursomes'||matchplayEmbedded.matchplayMode==='foursomes')));
  if(embedded&&embeddedIsFoursomes){
    return {
      enabled:true,
      mode:'foursomes',
      teamA:[],
      teamB:[],
      teamAName:String(embedded.teamAName||embedded.aName||embedded.team1Name||embedded.teamOneName||'Team 1'),
      teamBName:String(embedded.teamBName||embedded.bName||embedded.team2Name||embedded.teamTwoName||'Team 2'),
      teamAShots:Math.max(0,parseInt(embedded.teamAShots||embedded.aShots||embedded.team1Shots)||0),
      teamBShots:Math.max(0,parseInt(embedded.teamBShots||embedded.bShots||embedded.team2Shots)||0)
    };
  }
  if(group&&(group.matchplayMode==='foursomes'||group.mode==='foursomes')){
    return {enabled:true,mode:'foursomes',teamA:[],teamB:[],teamAName:'Team 1',teamBName:'Team 2',teamAShots:0,teamBShots:0};
  }
  if(!ph.__foursomes_enabled)return null;
  return {
    enabled:true,
    mode:'foursomes',
    teamA:[],
    teamB:[],
    teamAName:String(ph.__foursomes_teamAName||'Team 1'),
    teamBName:String(ph.__foursomes_teamBName||'Team 2'),
    teamAShots:Math.max(0,parseInt(ph.__foursomes_teamAShots)||0),
    teamBShots:Math.max(0,parseInt(ph.__foursomes_teamBShots)||0)
  };
}
function foursomesScoresFromGroupMeta(group){
  const ph=(group&&group.playing_handicaps)||{};
  const raw=ph.__foursomes_scores||{};
  return raw&&typeof raw==='object'?raw:{};
}
function foursomesScoreRowsFromGroupMeta(roundId,group){
  const raw=foursomesScoresFromGroupMeta(group);
  const rows=[];
  Object.keys(raw||{}).forEach(h=>{
    const hole=parseInt(h);
    if(!hole)return;
    const rec=raw[h]||{};
    if(hasEnteredGross(rec.a))rows.push({round_id:roundId,player_id:MATCHPLAY_FOURSOMES_A,hole_number:hole,gross_score:parseInt(rec.a),stableford_points:0,par:4,stroke_index:hole});
    if(hasEnteredGross(rec.b))rows.push({round_id:roundId,player_id:MATCHPLAY_FOURSOMES_B,hole_number:hole,gross_score:parseInt(rec.b),stableford_points:0,par:4,stroke_index:hole});
  });
  return rows;
}
function foursomesHoleScoresFromGroupMeta(group){
  const raw=foursomesScoresFromGroupMeta(group);
  const map={};
  Object.keys(raw||{}).forEach(h=>{
    const hole=parseInt(h);
    if(!hole)return;
    const rec=raw[h]||{};
    if(!map[hole])map[hole]={};
    if(hasEnteredGross(rec.a))map[hole][MATCHPLAY_FOURSOMES_A]=parseInt(rec.a);
    if(hasEnteredGross(rec.b))map[hole][MATCHPLAY_FOURSOMES_B]=parseInt(rec.b);
  });
  return map;
}
async function saveFoursomesConfigToGroupMeta(sb,group,cfg){
  if(!sb||!group||!group.id||!cfg||cfg.mode!=='foursomes')return {ok:false};
  const ph={...((group&&group.playing_handicaps)||{})};
  ph.__foursomes_enabled=1;
  ph.__foursomes_teamAName=cfg.teamAName||'Team 1';
  ph.__foursomes_teamBName=cfg.teamBName||'Team 2';
  ph.__foursomes_teamAShots=Math.max(0,parseInt(cfg.teamAShots)||0);
  ph.__foursomes_teamBShots=Math.max(0,parseInt(cfg.teamBShots)||0);
  ph.__foursomes_scores=ph.__foursomes_scores||{};
  const res=await sb.from('cup_groups').update({playing_handicaps:ph}).eq('id',group.id);
  if(!res.error)group.playing_handicaps=ph;
  return {ok:!res.error,error:res.error&&res.error.message};
}
async function saveFoursomesScoreToGroupMeta(sb,group,holeNum,pid,gross){
  if(!sb||!group||!group.id||![MATCHPLAY_FOURSOMES_A,MATCHPLAY_FOURSOMES_B].includes(pid))return {ok:false};
  let latest=group;
  try{const r=await sb.from('cup_groups').select('*').eq('id',group.id).single();if(r&&r.data)latest=r.data;}catch(e){}
  const ph={...((latest&&latest.playing_handicaps)||{})};
  ph.__foursomes_enabled=1;
  const cfg=foursomesConfigFromGroupMeta(group)||{};
  ph.__foursomes_teamAName=ph.__foursomes_teamAName||cfg.teamAName||'Team 1';
  ph.__foursomes_teamBName=ph.__foursomes_teamBName||cfg.teamBName||'Team 2';
  ph.__foursomes_teamAShots=ph.__foursomes_teamAShots!=null?ph.__foursomes_teamAShots:(cfg.teamAShots||0);
  ph.__foursomes_teamBShots=ph.__foursomes_teamBShots!=null?ph.__foursomes_teamBShots:(cfg.teamBShots||0);
  const scores={...(ph.__foursomes_scores||{})};
  const h=String(parseInt(holeNum));
  scores[h]={...(scores[h]||{})};
  if(gross===undefined||gross===null||gross===''){
    if(pid===MATCHPLAY_FOURSOMES_A)delete scores[h].a;
    if(pid===MATCHPLAY_FOURSOMES_B)delete scores[h].b;
  }else{
    if(pid===MATCHPLAY_FOURSOMES_A)scores[h].a=parseInt(gross);
    if(pid===MATCHPLAY_FOURSOMES_B)scores[h].b=parseInt(gross);
  }
  if(scores[h].a===undefined&&scores[h].b===undefined)delete scores[h];
  ph.__foursomes_scores=scores;
  const res=await sb.from('cup_groups').update({playing_handicaps:ph}).eq('id',group.id);
  if(!res.error)group.playing_handicaps=ph;
  return {ok:!res.error,error:res.error&&res.error.message};
}
function matchplayConfigFromRows(rows,round,group){
  const groupKey=normaliseId((group&&group.id)||(group&&group.group_number)||'group');
  const allParsed=(rows||[]).filter(r=>r&&(!round||r.round_id===round.id)).map(parseMatchplayScoreRow).filter(Boolean).filter(x=>x.enabled);
  let parsed=allParsed.filter(x=>normaliseId(x.groupKey)===groupKey);
  if(!parsed.length){
    const generic=allParsed.filter(x=>normaliseId(x.groupKey)==='group');
    if(generic.length)parsed=generic;
  }
  if(!parsed.length){
    const groupKeys=Array.from(new Set(allParsed.map(x=>normaliseId(x.groupKey)).filter(Boolean)));
    if(groupKeys.length===1)parsed=allParsed;
  }
  // Same protection as matchplayMetaFromRows: spectator views sometimes use a
  // round_players fallback group id, so the exact group id may not match the saved
  // matchplay rows. Use the available saved matchplay team rows instead of rendering
  // the standard leaderboard.
  if(!parsed.length&&allParsed.length)parsed=allParsed;
  const meta=matchplayMetaFromRows(rows,round,groupKey);
  const groupMeta=foursomesConfigFromGroupMeta(group);
  const hasFoursomesScores=hasFoursomesScoreRows(rows,round)||foursomesScoreRowsFromGroupMeta(round&&round.id,group).length>0;
  const cloudMode=normaliseMatchplayMode((meta&&meta.mode)||(groupMeta&&groupMeta.mode)||(hasFoursomesScores?'foursomes':'doubles'));
  const parsedA=parsed.filter(x=>x.team==='A').map(x=>x.pid);
  const parsedB=parsed.filter(x=>x.team==='B').map(x=>x.pid);
  const groupIds=[
    ...((group&&group.player_ids)||[]),
    ...((group&&group.participants)||[]).map(p=>p&&p.id)
  ].map(normaliseId).filter(Boolean);
  const uniqueGroupIds=Array.from(new Set(groupIds));
  const inferSingles=cloudMode==='singles'&&!parsedA.length&&!parsedB.length&&uniqueGroupIds.length===2;
  const cloud={enabled:parsed.length>0||!!(meta&&meta.mode)||!!groupMeta||hasFoursomesScores,mode:cloudMode,teamA:inferSingles?[uniqueGroupIds[0]]:parsedA,teamB:inferSingles?[uniqueGroupIds[1]]:parsedB,teamAName:(meta&&meta.teamAName)||(groupMeta&&groupMeta.teamAName)||'Team 1',teamBName:(meta&&meta.teamBName)||(groupMeta&&groupMeta.teamBName)||'Team 2',teamAShots:(meta&&meta.teamAShots)||(groupMeta&&groupMeta.teamAShots)||0,teamBShots:(meta&&meta.teamBShots)||(groupMeta&&groupMeta.teamBShots)||0,keepStableford:meta&&meta.keepStableford!==undefined?meta.keepStableford:true};
  const local=round&&round.id?loadLocalMatchplayConfig(round.id,groupKey):null;
  const fallback=round&&round._matchplay;
  const inferred=(!cloud.enabled&&!(local&&local.enabled)&&!(fallback&&fallback.enabled))?inferSinglesMatchplayConfig(round,group,rows,false):null;
  const cfg=cloud.enabled?{...cloud,...(local&&local.enabled?{teamAName:local.teamAName,teamBName:local.teamBName,keepStableford:local.keepStableford}: {})}:(local&&local.enabled?local:(fallback&&fallback.enabled?fallback:(inferred||{enabled:false,mode:'doubles',teamA:[],teamB:[],teamAName:'Team 1',teamBName:'Team 2',teamAShots:0,teamBShots:0,keepStableford:true})));
  const mode=normaliseMatchplayMode(cfg.mode);
  const teamA=Array.from(new Set((cfg.teamA||[]).map(String).filter(Boolean)));
  const teamB=Array.from(new Set((cfg.teamB||[]).map(String).filter(Boolean)));
  const hasTeams=mode==='foursomes'||(teamA.length>0&&teamB.length>0);
  return {enabled:!!cfg.enabled&&hasTeams,mode,teamA,teamB,teamAName:cfg.teamAName||'Team 1',teamBName:cfg.teamBName||'Team 2',teamAShots:Math.max(0,parseInt(cfg.teamAShots)||0),teamBShots:Math.max(0,parseInt(cfg.teamBShots)||0),keepStableford:cfg.keepStableford!==false};
}

function foursomesConfigForLiveSnapshot(round,groups,rows){
  try{
    const groupList=(groups&&groups.length?groups:[{id:'group',group_number:1,playing_handicaps:{}}]);
    for(const g of groupList){
      const cfg=matchplayConfigFromRows(rows||[],round,g||{id:'group'});
      if(cfg&&cfg.enabled&&cfg.mode==='foursomes')return cfg;
    }
    const groupMeta=(groupList||[]).map(g=>foursomesConfigFromGroupMeta(g)).find(Boolean);
    if(groupMeta)return groupMeta;
    const roundFoursomes=parseMaybeJsonObject(round&&round.foursomesConfig)||parseMaybeJsonObject(round&&round.foursomes_config);
    const roundMatchplay=(round&&round._matchplay&&round._matchplay.mode==='foursomes'&&round._matchplay)||parseMaybeJsonObject(round&&round.matchplay);
    const embedded=roundFoursomes||(roundMatchplay&&(roundMatchplay.mode==='foursomes'||roundMatchplay.matchplayMode==='foursomes')?roundMatchplay:null);
    if(embedded)return {enabled:true,mode:'foursomes',teamAName:embedded.teamAName||embedded.aName||embedded.team1Name||'Team 1',teamBName:embedded.teamBName||embedded.bName||embedded.team2Name||'Team 2',teamAShots:Math.max(0,parseInt(embedded.teamAShots||embedded.aShots||embedded.team1Shots)||0),teamBShots:Math.max(0,parseInt(embedded.teamBShots||embedded.bShots||embedded.team2Shots)||0),teamA:[],teamB:[]};
    if(round&&(round.matchplayMode==='foursomes'||round.mode==='foursomes'))return {enabled:true,mode:'foursomes',teamAName:'Team 1',teamBName:'Team 2',teamAShots:0,teamBShots:0,teamA:[],teamB:[]};
    if(hasFoursomesScoreRows(rows||[],round))return {enabled:true,mode:'foursomes',teamAName:'Team 1',teamBName:'Team 2',teamAShots:0,teamBShots:0,teamA:[],teamB:[]};
  }catch(e){}
  return null;
}

function buildFoursomesMatchplaySummary(rd,rdGroups,rowSources,courseList){
  try{
    const groupsList=(rdGroups&&rdGroups.length)?rdGroups:[{id:'group',group_number:1,playing_handicaps:{}}];
    const groupMetaRows=groupsList.flatMap(gr=>foursomesScoreRowsFromGroupMeta(rd&&rd.id,gr));
    const allRows=normaliseFoursomesScoreRows([...(rowSources||[]),...groupMetaRows]).filter(r=>r&&(!rd||r.round_id===rd.id));
    const g=groupsList[0]||{id:'group'};
    const cfg=foursomesConfigForLiveSnapshot(rd,groupsList,allRows)||matchplayConfigFromRows(allRows,rd,g);
    if(!cfg||!cfg.enabled||cfg.mode!=='foursomes')return null;
    const course=(courseList||[]).find(co=>co.id===(rd&&rd.course_id))||findCourseForTee(courseList||[],rd&&rd.course_name,rd&&rd.tee)||{};
    const ch=Array.isArray(course.holes)?course.holes:[];
    const holeList=ch.length?ch:Array.from({length:18},(_,i)=>({hole:i+1,par:4,stroke_index:i+1}));
    const map={};
    allRows.filter(r=>!isMetaScoreRow(r)).forEach(r=>{
      if(!isFoursomesTeamPlayerId(r.player_id))return;
      const h=parseInt(r.hole_number);
      if(!map[h])map[h]={};
      map[h][canonicalFoursomesPlayerId(r.player_id)]=r.gross_score;
    });
    let lead=0,played=0,lastHole=0;
    holeList.filter(h=>parseInt(h.hole)>=1&&parseInt(h.hole)<=18).forEach(hd=>{
      const h=parseInt(hd.hole);
      const aGross=(map[h]||{})[MATCHPLAY_FOURSOMES_A];
      const bGross=(map[h]||{})[MATCHPLAY_FOURSOMES_B];
      if(!hasEnteredGross(aGross)||!hasEnteredGross(bGross))return;
      const markedAWon=isFoursomesWonMarker(aGross)||isFoursomesConcededMarker(bGross);
      const markedBWon=isFoursomesWonMarker(bGross)||isFoursomesConcededMarker(aGross);
      const si=parseInt(hd.stroke_index)||h;
      const aShot=shotsOnHole(cfg.teamAShots||0,si);
      const bShot=shotsOnHole(cfg.teamBShots||0,si);
      const aNet=isFoursomesOutcomeMarker(aGross)?null:(parseInt(aGross)||0)-aShot;
      const bNet=isFoursomesOutcomeMarker(bGross)?null:(parseInt(bGross)||0)-bShot;
      if(markedAWon&&!markedBWon)lead+=1;
      else if(markedBWon&&!markedAWon)lead-=1;
      else if(aNet!==null&&bNet!==null&&aNet<bNet)lead+=1;
      else if(aNet!==null&&bNet!==null&&bNet<aNet)lead-=1;
      played+=1;
      lastHole=h;
    });
    const aName=cfg.teamAName||'Team 1';
    const bName=cfg.teamBName||'Team 2';
    const remaining=Math.max(0,18-played);
    const abs=Math.abs(lead);
    let label='A/S',sub=played?'Thru '+lastHole:'Not started yet';
    if(played&&lead!==0){
      const leader=lead>0?aName:bName;
      if(abs>remaining){label=leader+' win '+abs+'&'+remaining;sub='Match finished';}
      else {label=leader+' '+abs+'UP';sub='Thru '+lastHole;}
    }
    return {mode:'foursomes',aName,bName,label,sub,lead,played,lastHole,remaining,abs,isFinished:played&&lead!==0&&abs>remaining,winningTeam:lead>0?'A':lead<0?'B':null,teamA:(cfg.teamA||[]).map(String).filter(Boolean),teamB:(cfg.teamB||[]).map(String).filter(Boolean),teamAShots:parseInt(cfg.teamAShots)||0,teamBShots:parseInt(cfg.teamBShots)||0,keepStableford:cfg.keepStableford!==false};
  }catch(e){return null;}
}
function userCanScoreFoursomesRound(currentUser,round,realGroup,roundPlayers){
  if(!currentUser)return false;
  if(round&&idMatches(round.created_by,currentUser.id))return true;
  if(realGroup&&userCanScoreRound(currentUser,realGroup,roundPlayers))return true;
  return (roundPlayers||[]).some(rp=>rp&&rp.is_host&&(idMatches(rp.user_id,currentUser.id)||idMatches(rp.id,currentUser.id)));
}

async function saveMatchplayConfigToCloud(roundId,groupKey,cfg){
  if(!roundId||!cfg||!cfg.enabled)return {ok:true,count:0};
  const clean={enabled:!!cfg.enabled,mode:normaliseMatchplayMode(cfg.mode),teamA:(cfg.teamA||[]).map(String).filter(Boolean),teamB:(cfg.teamB||[]).map(String).filter(Boolean),teamAName:cfg.teamAName||'Team 1',teamBName:cfg.teamBName||'Team 2',teamAShots:Math.max(0,parseInt(cfg.teamAShots)||0),teamBShots:Math.max(0,parseInt(cfg.teamBShots)||0),keepStableford:cfg.keepStableford!==false};
  saveLocalMatchplayConfig(roundId,groupKey,clean);
  const rows=[];
  clean.teamA.forEach(pid=>rows.push({round_id:roundId,player_id:makeMatchplayScorePlayerId(groupKey,'A',pid),hole_number:MATCHPLAY_CONFIG_HOLE,gross_score:1,stableford_points:1,par:4,stroke_index:1}));
  clean.teamB.forEach(pid=>rows.push({round_id:roundId,player_id:makeMatchplayScorePlayerId(groupKey,'B',pid),hole_number:MATCHPLAY_CONFIG_HOLE,gross_score:1,stableford_points:1,par:4,stroke_index:1}));
  rows.push({round_id:roundId,player_id:makeMatchplayMetaPlayerId(groupKey,'mode'),hole_number:MATCHPLAY_CONFIG_HOLE,gross_score:matchplayModeCode(clean.mode),stableford_points:1,par:4,stroke_index:1});
  rows.push({round_id:roundId,player_id:makeMatchplayMetaPlayerId(groupKey,'teamAShots'),hole_number:MATCHPLAY_CONFIG_HOLE,gross_score:clean.teamAShots,stableford_points:1,par:4,stroke_index:1});
  rows.push({round_id:roundId,player_id:makeMatchplayMetaPlayerId(groupKey,'teamBShots'),hole_number:MATCHPLAY_CONFIG_HOLE,gross_score:clean.teamBShots,stableford_points:1,par:4,stroke_index:1});
  rows.push({round_id:roundId,player_id:makeMatchplayMetaPlayerId(groupKey,'keepStableford'),hole_number:MATCHPLAY_CONFIG_HOLE,gross_score:clean.keepStableford?1:0,stableford_points:1,par:4,stroke_index:1});
  rows.push({round_id:roundId,player_id:makeMatchplayMetaPlayerId(groupKey,'teamAName:'+encodeURIComponent(clean.teamAName)),hole_number:MATCHPLAY_CONFIG_HOLE,gross_score:1,stableford_points:1,par:4,stroke_index:1});
  rows.push({round_id:roundId,player_id:makeMatchplayMetaPlayerId(groupKey,'teamBName:'+encodeURIComponent(clean.teamBName)),hole_number:MATCHPLAY_CONFIG_HOLE,gross_score:1,stableford_points:1,par:4,stroke_index:1});
  return rows.length?saveScoreRowsToCloud(sb,rows):{ok:true,count:0};
}
function cleanMatchplaySetup(matchplay,players){
  const ids=(players||[]).map(p=>normaliseId(p.id));
  const keep=(arr)=>(arr||[]).map(normaliseId).filter(id=>ids.includes(id));
  const mode=normaliseMatchplayMode(matchplay&&matchplay.mode);
  let teamA=keep(matchplay&&matchplay.teamA);
  let teamB=keep(matchplay&&matchplay.teamB).filter(id=>!teamA.includes(id));
  if(mode==='doubles'&&(!teamA.length&&!teamB.length)&&ids.length>=4){teamA=[ids[0],ids[1]];teamB=[ids[2],ids[3]];}
  if(mode==='foursomes'){teamA=[MATCHPLAY_FOURSOMES_A];teamB=[MATCHPLAY_FOURSOMES_B];}
  return {enabled:!!(matchplay&&matchplay.enabled),mode,teamA,teamB,teamAName:(matchplay&&matchplay.teamAName)||'Team 1',teamBName:(matchplay&&matchplay.teamBName)||'Team 2',teamAShots:Math.max(0,parseInt(matchplay&&matchplay.teamAShots)||0),teamBShots:Math.max(0,parseInt(matchplay&&matchplay.teamBShots)||0),keepStableford:matchplay&&matchplay.keepStableford!==false};
}

function applySinglesMatchplayShots(matchplay,players){
  const clean=cleanMatchplaySetup(matchplay||{},players||[]);
  if(clean.mode!=='singles')return clean;
  const playerById={};
  (players||[]).forEach(p=>{playerById[normaliseId(p.id)]=p;});
  const aId=normaliseId((clean.teamA||[])[0]);
  const bId=normaliseId((clean.teamB||[])[0]);
  const shotsFor=id=>{
    const p=playerById[id]||{};
    return parseInt(p.playing_handicap??p.current_handicap??p.handicap??0)||0;
  };
  const aShots=shotsFor(aId);
  const bShots=shotsFor(bId);
  const diff=Math.abs(aShots-bShots);
  return {...clean,teamAShots:aShots>bShots?diff:0,teamBShots:bShots>aShots?diff:0};
}

function moneyFromPence(v){
  const n=Math.round(parseFloat(v)||0);
  const sign=n<0?'-':'';
  const abs=Math.abs(n);
  return sign+'£'+(abs/100).toFixed(abs%100?2:0);
}
function isMetaScoreRow(row){return isSnakeScoreRow(row)||isFineScoreRow(row)||isSweepstakeScoreRow(row)||isMatchplayScoreRow(row)||isMatchplayMetaScoreRow(row);}

function localScoreRowsForRound(roundId){
  const rows=[];
  if(!roundId)return rows;
  try{
    const local=JSON.parse(localStorage.getItem('scores_'+roundId)||'{}')||{};
    Object.keys(local||{}).forEach(h=>{
      const holeNum=parseInt(h);
      if(!holeNum)return;
      Object.keys(local[h]||{}).forEach(pid=>{
        const gross=local[h][pid];
        if(gross===undefined||gross===null||gross==='')return;
        rows.push({round_id:roundId,player_id:pid,hole_number:holeNum,gross_score:gross,stableford_points:0,par:4,stroke_index:holeNum});
      });
    });
  }catch(e){}
  return rows;
}
function localFoursomesScoreRowsForRound(roundId){
  return normaliseFoursomesScoreRows(localScoreRowsForRound(roundId)).filter(r=>r&&isFoursomesTeamPlayerId(r.player_id)&&hasEnteredGross(r.gross_score));
}
function fineAmount(key,count){const def=fineDef(key);return def?(parseInt(count)||0)*(def.amount||0):0;}

function cupFineTotalForRound(round,scores){
  if(!round)return 0;
  const roundScores=(scores||[]).filter(sc=>sc&&sc.round_id===round.id);
  const fineRows=roundScores.filter(isFineScoreRow);
  let total=fineRows.reduce((t,sc)=>{const parsed=parseFineScoreRow(sc);return t+fineAmount(parsed&&parsed.key,parseInt(sc.gross_score)||0);},0);
  const storedBlobKeys=new Set(fineRows.map(sc=>{const parsed=parseFineScoreRow(sc);return parsed&&parsed.key==='blob'?normaliseId(parsed.pid)+'|'+(parseInt(parsed.hole)||0):null;}).filter(Boolean));
  roundScores.filter(sc=>!isMetaScoreRow(sc)&&stablefordPointsValue(sc.stableford_points)===0).forEach(sc=>{
    const key=normaliseId(sc.player_id)+'|'+(parseInt(sc.hole_number)||0);
    if(!storedBlobKeys.has(key))total+=fineAmount('blob',1);
  });
  return total;
}
function rowsToSnakeMarks(rows){
  const marks={};
  (rows||[]).forEach(row=>{
    const hole=parseInt(row&&row.hole_number);
    if(!hole)return;
    const parsed=parseSnakeScorePlayerId(row&&row.player_id);
    if(parsed&&parsed.groupKey&&parsed.pid){
      if(!marks[parsed.groupKey])marks[parsed.groupKey]={};
      marks[parsed.groupKey][hole]=parsed.pid;
      return;
    }
    // New safe storage: actual score rows can carry the snake flag by adding
    // SNAKE_STABLEFORD_OFFSET to stableford_points. This avoids fake player_id
    // rows, so spectators can see snakes without breaking scorecard rendering.
    if(rowHasSnakeFlag(row)&&row&&row.player_id){
      const scoreGroup='__score__|'+normaliseId(row.round_id||'round');
      if(!marks[scoreGroup])marks[scoreGroup]={};
      marks[scoreGroup][hole]=row.player_id;
    }
  });
  return marks;
}
function stableLiveDataSignature(rows,fields){
  return (rows||[]).map(row=>(fields||[]).map(f=>{
    const v=row&&row[f];
    if(v&&typeof v==='object')return JSON.stringify(v);
    return v===undefined||v===null?'':String(v);
  }).join(':')).sort().join('|');
}
function snakeHolderIdsFromMarks(marks,throughHole=18){
  const ids=new Set();
  const rawHole=throughHole===undefined||throughHole===null?18:parseInt(throughHole);
  const maxHole=Math.min(18,Math.max(0,Number.isFinite(rawHole)?rawHole:18));
  Object.keys(marks||{}).forEach(groupKey=>{
    const groupMarks=marks[groupKey]||{};
    let holder=null;
    Object.keys(groupMarks).map(Number).filter(h=>h>0&&h<=maxHole).sort((a,b)=>a-b).forEach(h=>{
      if(groupMarks[h])holder=groupMarks[h];
    });
    const id=normaliseId(holder);
    if(id)ids.add(id);
  });
  return ids;
}
function snakeHolderIdsFromScoreRows(rows,throughHole=18,roundIds=null){
  const allowed=roundIds?new Set(Array.from(roundIds).map(normaliseId).filter(Boolean)):null;
  const filtered=(rows||[]).filter(r=>r&&(!allowed||allowed.has(normaliseId(r.round_id))));
  return snakeHolderIdsFromMarks(rowsToSnakeMarks(filtered),throughHole);
}

function splitIntoGolfGroups(participants,range){
  const list=[...(participants||[])];
  let groupCount=1;
  if(range==='5-8')groupCount=2;
  else if(range==='9-12')groupCount=3;
  else if(range==='more')groupCount=Math.max(1,Math.ceil(list.length/4));
  groupCount=Math.max(groupCount,Math.ceil(list.length/4)||1);
  const groups=Array.from({length:groupCount},()=>[]);
  list.forEach((p,i)=>groups[Math.min(Math.floor(i/4),groupCount-1)].push(p));
  return groups.filter((g,i)=>g.length>0 || i===0);
}
function playerRangeLabel(range){
  if(range==='1-4')return '1-4 players';
  if(range==='5-8')return '5-8 players';
  if(range==='9-12')return '9-12 players';
  if(range==='more')return 'Groups';
  if(range==='13-16')return '13-16 players';
  return 'Choose players';
}
function defaultDaySweepstakeName(){
  return new Date().toLocaleDateString('en-GB',{weekday:'long',timeZone:'Europe/London'})+' Sweepstake';
}

// =========================================================
// Play Golf flow
// Round setup, player selection, joining live rounds and launch into scorecard
// =========================================================
function PlayGolf({players,courses,rounds,groups,scores,sb,flash,setView,setSelectedRound,load,isAdmin,currentUser,cupUsers,guests,selectedRound,holeScores,setHoleScores,promptStartRoundAuth}){
  const[step,setStep]=useState('playerCount');
  const[activeRound,setActiveRound]=useState(null);
  const[activeGroup,setActiveGroup]=useState(null);
  const[setup,setSetup]=useState({name:'',course_id:'',course_name:'',tee:'White',is_private:false,allowance:0.95,dayCompMode:'none',dayCompKey:'',sweepstake:{enabled:false,amountPence:200,scope:'round'},matchplay:{enabled:false,mode:'doubles',teamA:[],teamB:[],teamAName:'Team 1',teamBName:'Team 2',teamAShots:0,teamBShots:0,keepStableford:true}});
  const[dayJoinPromptDone,setDayJoinPromptDone]=useState(false);
  const[daySweepstakeEntryMode,setDaySweepstakeEntryMode]=useState('all');
  const[daySweepstakeEntryIds,setDaySweepstakeEntryIds]=useState([]);
  const[participants,setParticipants]=useState([]);
  const[groupSetup,setGroupSetup]=useState([[]]);
  const[pickerGroup,setPickerGroup]=useState(0);
  const[saving,setSaving]=useState(false);
  const[showPicker,setShowPicker]=useState(false);
  const[playerRange,setPlayerRange]=useState(null);
  const[openRoundBlock,setOpenRoundBlock]=useState(null);
  const[openRoundBlockCanDelete,setOpenRoundBlockCanDelete]=useState(false);
  const[clearedLiveRoundIds,setClearedLiveRoundIds]=useState([]);
  const liveRounds=uniqueVisibleLiveRounds(rounds,currentUser);
  const myRounds=myRoundsForUser(rounds,groups,currentUser);
  const myLiveRounds=myRounds.filter(isLiveRound);
  const courseOptions=getCourseOptions(courses);
  const selectedCourseOption=courseOptions.find(o=>o.name===setup.course_name)||courseOptions.find(o=>o.course&&o.course.id===setup.course_id)||null;
  const availableTees=selectedCourseOption?Object.keys(selectedCourseOption.tees):['White','Yellow','Red','Orange'];
  const selectedCourse=courses.find(co=>co.id===setup.course_id)||findCourseForTee(courses,setup.course_name,setup.tee);
  const isSingleGroupDay=(playerRange==='1-4'||groupSetup.length<=1);
  const activeDayBoards=Array.from((rounds||[]).filter(r=>dayCompKeyFromRound(r)&&isSameLocalDay(roundStartValue(r),Date.now())).reduce((map,r)=>{const key=dayCompKeyFromRound(r);if(key&&(!map.has(key)||isDayCompBoardRound(r)))map.set(key,r);return map;},new Map()).values());
  const promptDayBoard=activeDayBoards.find(isDayCompBoardRound)||activeDayBoards[0]||null;
  function dayBoardByKey(key){
    return activeDayBoards.find(r=>dayCompKeyFromRound(r)===key)||null;
  }
  function dayBoardSweepstakeConfig(board){
    return board?sweepstakeConfigFromRows(scores||[],board):{enabled:false,amountPence:200,scope:'round'};
  }
  const selectedDayBoard=setup.dayCompMode==='join'?dayBoardByKey(setup.dayCompKey):null;
  const selectedDayBoardSweepstake=dayBoardSweepstakeConfig(selectedDayBoard);
  const daySweepstakeLocked=setup.dayCompMode==='create'||setup.dayCompMode==='join';
  const daySweepstakePlayerIds=participants.map(p=>normaliseId(p.id)).filter(Boolean);
  const daySweepstakeSelectedIds=daySweepstakeEntryMode==='all'?daySweepstakePlayerIds:daySweepstakeEntryIds.map(normaliseId).filter(id=>daySweepstakePlayerIds.includes(id));
  function toggleDaySweepstakeEntry(playerId){
    const id=normaliseId(playerId);
    setDaySweepstakeEntryMode('custom');
    setDaySweepstakeEntryIds(ids=>{
      const set=new Set((ids||[]).map(normaliseId));
      if(set.has(id))set.delete(id); else set.add(id);
      return Array.from(set);
    });
  }
  useEffect(()=>{
    if(setup.dayCompMode!=='join'){setDaySweepstakeEntryMode('all');setDaySweepstakeEntryIds([]);return;}
    setDaySweepstakeEntryIds(ids=>(ids||[]).map(normaliseId).filter(id=>daySweepstakePlayerIds.includes(id)));
  },[setup.dayCompMode,daySweepstakePlayerIds.join('|')]);
  useEffect(()=>{
    if(setup.dayCompMode!=='join'||!selectedDayBoard)return;
    const cfg=selectedDayBoardSweepstake&&selectedDayBoardSweepstake.enabled?selectedDayBoardSweepstake:{enabled:true,amountPence:200,scope:'round'};
    setSetup(q=>{
      const current=q.sweepstake||{};
      const nextAmount=parseInt(cfg.amountPence)||200;
      if(current.enabled===true&&parseInt(current.amountPence)===nextAmount&&current.scope==='round')return q;
      return {...q,sweepstake:{...current,enabled:true,amountPence:nextAmount,scope:'round'}};
    });
  },[setup.dayCompMode,setup.dayCompKey,selectedDayBoard&&selectedDayBoard.id,selectedDayBoardSweepstake&&selectedDayBoardSweepstake.enabled,selectedDayBoardSweepstake&&selectedDayBoardSweepstake.amountPence]);
  function updateSetupSweepstakeAmount(value){
    const raw=String(value||'').trim();
    const amountPence=raw===''?'':Math.round(Math.max(0,parseFloat(raw)||0)*100);
    setSetup(q=>({...q,sweepstake:{...(q.sweepstake||{}),enabled:daySweepstakeLocked?true:!!(q.sweepstake&&q.sweepstake.enabled),amountPence,scope:daySweepstakeLocked?'round':((q.sweepstake&&q.sweepstake.scope)==='group'?'group':'round')}}));
  }
  function withPlayingHandicap(person,course=selectedCourse,allowance=setup.allowance){
    const handicapIndex=parseFloat(person.handicap_index!=null?person.handicap_index:person.current_handicap!=null?person.current_handicap:person.handicap)||0;
    if(person.is_casual){
      const fixedShots=Math.max(0,parseInt(person.fixed_playing_handicap!=null?person.fixed_playing_handicap:(person.playing_handicap!=null?person.playing_handicap:handicapIndex),10)||0);
      return {...person,is_casual:true,fixed_playing_handicap:fixedShots,playing_handicap:fixedShots,handicap_index:handicapIndex,current_handicap:handicapIndex};
    }
    return {...person,is_casual:false,handicap_index:handicapIndex,current_handicap:handicapIndex,playing_handicap:calcPlayingHandicap(handicapIndex,course,allowance)};
  }
  function resetGroupsForRange(range){
    const count=groupCountForRange(range);
    const flat=groupSetup.flat();
    const next=Array.from({length:count},(_,i)=>flat.filter((_,idx)=>Math.floor(idx/4)===i));
    setGroupSetup(next);
    setParticipants(next.flat());
  }
  function syncGroups(nextGroups){
    setGroupSetup(nextGroups);
    setParticipants(nextGroups.flat());
  }
  function chooseCourse(baseName){const option=courseOptions.find(o=>o.name===baseName);const nextCourse=option?(option.tees[setup.tee]||option.tees.White||option.course):null;const nextTee=nextCourse?(courseTeeFromName(nextCourse.name)||nextCourse.tee||setup.tee):setup.tee;setSetup(q=>({...q,course_name:baseName,course_id:nextCourse?nextCourse.id:'',tee:nextTee}));}
  function chooseTee(tee){const baseName=setup.course_name||(selectedCourseOption&&selectedCourseOption.name)||'';const nextCourse=findCourseForTee(courses,baseName,tee);setSetup(q=>({...q,tee,course_id:nextCourse?nextCourse.id:q.course_id}));}
  useEffect(()=>{
    if(!selectedCourse)return;
    const next=groupSetup.map(g=>g.map(p=>withPlayingHandicap(p,selectedCourse,setup.allowance)));
    syncGroups(next);
  },[setup.course_id,setup.tee,setup.allowance]);
  useEffect(()=>{
    const current=cleanMatchplaySetup(setup.matchplay||{},participants);
    const before=JSON.stringify(setup.matchplay||{});
    const after=JSON.stringify(current);
    if(before!==after)setSetup(q=>({...q,matchplay:current}));
  },[participants.length,participants.map(p=>normaliseId(p.id)).join('|')]);
  useEffect(()=>{
    if(setup.dayCompMode!=='join'||!selectedDayBoard||!selectedDayBoardSweepstake.enabled)return;
    const inherited={enabled:true,amountPence:parseInt(selectedDayBoardSweepstake.amountPence)||200,scope:selectedDayBoardSweepstake.scope==='group'?'group':'round'};
    const current=setup.sweepstake||{};
    if(!current.enabled||parseInt(current.amountPence)!==inherited.amountPence||(current.scope||'round')!==inherited.scope){
      setSetup(q=>({...q,sweepstake:inherited}));
    }
  },[setup.dayCompMode,setup.dayCompKey,selectedDayBoard&&selectedDayBoard.id,selectedDayBoardSweepstake.enabled,selectedDayBoardSweepstake.amountPence,selectedDayBoardSweepstake.scope]);
  useEffect(()=>{
    if(setup.dayCompMode!=='create')return;
    const current=setup.sweepstake||{};
    if(!current.enabled||(current.scope||'round')!=='round'){
      setSetup(q=>({...q,sweepstake:{...(q.sweepstake||{}),enabled:true,amountPence:parseInt(q.sweepstake&&q.sweepstake.amountPence)||200,scope:'round'}}));
    }
  },[setup.dayCompMode,setup.sweepstake&&setup.sweepstake.enabled,setup.sweepstake&&setup.sweepstake.scope]);
  async function continueRound(rd){
    let rdGroups=(groups||[]).filter(g=>g.round_id===rd.id);
    try{const{data:dbGroups}=await sb.from('cup_groups').select('*').eq('round_id',rd.id).order('group_number',{ascending:true});if(dbGroups&&dbGroups.length)rdGroups=dbGroups;}catch(e){}
    const{data:rps}=await sb.from('cup_round_players').select('*').eq('round_id',rd.id);
    if(!rdGroups.length){const rpGroup=groupFromRoundPlayers(rd,rps||[],isSnyderCupRound(rd));if(rpGroup)rdGroups=[rpGroup];}
    const po=(rps||[]).map(rp=>({id:rp.user_id||rp.guest_id||rp.id,name:rp.display_name,display_name:rp.display_name,current_handicap:rp.playing_handicap||0,handicap:rp.playing_handicap||0}));
    const hm={};(rps||[]).forEach(rp=>{hm[rp.user_id||rp.guest_id||rp.id]=rp.playing_handicap||0;});
    {
      let local={};
      try{local=JSON.parse(localStorage.getItem('scores_'+rd.id)||'{}')||{};}catch(e){local={};}
      const{data:dbScores}=await sb.from('cup_scores').select('*').eq('round_id',rd.id);
      const groupMetaRows=(rdGroups||[]).flatMap(g=>foursomesScoreRowsFromGroupMeta(rd.id,g));
      const latestRows=normaliseFoursomesScoreRows([...(scores||[]),...(dbScores||[]),...groupMetaRows,...localScoreRowsForRound(rd.id)]).filter(r=>r&&r.round_id===rd.id);
      const latestMatchplay=foursomesConfigForLiveSnapshot(rd,rdGroups,latestRows)||matchplayConfigFromRows(latestRows,rd,rdGroups[0]||{id:'group',group_number:1});
      const fallbackGroup=(latestMatchplay&&latestMatchplay.enabled&&latestMatchplay.mode==='foursomes')?foursomesFallbackGroup(rd,latestMatchplay):null;
      const userGroup=fallbackGroup||(rdGroups.find(g=>currentUser&&Array.isArray(g.player_ids)&&(g.player_ids||[]).some(pid=>normaliseId(pid)===normaliseId(currentUser.id)))||rdGroups[0]);
      if(!userGroup){flash('No scorecard group found for this round','error');return;}
      const canScore=(fallbackGroup&&userGroup===fallbackGroup)?userCanScoreFoursomesRound(currentUser,rd,rdGroups[0],rps):userCanScoreRound(currentUser,userGroup,rps);
      const dbMap={};
      normaliseFoursomesScoreRows(dbScores||[]).filter(r=>!isMetaScoreRow(r)).forEach(s=>{
        if(!dbMap[s.hole_number])dbMap[s.hole_number]={};
        dbMap[s.hole_number][s.player_id]=s.gross_score;
      });
      const metaMap=fallbackGroup?foursomesHoleScoresFromGroupMeta(rdGroups[0]||{}):{};
      const merged={...local,...dbMap,...metaMap};
      const finalParticipants=fallbackGroup&&userGroup===fallbackGroup?fallbackGroup.participants:po.filter(p=>!userGroup.player_ids||userGroup.player_ids.includes(p.id));
      const finalHandicaps=fallbackGroup&&userGroup===fallbackGroup?fallbackGroup.playing_handicaps:(userGroup.playing_handicaps||hm);
      setActiveRound({...rd,_spectator:!canScore,_extraScores:latestRows,_matchplay:latestMatchplay});
      setActiveGroup({...userGroup,participants:finalParticipants,playing_handicaps:finalHandicaps,player_ids:(userGroup.player_ids&&userGroup.player_ids.length?userGroup.player_ids:finalParticipants.map(p=>p.id))});
      setHoleScores(merged);
      try{if(Object.keys(dbMap).length>0||Object.keys(metaMap).length>0)localStorage.setItem('scores_'+rd.id,JSON.stringify(merged));}catch(e){}
      setStep('scorecard');
    }
  }

  useEffect(()=>{
    if(selectedRound&&selectedRound._group){
      setActiveRound(selectedRound);
      setActiveGroup(selectedRound._group);
      setHoleScores({});
      sb.from('cup_scores').select('*').eq('round_id',selectedRound.id).then(({data})=>{
        const m={};
        [...(data||[]),...((selectedRound&&selectedRound._extraScores)||[]),...foursomesScoreRowsFromGroupMeta(selectedRound&&selectedRound.id,selectedRound&&selectedRound._group)].filter(r=>!isMetaScoreRow(r)).forEach(s=>{
          if(!m[s.hole_number])m[s.hole_number]={};
          m[s.hole_number][s.player_id]=s.gross_score;
        });
        if(Object.keys(m).length>0){
          setHoleScores(m);
          try{localStorage.setItem('scores_'+selectedRound.id,JSON.stringify(m));}catch(e){}
        }
      });
      setStep('scorecard');
      // Clear so next visit to PlayGolf starts fresh
      setSelectedRound(null);
    }
  },[selectedRound]);

  function addPersonToGroup(person,groupIdx,options={}){
    const flat=groupSetup.flat();
    if(flat.find(p=>normaliseId(p.id)===normaliseId(person.id))){flash('Already added');return;}
    const idx=Math.max(0,Math.min(groupIdx,groupSetup.length-1));
    const next=groupSetup.map(g=>[...g]);
    next[idx].push(withPlayingHandicap(person));
    syncGroups(next);
    if(options.closePicker!==false)setShowPicker(false);
  }
  function addP(person){
    addPersonToGroup(person,pickerGroup,{closePicker:false});
  }
  function removeFromGroup(groupIdx,playerId){
    const next=groupSetup.map((g,i)=>i===groupIdx?g.filter(p=>normaliseId(p.id)!==normaliseId(playerId)):[...g]);
    syncGroups(next);
  }
  function updateGroupHandicap(groupIdx,playerId,value){
    const next=groupSetup.map((g,i)=>i===groupIdx?g.map(p=>{
      if(normaliseId(p.id)!==normaliseId(playerId))return p;
      if(p.is_casual){
        const shots=Math.max(0,parseInt(value,10)||0);
        return {...p,fixed_playing_handicap:shots,playing_handicap:shots};
      }
      return withPlayingHandicap({...p,handicap_index:parseFloat(value)||0,current_handicap:parseFloat(value)||0});
    }):[...g]);
    syncGroups(next);
  }
  function toggleCasualPlayer(groupIdx,playerId){
    const next=groupSetup.map((g,i)=>i===groupIdx?g.map(p=>{
      if(normaliseId(p.id)!==normaliseId(playerId))return p;
      const makeCasual=!p.is_casual;
      if(makeCasual){
        const shots=Math.max(0,parseInt(p.playing_handicap!=null?p.playing_handicap:p.current_handicap,10)||0);
        return {...p,is_casual:true,fixed_playing_handicap:shots,playing_handicap:shots};
      }
      return withPlayingHandicap({...p,is_casual:false});
    }):[...g]);
    syncGroups(next);
  }
  function updatePlayingHandicap(groupIdx,playerId,value){
    const ph=Math.max(0,parseInt(value,10)||0);
    const next=groupSetup.map((g,i)=>i===groupIdx?g.map(p=>{
      if(normaliseId(p.id)!==normaliseId(playerId))return p;
      if(p.is_casual)return {...p,playing_handicap:ph,fixed_playing_handicap:ph,_playingHandicapEdited:true};
      const normalHcp=handicapIndexFromPlayingHandicap(ph,selectedCourse,setup.allowance);
      return {...p,playing_handicap:ph,handicap_index:normalHcp,current_handicap:normalHcp,handicap:normalHcp,_playingHandicapEdited:true};
    }):[...g]);
    syncGroups(next);
  }
  function setMatchplayTeam(pid,team){
    const id=normaliseId(pid);
    setSetup(q=>{
      const base=cleanMatchplaySetup(q.matchplay||{},participants);
      let teamA=(base.teamA||[]).filter(x=>normaliseId(x)!==id);
      let teamB=(base.teamB||[]).filter(x=>normaliseId(x)!==id);
      if(team==='A')teamA=[...teamA,id].slice(0,2);
      if(team==='B')teamB=[...teamB,id].slice(0,2);
      return {...q,matchplay:{...base,enabled:true,teamA,teamB}};
    });
  }
  function toggleMatchplaySetup(){
    setSetup(q=>{
      const clean=cleanMatchplaySetup(q.matchplay||{},participants);
      const enabled=!clean.enabled;
      return {...q,matchplay:{...clean,enabled}};
    });
  }

  function setMatchplayMode(mode){
    setSetup(q=>{
      const clean=cleanMatchplaySetup(q.matchplay||{},participants);
      return {...q,matchplay:{...clean,enabled:true,mode:normaliseMatchplayMode(mode)}};
    });
  }
  function updateMatchplayField(key,value){
    setSetup(q=>{
      const clean=cleanMatchplaySetup(q.matchplay||{},participants);
      const next={...clean,enabled:true,[key]:value};
      if(key==='teamAShots'||key==='teamBShots')next[key]=Math.max(0,parseInt(value)||0);
      return {...q,matchplay:next};
    });
  }

  function setRoundMode(mode){
    if(mode==='foursomes'){
      if(playerRange!=='1-4'){setPlayerRange('1-4');resetGroupsForRange('1-4');}
      if(participants.length&&participants.length!==4){flash('Foursomes needs exactly 4 players','error');}
      setSetup(q=>{
        const clean=cleanMatchplaySetup(q.matchplay||{},participants);
        return {...q,matchplay:{...clean,enabled:true,mode:'foursomes',teamAName:clean.teamAName||'Team 1',teamBName:clean.teamBName||'Team 2',keepStableford:false}};
      });
      return;
    }
    if(mode==='singles'){
      if(playerRange!=='1-4'){setPlayerRange('1-4');resetGroupsForRange('1-4');}
      if(participants.length&&participants.length!==2){flash('Singles matchplay needs exactly 2 players','error');}
      setSetup(q=>{
        const clean=cleanMatchplaySetup(q.matchplay||{},participants);
        const a=participants[0]?[String(participants[0].id)]:clean.teamA.slice(0,1);
        const b=participants[1]?[String(participants[1].id)]:clean.teamB.slice(0,1);
        const next=applySinglesMatchplayShots({...clean,enabled:true,mode:'singles',teamA:a,teamB:b,teamAName:'Player 1',teamBName:'Player 2',keepStableford:clean.keepStableford!==false},participants);
        return {...q,matchplay:next};
      });
      return;
    }
    setSetup(q=>{
      const clean=cleanMatchplaySetup(q.matchplay||{},participants);
      return {...q,matchplay:{...clean,mode:'doubles',enabled:false,keepStableford:true}};
    });
  }
  function isFoursomesSetup(){return !!(setup.matchplay&&setup.matchplay.enabled&&setup.matchplay.mode==='foursomes');}
  function isSinglesMatchplaySetup(){return !!(setup.matchplay&&setup.matchplay.enabled&&setup.matchplay.mode==='singles');}
  function isMatchplayOnlySetup(){return !!(setup.matchplay&&setup.matchplay.enabled&&setup.matchplay.mode==='singles'&&setup.matchplay.keepStableford===false);}
  function blockingLiveRound(){
    return myLiveRounds.find(r=>!clearedLiveRoundIds.some(id=>normaliseId(id)===normaliseId(r.id)))||null;
  }
  async function finishBlockedRound(){
    if(!openRoundBlock)return;
    const{error}=await sb.from('cup_rounds').update({status:'complete'}).eq('id',openRoundBlock.id);
    if(error){flash(error.message||'Could not finish previous round','error');return;}
    setClearedLiveRoundIds(ids=>ids.some(id=>normaliseId(id)===normaliseId(openRoundBlock.id))?ids:[...ids,openRoundBlock.id]);
    setOpenRoundBlock(null);
    setOpenRoundBlockCanDelete(false);
    await load();
    flash('Previous round finished');
  }
  async function deleteBlockedRound(){
    if(!openRoundBlock||!openRoundBlockCanDelete)return;
    if(!window.confirm('Are you sure you want to delete this round? This cannot be undone.'))return;
    await sb.from('cup_scores').delete().eq('round_id',openRoundBlock.id);
    await sb.from('cup_groups').delete().eq('round_id',openRoundBlock.id);
    await sb.from('cup_round_players').delete().eq('round_id',openRoundBlock.id);
    const{error}=await sb.from('cup_rounds').delete().eq('id',openRoundBlock.id);
    if(error){flash(error.message||'Could not delete previous round','error');return;}
    try{localStorage.removeItem('scores_'+openRoundBlock.id);localStorage.removeItem('pending_scores_'+openRoundBlock.id);}catch(e){}
    setClearedLiveRoundIds(ids=>ids.some(id=>normaliseId(id)===normaliseId(openRoundBlock.id))?ids:[...ids,openRoundBlock.id]);
    setOpenRoundBlock(null);
    setOpenRoundBlockCanDelete(false);
    await load();
    flash('Previous round deleted');
  }

    // ---------------------------------------------------------
  // Start round / create Supabase round records
  // ---------------------------------------------------------
  async function startRound(skipHandicapConfirm=false){
    const foursomesMode=!!(setup.matchplay&&setup.matchplay.enabled&&setup.matchplay.mode==='foursomes');
    const singlesMode=!!(setup.matchplay&&setup.matchplay.enabled&&setup.matchplay.mode==='singles');
    let allParticipants=groupSetup.flat();
    if(!currentUser){promptStartRoundAuth&&promptStartRoundAuth();return;}
    if(!setup.course_id){flash('Pick a course','error');return;}
    const currentUserInRound=allParticipants.some(p=>normaliseId(p.id)===normaliseId(currentUser.id));
    // Foursomes uses the two named teams as the scorecard players. Do not ask for, or
    // silently add, four individual players on this setup screen: that made the Go Live
    // button look ready but still fail with an Add players validation message.
    if(foursomesMode){
      const aName=String((setup.matchplay&&setup.matchplay.teamAName)||'').trim()||'Team 1';
      const bName=String((setup.matchplay&&setup.matchplay.teamBName)||'').trim()||'Team 2';
      allParticipants=[
        {id:MATCHPLAY_FOURSOMES_A,display_name:aName,name:aName,playing_handicap:0,current_handicap:0,handicap:0,is_guest:true,is_foursomes_team:true},
        {id:MATCHPLAY_FOURSOMES_B,display_name:bName,name:bName,playing_handicap:0,current_handicap:0,handicap:0,is_guest:true,is_foursomes_team:true}
      ];
    }
    if(allParticipants.length===0){flash('Add players','error');return;}
    if(!foursomesMode&&!allParticipants.some(p=>normaliseId(p.id)===normaliseId(currentUser.id))){flash('Add yourself first so at least one signed-in player is in the round','error');return;}
    if(setup.dayCompMode==='create'&&(parseInt(setup.sweepstake&&setup.sweepstake.amountPence)||0)<=0){flash('Enter a sweepstake amount','error');return;}
    if(setup.dayCompMode==='join'&&allParticipants.length>0&&!daySweepstakeSelectedIds.length){flash('Choose at least one player for the day sweepstake, or choose All','error');return;}
    if(singlesMode&&allParticipants.length!==2){flash('Singles matchplay needs exactly 2 players','error');return;}
    if(foursomesMode&&(!(setup.matchplay.teamAName||'').trim()||!(setup.matchplay.teamBName||'').trim())){flash('Add both foursomes team names','error');return;}
    if(singlesMode){setup.matchplay.teamA=[String(allParticipants[0].id)];setup.matchplay.teamB=[String(allParticipants[1].id)];setup.matchplay.teamAName=gameFirstName(allParticipants[0].display_name||allParticipants[0].name||'Player 1');setup.matchplay.teamBName=gameFirstName(allParticipants[1].display_name||allParticipants[1].name||'Player 2');}
    const blocked=blockingLiveRound();
    if(blocked){
      let canDelete=idMatches(blocked.created_by,currentUser.id);
      if(!canDelete){
        const{data:rps}=await sb.from('cup_round_players').select('*').eq('round_id',blocked.id);
        canDelete=(rps||[]).some(rp=>rp.is_host&&(idMatches(rp.user_id,currentUser.id)||idMatches(rp.id,currentUser.id)));
      }
      setOpenRoundBlock(blocked);
      setOpenRoundBlockCanDelete(canDelete);
      flash(isSameLocalDay(roundStartValue(blocked),Date.now())?'You already have a live round open today':'You have an unfinished round from a previous day','error');
      return;
    }
    if(!foursomesMode&&skipHandicapConfirm!==true){
      setStep('confirmHandicaps');
      return;
    }
    setSaving(true);
    try{
      const course=courses.find(co=>co.id===setup.course_id)||findCourseForTee(courses,setup.course_name,setup.tee);
      const today=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
      const creatorName=currentUser&&currentUser.display_name?currentUser.display_name.split(' ')[0]+"'s Round":null;
      const courseBaseName=getCourseDisplayName(course)||setup.course_name;
      const dayCompKey=setup.dayCompMode==='create'?makeDayCompKey():(setup.dayCompMode==='join'?setup.dayCompKey:'');
      let roundName=setup.dayCompMode==='create'?(setup.name||defaultDaySweepstakeName()):(setup.name||creatorName||(courseBaseName+' - '+today)||'Round');
      const joinedDayBoard=setup.dayCompMode==='join'?dayBoardByKey(dayCompKey):null;
      let inheritedSweepstake=joinedDayBoard?dayBoardSweepstakeConfig(joinedDayBoard):null;
      if(joinedDayBoard&&(!inheritedSweepstake||!inheritedSweepstake.enabled)){
        try{
          const{data:boardSweepRows}=await sb.from('cup_scores').select('*').eq('round_id',joinedDayBoard.id);
          const cloudCfg=sweepstakeConfigFromRows(boardSweepRows||[],joinedDayBoard);
          if(cloudCfg&&cloudCfg.enabled)inheritedSweepstake=cloudCfg;
        }catch(e){}
      }
      if(joinedDayBoard&&(!inheritedSweepstake||!inheritedSweepstake.enabled))inheritedSweepstake={enabled:true,amountPence:parseInt(setup.sweepstake&&setup.sweepstake.amountPence)||200,scope:'round'};
      const roundSweepstake=inheritedSweepstake&&inheritedSweepstake.enabled
        ?{enabled:true,amountPence:parseInt(inheritedSweepstake.amountPence)||200,scope:'round'}
        :{enabled:!!(setup.sweepstake&&setup.sweepstake.enabled),amountPence:parseInt(setup.sweepstake&&setup.sweepstake.amountPence)||200,scope:(setup.sweepstake&&setup.sweepstake.scope)==='group'?'group':'round'};
      if(dayCompKey)roundName=appendDayCompMarker(roundName,dayCompKey);
      const joinCode=Math.random().toString(36).substring(2,6).toUpperCase();
      const playerIds=allParticipants.map(p=>p.id);
      const playingHcps={};
      allParticipants.forEach(p=>{playingHcps[p.id]=p.playing_handicap||0;});

      for(const p of allParticipants){
        if(p._playingHandicapEdited&&!p.is_guest&&!p.is_casual){
          const savedHandicap=parseFloat(p.handicap_index??p.current_handicap??p.handicap)||0;
          await sb.from('cup_users').update({handicap:savedHandicap}).eq('id',p.id);
          if(currentUser&&normaliseId(p.id)===normaliseId(currentUser.id)){
            const updated={...currentUser,handicap:savedHandicap};
            localStorage.setItem('snyder_user',JSON.stringify(updated));
          }
        }
      }

      const roundPayload={
        name:roundName,course_id:safeCourseIdForDb(course,setup.course_id),course_name:courseBaseName||'',
        status:'live',tee:setup.tee,day_number:1,join_code:joinCode,is_private:false,created_by:currentUser.id,
      };
      let{data:rd,error:roundErr}=await sb.from('cup_rounds').insert(roundPayload).select().single();
      if(roundErr&&String(roundErr.message||'').toLowerCase().includes('created_by')){
        delete roundPayload.created_by;
        const retry=await sb.from('cup_rounds').insert(roundPayload).select().single();
        rd=retry.data;roundErr=retry.error;
      }
      if(roundErr&&String(roundErr.message||'').toLowerCase().includes('course')){
        roundPayload.course_id=null;
        const retry=await sb.from('cup_rounds').insert(roundPayload).select().single();
        rd=retry.data;roundErr=retry.error;
      }
      if(roundErr)throw roundErr;

      const groupBuckets=foursomesMode?[allParticipants]:groupSetup.map(g=>g.filter(Boolean)).filter(g=>g.length>0);
      // Foursomes scorecards use two synthetic team IDs inside the UI, but Supabase
      // cup_groups.player_ids is a real user/guest ID array. Saving the synthetic IDs
      // there makes the insert fail, so persist the signed-in host as the group scorer
      // and then rehydrate the scorecard locally from the saved foursomes config.
      const groupRows=groupBuckets.map((bucket,idx)=>{
        const dbPlayers=foursomesMode?(currentUser&&currentUser.id?[currentUser.id]:[]):bucket.map(p=>p.id);
        const dbPlayingHcps=foursomesMode?(currentUser&&currentUser.id?{[currentUser.id]:0}:{}):bucket.reduce((acc,p)=>{acc[p.id]=p.playing_handicap||0;return acc;},{});
        return {
          round_id:rd.id,
          group_number:idx+1,
          player_ids:dbPlayers,
          playing_handicaps:dbPlayingHcps
        };
      });
      const{data:createdGroups,error:groupErr}=groupRows.length?await sb.from('cup_groups').insert(groupRows).select():{data:[],error:null};
      if(groupErr)throw groupErr;

      if(roundSweepstake&&roundSweepstake.enabled){
        const swSave=await saveSweepstakeConfigToCloud(rd.id,roundSweepstake);
        if(!swSave.ok)flash('Sweepstake setting did not sync yet. Tap refresh/retry if it is missing on another device.','error');
        if(joinedDayBoard){
          const allEntryIds=allParticipants.map(p=>normaliseId(p.id)).filter(Boolean);
          const entryIds=daySweepstakeEntryMode==='custom'?daySweepstakeSelectedIds:allEntryIds;
          const entrySave=await saveSweepstakeEntryIdsToCloud(rd.id,entryIds,allEntryIds);
          if(!entrySave.ok)flash('Sweepstake player choices did not sync yet. Tap refresh if the sweepstake list is wrong.','error');
          const boardEntrySave=await mergeSweepstakeEntryIdsToCloud(joinedDayBoard.id,entryIds,allEntryIds);
          if(!boardEntrySave.ok)flash('Day sweepstake entrants did not sync yet. Tap refresh if the sweepstake list is wrong.','error');
        }
      }

      if(setup.matchplay&&setup.matchplay.enabled){
        let mp=cleanMatchplaySetup(setup.matchplay,groupBuckets[0]||[]);
        if(mp.mode==='singles')mp=applySinglesMatchplayShots(mp,groupBuckets[0]||[]);
        if(mp.mode==='foursomes'||(mp.teamA.length&&mp.teamB.length)){
          const primaryGroupKey=normaliseId((createdGroups&&createdGroups[0]&&(createdGroups[0].id||createdGroups[0].group_number))||'group');
          const mpSave=await saveMatchplayConfigToCloud(rd.id,primaryGroupKey,mp);
          // Also save a generic fallback key so spectator scorecards can show matchplay even before the real group id hydrates.
          if(primaryGroupKey!=='group')await saveMatchplayConfigToCloud(rd.id,'group',mp);
          if(!mpSave.ok)flash('Matchplay setting did not sync yet. Tap refresh if it is missing on another device.','error');
          if(mp.mode==='foursomes'&&createdGroups&&createdGroups[0]){const gm=await saveFoursomesConfigToGroupMeta(sb,createdGroups[0],mp);if(!gm.ok)flash('Foursomes spectator setup did not sync yet. Tap refresh if it is missing on another device.','error');}
        }
      }

      for(const p of allParticipants){
        if(p.is_foursomes_team)continue;
        await sb.from('cup_round_players').upsert({
          round_id:rd.id,
          [p.is_guest?'guest_id':'user_id']:p.id,
          display_name:p.display_name||p.name||'Player',
          playing_handicap:p.playing_handicap||0,
          is_host:currentUser&&p.id===currentUser.id,
        });
      }

      const po=allParticipants.map(p=>({
        id:p.id,name:p.display_name||p.name,display_name:p.display_name||p.name,
        current_handicap:p.playing_handicap||0,handicap:p.playing_handicap||0,
        user_id:p.is_guest?null:p.id,guest_id:p.is_guest?p.id:null,is_host:currentUser&&normaliseId(p.id)===normaliseId(currentUser.id),
      }));

      const starterName=((currentUser&&currentUser.display_name)||'Someone').split(' ')[0];
      const notifyResult=await sendSnyderLiveNotification('round_started',{roundId:rd&&rd.id,status:'created',title:'🏌️ '+starterName+' is LIVE!',body:'Tap for live scores · '+(courseBaseName||roundName||'Snyder Golf'),roundName:roundName,courseName:courseBaseName,createdBy:currentUser&&currentUser.id});
      if(notifyResult&&!notifyResult.ok)console.warn('Snyder Live notification failed',notifyResult);
      await load();
      const scorerGroup=(createdGroups||[]).find(g=>currentUser&&Array.isArray(g.player_ids)&&g.player_ids.includes(currentUser.id))||(createdGroups||[])[0];
      const scorerIds=foursomesMode?playerIds:((scorerGroup&&scorerGroup.player_ids)||playerIds);
      const scorerParticipants=foursomesMode?po:po.filter(p=>scorerIds.includes(p.id));
      const activeMatchplay=(cleanMatchplaySetup(setup.matchplay||{},scorerParticipants).mode==='singles'?applySinglesMatchplayShots(setup.matchplay||{},scorerParticipants):cleanMatchplaySetup(setup.matchplay||{},scorerParticipants));
      if(joinedDayBoard&&roundSweepstake.enabled)flash('Joined '+dayCompDisplayName(rounds,joinedDayBoard)+' sweepstake');
      setActiveRound({...rd,join_code:joinCode,_allParticipants:po,_dayCompKey:dayCompKey||null,_sweepstake:roundSweepstake,_matchplay:activeMatchplay});
      setActiveGroup({...scorerGroup,playing_handicaps:foursomesMode?playingHcps:((scorerGroup&&scorerGroup.playing_handicaps)||playingHcps),participants:scorerParticipants,player_ids:scorerIds});
      setHoleScores({}); // Fresh scores for new round
      setStep('scorecard');
    }catch(e){flash('Error: '+e.message,'error');}
    setSaving(false);
  }

    // ---------------------------------------------------------
  // Confirm playing handicaps before round creation
  // ---------------------------------------------------------
  if(step==='confirmHandicaps'){
    const activeGroups=groupSetup.map((bucket,idx)=>({bucket:bucket.filter(Boolean),groupIdx:idx})).filter(g=>g.bucket.length>0);
    return(
      <div style={{minHeight:'100vh',paddingBottom:40}}>
        <div style={{padding:'12px 16px',display:'flex',alignItems:'center',gap:12,borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
          <button onClick={()=>setStep('setup')} style={{...S.gho,padding:'6px 12px',fontSize:13}}>Back</button>
          <div style={{fontSize:16,color:'#fff'}}>Check Playing Handicaps</div>
        </div>
        <div style={{padding:16}}>
          <div style={{...S.card,marginBottom:12,background:'rgba(96,184,240,0.08)',borderColor:'rgba(96,184,240,0.2)'}}>
            <div style={{fontSize:18,color:'#fff',fontWeight:900,marginBottom:6}}>Are these shots correct?</div>
            <div style={{fontSize:12,color:'#90ccf0',lineHeight:1.45}}>These are calculated from each player's handicap index for {setup.course_name||'this course'} {setup.tee?('('+setup.tee+' tees)'):''}. Edit the shots here if needed, then start the round.</div>
          </div>
          {activeGroups.map(({bucket,groupIdx})=>(
            <div key={groupIdx} style={{...S.card,marginBottom:12}}>
              {activeGroups.length>1&&<div style={{fontSize:13,color:'#60b8f0',fontWeight:900,marginBottom:8}}>Group {groupLetter(groupIdx+1)}</div>}
              {bucket.map(p=>(
                <div key={p.id} style={{display:'grid',gridTemplateColumns:'1fr 82px',gap:10,alignItems:'center',padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:16,color:'#fff',fontWeight:900,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.display_name||p.name}</div>
                    <div style={{fontSize:11,color:'#60b8f0'}}>{p.is_casual?'Casual golfer - fixed shots':'EG HCP '+parseFloat(p.handicap_index??p.current_handicap??0).toFixed(1)}</div>
                  </div>
                  <div>
                    <label style={{fontSize:10,color:'rgba(255,255,255,0.55)',display:'block',marginBottom:3,textAlign:'center'}}>Shots</label>
                    <HandicapPicker value={p.playing_handicap||0} onChange={v=>updatePlayingHandicap(groupIdx,p.id,v)} style={{padding:'8px 6px',textAlign:'center',fontSize:18,fontWeight:900}} label={(p.display_name||p.name||'Player')+' Playing shots'} step={1} min={0} max={54} defaultValue={18}/>
                  </div>
                </div>
              ))}
            </div>
          ))}
          <button onClick={()=>startRound(true)} disabled={saving} style={{...S.pri,width:'100%',padding:14,fontSize:15,opacity:saving?0.5:1}}>{saving?'Starting...':'Start Round'}</button>
          <button onClick={()=>setStep('setup')} style={{...S.gho,width:'100%',padding:12,fontSize:13,marginTop:10}}>Edit players instead</button>
        </div>
      </div>
    );
  }

    // ---------------------------------------------------------
  // Scorecard handoff
  // ---------------------------------------------------------
  if(step==='scorecard'&&activeRound&&activeGroup){
    return <LiveScorecard round={activeRound} group={activeGroup} players={[...(players||[]),...(cupUsers||[])]} courses={courses} rounds={rounds} scores={scores} sb={sb} flash={flash} load={load} setView={setView} holeScores={holeScores} setHoleScores={setHoleScores} currentUser={currentUser}/>;
  }

    // ---------------------------------------------------------
  // Player count screen
  // ---------------------------------------------------------
  if(step==='playerCount'){
    if(promptDayBoard&&!dayJoinPromptDone&&(setup.dayCompMode||'none')==='none'){
      return(
        <div style={{minHeight:'100vh',paddingBottom:40}}>
          <div style={{padding:'12px 16px',display:'flex',alignItems:'center',gap:12,borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
            <button onClick={()=>setStep('menu')} style={{...S.gho,padding:'6px 12px',fontSize:13}}>Back</button>
            <div style={{fontSize:16,color:'#fff'}}>Start a Round</div>
          </div>
          <div style={{padding:16}}>
            <div style={{...S.card,borderColor:'rgba(96,184,240,0.35)',background:'rgba(96,184,240,0.10)',marginBottom:12}}>
              <div style={{fontSize:20,color:'#fff',fontWeight:950,marginBottom:6}}>Are you joining the day sweepstake?</div>
              <div style={{fontSize:13,color:'#90ccf0',lineHeight:1.4}}>{dayCompDisplayName(rounds,promptDayBoard)}</div>
              {dayBoardSweepstakeConfig(promptDayBoard).enabled&&<div style={{marginTop:8,padding:'8px 10px',borderRadius:10,background:'rgba(245,158,11,0.12)',border:'1px solid rgba(245,158,11,0.25)',fontSize:12,color:'#fbbf24',lineHeight:1.35}}>Joining enters you into the same front, back and overall sweepstake.</div>}
            </div>
            <button onClick={()=>{setSetup(q=>({...q,dayCompMode:'join',dayCompKey:dayCompKeyFromRound(promptDayBoard)||''}));setDayJoinPromptDone(true);}} style={{...S.pri,width:'100%',padding:14,fontSize:15,marginBottom:10}}>Yes, join it</button>
            <button onClick={()=>setDayJoinPromptDone(true)} style={{...S.gho,width:'100%',padding:12,fontSize:13}}>No, normal round</button>
          </div>
        </div>
      );
    }
    const options=[
      {key:'normal',range:'1-4',title:'🏌️ Normal',sub:'Stableford points and gross scores',mode:'normal'},
      {key:'singles',range:'1-4',title:'⚔️ Singles',sub:'2-player matchplay',mode:'singles'},
      {key:'foursomes',range:'1-4',title:'🤝 Foursomes',sub:'2 teams, one ball each',mode:'foursomes'},
      {key:'5-8',range:'5-8',title:'👥 5-8 players',sub:'2 groups, one leaderboard',mode:'normal'},
      {key:'9-12',range:'9-12',title:'🏟️ 9-12 players',sub:'3 groups, one leaderboard',mode:'normal'},
      {key:'13-16',range:'13-16',title:'🎪 13-16 players',sub:'4 groups, one leaderboard',mode:'normal'},
    ];
    const displayOptions=[
      options.find(o=>o.key==='normal'),
      options.find(o=>o.key==='singles'),
      options.find(o=>o.key==='foursomes'),
      {key:'groups',range:'more',title:'Groups',sub:'Multiple groups, one leaderboard',mode:'normal'}
    ].filter(Boolean);
    function choosePreset(o){
      setPlayerRange(o.range);
      resetGroupsForRange(o.range);
      setSetup(q=>{
        const clean=cleanMatchplaySetup(q.matchplay||{},participants);
        if(o.mode==='singles')return {...q,is_private:false,matchplay:{...clean,enabled:true,mode:'singles',keepStableford:true}};
        if(o.mode==='foursomes')return {...q,is_private:false,matchplay:{...clean,enabled:true,mode:'foursomes',teamAName:clean.teamAName||'Team 1',teamBName:clean.teamBName||'Team 2',keepStableford:false}};
        return {...q,is_private:false,matchplay:{...clean,enabled:false,mode:'doubles',keepStableford:true}};
      });
      setStep('setup');
    }
    function roundPresetTitle(o){
      if(o.key==='normal')return 'Standard Round';
      if(o.key==='singles')return 'Head-to-Head Matchplay';
      if(o.key==='foursomes')return 'Foursomes Matchplay';
      return o.title;
    }
    function roundPresetSub(o){
      if(o.key==='normal')return 'Normal golf scoring for 1-4 players';
      if(o.key==='singles')return '2-player matchplay only';
      return o.sub;
    }
    function roundPresetStyle(o){
      const isStandard=o.key==='normal';
      const isMatchplay=o.key==='singles'||o.key==='foursomes';
      return {
        border:'1px solid '+(isStandard?'rgba(34,197,94,0.66)':isMatchplay?'rgba(96,184,240,0.32)':'rgba(255,255,255,0.12)'),
        background:isStandard?'linear-gradient(135deg,rgba(22,163,74,0.92),rgba(12,88,50,0.82))':isMatchplay?'rgba(96,184,240,0.10)':'rgba(255,255,255,0.055)',
        minHeight:isStandard?94:78,
        boxShadow:isStandard?'0 12px 30px rgba(22,163,74,0.22)':'none'
      };
    }
    return(
      <div style={{minHeight:'100vh',paddingBottom:40}}>
        <div style={{padding:'12px 16px',display:'flex',alignItems:'center',gap:12,borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
          <button onClick={()=>setStep('menu')} style={{...S.gho,padding:'6px 12px',fontSize:13}}>Back</button>
          <div style={{fontSize:16,color:'#fff'}}>Choose your round</div>
        </div>
        <div style={{padding:16}}>
          <div style={{fontSize:13,color:'#90ccf0',marginBottom:12}}>Tap the game you want. You can still tweak players, course and shots after this.</div>
          {displayOptions.map(o=>(
            <div key={o.key} onClick={()=>choosePreset(o)} style={{...S.card,marginBottom:10,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,...roundPresetStyle(o)}}>
              <div>
                <div style={{fontSize:o.key==='normal'?28:20,color:'#fff',fontWeight:950,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.04em'}}>{roundPresetTitle(o)}</div>
                <div style={{fontSize:o.key==='normal'?13:12,color:o.key==='normal'?'#d9f99d':'#60b8f0',marginTop:3,fontWeight:o.key==='normal'?850:700}}>{roundPresetSub(o)}</div>
              </div>
              <div style={{fontSize:22,color:o.key==='normal'?'#d9f99d':'#60b8f0',fontWeight:950}}>&gt;</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

    // ---------------------------------------------------------
  // Round setup screen
  // ---------------------------------------------------------
  if(step==='setup'){
    return(
      <div style={{minHeight:'100vh',paddingBottom:40}}>
        <div style={{padding:'12px 16px',display:'flex',alignItems:'center',gap:12,borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
          <button onClick={()=>setStep('playerCount')} style={{...S.gho,padding:'6px 12px',fontSize:13}}>Back</button>
          <div style={{fontSize:16,color:'#fff'}}>Start a Round</div>
        </div>
        <div style={{padding:16}}>
          <div style={{...S.card,marginBottom:12,background:!isFoursomesSetup()&&!isSinglesMatchplaySetup()?'rgba(34,197,94,0.10)':'rgba(96,184,240,0.10)',borderColor:!isFoursomesSetup()&&!isSinglesMatchplaySetup()?'rgba(34,197,94,0.35)':'rgba(96,184,240,0.28)'}}>
            <div style={{fontSize:11,color:'#90ccf0',fontWeight:900,letterSpacing:'0.12em',marginBottom:8}}>HOW ARE YOU PLAYING?</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr',gap:8}}>
              <button onClick={()=>setRoundMode('normal')} style={{border:'1px solid '+(!isFoursomesSetup()&&!isSinglesMatchplaySetup()?'rgba(34,197,94,0.66)':'rgba(255,255,255,0.12)'),background:!isFoursomesSetup()&&!isSinglesMatchplaySetup()?'linear-gradient(135deg,rgba(22,163,74,0.92),rgba(12,88,50,0.82))':'rgba(255,255,255,0.06)',color:'#fff',borderRadius:12,padding:'14px 12px',fontSize:18,fontWeight:950,textAlign:'left',boxShadow:!isFoursomesSetup()&&!isSinglesMatchplaySetup()?'0 10px 24px rgba(22,163,74,0.20)':'none'}}>Standard Round <span style={{display:'block',fontSize:12,color:!isFoursomesSetup()&&!isSinglesMatchplaySetup()?'#d9f99d':'rgba(255,255,255,0.62)',fontWeight:800,marginTop:2}}>Normal golf scoring and Stableford points</span></button>
              <button onClick={()=>setRoundMode('singles')} style={{border:'1px solid '+(isSinglesMatchplaySetup()?'rgba(96,184,240,0.6)':'rgba(255,255,255,0.12)'),background:isSinglesMatchplaySetup()?'rgba(96,184,240,0.20)':'rgba(255,255,255,0.06)',color:'#fff',borderRadius:12,padding:'12px 11px',fontSize:14,fontWeight:950,textAlign:'left'}}>Head-to-head matchplay <span style={{display:'block',fontSize:11,color:'rgba(255,255,255,0.62)',fontWeight:700,marginTop:2}}>Only choose this for a 2-player match</span></button>
              <button onClick={()=>setRoundMode('foursomes')} style={{border:'1px solid '+(isFoursomesSetup()?'rgba(96,184,240,0.6)':'rgba(255,255,255,0.12)'),background:isFoursomesSetup()?'rgba(96,184,240,0.20)':'rgba(255,255,255,0.06)',color:'#fff',borderRadius:12,padding:'12px 11px',fontSize:14,fontWeight:950,textAlign:'left'}}>Foursomes matchplay <span style={{display:'block',fontSize:11,color:'rgba(255,255,255,0.62)',fontWeight:700,marginTop:2}}>Two teams, one ball each</span></button>
            </div>
            <div style={{fontSize:11,color:isFoursomesSetup()||isSinglesMatchplaySetup()?'#90ccf0':'#d9f99d',marginTop:8,lineHeight:1.35}}>{isFoursomesSetup()?'Team scorecard only.':isSinglesMatchplaySetup()?'Choose points as well, or matchplay only.':'Classic live scoring.'}</div>
            {isSinglesMatchplaySetup()&&<div style={{marginTop:10,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <button onClick={()=>setSetup(q=>({...q,matchplay:{...cleanMatchplaySetup(q.matchplay||{},participants),enabled:true,mode:'singles',keepStableford:true}}))} style={{border:'1px solid '+(setup.matchplay&&setup.matchplay.keepStableford!==false?'rgba(96,184,240,0.6)':'rgba(255,255,255,0.12)'),background:setup.matchplay&&setup.matchplay.keepStableford!==false?'rgba(96,184,240,0.20)':'rgba(255,255,255,0.06)',color:'#fff',borderRadius:10,padding:'10px 8px',fontSize:12,fontWeight:900}}>Matchplay + points</button>
              <button onClick={()=>setSetup(q=>({...q,sweepstake:{...(q.sweepstake||{}),enabled:false},matchplay:{...cleanMatchplaySetup(q.matchplay||{},participants),enabled:true,mode:'singles',keepStableford:false}}))} style={{border:'1px solid '+(setup.matchplay&&setup.matchplay.keepStableford===false?'rgba(251,191,36,0.55)':'rgba(255,255,255,0.12)'),background:setup.matchplay&&setup.matchplay.keepStableford===false?'rgba(251,191,36,0.16)':'rgba(255,255,255,0.06)',color:'#fff',borderRadius:10,padding:'10px 8px',fontSize:12,fontWeight:900}}>Matchplay only</button>
            </div>}
          </div>
          {!isSingleGroupDay&&<div style={{...S.card,marginBottom:12,background:'rgba(0,112,187,0.12)',borderColor:'rgba(0,112,187,0.25)'}}>
            <div style={{fontSize:12,color:'#60b8f0',letterSpacing:'0.08em',textTransform:'uppercase'}}>Day setup</div>
            <div style={{fontSize:16,color:'#fff',fontWeight:800,marginTop:3}}>{playerRangeLabel(playerRange)}</div>
            <div style={{fontSize:12,color:'rgba(255,255,255,0.55)',marginTop:4}}>Players will be split into groups of up to 4 for the overall leaderboard.</div>
          </div>}
          <label style={S.lbl}>Round Name (optional)</label>
          <input style={{...S.inp,marginBottom:12}} value={setup.name} onChange={e=>setSetup(q=>({...q,name:e.target.value}))} placeholder={"e.g. "+(currentUser?currentUser.display_name.split(' ')[0]+"'s Round":"Saturday Morning")}/>
          {!isMatchplayOnlySetup()&&<div style={{padding:'12px 14px',background:setup.dayCompMode&&setup.dayCompMode!=='none'?'rgba(96,184,240,0.13)':'rgba(255,255,255,0.06)',borderRadius:10,marginBottom:16,border:'1px solid '+(setup.dayCompMode&&setup.dayCompMode!=='none'?'rgba(96,184,240,0.38)':'rgba(255,255,255,0.12)')}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
              <div>
                <div style={{fontSize:14,color:'#fff',fontWeight:800}}>Day sweepstake</div>
                <div style={{fontSize:11,color:'#90ccf0',marginTop:2}}>Join the admin-created day sweepstake for separate tee times.</div>
              </div>
              <select value={setup.dayCompMode==='join'?setup.dayCompKey:setup.dayCompMode||'none'} onChange={e=>{const v=e.target.value;setSetup(q=>v==='create'?{...q,dayCompMode:'create',dayCompKey:''}:v==='none'?{...q,dayCompMode:'none',dayCompKey:''}:{...q,dayCompMode:'join',dayCompKey:v});}} style={{...S.inp,width:150,marginBottom:0,padding:'8px 9px',fontSize:12}}>
                <option value="none">No sweepstake</option>
                {activeDayBoards.map(r=><option key={dayCompKeyFromRound(r)} value={dayCompKeyFromRound(r)}>{dayCompDisplayName(rounds,r)}</option>)}
              </select>
            </div>
            {setup.dayCompMode&&setup.dayCompMode!=='none'&&<div style={{fontSize:11,color:'rgba(255,255,255,0.70)',marginTop:9,lineHeight:1.35}}>
              {setup.dayCompMode==='create'?'This starts a Saturday Sweepstake-style board. Later players can choose it when they start.':'This round will appear on the selected sweepstake board and use the admin-set sweepstake.'}
              {setup.dayCompMode==='join'&&<div style={{marginTop:7,color:'#fbbf24',fontWeight:900}}>Joining this board enters you into its sweepstake. The amount is locked by admin.</div>}
            </div>}
          </div>}
          <label style={S.lbl}>Course</label>
          <select style={{...S.inp,marginBottom:12}} value={setup.course_name} onChange={e=>chooseCourse(e.target.value)}>
            <option value="">Select course...</option>
            {courseOptions.map(co=><option key={co.name} value={co.name}>{co.name}</option>)}
          </select>
          <label style={S.lbl}>Tee</label>
          <select style={{...S.inp,marginBottom:12}} value={setup.tee} onChange={e=>chooseTee(e.target.value)} disabled={!setup.course_name}>
            {(availableTees.length?availableTees:['White','Yellow','Red','Orange']).map(t=><option key={t}>{t}</option>)}
          </select>
          {selectedCourse&&(
            <div style={{...S.card,marginBottom:12,padding:12,background:'rgba(96,184,240,0.08)',borderColor:'rgba(96,184,240,0.2)'}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',marginBottom:10}}>
                <div>
                  <div style={{fontSize:12,color:'#60b8f0',fontWeight:800}}>Slope {selectedCourse.slope_rating||113}</div>
                  <div style={{fontSize:11,color:'rgba(255,255,255,0.55)'}}>Enter EG handicap. Tick Casual golfer for fixed playing shots.</div>
                </div>
                <select value={setup.allowance} onChange={e=>setSetup(q=>({...q,allowance:parseFloat(e.target.value)||1}))} style={{...S.inp,width:118,padding:'8px 10px',fontSize:12}}>
                  <option value={0.95}>95% comp</option>
                  <option value={1}>Full shots</option>
                </select>
              </div>
              <div style={{fontSize:11,color:'rgba(255,255,255,0.55)'}}>Course rating {selectedCourse.course_rating||'-'} - Par {(selectedCourse.holes||[]).reduce((t,h)=>t+(parseInt(h.par)||0),0)||'-'}</div>
            </div>
          )}
          {!isMatchplayOnlySetup()&&<div style={{padding:'12px 14px',background:setup.sweepstake&&setup.sweepstake.enabled?'rgba(245,158,11,0.12)':'rgba(255,255,255,0.06)',borderRadius:10,marginBottom:16,border:'1px solid '+(setup.sweepstake&&setup.sweepstake.enabled?'rgba(245,158,11,0.35)':'rgba(255,255,255,0.12)')}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
              <div>
                <div style={{fontSize:14,color:'#fff',fontWeight:800}}>Sweepstake</div>
                <div style={{fontSize:11,color:'#fbbf24',marginTop:2}}>{daySweepstakeLocked?'This day sweepstake uses one amount for front, back and overall.':'Optional side pot from Stableford only: front, back and overall.'}</div>
              </div>
              <div onClick={()=>{if(!daySweepstakeLocked)setSetup(q=>({...q,sweepstake:{...(q.sweepstake||{}),enabled:!(q.sweepstake&&q.sweepstake.enabled)}}));}} style={{width:48,height:28,borderRadius:14,background:(setup.sweepstake&&setup.sweepstake.enabled)||daySweepstakeLocked?'#d97706':'rgba(255,255,255,0.2)',cursor:daySweepstakeLocked?'default':'pointer',position:'relative',transition:'background 0.2s',flexShrink:0,opacity:daySweepstakeLocked?0.9:1}}>
                <div style={{position:'absolute',top:3,left:(setup.sweepstake&&setup.sweepstake.enabled)||daySweepstakeLocked?22:3,width:22,height:22,borderRadius:'50%',background:'#fff',transition:'left 0.2s'}}/>
              </div>
            </div>
            {((setup.sweepstake&&setup.sweepstake.enabled)||daySweepstakeLocked)&&<div style={{marginTop:10,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,alignItems:'center'}}>
              <input type="number" min="0" step="0.5" disabled={setup.dayCompMode==='join'} value={(setup.sweepstake&&setup.sweepstake.amountPence)===''?'':((parseInt(setup.sweepstake&&setup.sweepstake.amountPence)||0)/100)} onChange={e=>updateSetupSweepstakeAmount(e.target.value)} style={{...S.inp,marginBottom:0,padding:'9px 10px',fontSize:13,opacity:setup.dayCompMode==='join'?0.72:1}} placeholder="£ per pot"/>
              <select disabled={daySweepstakeLocked} value={daySweepstakeLocked?'round':((setup.sweepstake&&setup.sweepstake.scope)||'round')} onChange={e=>setSetup(q=>({...q,sweepstake:{...(q.sweepstake||{}),scope:e.target.value==='group'?'group':'round'}}))} style={{...S.inp,marginBottom:0,padding:'9px 10px',fontSize:13,opacity:daySweepstakeLocked?0.75:1}}>
                <option value="round">Whole round / all groups</option>
                <option value="group">My group only</option>
              </select>
              {daySweepstakeLocked&&<div style={{gridColumn:'1 / -1',fontSize:11,color:'#fbbf24',fontWeight:900,lineHeight:1.35}}>Day sweepstakes are always across the whole board.</div>}
              <div style={{gridColumn:'1 / -1',fontSize:11,color:'rgba(255,255,255,0.72)',lineHeight:1.35}}>Amount is per front, back and overall pot. Max loss per player: <b>{moneyFromPence((parseInt(setup.sweepstake&&setup.sweepstake.amountPence)||0)*3)}</b>.</div>
            </div>}
          </div>}

          {isSingleGroupDay&&!isSinglesMatchplaySetup()&&(isFoursomesSetup()||participants.length===4)&&(
            <div style={{padding:'12px 14px',background:setup.matchplay&&setup.matchplay.enabled?'rgba(96,184,240,0.13)':'rgba(255,255,255,0.06)',borderRadius:10,marginBottom:16,border:'1px solid '+(setup.matchplay&&setup.matchplay.enabled?'rgba(96,184,240,0.38)':'rgba(255,255,255,0.12)')}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
                <div>
                  <div style={{fontSize:14,color:'#fff',fontWeight:800}}>{isFoursomesSetup()?'Foursomes Matchplay':'Doubles Matchplay'}</div>
                  <div style={{fontSize:11,color:'#90ccf0',marginTop:2}}>{isFoursomesSetup()?'Main format: alternate shots, two team score columns.':'Optional side match. Best Stableford score on each hole wins the hole.'}</div>
                </div>
                {!isFoursomesSetup()?<div onClick={toggleMatchplaySetup} style={{width:48,height:28,borderRadius:14,background:setup.matchplay&&setup.matchplay.enabled?'#0070BB':'rgba(255,255,255,0.2)',cursor:'pointer',position:'relative',transition:'background 0.2s',flexShrink:0}}>
                  <div style={{position:'absolute',top:3,left:setup.matchplay&&setup.matchplay.enabled?22:3,width:22,height:22,borderRadius:'50%',background:'#fff',transition:'left 0.2s'}}/>
                </div>:<div style={{fontSize:11,color:'#fbbf24',fontWeight:950}}>ON</div>}
              </div>
              {setup.matchplay&&setup.matchplay.enabled&&<div style={{marginTop:10,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div style={{gridColumn:'1 / -1',display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:2}}>
                  <button onClick={()=>setMatchplayMode('doubles')} style={{border:'1px solid '+(((setup.matchplay&&setup.matchplay.mode)||'doubles')==='doubles'?'rgba(96,184,240,0.6)':'rgba(255,255,255,0.12)'),background:(((setup.matchplay&&setup.matchplay.mode)||'doubles')==='doubles')?'rgba(96,184,240,0.20)':'rgba(255,255,255,0.06)',color:'#fff',borderRadius:10,padding:'10px 8px',fontSize:12,fontWeight:900}}>Doubles Stableford</button>
                  <button onClick={()=>setMatchplayMode('foursomes')} style={{border:'1px solid '+((setup.matchplay&&setup.matchplay.mode)==='foursomes'?'rgba(251,191,36,0.6)':'rgba(255,255,255,0.12)'),background:(setup.matchplay&&setup.matchplay.mode)==='foursomes'?'rgba(251,191,36,0.20)':'rgba(255,255,255,0.06)',color:'#fff',borderRadius:10,padding:'10px 8px',fontSize:12,fontWeight:900}}>Foursomes</button>
                </div>
                {(setup.matchplay&&setup.matchplay.mode)==='foursomes'&&<>
                  <input value={(setup.matchplay&&setup.matchplay.teamAName)||''} onChange={e=>updateMatchplayField('teamAName',e.target.value)} placeholder='Team 1 name, e.g. Paolo & James' style={{...S.inp,marginBottom:0,padding:'9px 10px',fontSize:13}}/>
                  <input value={(setup.matchplay&&setup.matchplay.teamBName)||''} onChange={e=>updateMatchplayField('teamBName',e.target.value)} placeholder="Team 2 name, e.g. The Reids" style={{...S.inp,marginBottom:0,padding:'9px 10px',fontSize:13}}/>
                  <select value={(parseInt(setup.matchplay&&setup.matchplay.teamAShots)||0)>0?'A':((parseInt(setup.matchplay&&setup.matchplay.teamBShots)||0)>0?'B':'none')} onChange={e=>setSetup(q=>{const clean=cleanMatchplaySetup(q.matchplay||{},participants);const receiver=e.target.value;const current=Math.max(parseInt(clean.teamAShots)||0,parseInt(clean.teamBShots)||0,receiver==='none'?0:1);return {...q,matchplay:{...clean,enabled:true,mode:'foursomes',teamAShots:receiver==='A'?current:0,teamBShots:receiver==='B'?current:0}};})} style={{...S.inp,marginBottom:0,padding:'9px 10px',fontSize:13}}>
                    <option value="none">No shots given</option>
                    <option value="A">{((setup.matchplay&&setup.matchplay.teamAName)||'Team 1')} get shots</option>
                    <option value="B">{((setup.matchplay&&setup.matchplay.teamBName)||'Team 2')} get shots</option>
                  </select>
                  <select value={Math.max(parseInt(setup.matchplay&&setup.matchplay.teamAShots)||0,parseInt(setup.matchplay&&setup.matchplay.teamBShots)||0)} onChange={e=>setSetup(q=>{const clean=cleanMatchplaySetup(q.matchplay||{},participants);const n=parseInt(e.target.value)||0;let receiver=(parseInt(clean.teamAShots)||0)>0?'A':((parseInt(clean.teamBShots)||0)>0?'B':'none');if(n===0)receiver='none';if(n>0&&receiver==='none')receiver='B';return {...q,matchplay:{...clean,enabled:true,mode:'foursomes',teamAShots:receiver==='A'?n:0,teamBShots:receiver==='B'?n:0}};})} style={{...S.inp,marginBottom:0,padding:'9px 10px',fontSize:13}}>
                    {Array.from({length:19},(_,i)=>i).map(n=><option key={n} value={n}>{n} {n===1?'shot':'shots'}</option>)}
                  </select>
                  <div style={{gridColumn:'1 / -1',fontSize:11,color:'rgba(255,255,255,0.72)',lineHeight:1.35}}>Choose which team receives shots and scroll the whole-number shot allowance. Use 0 for a scratch match.</div>
                </>}
                {(setup.matchplay&&setup.matchplay.mode)!=='foursomes'&&participants.map(p=>{
                  const id=normaliseId(p.id);
                  const teamA=(setup.matchplay.teamA||[]).map(normaliseId).includes(id);
                  const teamB=(setup.matchplay.teamB||[]).map(normaliseId).includes(id);
                  return <div key={p.id} style={{background:'rgba(0,0,0,0.18)',border:'1px solid rgba(255,255,255,0.10)',borderRadius:10,padding:8}}>
                    <div style={{fontSize:12,color:'#fff',fontWeight:850,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:7}}>{gameFirstName(p.display_name||p.name||'Player')}</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                      <button onClick={()=>setMatchplayTeam(p.id,'A')} style={{border:'1px solid '+(teamA?'rgba(251,191,36,0.6)':'rgba(255,255,255,0.12)'),background:teamA?'rgba(251,191,36,0.22)':'rgba(255,255,255,0.06)',color:teamA?'#fbbf24':'rgba(255,255,255,0.72)',borderRadius:8,padding:'7px 5px',fontSize:11,fontWeight:900}}>Team A</button>
                      <button onClick={()=>setMatchplayTeam(p.id,'B')} style={{border:'1px solid '+(teamB?'rgba(96,184,240,0.6)':'rgba(255,255,255,0.12)'),background:teamB?'rgba(96,184,240,0.22)':'rgba(255,255,255,0.06)',color:teamB?'#90ccf0':'rgba(255,255,255,0.72)',borderRadius:8,padding:'7px 5px',fontSize:11,fontWeight:900}}>Team B</button>
                    </div>
                  </div>;
                })}
                {(setup.matchplay&&setup.matchplay.mode)!=='foursomes'&&<div style={{gridColumn:'1 / -1',fontSize:11,color:'rgba(255,255,255,0.72)',lineHeight:1.35}}>Team A: <b>{(setup.matchplay.teamA||[]).map(id=>gameFirstName((participants.find(p=>normaliseId(p.id)===normaliseId(id))||{}).display_name||(participants.find(p=>normaliseId(p.id)===normaliseId(id))||{}).name||'')).filter(Boolean).join(' & ')||'Pick 2'}</b> · Team B: <b>{(setup.matchplay.teamB||[]).map(id=>gameFirstName((participants.find(p=>normaliseId(p.id)===normaliseId(id))||{}).display_name||(participants.find(p=>normaliseId(p.id)===normaliseId(id))||{}).name||'')).filter(Boolean).join(' & ')||'Pick 2'}</b></div>}
              </div>}
            </div>
          )}
          {!isFoursomesSetup()&&<><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <label style={{...S.lbl,margin:0}}>{isSingleGroupDay?'Players':'Groups'} ({participants.length} players)</label>
          </div>
          {currentUser&&!participants.find(p=>normaliseId(p.id)===normaliseId(currentUser.id))&&isSingleGroupDay&&(
            <button onClick={()=>addPersonToGroup({...currentUser,display_name:currentUser.display_name,current_handicap:currentUser.handicap},0)} style={{...S.gho,width:'100%',marginBottom:10,fontSize:13}}>
              + Add yourself
            </button>
          )}
          {isSingleGroupDay ? <div style={{marginBottom:12}}>
            <button onClick={()=>{setPickerGroup(0);setShowPicker(true);}} style={{...S.pri,width:'100%',marginBottom:10,fontSize:13}}>+ Add Player</button>
            {participants.length===0&&<div style={{...S.card,fontSize:13,color:'rgba(255,255,255,0.5)',textAlign:'center'}}>No players added yet</div>}
            {participants.map(p=>(
              <div key={p.id} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,padding:'10px 12px',background:'rgba(255,255,255,0.06)',borderRadius:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,color:'#fff',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.display_name||p.name}</div>
                  <div style={{fontSize:11,color:'#60b8f0'}}>{p.is_casual?'Casual - '+(p.playing_handicap||0)+' fixed shots':'EG HCP '+parseFloat(p.handicap_index??p.current_handicap??0).toFixed(1)+' - '+(p.playing_handicap||0)+' shots'}</div>
                  <label style={{display:'inline-flex',alignItems:'center',gap:5,marginTop:6,fontSize:11,color:'rgba(255,255,255,0.7)'}}><input type="checkbox" checked={!!p.is_casual} onChange={()=>toggleCasualPlayer(0,p.id)}/> Casual golfer</label>
                </div>
                <HandicapPicker value={p.is_casual?(p.fixed_playing_handicap??p.playing_handicap):(p.handicap_index??p.current_handicap)} onChange={v=>updateGroupHandicap(0,p.id,v)} style={{width:76,padding:'4px 8px',fontSize:13}} label={(p.display_name||p.name||'Player')+(p.is_casual?' Playing shots':' EG Handicap')} step={p.is_casual?1:0.1} min={0} max={54} defaultValue={p.is_casual?18:8}/>
                <button onClick={()=>removeFromGroup(0,p.id)} style={{...S.dan,padding:'4px 10px',fontSize:12}}>x</button>
              </div>
            ))}
          </div> : <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:12}}>
            {groupSetup.map((bucket,groupIdx)=>(
              <React.Fragment key={groupIdx}>
                {currentUser&&!participants.find(p=>normaliseId(p.id)===normaliseId(currentUser.id))&&(
                  <button onClick={()=>addPersonToGroup({...currentUser,display_name:currentUser.display_name,current_handicap:currentUser.handicap},groupIdx)} style={{...S.gho,width:'100%',fontSize:13,padding:'10px 12px',marginBottom:0}}>
                    + Add yourself to Group {groupLetter(groupIdx+1)}
                  </button>
                )}
                <div style={{...S.card,background:'rgba(255,255,255,0.04)',borderColor:'rgba(255,255,255,0.1)'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{width:10,height:10,borderRadius:'50%',background:groupColour(groupIdx+1),display:'inline-block'}}></span>
                    <div style={{fontSize:16,color:'#fff',fontWeight:900}}>Group {groupLetter(groupIdx+1)}</div>
                  </div>
                  <button onClick={()=>{setPickerGroup(groupIdx);setShowPicker(true);}} style={{...S.pri,padding:'6px 12px',fontSize:12}}>+ Add</button>
                </div>
                {bucket.length===0&&<div style={{fontSize:12,color:'rgba(255,255,255,0.45)',padding:'8px 0'}}>No players added yet</div>}
                {bucket.map(p=>(
                  <div key={p.id} style={{display:'flex',alignItems:'center',gap:8,marginTop:8,padding:'10px 12px',background:'rgba(255,255,255,0.06)',borderRadius:10}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,color:'#fff',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.display_name||p.name}</div>
                      <div style={{fontSize:11,color:'#60b8f0'}}>{p.is_casual?'Casual - '+(p.playing_handicap||0)+' fixed shots':'EG HCP '+parseFloat(p.handicap_index??p.current_handicap??0).toFixed(1)+' - '+(p.playing_handicap||0)+' shots'}</div>
                      <label style={{display:'inline-flex',alignItems:'center',gap:5,marginTop:6,fontSize:11,color:'rgba(255,255,255,0.7)'}}><input type="checkbox" checked={!!p.is_casual} onChange={()=>toggleCasualPlayer(groupIdx,p.id)}/> Casual golfer</label>
                    </div>
                    <HandicapPicker value={p.is_casual?(p.fixed_playing_handicap??p.playing_handicap):(p.handicap_index??p.current_handicap)} onChange={v=>updateGroupHandicap(groupIdx,p.id,v)} style={{width:76,padding:'4px 8px',fontSize:13}} label={(p.display_name||p.name||'Player')+(p.is_casual?' Playing shots':' EG Handicap')} step={p.is_casual?1:0.1} min={0} max={54} defaultValue={p.is_casual?18:8}/>
                    <button onClick={()=>removeFromGroup(groupIdx,p.id)} style={{...S.dan,padding:'4px 10px',fontSize:12}}>x</button>
                  </div>
                ))}
                </div>
              </React.Fragment>
            ))}
          </div>}
          </>}
          {setup.dayCompMode==='join'&&participants.length>0&&!isMatchplayOnlySetup()&&<div style={{...S.card,marginTop:12,borderColor:'rgba(245,158,11,0.38)',background:'rgba(245,158,11,0.10)'}}>
            <div style={{fontSize:15,color:'#fff',fontWeight:950,marginBottom:4}}>Who is joining the sweepstake?</div>
            <div style={{fontSize:11,color:'#fbbf24',lineHeight:1.35,marginBottom:10}}>Anyone left out still appears on the scorecard and day leaderboard, but they are not included in the sweepstake pots or payments.</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
              <button onClick={()=>{setDaySweepstakeEntryMode('all');setDaySweepstakeEntryIds([]);}} style={{border:'1px solid '+(daySweepstakeEntryMode==='all'?'rgba(245,158,11,0.65)':'rgba(255,255,255,0.12)'),background:daySweepstakeEntryMode==='all'?'rgba(245,158,11,0.22)':'rgba(255,255,255,0.06)',color:'#fff',borderRadius:10,padding:'9px 8px',fontSize:12,fontWeight:950}}>All players</button>
              <button onClick={()=>{setDaySweepstakeEntryMode('custom');setDaySweepstakeEntryIds(ids=>ids&&ids.length?ids:daySweepstakePlayerIds);}} style={{border:'1px solid '+(daySweepstakeEntryMode==='custom'?'rgba(96,184,240,0.65)':'rgba(255,255,255,0.12)'),background:daySweepstakeEntryMode==='custom'?'rgba(96,184,240,0.22)':'rgba(255,255,255,0.06)',color:'#fff',borderRadius:10,padding:'9px 8px',fontSize:12,fontWeight:950}}>Choose individually</button>
            </div>
            {daySweepstakeEntryMode==='custom'&&<div style={{display:'flex',flexDirection:'column',gap:7}}>
              {participants.map(p=>{const id=normaliseId(p.id);const checked=daySweepstakeSelectedIds.includes(id);return <label key={id} style={{display:'flex',alignItems:'center',gap:9,padding:'9px 10px',borderRadius:10,background:checked?'rgba(245,158,11,0.15)':'rgba(255,255,255,0.05)',border:'1px solid '+(checked?'rgba(245,158,11,0.32)':'rgba(255,255,255,0.08)'),fontSize:13,color:'#fff',fontWeight:850}}>
                <input type="checkbox" checked={checked} onChange={()=>toggleDaySweepstakeEntry(p.id)}/>
                <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.display_name||p.name||'Player'}</span>
                <span style={{fontSize:10,color:checked?'#fbbf24':'rgba(255,255,255,0.45)',fontWeight:950}}>{checked?'IN':'OUT'}</span>
              </label>;})}
            </div>}
            <div style={{fontSize:11,color:'#dbeafe',marginTop:9,fontWeight:800}}>{daySweepstakeSelectedIds.length} of {participants.length} player{participants.length===1?'':'s'} in sweepstake</div>
          </div>}
          {openRoundBlock&&(
            <div style={{...S.card,marginTop:12,borderColor:isSameLocalDay(roundStartValue(openRoundBlock),Date.now())?'rgba(239,68,68,0.45)':'rgba(245,158,11,0.45)',background:isSameLocalDay(roundStartValue(openRoundBlock),Date.now())?'rgba(239,68,68,0.12)':'rgba(245,158,11,0.12)'}}>
              <div style={{fontSize:15,color:'#fff',fontWeight:900,marginBottom:5}}>{isSameLocalDay(roundStartValue(openRoundBlock),Date.now())?'You already have a live round open today':'You have an unfinished round from a previous day'}</div>
              <div style={{fontSize:12,color:'#90ccf0',marginBottom:10}}>{roundDisplayName(openRoundBlock)} - {formatRoundStart(openRoundBlock)}</div>
              <div style={{display:'grid',gridTemplateColumns:openRoundBlockCanDelete?'1fr 1fr':'1fr',gap:8,marginBottom:8}}>
                <button onClick={finishBlockedRound} style={{...S.pri,padding:'10px 8px',fontSize:13,background:'#0a8a4a'}}>Finish Round</button>
                {openRoundBlockCanDelete&&<button onClick={deleteBlockedRound} style={{...S.dan,padding:'10px 8px',fontSize:13}}>Delete Round</button>}
              </div>
              <button onClick={()=>continueRound(openRoundBlock)} style={{...S.gho,width:'100%',fontSize:13}}>Go to open round</button>
            </div>
          )}
          <button onClick={startRound} disabled={saving||!setup.course_id} style={{...S.pri,width:'100%',padding:14,fontSize:15,marginTop:12,opacity:saving||!setup.course_id?0.5:1}}>
            {saving?'Starting...':(isFoursomesSetup()?'Start Foursomes Match - Go Live!':'Start Round - Go Live!')}
          </button>
        </div>
        {showPicker&&<PeoplePicker currentUser={currentUser} cupUsers={cupUsers} guests={guests} flash={flash} onAdd={addP} onClose={()=>setShowPicker(false)} alreadyAdded={participants.map(p=>p.id)}/>}
      </div>
    );
  }

  return(
    <div style={{minHeight:'100vh',paddingBottom:40}}>
      <div style={{padding:'12px 16px',display:'flex',alignItems:'center',gap:12,borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
        <button onClick={()=>setView('home')} style={{...S.gho,padding:'6px 12px',fontSize:13}}>Back</button>
        <div style={{fontSize:16,color:'#fff'}}>Play Golf</div>
      </div>
      <div style={{padding:16}}>
        <div style={{...S.card,marginBottom:12,cursor:'pointer',textAlign:'center',padding:24}} onClick={()=>currentUser?setStep('playerCount'):(promptStartRoundAuth&&promptStartRoundAuth())}>
          <div style={{fontSize:16,color:'#fff',marginBottom:4}}>Start a New Round</div>
          <div style={{fontSize:13,color:'#60b8f0'}}>Pick a course, add players, go live</div>
        </div>
        {false&&currentUser&&myRounds.length>0&&(
          <div>
            <div style={{fontSize:12,color:'#60b8f0',margin:'16px 0 8px',letterSpacing:'0.1em'}}>MY ROUNDS</div>
            {myRounds.map(rd=>{
              const course=courses.find(co=>co.id===rd.course_id)||findCourseForTee(courses,rd.course_name,rd.tee);
              const live=isLiveRound(rd);
              return(
                <div key={rd.id} style={{...S.card,marginBottom:6,cursor:'pointer',borderColor:live?'rgba(239,68,68,0.3)':'rgba(255,255,255,0.1)'}} onClick={()=>continueRound(rd)}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <CourseBadge course={course} round={rd} size={32}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,color:'#fff',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{roundDisplayName(rd)||getCourseDisplayName(course,rd)||'Round'}</div>
                      <div style={{fontSize:12,color:'#60b8f0'}}>{live?'Continue scoring':'Completed'} - {rd.tee||'White'} tee</div>
                    </div>
                    <div style={{fontSize:10,color:live?'#fff':'#60b8f0',background:live?'#ef4444':'rgba(96,184,240,0.12)',borderRadius:20,padding:'4px 8px',fontWeight:700}}>{live?'LIVE':'DONE'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {liveRounds.filter(rd=>!myRounds.some(m=>m.id===rd.id)).length>0&&(
          <div>
            <div style={{fontSize:12,color:'#60b8f0',margin:'16px 0 8px',letterSpacing:'0.1em'}}>WATCH LIVE ROUND</div>
            {liveRounds.filter(rd=>!myRounds.some(m=>m.id===rd.id)).map(rd=>
              groups.filter(g=>g.round_id===rd.id).map(grp=>(
                <div key={grp.id} style={{...S.card,marginBottom:6,cursor:'pointer',borderColor:'rgba(239,68,68,0.3)'}} onClick={()=>continueRound(rd)}>
                  <div style={{fontSize:14,color:'#ef4444',marginBottom:2}}>{roundDisplayName(rd)}</div>
                  <div style={{fontSize:12,color:'#60b8f0'}}>{rd.course_name} - Spectator view</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =========================================================
// Live scorecard
// Hole entry, running totals, review pages, sharing and finish-round controls
// =========================================================
function LiveScorecard({round,group,players,courses,rounds,scores,sb,flash,load,setView,holeScores,setHoleScores,currentUser}){
  const course=courses.find(co=>co.id===round.course_id)||findCourseForTee(courses,round.course_name,round.tee);
  const holes=course&&course.holes&&course.holes.length>0?course.holes:Array.from({length:18},(_,i)=>({hole:i+1,par:4,stroke_index:i+1,yards:0}));
  const[allGroups,setAllGroups]=useState(group?[group]:[]);
  const groups=allGroups||[];
  const[allRoundPlayers,setAllRoundPlayers]=useState((group&&group.participants)||[]);
  const[activeGroupId,setActiveGroupId]=useState(group&&group.id?group.id:'leaderboard');
  const activeScoreGroup=activeGroupId==='leaderboard'?null:(allGroups.find(g=>normaliseId(g.id)===normaliseId(activeGroupId))||group||allGroups[0]||{});
  const playingHcps=activeScoreGroup&&activeScoreGroup.playing_handicaps||{};
  const participants=activeScoreGroup&&activeScoreGroup.participants||[];
  const grpPlayers=participants.length>0?participants:(activeScoreGroup&&activeScoreGroup.player_ids||[]).map(id=>{
    const p=allRoundPlayers.find(pl=>normaliseId(pl.id)===normaliseId(id))||players.find(pl=>normaliseId(pl.id)===normaliseId(id));
    return p||{id,name:'Player',display_name:'Player',current_handicap:playingHcps[id]||0};
  });
  function scorecardPlayerProfile(player){
    if(!player)return {display_name:'Player'};
    const seedIds=[player.id,player.user_id,player.guest_id,player.cup_player_id,player.round_player_id].filter(Boolean).map(normaliseId);
    const expandedIds=new Set(seedIds);
    const playerName=String(player.display_name||player.name||'').trim().toLowerCase();
    const pool=[player,...(allRoundPlayers||[]),...((round&&round._cupDayAllPlayers)||[]),...(players||[])].filter(Boolean);
    const isNameMatch=candidate=>{
      const candidateName=String(candidate.display_name||candidate.name||'').trim().toLowerCase();
      return !!playerName&&!!candidateName&&candidateName===playerName;
    };
    const firstMatches=pool.filter(candidate=>{
      if(!candidate)return false;
      const candidateIds=[candidate.id,candidate.user_id,candidate.guest_id,candidate.cup_player_id,candidate.round_player_id].filter(Boolean).map(normaliseId);
      return (seedIds.length&&candidateIds.some(id=>expandedIds.has(id)))||isNameMatch(candidate);
    });
    firstMatches.forEach(candidate=>[candidate.id,candidate.user_id,candidate.guest_id,candidate.cup_player_id,candidate.round_player_id].filter(Boolean).forEach(id=>expandedIds.add(normaliseId(id))));
    const matches=pool.filter(candidate=>{
      const candidateIds=[candidate.id,candidate.user_id,candidate.guest_id,candidate.cup_player_id,candidate.round_player_id].filter(Boolean).map(normaliseId);
      return candidateIds.some(id=>expandedIds.has(id))||isNameMatch(candidate);
    });
    const source=matches.find(candidate=>userAvatarImage(candidate))||matches[0]||{};
    return {
      ...source,
      ...player,
      display_name:player.display_name||player.name||source.display_name||source.name||'Player',
      name:player.name||player.display_name||source.name||source.display_name||'Player',
      avatar_image:player.avatar_image||source.avatar_image,
      avatar_url:player.avatar_url||source.avatar_url
    };
  }
  function ScorecardPlayerBadge({player,size=30,compact=false,align='center',showHcp=false}){
    const profile=scorecardPlayerProfile(player);
    const name=gameFirstName(profile.display_name||profile.name||'?');
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:align==='left'?'flex-start':'center',gap:compact?5:7,minWidth:0}}>
        <Avatar user={profile} size={size}/>
        <div style={{minWidth:0,textAlign:align==='left'?'left':'center'}}>
          <div style={{fontSize:compact?11:13,color:'#fff',fontWeight:900,lineHeight:1.05,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</div>
          {showHcp&&<div style={{fontSize:9,color:'#90ccf0',fontWeight:800,lineHeight:1.1,marginTop:2}}>HCP {playingHcps[player.id]||0}</div>}
        </div>
      </div>
    );
  }

  // Determine if current user can edit.
  // Cup scorecards are locked to the signed-in player actually assigned to this scorecard.
  // Do not let any logged-in Cup user edit every Cup group.
  const playerIds=(activeScoreGroup&&activeScoreGroup.player_ids)||grpPlayers.map(p=>p.id);
  const currentUserKey=currentUser&&normaliseId(currentUser.id);
  const currentUserNameKey=currentUser&&String(currentUser.display_name||currentUser.name||currentUser.username||'').trim().toLowerCase();
  const currentUserFirstNameKey=currentUserNameKey&&currentUserNameKey.split(/\s+/)[0];
  const isFoursomesScorecard=!!(
    (round._matchplay&&round._matchplay.enabled&&round._matchplay.mode==='foursomes')||
    (activeScoreGroup&&activeScoreGroup._foursomesFallback)
  );
  const currentUserIsAssignedToGroup=!!currentUserKey&&(
    playerIds.some(id=>normaliseId(id)===currentUserKey)||
    grpPlayers.some(p=>[p.id,p.user_id,p.guest_id,p.cup_player_id,p.round_player_id].filter(Boolean).some(id=>normaliseId(id)===currentUserKey))||
    (isFoursomesScorecard&&!round._spectator)||
    (round._cupScoring&&!!currentUserNameKey&&grpPlayers.some(p=>{const nm=String(p.display_name||p.name||'').trim().toLowerCase();return nm===currentUserNameKey||(currentUserFirstNameKey&&nm.split(/\s+/)[0]===currentUserFirstNameKey);}))
  );
  const cupDayOpenForScoring=!round._cupScoring||round._cupDayReleased!==false;
  const canEdit=activeGroupId!=='leaderboard'&&!round._spectator&&isLiveRound(round)&&currentUserIsAssignedToGroup&&cupDayOpenForScoring;
  const canSettleSweepstakeLeagueBalance=!round._spectator&&currentUserIsAssignedToGroup;
  const isJoinedDaySweepstake=!!(dayCompKeyFromRound(round)&&!isDayCompBoardRound(round));
  const isCupSpectatorScorecard=!!(round._cupScoring&&(round._spectator||!canEdit));
  const localFoursomesSyncRef=useRef('');

  const[saving,setSaving]=useState(false);
  const[cloudStatus,setCloudStatus]=useState('');
  const[cloudError,setCloudError]=useState('');
  const[refreshing,setRefreshing]=useState(false);
  const[lastRefreshed,setLastRefreshed]=useState('');
  const[showReview,setShowReview]=useState(false);
  const[showEnd,setShowEnd]=useState(false);
  const[endStep,setEndStep]=useState(0);
  const[inputHole,setInputHole]=useState(null);
  const[inputVal,setInputVal]=useState('');
  const[showOverall,setShowOverall]=useState(false);
  const[snakeMarks,setSnakeMarks]=useState({});
  const snakeMarksRef=useRef({});
  const[overallPlayers,setOverallPlayers]=useState([]);
  const[overallScores,setOverallScores]=useState([]);
  const[cloudScoreRows,setCloudScoreRows]=useState([...(scores||[]),...((round&&round._extraScores)||[])]);
  const[overallMode,setOverallMode]=useState('round');
  const[overallRefreshNote,setOverallRefreshNote]=useState('');
  const[cupOverallRoundPlayers,setCupOverallRoundPlayers]=useState([]);
  const initialScoreRows=[...(scores||[]),...((round&&round._extraScores)||[])];
  const[sweepstakeConfig,setSweepstakeConfig]=useState(sweepstakeConfigFromRows(initialScoreRows,round));
  const[matchplayConfig,setMatchplayConfig]=useState(matchplayConfigFromRows(initialScoreRows,round,group));
  const[showSweepstake,setShowSweepstake]=useState(false);
  const[scorecardNotificationsOff,setScorecardNotificationsOff]=useState(()=>scorecardNotificationsMuted(round&&round.id));
  const[foursomesAutoFinished,setFoursomesAutoFinished]=useState(false);
  const[leagueSubmitData,setLeagueSubmitData]=useState(null);
  const[leagueSubmitLoading,setLeagueSubmitLoading]=useState(false);
  const[leagueSubmitSubmitting,setLeagueSubmitSubmitting]=useState(false);
  const[leagueSubmitSelected,setLeagueSubmitSelected]=useState({});
  const[leagueSubmitNote,setLeagueSubmitNote]=useState('');
  const[leagueSubmitChoice,setLeagueSubmitChoice]=useState('');
  const[showLeagueSubmitPrompt,setShowLeagueSubmitPrompt]=useState(false);
  const[leagueSubmitLinks,setLeagueSubmitLinks]=useState({});
  const[leagueSubmitLinkCloud,setLeagueSubmitLinkCloud]=useState(true);
  const[leagueSubmitLinking,setLeagueSubmitLinking]=useState('');
  const[sweepstakeLeagueSettlement,setSweepstakeLeagueSettlement]=useState(null);
  const sweepstakeLeagueSettlementRef=useRef('');
  const leagueSubmitSubmittingRef=useRef(false);
  const foursomesNotifyStateRef=useRef(null);
  const suppressFoursomesNotifyRef=useRef(false);
  const foursomesAutoFinishRef=useRef('');
  const foursomesScoreEditRef=useRef(false);

  useEffect(()=>{
    setScorecardNotificationsOff(scorecardNotificationsMuted(round&&round.id));
    setFoursomesAutoFinished(false);
    foursomesNotifyStateRef.current=null;
    suppressFoursomesNotifyRef.current=false;
    foursomesAutoFinishRef.current='';
    foursomesScoreEditRef.current=false;
    syncMutedScorecardsToServiceWorker();
  },[round&&round.id]);

  function realCloudGroupForFoursomesSync(){
    return [activeScoreGroup,group,...(allGroups||[])].find(g=>g&&g.id&&g.id!=='foursomes'&&g.id!=='round_players'&&!g._foursomesFallback&&!g._roundPlayersFallback);
  }
  async function ensureFoursomesCloudGroup(){
    let cloudGroup=realCloudGroupForFoursomesSync();
    if(cloudGroup)return cloudGroup;
    try{
      const {data:grps}=await sb.from('cup_groups').select('*').eq('round_id',round.id).order('group_number',{ascending:true});
      cloudGroup=(grps||[])[0];
      if(cloudGroup){
        setAllGroups(prev=>[cloudGroup,...(prev||[]).filter(g=>normaliseId(g.id)!==normaliseId(cloudGroup.id))]);
        return cloudGroup;
      }
    }catch(e){}
    return null;
  }
  function visibleFoursomesScoreRows(){
    const rows=[];
    Object.keys(holeScores||{}).forEach(h=>{
      const holeNum=parseInt(h);
      if(!holeNum)return;
      Object.keys((holeScores||{})[h]||{}).forEach(pid=>{
        const cleanPid=canonicalFoursomesPlayerId(pid);
        const gross=(holeScores[h]||{})[pid];
        if(!isFoursomesTeamPlayerId(cleanPid)||!hasEnteredGross(gross))return;
        rows.push({round_id:round&&round.id,player_id:cleanPid,hole_number:holeNum,gross_score:gross,stableford_points:0,par:(getHole(holeNum).par||4),stroke_index:(getHole(holeNum).stroke_index||holeNum)});
      });
    });
    return rows;
  }
  function foursomesRowsToSync(){
    const byKey={};
    [...localFoursomesScoreRowsForRound(round&&round.id),...visibleFoursomesScoreRows()].forEach(r=>{
      if(!r||!r.round_id||!r.player_id||!r.hole_number)return;
      byKey[normaliseId(r.player_id)+'_'+r.hole_number]={...r,player_id:canonicalFoursomesPlayerId(r.player_id),stableford_points:0};
    });
    return Object.values(byKey);
  }
  async function syncLocalFoursomesScoresToCloud(reason){
    if(!round||!round.id||!canEdit||!isFoursomesScorecard)return;
    const rows=foursomesRowsToSync();
    if(!rows.length)return;
    const sig=rows.map(r=>[r.hole_number,r.player_id,r.gross_score].join(':')).sort().join('|');
    if(localFoursomesSyncRef.current===sig)return;
    localFoursomesSyncRef.current=sig;
    const cloudGroup=await ensureFoursomesCloudGroup();
    if(!cloudGroup){
      localFoursomesSyncRef.current='';
      console.warn('Foursomes local score replay found no cloud group',reason);
      return;
    }
    for(const row of rows){
      await saveFoursomesScoreToGroupMeta(sb,cloudGroup,row.hole_number,row.player_id,row.gross_score).catch(e=>{localFoursomesSyncRef.current='';console.warn('Foursomes group replay failed',e);});
    }
    setCloudScoreRows(prev=>{
      const byKey={};
      normaliseFoursomesScoreRows(prev||[]).forEach(r=>{byKey[normaliseId(r.player_id)+'_'+r.hole_number]=r;});
      rows.forEach(r=>{byKey[normaliseId(r.player_id)+'_'+r.hole_number]=r;});
      return Object.values(byKey);
    });
  }

  useEffect(()=>{
    if(round&&round.id&&sweepstakeConfig&&sweepstakeConfig.enabled)saveLocalSweepstakeConfig(round.id,sweepstakeConfig);
  },[round&&round.id,sweepstakeConfig&&sweepstakeConfig.enabled,sweepstakeConfig&&sweepstakeConfig.amountPence,sweepstakeConfig&&sweepstakeConfig.scope]);

  function setSnakeMarksSafe(next){
    const clean=next&&typeof next==='object'?next:{};
    snakeMarksRef.current=clean;
    setSnakeMarks(clean);
    try{if(round&&round.id)localStorage.setItem('snake_marks_'+round.id,JSON.stringify(clean));}catch(e){}
  }
  function mergeSnakeMarksSafe(extra){
    if(!extra||typeof extra!=='object'||Object.keys(extra).length===0)return;
    const merged={...(snakeMarksRef.current||{}),...extra};
    setSnakeMarksSafe(merged);
  }
  function currentSnakeMarks(){
    return snakeMarksRef.current&&typeof snakeMarksRef.current==='object'?snakeMarksRef.current:(snakeMarks||{});
  }

    // ---------------------------------------------------------
  // Score loading / hydration
  // Local cache first, Supabase as authoritative source
  // ---------------------------------------------------------
  useEffect(()=>{
    if(!round||!round.id)return;
    // Load from localStorage first (instant)
    try{
      const local=JSON.parse(localStorage.getItem('scores_'+round.id)||'{}');
      if(Object.keys(local).length>0){
        setHoleScores(prev=>({...local,...prev}));
      }
    }catch(e){}
    try{
      const snakes=JSON.parse(localStorage.getItem('snake_marks_'+round.id)||'{}');
      setSnakeMarksSafe(snakes&&typeof snakes==='object'?snakes:{});
    }catch(e){setSnakeMarksSafe({});}
    // Then load from Supabase (authoritative)
    refreshScoresFromCloud(false);
  },[round&&round.id]);

  useEffect(()=>{
    if(!round||!round.id)return;
    let alive=true;
    async function loadRoundGroups(){
      try{
        const [{data:grps},{data:rps},{data:scs}]=await Promise.all([
          sb.from('cup_groups').select('*').eq('round_id',round.id).order('group_number',{ascending:true}),
          sb.from('cup_round_players').select('*').eq('round_id',round.id),
          sb.from('cup_scores').select('*').eq('round_id',round.id)
        ]);
        if(!alive)return;
        const cleanScores=normaliseFoursomesScoreRows(scs||[]);
        setCloudScoreRows(cleanScores);
        setSweepstakeConfig(sweepstakeConfigFromRows(cleanScores,round));
        setMatchplayConfig(matchplayConfigFromRows(cleanScores,round,activeScoreGroup||group));
        const initialParts=(group&&group.participants)||[];
        const byName={};initialParts.forEach(p=>{byName[String(p.display_name||p.name||'').trim().toLowerCase()]=p;});
        const people=(rps||[]).map((rp,idx)=>{
          const rowName=String(rp.display_name||'').trim();
          const original=byName[rowName.toLowerCase()]||(round._cupScoring&&rowName.toLowerCase()==='player'&&initialParts.length===(rps||[]).length?initialParts[idx]:{})||{};
          const stableId=original.cup_player_id||original.id||rp.id;
          const displayName=original.display_name||original.name||(rowName&&rowName!=='Player'?rowName:'Player');
          return {
            // Cup scorecards save against the stable Snyder Cup player id where possible.
            // The generated cup_round_players row is kept only as round_player_id metadata.
            id:stableId,
            name:displayName,
            display_name:displayName,
            current_handicap:rp.playing_handicap||0,
            handicap:rp.playing_handicap||0,
            playing_handicap:rp.playing_handicap||0,
            user_id:rp.user_id,
            guest_id:rp.guest_id,
            cup_player_id:original.cup_player_id||original.id||null,
            round_player_id:rp.id,
            is_host:rp.is_host
          };
        });
        const normalised=(grps&&grps.length?grps:[group]).filter(Boolean).map((g,idx)=>{
          const ids=(g.player_ids||[]).map(normaliseId);
          let parts=people.filter(p=>ids.includes(normaliseId(p.id))).map(p=>{
            const original=byName[String(p.display_name||p.name||'').trim().toLowerCase()]||{};
            return {...p,cup_player_id:original.cup_player_id||p.cup_player_id};
          });
          if(round._cupScoring&&(!parts.length||parts.some(p=>String(p.display_name||p.name||'')==='Player'))&&group&&group.participants&&group.participants.length){
            parts=group.participants;
          }
          const cupPlayerMap={};parts.forEach(p=>{if(p.cup_player_id)cupPlayerMap[normaliseId(p.cup_player_id)]=p.id;});
          return {...g,group_number:g.group_number||idx+1,participants:parts,player_ids:parts.length?parts.map(p=>p.id):g.player_ids,playing_handicaps:(group&&group.playing_handicaps)||g.playing_handicaps||{},_cupPlayerMap:cupPlayerMap};
        });
        let boardPeople=people;
        let boardScores=cleanScores;
        if(dayCompKeyFromRound(round)){
          const boardRoundIds=dayCompRoundsFor(rounds,round).map(r=>r&&r.id).filter(Boolean);
          if(boardRoundIds.length>1){
            const [{data:boardRps},{data:boardScs}]=await Promise.all([
              sb.from('cup_round_players').select('*').in('round_id',boardRoundIds),
              sb.from('cup_scores').select('*').in('round_id',boardRoundIds)
            ]);
            const byStableId={};
            (boardRps||[]).forEach(rp=>{
              const stableId=normaliseId(rp.user_id||rp.guest_id||rp.id);
              if(!stableId||byStableId[stableId])return;
              byStableId[stableId]={
                id:stableId,
                name:rp.display_name||'Player',
                display_name:rp.display_name||'Player',
                current_handicap:rp.playing_handicap||0,
                handicap:rp.playing_handicap||0,
                playing_handicap:rp.playing_handicap||0,
                user_id:rp.user_id,
                guest_id:rp.guest_id,
                round_player_id:rp.id,
                is_host:rp.is_host
              };
            });
            boardPeople=Object.values(byStableId);
            boardScores=normaliseFoursomesScoreRows(boardScs||[]);
          }
        }
        setSweepstakeConfig(sweepstakeConfigFromRows(boardScores,round));
        setAllRoundPlayers(boardPeople);
        setAllGroups(normalised);
        setOverallPlayers(boardPeople.map(p=>({id:p.id,name:p.display_name||p.name,playing_handicap:p.playing_handicap||0})));
        setOverallScores(boardScores.filter(r=>!isMetaScoreRow(r)));
        const initialSnakes=rowsToSnakeMarks(cleanScores);
        if(Object.keys(initialSnakes).length>0){
          mergeSnakeMarksSafe(initialSnakes);
        }
        const userGrp=normalised.find(g=>currentUser&&(g.player_ids||[]).some(id=>normaliseId(id)===normaliseId(currentUser.id)));
        if(userGrp)setActiveGroupId(userGrp.id);
        else if(!group||!group.id&&round._spectator)setActiveGroupId('leaderboard');
      }catch(e){/* keep current group if loading extra tabs fails */}
    }
    loadRoundGroups();
    return()=>{alive=false;};
  },[round&&round.id,currentUser&&currentUser.id]);

  useEffect(()=>{
    if(!round||!round.id)return;
    const nextCfg=matchplayConfigFromRows(cloudScoreRows&&cloudScoreRows.length?cloudScoreRows:(scores||[]),round,activeScoreGroup||group);
    setMatchplayConfig(prev=>preserveFoursomesTeamNames(nextCfg,prev));
  },[round&&round.id,activeScoreGroup&&activeScoreGroup.id,cloudScoreRows&&cloudScoreRows.length]);

  useEffect(()=>{
    syncLocalFoursomesScoresToCloud('scorecard-open');
  },[round&&round.id,canEdit,isFoursomesScorecard,activeGroupId,allGroups&&allGroups.length]);

  useEffect(()=>{
    if(!isFoursomesScorecard||!canEdit)return;
    const t=setTimeout(()=>syncLocalFoursomesScoresToCloud('visible-score-change'),700);
    return()=>clearTimeout(t);
  },[round&&round.id,canEdit,isFoursomesScorecard,JSON.stringify(holeScores||{})]);

  function preserveFoursomesTeamNames(next,prev=matchplayConfig){
    if(!next||next.mode!=='foursomes')return next;
    if(!prev||prev.mode!=='foursomes')return next;
    const prevA=String(prev.teamAName||'').trim();
    const prevB=String(prev.teamBName||'').trim();
    const nextA=String(next.teamAName||'').trim();
    const nextB=String(next.teamBName||'').trim();
    const keepA=prevA&&prevA!=='Team 1'&&(!nextA||nextA==='Team 1');
    const keepB=prevB&&prevB!=='Team 2'&&(!nextB||nextB==='Team 2');
    return {...next,teamAName:keepA?prevA:(next.teamAName||prevA||'Team 1'),teamBName:keepB?prevB:(next.teamBName||prevB||'Team 2')};
  }

  async function refreshScoresFromCloud(showMessage=true){
    if(!round||!round.id||refreshing)return;
    suppressFoursomesNotifyRef.current=true;
    setRefreshing(true);
    try{
      const [{data,error},{data:groupRows,error:groupError}]=await Promise.all([
        sb.from('cup_scores').select('*').eq('round_id',round.id),
        sb.from('cup_groups').select('*').eq('round_id',round.id).order('group_number',{ascending:true})
      ]);
      if(error)throw error;
      if(groupError)throw groupError;
      const rows=normaliseFoursomesScoreRows(data||[]);
      const groupMetaRows=(groupRows||[]).flatMap(g=>foursomesScoreRowsFromGroupMeta(round.id,g));
      const allScoreRows=normaliseFoursomesScoreRows([...rows,...groupMetaRows]);
      setCloudScoreRows(allScoreRows);
      const scoreRows=allScoreRows.filter(r=>!isMetaScoreRow(r));
      const snakeRows=rows.filter(isSnakeScoreRow);
      const m={};
      const scorePeople=(allRoundPlayers&&allRoundPlayers.length?allRoundPlayers:((group&&group.participants)||[]));
      scoreRows.forEach(s=>{
        if(!m[s.hole_number])m[s.hole_number]={};
        aliasesForSavedScoreId(canonicalFoursomesPlayerId(s.player_id),scorePeople).forEach(pid=>{m[s.hole_number][pid]=s.gross_score;});
      });
      const cloudSnakes=rowsToSnakeMarks(rows);
      let nextSweepstakeConfig=sweepstakeConfigFromRows(rows,round);
      if(dayCompKeyFromRound(round)&&(!nextSweepstakeConfig||!nextSweepstakeConfig.enabled)){
        try{
          const board=dayCompBoardFor(rounds,round);
          if(board&&board.id&&board.id!==round.id){
            const{data:boardRows}=await sb.from('cup_scores').select('*').eq('round_id',board.id);
            const boardCfg=sweepstakeConfigFromRows(boardRows||[],board);
            if(boardCfg&&boardCfg.enabled)nextSweepstakeConfig=boardCfg;
          }
        }catch(e){}
      }
      setSweepstakeConfig(nextSweepstakeConfig);
      const refreshedMatchplayConfig=matchplayConfigFromRows(allScoreRows,round,(groupRows&&groupRows[0])||activeScoreGroup||group);
      setMatchplayConfig(prev=>preserveFoursomesTeamNames(refreshedMatchplayConfig,prev));
      if(groupRows&&groupRows.length){
        setAllGroups(prev=>(groupRows||[]).map((g,idx)=>{
          const existing=(prev||[]).find(p=>normaliseId(p.id)===normaliseId(g.id))||{};
          return {...existing,...g,participants:existing.participants||[],player_ids:(existing.player_ids&&existing.player_ids.length?existing.player_ids:g.player_ids),playing_handicaps:g.playing_handicaps||existing.playing_handicaps||{},group_number:g.group_number||idx+1};
        }));
      }
      if(Object.keys(m).length>0){
        setHoleScores(prev=>({...prev,...m}));
        try{localStorage.setItem('scores_'+round.id,JSON.stringify(m));}catch(e){}
      }
      if(Object.keys(cloudSnakes).length>0){
        mergeSnakeMarksSafe(cloudSnakes);
      }
      // Keep the top leaderboard button in sync with the same refresh action.
      setOverallScores(scoreRows);
      const t=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
      setLastRefreshed(t);
      if(showMessage)flash('Scorecard refreshed');
    }catch(e){
      if(showMessage)flash('Refresh failed: '+(e.message||String(e)),'error');
    }finally{
      setRefreshing(false);
    }
  }

  useEffect(()=>{
    function onPullRefresh(e){
      if(e&&e.detail&&e.detail.view==='play')refreshScoresFromCloud(false);
    }
    window.addEventListener('snyderPullRefresh',onPullRefresh);
    return()=>window.removeEventListener('snyderPullRefresh',onPullRefresh);
  },[round&&round.id]);

  async function openOverallLeaderboard(openModal=true){
    try{
      const boardRounds=dayCompKeyFromRound(round)?dayCompRoundsFor(rounds,round):[round];
      const boardRoundIds=boardRounds.map(r=>r&&r.id).filter(Boolean);
      const [{data:rps,error:rpErr},{data:scs,error:scErr},{data:grps,error:gErr}]=await Promise.all([
        boardRoundIds.length>1?sb.from('cup_round_players').select('*').in('round_id',boardRoundIds):sb.from('cup_round_players').select('*').eq('round_id',round.id),
        boardRoundIds.length>1?sb.from('cup_scores').select('*').in('round_id',boardRoundIds):sb.from('cup_scores').select('*').eq('round_id',round.id),
        boardRoundIds.length>1?sb.from('cup_groups').select('*').in('round_id',boardRoundIds).order('group_number',{ascending:true}):sb.from('cup_groups').select('*').eq('round_id',round.id).order('group_number',{ascending:true})
      ]);
      if(rpErr)throw rpErr;
      if(scErr)throw scErr;
      if(gErr)throw gErr;
      const byStableId={};
      (rps||[]).forEach(rp=>{
        const stableId=normaliseId(rp.user_id||rp.guest_id||rp.id);
        if(!stableId||byStableId[stableId])return;
        byStableId[stableId]={
          id:stableId,
          name:rp.display_name||'Player',
          playing_handicap:rp.playing_handicap||0
        };
      });
      const groupsForBoard=(grps&&grps.length?grps:allGroups)||[];
      const wantedIds=new Set();
      if(dayCompKeyFromRound(round)){
        (rps||[]).forEach(rp=>wantedIds.add(normaliseId(rp.user_id||rp.guest_id||rp.id)));
        groupsForBoard.forEach(g=>(g.player_ids||[]).forEach(pid=>wantedIds.add(normaliseId(pid))));
      }else if(groupsForBoard.length>1){
        groupsForBoard.forEach(g=>(g.player_ids||[]).forEach(pid=>wantedIds.add(normaliseId(pid))));
      }else if(group&&group.player_ids&&group.player_ids.length){
        (group.player_ids||[]).forEach(pid=>wantedIds.add(normaliseId(pid)));
      }
      let players=Object.values(byStableId);
      if(wantedIds.size)players=players.filter(p=>wantedIds.has(normaliseId(p.id)));
      if(!players.length)players=(grpPlayers||[]).map(p=>({id:normaliseId(p.id),name:p.display_name||p.name||'Player',playing_handicap:p.playing_handicap||p.current_handicap||0}));
      setOverallPlayers(players);
      setOverallMode('round');
      setOverallScores((scs||[]).filter(r=>!isMetaScoreRow(r)));
      setOverallRefreshNote('Refreshed '+new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}));
      const boardSnakes=rowsToSnakeMarks(scs||[]);
      if(Object.keys(boardSnakes).length>0){
        mergeSnakeMarksSafe(boardSnakes);
      }
      if(openModal)setShowOverall(true);
    }catch(e){
      flash('Leaderboard failed: '+(e.message||String(e)),'error');
    }
  }
  function cupPlayerDisplayName(cp){
    return cleanCupStoredDisplayName((cp&&(cp.display_name||cp.name||cp.username||cp.full_name))||'Player');
  }

  function cupOverallBaseName(){
    const name=String((round&&round.name)||'');
    const m=name.match(/^(.*?)(?:\s+Day\s+\d+)/i);
    return (m&&m[1]&&m[1].trim())||'Synder Cup';
  }
  function cupOverallRounds(){
    const base=cupOverallBaseName();
    const list=(rounds||[]).filter(r=>{
      const n=String((r&&r.name)||'');
      return n.startsWith(base+' Day ')||n.startsWith('Synder Cup Day ');
    });
    if(!list.some(r=>r&&round&&r.id===round.id))list.push(round);
    const byDayGroup={};
    list.filter(r=>r&&r.id).forEach(r=>{
      const n=String(r.name||'');
      const m=n.match(/Day\s+(\d+)\s+Group\s+(\d+)/i);
      const key=m?(m[1]+'-'+m[2]):r.id;
      const existing=byDayGroup[key];
      const score=r.id===(round&&round.id)?3:(n.startsWith(base+' Day ')?2:1);
      const existingName=String(existing&&existing.name||'');
      const existingScore=existing&&existing.id===(round&&round.id)?3:(existingName.startsWith(base+' Day ')?2:1);
      if(!existing||score>=existingScore)byDayGroup[key]=r;
    });
    return Object.values(byDayGroup);
  }
  function cupOverallPlayerKeys(cp){
    return [cp&&cp.id,cp&&cp.user_id,cp&&cp.guest_id,cp&&cp.round_player_id,cp&&cp.cup_player_id].filter(Boolean).map(normaliseId);
  }
  function cupOverallPlayerIdForScoreRow(row){
    if(!row)return null;
    const rowPid=normaliseId(row.player_id);
    const dayPlayers=(round&&round._cupDayAllPlayers)||[];
    for(const cp of dayPlayers){
      if(cupOverallPlayerKeys(cp).includes(rowPid))return cp.id;
    }
    const rps=cupOverallRoundPlayers||[];
    const rp=(rps||[]).find(x=>x&&normaliseId(x.id)===rowPid&&(!row.round_id||x.round_id===row.round_id));
    if(rp){
      const rpName=String(rp.display_name||rp.name||'').trim().toLowerCase();
      const byName=dayPlayers.find(cp=>String(cupPlayerDisplayName(cp)).trim().toLowerCase()===rpName);
      if(byName)return byName.id;
    }
    const live=(grpPlayers||[]).find(gp=>[gp.id,gp.user_id,gp.guest_id,gp.round_player_id,gp.cup_player_id].filter(Boolean).map(normaliseId).includes(rowPid));
    if(live){
      const liveName=String(live.display_name||live.name||'').trim().toLowerCase();
      const byName=dayPlayers.find(cp=>String(cupPlayerDisplayName(cp)).trim().toLowerCase()===liveName);
      if(byName)return byName.id;
    }
    return null;
  }
  function cupOverallSinglesRows(){
    const dayPlayers=(round&&round._cupDayAllPlayers)||[];
    const rowsByCup={};
    dayPlayers.forEach(cp=>{rowsByCup[cp.id]={id:cp.id,name:cupPlayerDisplayName(cp),total:0,holes:0,_holes:new Set()};});
    const roundIdSet=new Set(cupOverallRounds().map(r=>r&&r.id).filter(Boolean));
    const put=(sc,sourceRoundId)=>{
      if(!sc||isMetaScoreRow(sc))return;
      const h=parseInt(sc.hole_number)||0;
      if(h<1||h>18)return;
      const cpId=cupOverallPlayerIdForScoreRow({...sc,round_id:sourceRoundId||sc.round_id});
      if(!cpId||!rowsByCup[cpId])return;
      const key=(sourceRoundId||sc.round_id||'live')+'_'+h;
      if(rowsByCup[cpId]._holes.has(key))return;
      rowsByCup[cpId]._holes.add(key);
      rowsByCup[cpId].holes+=1;
      rowsByCup[cpId].total+=stablefordPointsValue(sc.stableford_points);
    };
    (overallScores&&overallScores.length?overallScores:scores||[]).forEach(sc=>{
      if(sc&&roundIdSet.has(sc.round_id)&&(!round||sc.round_id!==round.id))put(sc,sc.round_id);
    });
    if(round&&round.id){
      (grpPlayers||[]).forEach(gp=>{
        for(let h=1;h<=holes.length;h++){
          const gross=(holeScores[h]||{})[gp.id];
          if(gross===undefined)continue;
          put({round_id:round.id,player_id:gp.id,hole_number:h,gross_score:gross,stableford_points:getPts(gross,h,gp.id)||0},round.id);
        }
      });
    }
    return Object.values(rowsByCup).map(r=>({...r,_holes:undefined})).sort(compareStablefordLeaderboardRows);
  }
  async function openCupOverallSummary(openModal=true){
    try{
      const cupRounds=cupOverallRounds();
      const ids=cupRounds.map(r=>r&&r.id).filter(Boolean);
      let scs=[];
      let rps=[];
      if(ids.length){
        const [{data:scoreData,error:scoreErr},{data:rpData,error:rpErr}]=await Promise.all([
          sb.from('cup_scores').select('*').in('round_id',ids),
          sb.from('cup_round_players').select('*').in('round_id',ids)
        ]);
        if(scoreErr)throw scoreErr;
        if(rpErr)throw rpErr;
        scs=(scoreData||[]).filter(r=>!isMetaScoreRow(r));
        rps=rpData||[];
      }
      setCupOverallRoundPlayers(rps);
      setOverallPlayers(((round&&round._cupDayAllPlayers)||[]).map(cp=>({id:cp.id,name:cupPlayerDisplayName(cp),playing_handicap:cp.handicap||0})));
      setOverallScores(scs);
      setOverallMode('cupOverall');
      setOverallRefreshNote('Refreshed '+new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}));
      if(openModal)setShowOverall(true);
    }catch(e){
      flash('Overall failed: '+(e.message||String(e)),'error');
    }
  }
  async function openCupDaySinglesLeaderboard(openModal=true){
    try{
      const dayPlayers=(round&&round._cupDayAllPlayers)||[];
      const dayRounds=(round&&round._cupDayRounds)||[];
      const dayRoundIds=dayRounds.map(r=>r&&r.id).filter(Boolean);
      const playersForBoard=dayPlayers.map(cp=>({
        id:cp.id,
        name:cupPlayerDisplayName(cp),
        playing_handicap:cp.handicap||0
      }));
      const rows=[];
      const cpByKey={};
      dayPlayers.forEach(cp=>{
        [cp.id,cp.user_id,cp.guest_id].filter(Boolean).forEach(id=>{cpByKey[normaliseId(id)]=cp.id;});
      });
      let dbScores=[];
      let dbRoundPlayers=[];
      if(dayRoundIds.length){
        const [{data:scs,error:scErr},{data:rps,error:rpErr}]=await Promise.all([
          sb.from('cup_scores').select('*').in('round_id',dayRoundIds),
          sb.from('cup_round_players').select('*').in('round_id',dayRoundIds)
        ]);
        if(scErr)throw scErr;
        if(rpErr)throw rpErr;
        dbScores=(scs||[]).filter(r=>!isMetaScoreRow(r));
        dbRoundPlayers=rps||[];
      }
      const rpToCup={};
      const byRoundName={};
      dayPlayers.forEach(cp=>{byRoundName[String(cupPlayerDisplayName(cp)).trim().toLowerCase()]=cp.id;});
      dbRoundPlayers.forEach(rp=>{
        const nameKey=String(rp.display_name||'').trim().toLowerCase();
        if(byRoundName[nameKey])rpToCup[normaliseId(rp.id)]=byRoundName[nameKey];
      });
      // Build the day singles rows through a single keyed map so refresh never double-counts.
      // The current group exists both in saved cup_scores and local holeScores after autosave;
      // without this, Group 1 could appear doubled after pressing Refresh.
      const rowByPlayerHole={};
      const putRow=(cpId,holeNumber,row)=>{
        if(!cpId||!holeNumber)return;
        rowByPlayerHole[normaliseId(cpId)+'-'+Number(holeNumber)]={...row,player_id:cpId,hole_number:Number(holeNumber)};
      };
      dbScores.filter(sc=>!isMetaScoreRow(sc)).forEach(sc=>{
        let cpId=cpByKey[normaliseId(sc.player_id)]||rpToCup[normaliseId(sc.player_id)];
        if(cpId)putRow(cpId,sc.hole_number,sc);
      });
      (grpPlayers||[]).forEach(gp=>{
        const keys=[gp.cup_player_id,gp.id,gp.user_id,gp.guest_id,gp.round_player_id].filter(Boolean).map(normaliseId);
        let cpId=null;
        for(const k of keys){if(cpByKey[k]){cpId=cpByKey[k];break;}}
        if(!cpId)return;
        for(let h=1;h<=holes.length;h++){
          const gross=(holeScores[h]||{})[gp.id];
          if(gross!==undefined)putRow(cpId,h,{player_id:cpId,hole_number:h,gross_score:gross,stableford_points:getPts(gross,h,gp.id)||0});
        }
      });
      rows.push(...Object.values(rowByPlayerHole));
      setOverallMode('cupDay');
      setOverallPlayers(playersForBoard);
      setOverallScores(rows);
      setOverallRefreshNote('Refreshed '+new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}));
      if(openModal)setShowOverall(true);
    }catch(e){
      flash('Singles leaderboard failed: '+(e.message||String(e)),'error');
    }
  }
  function overallLeaderboardRows(){
    const playerMap={};
    (overallPlayers.length?overallPlayers:grpPlayers).forEach(p=>{const key=normaliseId(p&&p.id); if(key&&!playerMap[key])playerMap[key]={...p,id:key};});
    (allGroups||[]).forEach((g,idx)=>{(g.player_ids||[]).forEach(pid=>{const key=normaliseId(pid); if(playerMap[key])playerMap[key]={...playerMap[key],groupNumber:g.group_number||idx+1};});});
    const scoreRows=(overallScores.length?overallScores.filter(r=>!isMetaScoreRow(r)):Object.keys(holeScores||{}).flatMap(h=>Object.keys(holeScores[h]||{}).map(pid=>{
      const gross=holeScores[h][pid];
      const hd=getHole(parseInt(h));
      const hcp=parseFloat(playingHcps[pid]||0);
      return {player_id:pid,hole_number:parseInt(h),gross_score:gross,stableford_points:(gross===-1||isGivenGross(gross))?0:calcStableford(gross,hd.par,hd.stroke_index,hcp)||0};
    })));
    const totals={}; const holesPlayed={}; const holePoints={};
    Object.keys(playerMap).forEach(pid=>{totals[pid]=0;holesPlayed[pid]=new Set();});
    const scoreByPlayerHole={};
    scoreRows.forEach((s,idx)=>{
      const pid=normaliseId(s.player_id);
      if(!pid)return;
      if(Object.keys(playerMap).length&&!playerMap[pid])return;
      const holeNum=Number(s.hole_number);
      if(!holeNum)return;
      scoreByPlayerHole[pid+'-'+holeNum]={...s,_pid:pid,_holeNum:holeNum,_idx:idx};
    });
    Object.values(scoreByPlayerHole).sort((a,b)=>(a._idx||0)-(b._idx||0)).forEach(s=>{
      const pid=s._pid;
      if(totals[pid]==null)totals[pid]=0;
      const points=stablefordPointsValue(s.stableford_points);
      totals[pid]+=points;
      if(!holesPlayed[pid])holesPlayed[pid]=new Set();
      const holeNum=s._holeNum;
      holesPlayed[pid].add(holeNum);
      if(!holePoints[pid])holePoints[pid]={};
      holePoints[pid][holeNum]=points;
    });
    return Object.keys(totals).map(pid=>({
      id:pid,
      name:(playerMap[pid]&&playerMap[pid].name)||'Player',
      groupNumber:(playerMap[pid]&&playerMap[pid].groupNumber)||1,
      total:totals[pid]||0,
      holes:holesPlayed[pid]?holesPlayed[pid].size:0,
      _holePoints:holePoints[pid]||{}
    })).sort(compareStablefordLeaderboardRows);
  }

  function activeCupLeader(){
    const dayPlayers=(round&&round._cupDayAllPlayers)||[];
    const dayRounds=(round&&round._cupDayRounds)||[];
    if(round&&round._cupScoring&&dayPlayers.length){
      const rows=dayPlayers.map(cp=>{
        const ids=[cp.id,cp.user_id,cp.guest_id].filter(Boolean).map(normaliseId);
        const name=((cp.display_name||cp.name||cp.username)||'Player').split(' ')[0];
        let total=0;
        const holesDone=new Set();
        // Current open group uses live local state so the bar moves instantly while scoring.
        (grpPlayers||[]).forEach(gp=>{
          const gpKeys=[gp.id,gp.cup_player_id,gp.user_id,gp.guest_id].filter(Boolean).map(normaliseId);
          if(!gpKeys.some(k=>ids.includes(k)))return;
          for(let h=1;h<=holes.length;h++){
            const g=(holeScores[h]||{})[gp.id];
            if(g!==undefined){total+=getPts(g,h,gp.id)||0;holesDone.add((round&&round.id||'current')+'-'+h);}
          }
        });
        // Other Cup groups for this day use the latest saved scores already loaded in appData.
        (scores||[]).filter(sc=>!isMetaScoreRow(sc)).forEach(sc=>{
          if(!dayRounds.some(r=>r&&r.id===sc.round_id))return;
          if(round&&sc.round_id===round.id)return; // avoid double counting current live group
          if(ids.includes(normaliseId(sc.player_id))){total+=stablefordPointsValue(sc.stableford_points);holesDone.add(sc.round_id+'-'+sc.hole_number);}
        });
        return{id:cp.id,name,total,holes:holesDone.size};
      }).sort(compareStablefordLeaderboardRows);
      return rows[0]||null;
    }
    const rows=(grpPlayers||[]).map(p=>({
      id:p.id,
      name:((p.name||p.display_name)||'Player').split(' ')[0],
      total:getRunning(p.id,holes.length),
      holes:Object.keys(holeScores||{}).filter(h=>(holeScores[h]||{})[p.id]!==undefined).length
    })).sort((a,b)=>(b.total||0)-(a.total||0)||(b.holes||0)-(a.holes||0)||String(a.name).localeCompare(String(b.name)));
    return rows[0]||null;
  }
  function participantIdForCupPlayer(cupId){
    const key=normaliseId(cupId);
    const mapped=activeScoreGroup&&activeScoreGroup._cupPlayerMap&&activeScoreGroup._cupPlayerMap[key];
    if(mapped)return mapped;
    const direct=(grpPlayers||[]).find(p=>normaliseId(p.cup_player_id)===key||normaliseId(p.id)===key||normaliseId(p.user_id)===key||normaliseId(p.guest_id)===key);
    return direct&&direct.id;
  }
  function participantForCupPlayer(cupId){
    const key=normaliseId(cupId);
    const pid=participantIdForCupPlayer(cupId);
    return (grpPlayers||[]).find(p=>normaliseId(p.id)===normaliseId(pid)||[p&&p.cup_player_id,p&&p.user_id,p&&p.guest_id,p&&p.round_player_id].filter(Boolean).some(id=>normaliseId(id)===key))||null;
  }
  function liveStablefordForCupPlayer(cupId){
    const pid=participantIdForCupPlayer(cupId);
    if(!pid)return 0;
    return getRunning(pid,holes.length)||0;
  }
  function liveNetScoreForCupPlayer(cupId,holeNum){
    const p=participantForCupPlayer(cupId);
    if(!p)return null;
    const map=holeScores[holeNum]||{};
    const gross=map[p.id]!==undefined?map[p.id]:map[normaliseId(p.id)];
    const g=grossScoreValue(gross);
    if(g<=0)return null;
    const hd=getHole(holeNum);
    const aliases=scoreAliasesForPerson(p).concat([cupId]).filter(Boolean);
    let hcp=null;
    for(const alias of aliases){
      if(playingHcps[alias]!=null&&playingHcps[alias]!==''){hcp=parseFloat(playingHcps[alias]);break;}
      const key=normaliseId(alias);
      if(playingHcps[key]!=null&&playingHcps[key]!==''){hcp=parseFloat(playingHcps[key]);break;}
    }
    if(hcp===null||Number.isNaN(hcp))hcp=parseFloat(p.playing_handicap??p.current_handicap??p.handicap??0)||0;
    return g-shotsOnHole(hcp,hd.stroke_index);
  }
  function doublesBestNet(ids,holeNum){
    const nets=(ids||[]).map(id=>liveNetScoreForCupPlayer(id,holeNum)).filter(v=>v!==null&&v!==undefined);
    return nets.length?Math.min(...nets):null;
  }
  function cupDoublesMatchState(match){
    if(!match||String(match.match_type||'').toLowerCase()!=='doubles')return null;
    const goldIds=match.gold_player_ids||[];
    const navyIds=match.navy_player_ids||[];
    const leftKey=cupSideTeamKey(goldIds);
    const rightKey=cupSideTeamKey(navyIds);
    let goldHoles=0,navyHoles=0,played=0,closedDiff=0,closedRemaining=0;
    for(let h=1;h<=holes.length;h++){
      const g=doublesBestNet(goldIds,h);
      const n=doublesBestNet(navyIds,h);
      if(g===null||n===null)continue;
      played++;
      if(g<n)goldHoles++; else if(n<g)navyHoles++;
      const runningDiff=Math.abs(goldHoles-navyHoles);
      const runningRemaining=Math.max(0,18-played);
      if(!closedDiff&&runningDiff>runningRemaining){closedDiff=runningDiff;closedRemaining=runningRemaining;}
    }
    const diff=Math.abs(goldHoles-navyHoles);
    const winner=goldHoles===navyHoles?'tie':goldHoles>navyHoles?leftKey:rightKey;
    const shortLabel=!played?'A/S':winner==='tie'?'A/S':formatMatchplayShortLabel(winner,closedDiff||diff,closedDiff?closedRemaining:0);
    const leftName=(goldIds||[]).map(id=>{const p=participantForCupPlayer(id);return gameFirstName((p&&(p.display_name||p.name))||getDisplayName(id)||'Player');}).filter(Boolean).join(' / ');
    const rightName=(navyIds||[]).map(id=>{const p=participantForCupPlayer(id);return gameFirstName((p&&(p.display_name||p.name))||getDisplayName(id)||'Player');}).filter(Boolean).join(' / ');
    const leaderName=winner===leftKey?leftName:winner===rightKey?rightName:'';
    const label=!played?'Not started':winner==='tie'?('A/S'+(played?' thru '+played:'')):leaderName+' '+shortLabel;
    return {gold:goldHoles,navy:navyHoles,played,winner,leftKey,rightKey,shortLabel,label,leftName,rightName};
  }
  function cupPlayerTeamKey(cupId){
    const key=normaliseId(cupId);
    const dayPlayers=(round&&round._cupDayAllPlayers)||[];
    const all=[...dayPlayers,...(grpPlayers||[])];
    const p=all.find(cp=>[cp&&cp.id,cp&&cp.user_id,cp&&cp.guest_id,cp&&cp.round_player_id,cp&&cp.cup_player_id].filter(Boolean).some(id=>normaliseId(id)===key));
    return (p&&p.team_key)||'gold';
  }
  function cupSideTeamKey(ids){
    const counts={};
    (ids||[]).forEach(id=>{const k=cupPlayerTeamKey(id);counts[k]=(counts[k]||0)+1;});
    return Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0]||'gold';
  }
  function completedHolesForPlayers(ids){
    let n=0;
    for(let h=1;h<=holes.length;h++){
      const map=holeScores[h]||{};
      if((ids||[]).every(id=>{const pid=participantIdForCupPlayer(id);return pid&&map[pid]!==undefined;}))n++;
    }
    return n;
  }
  function liveMatchLeader(match){
    if(!match)return 'tie';
    const goldIds=match.gold_player_ids||[];
    const navyIds=match.navy_player_ids||[];
    const leftKey=cupSideTeamKey(goldIds);
    const rightKey=cupSideTeamKey(navyIds);
    if(String(match.match_type||'').toLowerCase()==='doubles'){
      const state=cupDoublesMatchState(match);
      return state&&state.winner?state.winner:'tie';
    }
    const gold=goldIds.reduce((t,id)=>t+liveStablefordForCupPlayer(id),0);
    const navy=navyIds.reduce((t,id)=>t+liveStablefordForCupPlayer(id),0);
    const holesDone=completedHolesForPlayers([...goldIds,...navyIds]);
    if(!holesDone)return 'tie';
    return gold>navy?leftKey:navy>gold?rightKey:'tie';
  }
  function savedCupScoreRowFor(rd,cupId,holeNum){
    const p=[...(round&&round._cupDayAllPlayers||[]),...(grpPlayers||[])].find(cp=>scoreAliasesForPerson(cp).some(id=>normaliseId(id)===normaliseId(cupId)))||{id:cupId};
    const keys=scoreAliasesForPerson(p).concat([cupId]).filter(Boolean).map(normaliseId);
    const row=(scores||[]).find(sc=>rd&&sc.round_id===rd.id&&parseInt(sc.hole_number)===parseInt(holeNum)&&keys.includes(normaliseId(sc.player_id)));
    return row||null;
  }
  function savedCupPointFor(rd,cupId,holeNum){
    const row=savedCupScoreRowFor(rd,cupId,holeNum);
    return row?stablefordPointsValue(row.stableford_points):null;
  }
  function savedCupNetFor(rd,cupId,holeNum){
    const row=savedCupScoreRowFor(rd,cupId,holeNum);
    const p=[...(round&&round._cupDayAllPlayers||[]),...(grpPlayers||[])].find(cp=>scoreAliasesForPerson(cp).some(id=>normaliseId(id)===normaliseId(cupId)))||{id:cupId};
    const g=grossScoreValue(row&&row.gross_score);
    if(!row||g<=0)return null;
    const hd=getHole(holeNum);
    const rdGroup=(allGroups||[]).find(g=>g&&rd&&g.round_id===rd.id);
    const hmap=(rdGroup&&rdGroup.playing_handicaps)||{};
    const aliases=scoreAliasesForPerson(p).concat([cupId]).filter(Boolean);
    let hcp=null;
    for(const alias of aliases){
      if(hmap[alias]!=null&&hmap[alias]!==''&&!Number.isNaN(parseFloat(hmap[alias]))){hcp=parseFloat(hmap[alias]);break;}
      const key=normaliseId(alias);
      if(hmap[key]!=null&&hmap[key]!==''&&!Number.isNaN(parseFloat(hmap[key]))){hcp=parseFloat(hmap[key]);break;}
    }
    if(hcp===null||Number.isNaN(hcp)){
      const baseHcp=(p.playing_handicap!=null&&p.playing_handicap!==''&&parseFloat(p.playing_handicap)>0)?parseFloat(p.playing_handicap):calcPlayingHandicap(parseFloat(p.handicap??p.eg_handicap??p.current_handicap??0)||0,course,1);
      hcp=parseFloat(baseHcp)||0;
    }
    return g-shotsOnHole(hcp,hd.stroke_index);
  }
  function savedStablefordForCupPlayer(rd,cupId){
    if(!rd||!cupId)return 0;
    let total=0;
    for(let h=1;h<=holes.length;h++){
      const row=savedCupScoreRowFor(rd,cupId,h);
      if(row)total+=stablefordPointsValue(row.stableford_points);
    }
    return total;
  }
  function savedMatchLeader(match,rd){
    if(!match||!rd)return 'tie';
    const goldIds=match.gold_player_ids||[];
    const navyIds=match.navy_player_ids||[];
    const leftKey=cupSideTeamKey(goldIds);
    const rightKey=cupSideTeamKey(navyIds);
    if(String(match.match_type||'').toLowerCase()==='doubles'){
      let goldHoles=0,navyHoles=0;
      for(let h=1;h<=holes.length;h++){
        const goldNets=goldIds.map(id=>savedCupNetFor(rd,id,h)).filter(v=>v!==null&&v!==undefined);
        const navyNets=navyIds.map(id=>savedCupNetFor(rd,id,h)).filter(v=>v!==null&&v!==undefined);
        if(!goldNets.length||!navyNets.length)continue;
        const g=Math.min(...goldNets);
        const n=Math.min(...navyNets);
        if(g<n)goldHoles++; else if(n<g)navyHoles++;
      }
      return goldHoles>navyHoles?leftKey:navyHoles>goldHoles?rightKey:'tie';
    }
    const gold=goldIds.reduce((t,id)=>t+savedStablefordForCupPlayer(rd,id),0);
    const navy=navyIds.reduce((t,id)=>t+savedStablefordForCupPlayer(rd,id),0);
    return gold>navy?leftKey:navy>gold?rightKey:'tie';
  }
  function liveCupProjectedScore(){
    const dayGroups=(round&&round._cupDayGroups)||[];
    const groupData=round&&round._cupGroupData;
    const groupsToUse=dayGroups.length?dayGroups:[groupData].filter(Boolean);
    if(!groupsToUse.length)return null;
    const projected={gold:0,navy:0,red:0};
    groupsToUse.forEach(g=>{
      const rd=(round&&round._cupDayRounds||[]).find(r=>parseInt(r.day_number||g.day||1)===parseInt(g.day||1)&&String(r.name||'').includes('Group '+(g.idx||1)));
      [g&&g.doubles,...((g&&g.singles)||[])].filter(Boolean).filter(isCupTeamScoringMatch).forEach(m=>{
        const isCurrent=groupData&&parseInt(groupData.idx||1)===parseInt(g.idx||1)&&parseInt(groupData.day||1)===parseInt(g.day||1);
        const leader=isCurrent?liveMatchLeader(m):savedMatchLeader(m,rd);
        const leftKey=cupSideTeamKey(m.gold_player_ids||[]);
        const rightKey=cupSideTeamKey(m.navy_player_ids||[]);
        if(leader==='tie'){projected[leftKey]=(projected[leftKey]||0)+0.5;projected[rightKey]=(projected[rightKey]||0)+0.5;}
        else projected[leader]=(projected[leader]||0)+1;
      });
    });
    const teamNames=round&&round._cupTeams||{};
    return CUP_TEAM_KEYS.reduce((acc,k)=>({...acc,[k]:projected[k]||0,[k+'Name']:(teamNames[k]&&teamNames[k].name)||CUP_THEME[k].name}),{});
  }
  function actualCupTeamScore(){
    const summary=round&&round._cupSummary;
    const teamNames=round&&round._cupTeams||{};
    return CUP_TEAM_KEYS.reduce((acc,k)=>({...acc,[k]:summary&&Number.isFinite(parseFloat(summary[k]))?parseFloat(summary[k]):0,[k+'Name']:(summary&&summary[k+'Name'])||(teamNames[k]&&teamNames[k].name)||CUP_THEME[k].name}),{});
  }
  function cupIfItStaysScore(){
    const actual=actualCupTeamScore();
    const projected=liveCupProjectedScore();
    if(!projected)return actual;
    return CUP_TEAM_KEYS.reduce((acc,k)=>({...acc,[k]:(parseFloat(actual[k])||0)+(parseFloat(projected[k])||0),[k+'Name']:actual[k+'Name']||projected[k+'Name']||CUP_THEME[k].name,['actual'+k.charAt(0).toUpperCase()+k.slice(1)]:parseFloat(actual[k])||0,['projected'+k.charAt(0).toUpperCase()+k.slice(1)]:parseFloat(projected[k])||0}),{});
  }
  function fmtCupPoint(v){
    const n=parseFloat(v)||0;
    return Number.isInteger(n)?String(n):String(n).replace(/\.0$/,'');
  }
  function cupGroupScoreLabel(){
    const s=actualCupTeamScore();
    return CUP_TEAM_KEYS.map(k=>(s[k+'Name']||CUP_THEME[k].name)+' '+fmtCupPoint(s[k]||0)).join(' · ');
  }
  function cupProjectedScoreLabel(){
    const s=liveCupProjectedScore();
    if(!s)return 'Projected score';
    return CUP_TEAM_KEYS.map(k=>(s[k+'Name']||CUP_THEME[k].name)+' '+fmtCupPoint(s[k]||0)).join(' · ');
  }
  function cupProjectedLeader(){
    const s=liveCupProjectedScore();
    if(!s)return 'tie';
    const leader=CUP_TEAM_KEYS.reduce((best,k)=>(parseFloat(s[k])||0)>(parseFloat(s[best])||0)?k:best,'gold');
    const tied=CUP_TEAM_KEYS.filter(k=>(parseFloat(s[k])||0)===(parseFloat(s[leader])||0));
    return tied.length===1?leader:'tie';
  }
  function cupProjectedBg(){
    const lead=cupProjectedLeader();
    if(lead==='gold')return 'linear-gradient(135deg,rgba(212,175,55,0.96),rgba(146,96,10,0.95))';
    if(lead==='navy')return 'linear-gradient(135deg,rgba(11,31,77,0.98),rgba(0,112,187,0.92))';
    if(lead==='red')return 'linear-gradient(135deg,rgba(220,38,38,0.96),rgba(127,29,29,0.94))';
    return 'linear-gradient(135deg,rgba(212,175,55,0.38),rgba(37,99,235,0.36),rgba(220,38,38,0.32))';
  }
  function getHole(n){return holes.find(h=>h.hole===n)||{hole:n,par:4,stroke_index:n,yards:0};}
  function checkSkipped(targetHole){
    for(let h=1;h<targetHole;h++){
      const allScored=grpPlayers.every(p=>(holeScores[h]||{})[p.id]!==undefined);
      if(!allScored)return h;
    }
    return null;
  }

    // ---------------------------------------------------------
  // Score autosave
  // Persists each hole score locally and remotely
  // ---------------------------------------------------------
  function snakeGroupKey(){
    return normaliseId((activeScoreGroup&&activeScoreGroup.id)||activeGroupId||'default');
  }

  function snakeHolderFromGroupMarks(marks,holeNum){
    let holder=null;
    Object.keys(marks||{}).map(Number).filter(h=>h<=holeNum).sort((a,b)=>a-b).forEach(h=>{
      if(marks[h])holder=marks[h];
    });
    return holder;
  }

  function getSnakeStarter(holeNum){
    const groupKey=snakeGroupKey();
    const groups=currentSnakeMarks()||{};
    const marks=(groups&&groups[groupKey])||{};
    return snakeHolderFromGroupMarks(marks,holeNum);
  }

  function snakeHolderForHole(holeNum){
    const activeHolder=getSnakeStarter(holeNum);
    if(activeHolder)return activeHolder;
    const groups=currentSnakeMarks()||{};
    const holders=Object.keys(groups).map(k=>snakeHolderFromGroupMarks(groups[k],holeNum)).filter(Boolean);
    return holders[0]||null;
  }

  function isSnakeHolder(holeNum,pid){
    const id=normaliseId(pid);
    const holder=snakeHolderForHole(holeNum);
    return !!holder&&normaliseId(holder)===id;
  }

  function scoreRowHasSnake(holeNum,pid){
    const id=normaliseId(pid);
    const sources=[overallScores, scores].filter(Array.isArray);
    for(const list of sources){
      if((list||[]).some(row=>
        !isMetaScoreRow(row) &&
        Number(row&&row.hole_number)===Number(holeNum) &&
        normaliseId(row&&row.player_id)===id &&
        rowHasSnakeFlag(row)
      ))return true;
    }
    return false;
  }

  async function saveSnakeMarkToCloud(groupKey,holeNum,pid,checked=true){
    if(!round||!round.id||!groupKey||!holeNum)return;
    try{
      const likeKey=SNAKE_SCORE_PREFIX+encodeURIComponent(normaliseId(groupKey))+'|%';
      await sb.from('cup_scores')
        .delete()
        .eq('round_id',round.id)
        .eq('hole_number',holeNum)
        .like('player_id',likeKey);
      if(checked&&pid){
        await saveScoreRowToCloud(sb,{
          round_id:round.id,
          player_id:makeSnakeScorePlayerId(groupKey,pid),
          hole_number:holeNum,
          gross_score:1,
          stableford_points:0,
          par:4,
          stroke_index:1
        });
      }
    }catch(e){
      // Snake is decorative; never block score entry if cloud marker save fails.
    }
  }

  async function saveSnakeFlagsForHole(holeNum,pid,checked=true){
    try{
      const hd=getHole(holeNum);
      for(const player of grpPlayers){
        const rowPid=player&&player.id;
        const gross=(holeScores&&holeScores[holeNum]||{})[rowPid];
        if(!rowPid||!hasEnteredGross(gross))continue;
        const hcp=parseFloat(playingHcps[rowPid]!=null?playingHcps[rowPid]:(player&&player.current_handicap)||0);
        const pts=(gross===-1||isGivenGross(gross))?0:calcStableford(gross,hd.par,hd.stroke_index,hcp)||0;
        const shouldFlag=checked&&normaliseId(rowPid)===normaliseId(pid);
        await saveScoreRowToCloud(sb,{
          round_id:round.id,
          player_id:rowPid,
          hole_number:holeNum,
          gross_score:gross,
          stableford_points:stablefordPointsWithSnake(pts,shouldFlag),
          par:hd.par,
          stroke_index:hd.stroke_index
        });
      }
    }catch(e){/* never block the scorecard for a decorative marker */}
  }

  async function setSnakeFromHole(holeNum,pid,checked=true){
    const groupKey=snakeGroupKey();
    const next={...(currentSnakeMarks()||{})};
    const groupMarks={...((next[groupKey])||{})};
    if(checked)groupMarks[holeNum]=pid;
    else if(normaliseId(groupMarks[holeNum])===normaliseId(pid))delete groupMarks[holeNum];
    next[groupKey]=groupMarks;
    setSnakeMarksSafe(next);
    await Promise.allSettled([
      saveSnakeMarkToCloud(groupKey,holeNum,pid,checked),
      saveSnakeFlagsForHole(holeNum,pid,checked)
    ]);
    if(checked&&pid){
      const name=notifyPlayerName(pid);
      const res=await sendSnyderLiveNotification('snake_changed',{...notifyPayload(),roundId:round&&round.id,groupId:groupKey,hole:holeNum,playerId:pid,title:'🐍 '+name+' has the snake!',body:notifyHoleOrdinal(holeNum)+' hole · '+notifyRoundName(),playerName:name,roundName:notifyRoundName()});
      if(res&&!res.ok)console.warn('Snyder Live snake notification failed',res);
    }
  }

  function saveLocalScore(holeNum,pid,val){
    try{
      const key='scores_'+round.id;
      const existing=JSON.parse(localStorage.getItem(key)||'{}');
      if(!existing[holeNum])existing[holeNum]={};
      if(val===undefined||val===null||val==='')delete existing[holeNum][pid];
      else existing[holeNum][pid]=val;
      if(Object.keys(existing[holeNum]).length===0)delete existing[holeNum];
      localStorage.setItem(key,JSON.stringify(existing));
    }catch(e){}
  }

  function buildScoreRow(holeNum,pid,gross){
    const hd=getHole(holeNum);
    const hcp=parseFloat(playingHcps[pid]!=null?playingHcps[pid]:(grpPlayers.find(p=>p.id===pid)||{}).current_handicap||0);
    const pts=(gross===-1||isGivenGross(gross))?0:calcStableford(gross,hd.par,hd.stroke_index,hcp)||0;
    const flaggedPts=stablefordPointsWithSnake(pts,isSnakeHolder(holeNum,pid));
    return {
      round_id:round.id,player_id:pid,hole_number:holeNum,
      gross_score:gross,stableford_points:flaggedPts,par:hd.par,stroke_index:hd.stroke_index,
    };
  }

  function currentNotifyExcludeIds(){
    // Only exclude the signed-in scorer/device that is creating the event.
    // Do not exclude every player in the group, otherwise spectators/players miss birdie, snake and finish alerts.
    const ids=[];
    if(currentUser&&currentUser.id)ids.push(currentUser.id);
    return Array.from(new Set(ids.filter(Boolean).map(String)));
  }
  function notifyPayload(){
    return {excludeUserIds:[],mutedRoundIds:mutedScorecardNotificationIds()};
  }

  function notifyPlayerName(pid){
    const player=grpPlayers.find(p=>normaliseId(p.id)===normaliseId(pid));
    return ((player&&(player.display_name||player.name))||'Player').split(' ')[0];
  }
  function notifyRoundName(){
    return dayCompKeyFromRound(round)?dayCompDisplayName(rounds,round):roundDisplayName(round);
  }
  function notifyGroupName(){
    const realGroups=(allGroups||[]).filter(g=>g&&g.id&&!g._foursomesFallback&&!g._roundPlayersFallback);
    if(realGroups.length<=1)return '';
    const n=(activeScoreGroup&&activeScoreGroup.group_number)||(group&&group.group_number)||null;
    return n?('Group '+groupLetter(n)):'';
  }
  function notifyHoleOrdinal(holeNum){
    const n=parseInt(holeNum,10)||0;
    const suffix=(n%100>=11&&n%100<=13)?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th');
    return n+suffix;
  }
  function notifyGrossFromScores(player,holeNum,scoreMap){
    const row=(scoreMap&&scoreMap[holeNum])||{};
    const aliases=scoreAliasesForPerson(player).concat([player&&player.id,normaliseId(player&&player.id)]).filter(Boolean);
    for(const alias of aliases){
      if(row[alias]!==undefined)return row[alias];
      const key=normaliseId(alias);
      if(row[key]!==undefined)return row[key];
    }
    return undefined;
  }
  function notifyStablefordTotalFromScores(player,holeList,scoreMap){
    return (holeList||[]).reduce((t,h)=>{
      const live=notifyGrossFromScores(player,h.hole,scoreMap);
      if(live===undefined)return t;
      if(live===-1||isGivenGross(live))return t;
      const hcp=parseFloat(playingHcps[player.id]!=null?playingHcps[player.id]:(player.current_handicap||player.playing_handicap||0));
      return t+(calcStableford(live,h.par,h.stroke_index,hcp)||0);
    },0);
  }
  function notifyScoresForHoles(holeList,scoreMap){
    return grpPlayers.map(p=>{
      const pts=scoreMap?notifyStablefordTotalFromScores(p,holeList,scoreMap):getStablefordTotal(p.id,holeList);
      return notifyPlayerName(p.id)+' '+pts+' pts';
    }).join(' · ');
  }
  async function notifyMaybeBirdie(holeNum,pid,gross){
    if(!hasEnteredGross(gross)||gross<1)return {ok:true,skipped:true};
    const hd=getHole(holeNum);
    if(Number(gross)===Number(hd.par)-1){
      const name=notifyPlayerName(pid);
      const payload={...notifyPayload(),roundId:round&&round.id,groupId:snakeGroupKey(),hole:holeNum,playerId:pid,title:'🐦 '+name+' birdied '+notifyHoleOrdinal(holeNum)+'!',body:'🔥 What a dart · '+notifyRoundName()+(notifyGroupName()?' · '+notifyGroupName():''),playerName:name,roundName:notifyRoundName()};
      if(snyderNotifyAlreadyStored('birdie',payload))return {ok:true,skipped:true};
      const res=await sendSnyderLiveNotification('birdie',payload);
      if(res&&res.ok)storeSnyderNotifySent('birdie',payload);
      if(res&&!res.ok)console.warn('Snyder Live birdie notification failed',res);
      return res;
    }
    return {ok:true,skipped:true};
  }
  async function notifyFrontNineIfComplete(updatedScores){
    const allFront9=Array.from({length:9},(_,i)=>i+1).every(h=>grpPlayers.every(p=>notifyGrossFromScores(p,h,updatedScores)!==undefined));
    if(!allFront9)return {ok:true,skipped:true};
    const frontHoles=holes.filter(h=>h.hole<=9);
    const res=await sendSnyderLiveNotification('front9_scores',{...notifyPayload(),roundId:round&&round.id,groupId:snakeGroupKey(),hole:9,status:'front9-complete',title:'📊 Front 9 is in!',body:notifyScoresForHoles(frontHoles,updatedScores),roundName:notifyRoundName(),groupName:notifyGroupName()});
    if(res&&!res.ok)console.warn('Snyder Live front 9 notification failed',res);
    return res;
  }
  async function notifyFinishedScores(){
    const allHoles=holes.filter(h=>h.hole>=1&&h.hole<=18);
    const res=await sendSnyderLiveNotification('round_finished_scores',{...notifyPayload(),roundId:round&&round.id,groupId:snakeGroupKey(),hole:18,status:'round-finished',title:'🏁 Final scores are in!',body:notifyScoresForHoles(allHoles),roundName:notifyRoundName(),groupName:notifyGroupName()});
    if(res&&!res.ok)console.warn('Snyder Live finished-round notification failed',res);
    return res;
  }

  function foursomesNotifyStorageKey(type,status){
    return ['foursomesNotify',round&&round.id,snakeGroupKey(),type,status].filter(Boolean).join('|');
  }
  function foursomesNotifyAlreadySent(type,status){
    try{return localStorage.getItem(foursomesNotifyStorageKey(type,status))==='1';}catch(e){return false;}
  }
  function markFoursomesNotifySent(type,status){
    try{localStorage.setItem(foursomesNotifyStorageKey(type,status),'1');}catch(e){}
  }
  async function sendFoursomesMatchNotification(type,status,title,body,extra={}){
    if(!round||!round.id||!status||foursomesNotifyAlreadySent(type,status))return {ok:true,skipped:true};
    markFoursomesNotifySent(type,status);
    const res=await sendSnyderLiveNotification(type,{...notifyPayload(),roundId:round.id,groupId:snakeGroupKey(),status,title,body,roundName:notifyRoundName(),groupName:notifyGroupName(),...(extra||{})});
    if(res&&!res.ok)console.warn('Snyder Live foursomes notification failed',type,res);
    return res;
  }
  function foursomesWinningStreak(rows){
    const last3=(rows||[]).slice(-3);
    if(last3.length<3||last3.some(r=>!r||!r.winner||r.winner==='halve'))return null;
    return last3.every(r=>r.winner===last3[0].winner)?last3[0].winner:null;
  }
  function foursomesTeamNameFromKey(mp,key){
    return key==='A'?(mp&&mp.aName||'Team 1'):(mp&&mp.bName||'Team 2');
  }
  async function notifyFoursomesBirdiesForNewRows(mp,prev){
    const previousHoles=new Set(((prev&&prev.holeRows)||[]).map(r=>parseInt(r.hole)));
    const newRows=(mp.holeRows||[]).filter(r=>!previousHoles.has(parseInt(r.hole)));
    for(const row of newRows){
      const hd=getHole(row.hole);
      [['A',row.aGross],['B',row.bGross]].forEach(([team,gross])=>{
        if(isFoursomesOutcomeMarker(gross)||!hasEnteredGross(gross))return;
        if(Number(gross)===Number(hd.par)-1){
          const name=foursomesTeamNameFromKey(mp,team);
          sendFoursomesMatchNotification('foursomes_birdie',team+'-'+row.hole,'🐦 '+name+' birdied '+notifyHoleOrdinal(row.hole)+'!','Foursomes birdie · '+notifyRoundName(),{hole:row.hole,teamName:name});
        }
      });
    }
  }
  async function finishFoursomesMatchAutomatically(mp){
    if(!mp||!mp.isFinished||!canEdit||!isLiveRound(round)||foursomesAutoFinishRef.current===String(round&&round.id))return;
    foursomesAutoFinishRef.current=String(round&&round.id);
    try{
      setCloudStatus('Foursomes match won - finishing scorecard...');
      await syncLocalFoursomesScoresToCloud('auto-finish');
      const {error}=await sb.from('cup_rounds').update({status:'complete'}).eq('id',round.id);
      if(error){setCloudError(error.message||'Could not auto-finish foursomes match');foursomesAutoFinishRef.current='';return;}
      await sendFoursomesMatchNotification('foursomes_won','won-'+mp.winningTeam+'-'+mp.finalScore,'🏁 '+mp.winningName+' win the match!',mp.finalScore+' · '+notifyRoundName(),{hole:mp.lastHole,teamName:mp.winningName,finalScore:mp.finalScore});
      round.status='complete';
      setFoursomesAutoFinished(true);
      setCloudStatus('Foursomes match finished automatically');
      if(load)setTimeout(()=>load(),300);
    }catch(e){
      setCloudError(e&&e.message||String(e));
      foursomesAutoFinishRef.current='';
    }
  }

  async function saveCompletedHoleToCloud(holeNum,holeMap){
    const rows=grpPlayers.map(p=>buildScoreRow(holeNum,p.id,holeMap[p.id]));
    setCloudStatus('Saving hole '+holeNum+' to cloud...');
    setCloudError('');
    const result=await saveScoreRowsToCloud(sb,rows);
    if(!result.ok){
      try{
        const key='pending_scores_'+round.id;
        const pending=JSON.parse(localStorage.getItem(key)||'[]');
        rows.forEach(r=>pending.push(r));
        localStorage.setItem(key,JSON.stringify(pending));
      }catch(e){}
      setCloudStatus('Hole '+holeNum+' saved on this phone only');
      setCloudError(result.error||'Cloud save failed');
      throw new Error(result.error||'Cloud save failed');
    }
    setCloudStatus('Hole '+holeNum+' saved to cloud');
    setCloudError('');
    setOverallScores(prev=>{
      const byKey={};
      (prev||[]).forEach(r=>{byKey[normaliseId(r.player_id)+'_'+r.hole_number]=r;});
      rows.forEach(r=>{byKey[normaliseId(r.player_id)+'_'+r.hole_number]=r;});
      return Object.values(byKey);
    });
    setCloudScoreRows(prev=>{
      const byKey={};
      (prev||[]).forEach(r=>{byKey[normaliseId(r.player_id)+'_'+r.hole_number]=r;});
      rows.forEach(r=>{byKey[normaliseId(r.player_id)+'_'+r.hole_number]=r;});
      return Object.values(byKey);
    });
    setLastRefreshed(new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}));
    try{localStorage.removeItem('pending_scores_'+round.id);}catch(e){}
    // Pull latest public data after a successful cloud save.
    if(load)setTimeout(()=>load(),300);
  }

    // ---------------------------------------------------------
  // Score input state updates
  // ---------------------------------------------------------
  function setScore(holeNum,pid,val){
    const scorePid=canonicalFoursomesPlayerId(pid);
    const otherFoursomesPid=scorePid===MATCHPLAY_FOURSOMES_A?MATCHPLAY_FOURSOMES_B:(scorePid===MATCHPLAY_FOURSOMES_B?MATCHPLAY_FOURSOMES_A:null);
    const otherFoursomesVal=otherFoursomesPid&&(holeScores[holeNum]||{})[otherFoursomesPid];
    const shouldClearOtherMarker=isFoursomesTeamPlayerId(scorePid)&&!isFoursomesOutcomeMarker(val)&&isFoursomesOutcomeMarker(otherFoursomesVal);
    const singlesIds=singlesMatchplayOnlyIds();
    const otherSinglesPid=singlesIds.length===2&&singlesIds.map(normaliseId).includes(normaliseId(scorePid))?(normaliseId(scorePid)===normaliseId(singlesIds[0])?singlesIds[1]:singlesIds[0]):null;
    const otherSinglesVal=otherSinglesPid&&(holeScores[holeNum]||{})[otherSinglesPid];
    const shouldClearOtherSinglesMarker=!!(otherSinglesPid&&!isFoursomesOutcomeMarker(val)&&isFoursomesOutcomeMarker(otherSinglesVal));
    if(shouldClearOtherMarker)saveLocalScore(holeNum,otherFoursomesPid,undefined);
    if(shouldClearOtherSinglesMarker)saveLocalScore(holeNum,otherSinglesPid,undefined);
    saveLocalScore(holeNum,scorePid,val);
    notifyMaybeBirdie(holeNum,scorePid,val).catch(e=>console.warn('Snyder Live birdie notification error',e));
    if(isFoursomesTeamPlayerId(scorePid)){
      foursomesScoreEditRef.current=true;
      ensureFoursomesCloudGroup().then(cloudGroup=>{
        if(cloudGroup){
          const tasks=[];
          if(shouldClearOtherMarker)tasks.push(saveFoursomesScoreToGroupMeta(sb,cloudGroup,holeNum,otherFoursomesPid,undefined));
          tasks.push(saveFoursomesScoreToGroupMeta(sb,cloudGroup,holeNum,scorePid,val));
          return Promise.all(tasks).then(results=>results.find(r=>r&&!r.ok)||{ok:true});
        }
        return {ok:false,error:'No foursomes cloud group found'};
      }).then(res=>{
        if(res&&!res.ok){setCloudError(res.error||'Foursomes score did not sync');flash('Foursomes score saved on this phone only: '+(res.error||'No cloud group found'),'error');}
        else setCloudError('');
      }).catch(e=>{setCloudError(e.message||String(e));flash('Foursomes score saved on this phone only: '+(e.message||String(e)),'error');});
      setHoleScores(prev=>{
        const updatedHole={...(prev[holeNum]||{}),[scorePid]:val};
        if(shouldClearOtherMarker)delete updatedHole[otherFoursomesPid];
        const updated={...prev,[holeNum]:updatedHole};
        return updated;
      });
      return;
    }
    const row=buildScoreRow(holeNum,scorePid,val);
    setCloudStatus('');
    setCloudError('');
    saveScoreRowToCloud(sb,row)
      .then(result=>{
        if(!result.ok){
          try{
            const key='pending_scores_'+round.id;
            const pending=JSON.parse(localStorage.getItem(key)||'[]');
            pending.push(row);
            localStorage.setItem(key,JSON.stringify(pending));
          }catch(e){}
          setCloudStatus('');
          setCloudError(result.error||'Cloud save failed');
          flash('Score saved on this phone only: '+(result.error||'Cloud save failed'),'error');
          return;
        }
        setCloudStatus('');
        setCloudError('');
        setOverallScores(prev=>{
          const key=normaliseId(row.player_id)+'_'+row.hole_number;
          const filtered=(prev||[]).filter(r=>normaliseId(r.player_id)+'_'+r.hole_number!==key);
          return [...filtered,row];
        });
        setCloudScoreRows(prev=>{
          const key=normaliseId(row.player_id)+'_'+row.hole_number;
          const filtered=(prev||[]).filter(r=>normaliseId(r.player_id)+'_'+r.hole_number!==key);
          return [...filtered,row];
        });
        setLastRefreshed(new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}));
        if(shouldClearOtherSinglesMarker)sb.from('cup_scores').delete().eq('round_id',round.id).eq('hole_number',holeNum).eq('player_id',otherSinglesPid).catch(()=>{});
        if(load)setTimeout(()=>load(),300);
      })
      .catch(e=>{
        setCloudStatus('');
        setCloudError(e.message||String(e));
        flash('Score saved on this phone only: '+(e.message||String(e)),'error');
      });
    setHoleScores(prev=>{
      const updatedHole={...(prev[holeNum]||{}),[scorePid]:val};
      if(shouldClearOtherSinglesMarker)delete updatedHole[otherSinglesPid];
      const updated={...prev,[holeNum]:updatedHole};
      if(holeNum===9){
        const allFront9=Array.from({length:9},(_,i)=>i+1).every(h=>
          grpPlayers.every(p=>(updated[h]||{})[p.id]!==undefined)
        );
        if(allFront9){
          notifyFrontNineIfComplete(updated).catch(e=>console.warn('Snyder Live front 9 notification error',e));
          setTimeout(()=>setShowReview(true),600);
        }
      }
      if(holeNum===18){
        const allBack9=Array.from({length:9},(_,i)=>i+10).every(h=>
          grpPlayers.every(p=>(updated[h]||{})[p.id]!==undefined)
        );
        if(allBack9)setTimeout(()=>{setEndStep(0);setShowEnd(true);},600);
      }
      return updated;
      });
  }

  function setFoursomesHoleOutcome(holeNum,winnerPid){
    const winner=canonicalFoursomesPlayerId(winnerPid);
    const loser=winner===MATCHPLAY_FOURSOMES_A?MATCHPLAY_FOURSOMES_B:MATCHPLAY_FOURSOMES_A;
    const winnerVal=winnerPid?FOURSOMES_WON_MARKER:undefined;
    const loserVal=winnerPid?FOURSOMES_CONCEDED_MARKER:undefined;
    saveLocalScore(holeNum,MATCHPLAY_FOURSOMES_A,winner===MATCHPLAY_FOURSOMES_A?winnerVal:(winnerPid?loserVal:undefined));
    saveLocalScore(holeNum,MATCHPLAY_FOURSOMES_B,winner===MATCHPLAY_FOURSOMES_B?winnerVal:(winnerPid?loserVal:undefined));
    foursomesScoreEditRef.current=true;
    setHoleScores(prev=>{
      const nextHole={...(prev[holeNum]||{})};
      if(winnerPid){
        nextHole[winner]=FOURSOMES_WON_MARKER;
        nextHole[loser]=FOURSOMES_CONCEDED_MARKER;
      }else{
        delete nextHole[MATCHPLAY_FOURSOMES_A];
        delete nextHole[MATCHPLAY_FOURSOMES_B];
      }
      return {...prev,[holeNum]:nextHole};
    });
    ensureFoursomesCloudGroup().then(cloudGroup=>{
      if(!cloudGroup)return {ok:false,error:'No foursomes cloud group found'};
      return Promise.all([
        saveFoursomesScoreToGroupMeta(sb,cloudGroup,holeNum,MATCHPLAY_FOURSOMES_A,winner===MATCHPLAY_FOURSOMES_A?winnerVal:(winnerPid?loserVal:undefined)),
        saveFoursomesScoreToGroupMeta(sb,cloudGroup,holeNum,MATCHPLAY_FOURSOMES_B,winner===MATCHPLAY_FOURSOMES_B?winnerVal:(winnerPid?loserVal:undefined))
      ]).then(results=>results.find(r=>r&&!r.ok)||{ok:true});
    }).then(res=>{
      if(res&&!res.ok){setCloudError(res.error||'Foursomes hole result did not sync');flash('Foursomes result saved on this phone only: '+(res.error||'No cloud group found'),'error');}
      else setCloudError('');
    }).catch(e=>{setCloudError(e.message||String(e));flash('Foursomes result saved on this phone only: '+(e.message||String(e)),'error');});
  }

  function singlesMatchplayOnlyIds(){
    const cfg=matchplayConfig||{};
    if(!cfg.enabled||cfg.mode!=='singles'||cfg.keepStableford!==false)return [];
    return [(cfg.teamA||[])[0],(cfg.teamB||[])[0]].filter(Boolean).map(String);
  }
  function isSinglesMatchplayOnlyScorecard(){
    return singlesMatchplayOnlyIds().length===2;
  }
  function isSinglesMatchplayOnlyPlayer(pid){
    const ids=singlesMatchplayOnlyIds().map(normaliseId);
    return ids.includes(normaliseId(pid));
  }
  function setSinglesMatchplayHoleOutcome(holeNum,winnerPid){
    const ids=singlesMatchplayOnlyIds();
    if(ids.length!==2)return;
    const winner=winnerPid?String(winnerPid):null;
    const loser=winner===ids[0]?ids[1]:ids[0];
    const winnerVal=winner?FOURSOMES_WON_MARKER:undefined;
    const loserVal=winner?FOURSOMES_CONCEDED_MARKER:undefined;
    saveLocalScore(holeNum,ids[0],winner===ids[0]?winnerVal:(winner?loserVal:undefined));
    saveLocalScore(holeNum,ids[1],winner===ids[1]?winnerVal:(winner?loserVal:undefined));
    setHoleScores(prev=>{
      const nextHole={...(prev[holeNum]||{})};
      if(winner){
        nextHole[winner]=FOURSOMES_WON_MARKER;
        nextHole[loser]=FOURSOMES_CONCEDED_MARKER;
      }else{
        delete nextHole[ids[0]];
        delete nextHole[ids[1]];
      }
      return {...prev,[holeNum]:nextHole};
    });
    if(winner){
      Promise.all([
        saveScoreRowToCloud(sb,buildScoreRow(holeNum,winner,FOURSOMES_WON_MARKER)),
        saveScoreRowToCloud(sb,buildScoreRow(holeNum,loser,FOURSOMES_CONCEDED_MARKER))
      ]).then(results=>{
        const bad=results.find(r=>r&&!r.ok);
        if(bad){setCloudError(bad.error||'Singles matchplay result did not sync');flash('Matchplay result saved on this phone only: '+(bad.error||'Cloud save failed'),'error');}
        else setCloudError('');
      }).catch(e=>{setCloudError(e.message||String(e));flash('Matchplay result saved on this phone only: '+(e.message||String(e)),'error');});
    }else{
      sb.from('cup_scores').delete().eq('round_id',round.id).eq('hole_number',holeNum).in('player_id',ids).then(res=>{
        if(res&&res.error)setCloudError(res.error.message||'Could not clear singles matchplay result');
        else setCloudError('');
      }).catch(e=>setCloudError(e.message||String(e)));
    }
  }

    // ---------------------------------------------------------
  // Score totals / running points helpers
  // ---------------------------------------------------------
  function getPts(gross,holeNum,pid){
    if(gross===-1||isGivenGross(gross))return 0;
    if(!gross||gross<1)return null;
    const hd=getHole(holeNum);
    const hcp=parseFloat(playingHcps[pid]!=null?playingHcps[pid]:grpPlayers.find(p=>p.id===pid)&&grpPlayers.find(p=>p.id===pid).current_handicap||0);
    return calcStableford(gross,hd.par,hd.stroke_index,hcp);
  }

  function savedStablefordForHole(pid,holeNum){
    const key=normaliseId(pid);
    const h=parseInt(holeNum,10);
    const source=(overallScores&&overallScores.length?overallScores:(cloudScoreRows||[])).filter(r=>r&&!isMetaScoreRow(r));
    for(let i=source.length-1;i>=0;i--){
      const r=source[i];
      if(normaliseId(r.player_id)===key&&parseInt(r.hole_number,10)===h){
        return stablefordPointsValue(r.stableford_points);
      }
    }
    return null;
  }

  function getLivePts(pid,holeNum,gross){
    const saved=savedStablefordForHole(pid,holeNum);
    if(saved!==null&&saved!==undefined)return saved;
    return getPts(gross,holeNum,pid);
  }

  function getRunning(pid,upTo){
    let t=0;
    for(let h=1;h<=upTo;h++){
      const g=(holeScores[h]||{})[pid];
      const saved=savedStablefordForHole(pid,h);
      if(saved!==null&&saved!==undefined){t+=saved;continue;}
      if(g===-1)continue;
      const pts=getPts(g,h,pid);
      if(pts!==null&&pts!==undefined)t+=pts;
    }
    return t;
  }
  function getGrossTotal(pid,holeList){
    return (holeList||[]).reduce((t,h)=>{
      const g=(holeScores[h.hole]||{})[pid];
      return t+grossScoreValue(g);
    },0);
  }
  function getStablefordTotal(pid,holeList){
    return (holeList||[]).reduce((t,h)=>{
      const g=(holeScores[h.hole]||{})[pid];
      const saved=savedStablefordForHole(pid,h.hole);
      return t+(saved!==null&&saved!==undefined?saved:((g===-1||isGivenGross(g))?0:(getPts(g,h.hole,pid)||0)));
    },0);
  }

  function currentSweepstakeThroughHole(){
    let max=0;
    Object.keys(holeScores||{}).forEach(h=>{
      const hn=parseInt(h);
      if(!hn)return;
      const row=holeScores[h]||{};
      const has=Object.keys(row).some(pid=>hasEnteredGross(row[pid]));
      if(has&&hn>max)max=hn;
    });
    (overallScores||[]).filter(r=>r&&!isMetaScoreRow(r)).forEach(r=>{
      const hn=parseInt(r.hole_number);
      if(hn&&hasEnteredGross(r.gross_score)&&hn>max)max=hn;
    });
    return Math.min(18,Math.max(0,max));
  }

  function sweepstakePlayerRows(opts={}){
    const forceEnabled=!!(opts&&opts.forceEnabled);
    const amountPence=parseInt(sweepstakeConfig&&sweepstakeConfig.amountPence)||200;
    const scope=(sweepstakeConfig&&sweepstakeConfig.scope)==='group'?'group':'round';
    const throughHole=opts&&opts.throughHole!=null?parseInt(opts.throughHole):currentSweepstakeThroughHole();
    const safeThrough=Math.min(18,Math.max(0,throughHole||0));
    const final=safeThrough>=18;
    const overallLive=holes.filter(h=>h.hole<=Math.max(1,safeThrough));
    const pots=[];
    if(safeThrough>=9){
      pots.push({key:'front',label:'Front 9',holes:front9,settles:true});
    }else if(safeThrough>0){
      pots.push({key:'frontlive',label:'Front 9 so far',holes:front9.filter(h=>h.hole<=safeThrough),settles:false});
    }
    if(safeThrough>=18){
      pots.push({key:'back',label:'Back 9',holes:back9,settles:true});
    }else if(safeThrough>=10){
      pots.push({key:'backlive',label:'Back 9 so far',holes:back9.filter(h=>h.hole<=safeThrough),settles:false});
    }
    if(safeThrough>0){
      pots.push({key:'overall',label:final?'Overall':'Overall so far',holes:final?holes:overallLive,settles:final});
    }
    const fallbackGroupPlayers=(grpPlayers&&grpPlayers.length)?grpPlayers:(((allGroups&&allGroups[0]&&allGroups[0].participants)||[]).length?(allGroups[0].participants):((group&&group.participants)||[]));
    const playerSource=scope==='round'?(allRoundPlayers&&allRoundPlayers.length?allRoundPlayers:(fallbackGroupPlayers&&fallbackGroupPlayers.length?fallbackGroupPlayers:grpPlayers)):(grpPlayers&&grpPlayers.length?grpPlayers:fallbackGroupPlayers);
    const entryIds=sweepstakeEntryIdsFromRows(overallScores||[],round)||loadLocalSweepstakeEntryIds(round&&round.id);
    const sweepPlayers=(playerSource||[]).filter((p,idx,arr)=>p&&p.id&&(!entryIds||entryIds.has(normaliseId(p.id)))&&arr.findIndex(x=>normaliseId(x&&x.id)===normaliseId(p.id))===idx);
    const sweepNameMap=contextualNameMapFromPlayers(sweepPlayers);
    const pointByPlayerHole={};
    (overallScores||[]).filter(r=>r&&!isMetaScoreRow(r)).forEach(r=>{
      const pid=normaliseId(r.player_id); const hn=parseInt(r.hole_number);
      if(!pid||!hn)return;
      if(!pointByPlayerHole[pid])pointByPlayerHole[pid]={};
      pointByPlayerHole[pid][hn]=stablefordPointsValue(r.stableford_points);
    });
    function sweepPts(pid,holeList){
      const key=normaliseId(pid);
      return (holeList||[]).reduce((t,h)=>{
        const hn=h.hole;
        if(pointByPlayerHole[key]&&pointByPlayerHole[key][hn]!=null)return t+(pointByPlayerHole[key][hn]||0);
        const g=(holeScores[hn]||{})[pid];
        return t+((g===-1||isGivenGross(g))?0:(getPts(g,hn,pid)||0));
      },0);
    }
    const rows=sweepPlayers.map(p=>({id:p.id,player:p,name:nameFromContextMap(sweepNameMap,p.id,(p.name||p.display_name)||'?'),paid:amountPence*3,winnings:0,net:-(amountPence*3),potWins:[]}));
    const byId={};rows.forEach(r=>{byId[normaliseId(r.id)]=r;});
    let rolloverPence=0;
    const potRows=[];
    pots.forEach(pot=>{
      const scores=sweepPlayers.map(p=>({id:p.id,name:nameFromContextMap(sweepNameMap,p.id,(p.name||p.display_name)||'?'),displayName:nameFromContextMap(sweepNameMap,p.id,(p.name||p.display_name)||'?'),points:sweepPts(p.id,pot.holes),player:p}));
      const best=scores.length?Math.max(...scores.map(x=>x.points)):0;
      const tied=scores.filter(x=>x.points===best);
      const potTotal=amountPence*sweepPlayers.length;
      let winner=null,winners=tied,reason='',rollover=false,manualDecision=false,payoutAmountPence=potTotal;
      if(pot.settles){
        const resolved=resolveSweepstakeCountback(tied,pot.key,(row,start,end)=>sweepPts(row.id,Array.from({length:(end-start)+1},(_,i)=>({hole:start+i}))));
        winner=resolved.winner;winners=resolved.winners||[];reason=resolved.reason||'';
        if(resolved.unresolved&&(pot.key==='front'||pot.key==='back')){rollover=true;rolloverPence+=potTotal;payoutAmountPence=0;}
        else if(resolved.unresolved&&pot.key==='overall'){manualDecision=true;payoutAmountPence=0;}
        else if(winner){payoutAmountPence=potTotal+(pot.key==='overall'?rolloverPence:0);const row=byId[normaliseId(winner.id)];if(row){row.winnings+=payoutAmountPence;row.potWins.push({label:pot.label,amount:payoutAmountPence,points:winner.points,reason});}}
      }else{
        winner=tied[0]||null;
      }
      potRows.push({...pot,best,winners,winner,reason,rollover,manualDecision,potTotal,payoutAmountPence,rolloverIn:pot.key==='overall'?rolloverPence:0,share:payoutAmountPence});
    });
    rows.forEach(r=>{r.net=r.winnings-r.paid;});
    const currentSnakeIds=final?new Set():snakeHolderIdsFromMarks(currentSnakeMarks(),safeThrough);
    const liveRows=rows.map(r=>({...r,net:0,snakePenalty:currentSnakeIds.has(normaliseId(r.id))?SNAKE_SWEEPSTAKE_PENALTY_PENCE:0}));
    const liveById={};liveRows.forEach(r=>{liveById[normaliseId(r.id)]=r;});
    potRows.forEach(pot=>{
      if(!pot||pot.rollover||pot.manualDecision||!pot.winner)return;
      const winnerRow=liveById[normaliseId(pot.winner.id)];
      if(!winnerRow)return;
      const losers=liveRows.filter(r=>normaliseId(r.id)!==normaliseId(winnerRow.id));
      const winnerGain=Math.max(0,(parseInt(pot.payoutAmountPence)||amountPence*sweepPlayers.length)-amountPence);
      winnerRow.net+=winnerGain;
      losers.forEach(r=>{r.net-=amountPence;});
    });
    liveRows.forEach(r=>{r.displayNet=parseInt(r.net)||0;});
    const creditors=final?rows.filter(r=>r.net>0).map(r=>({...r,remaining:r.net})):[];
    const debtors=final?rows.filter(r=>r.net<0).map(r=>({...r,remaining:-r.net})):[];
    const payments=[];
    let i=0,j=0;
    while(i<debtors.length&&j<creditors.length){
      const amt=Math.min(debtors[i].remaining,creditors[j].remaining);
      if(amt>0)payments.push({from:debtors[i].name,to:creditors[j].name,fromId:debtors[i].id,toId:creditors[j].id,fromPlayer:debtors[i].player,toPlayer:creditors[j].player,amount:amt});
      debtors[i].remaining-=amt;creditors[j].remaining-=amt;
      if(debtors[i].remaining<=0)i++;
      if(creditors[j].remaining<=0)j++;
    }
    const suppressedByDaySweepstake=!!(dayCompKeyFromRound(round)&&!isDayCompBoardRound(round));
    return {enabled:(!!(sweepstakeConfig&&sweepstakeConfig.enabled)||forceEnabled)&&!round._cupScoring&&!suppressedByDaySweepstake,amountPence,scope,pots:potRows,rows,liveRows,payments,totalEntry:amountPence*3,playerCount:sweepPlayers.length,throughHole:safeThrough,final,suppressedByDaySweepstake};
  }
  function isSweepstakeLeagueGuest(player){
    const id=normaliseId(player&&player.id).toLowerCase();
    return !!(player&&(player.is_guest||player.guest_id||player.is_casual||id.startsWith('guest')||id.startsWith('casual')));
  }
  function sweepstakeSettlementKey(){
    const scope=(sweepstakeConfig&&sweepstakeConfig.scope)==='group'?'group':'round';
    return `league-balance-${round&&round.id||'round'}-${scope==='group'?(activeGroupId||'group'):'all'}`;
  }
  async function settleSweepstakeLeagueBalances(){
    if(!sb||!round||!round.id||round._cupScoring||!canSettleSweepstakeLeagueBalance||!isCompletedRound(round))return;
    const key=sweepstakeSettlementKey();
    if(sweepstakeLeagueSettlementRef.current===key)return;
    const sw=sweepstakePlayerRows({throughHole:18});
    if(!sw.enabled||!sw.final||!sw.payments.length)return;
    sweepstakeLeagueSettlementRef.current=key;
    setSweepstakeLeagueSettlement({status:'checking',changes:[],skipped:[]});
    const markerNote=`Sweepstake League balance settlement ${key} | adjustment-only | v4.47`;
    const legacyMarkerNoteV446=`Sweepstake League balance settlement ${key} | adjustment-only | v4.46`;
    const legacyMarkerNoteV445=`Sweepstake League balance settlement ${key} | adjustment-only | v4.45`;
    const legacyMarkerNoteV444=`Sweepstake League balance settlement ${key} | adjustment-only | v4.44`;
    const legacyMarkerNoteV443=`Sweepstake League balance settlement ${key} | adjustment-only | v4.43`;
    const legacyMarkerNoteV442=`Sweepstake League balance settlement ${key} | adjustment-only | v4.42`;
    const legacyMarkerNoteV441=`Sweepstake League balance settlement ${key} | adjustment-only | v4.41`;
    const legacyMarkerNoteV440=`Sweepstake League balance settlement ${key} | adjustment-only | v4.40`;
    const legacyMarkerNoteV439=`Sweepstake League balance settlement ${key} | adjustment-only | v4.39`;
    const legacyMarkerNoteV438=`Sweepstake League balance settlement ${key} | adjustment-only | v4.38`;
    const legacyMarkerNoteV437=`Sweepstake League balance settlement ${key} | adjustment-only | v4.37`;
    const legacyMarkerNoteV436=`Sweepstake League balance settlement ${key} | adjustment-only | v4.36`;
    const legacyMarkerNoteV435=`Sweepstake League balance settlement ${key} | adjustment-only | v4.35`;
    const legacyMarkerNoteV434=`Sweepstake League balance settlement ${key} | adjustment-only | v4.34`;
    const legacyMarkerNoteV433=`Sweepstake League balance settlement ${key} | adjustment-only | v4.33`;
    try{
      const {data:logMarkers,error:logMarkerError}=await sb.from('payment_log').select('id').or(`note.eq.${markerNote},note.eq.${legacyMarkerNoteV446},note.eq.${legacyMarkerNoteV445},note.eq.${legacyMarkerNoteV444},note.eq.${legacyMarkerNoteV443},note.eq.${legacyMarkerNoteV442},note.eq.${legacyMarkerNoteV441},note.eq.${legacyMarkerNoteV440},note.eq.${legacyMarkerNoteV439},note.eq.${legacyMarkerNoteV438},note.eq.${legacyMarkerNoteV437},note.eq.${legacyMarkerNoteV436},note.eq.${legacyMarkerNoteV435},note.eq.${legacyMarkerNoteV434},note.eq.${legacyMarkerNoteV433}`).limit(1);
      if(logMarkerError)throw logMarkerError;
      if(logMarkers&&logMarkers.length){
        setSweepstakeLeagueSettlement({status:'done',already:true,changes:[],skipped:[]});
        return;
      }

      const [{data:leaguePlayers,error:playersError},linkResult]=await Promise.all([
        sb.from('players').select('*').order('name',{ascending:true}),
        fetchLeaguePlayerLinks(sb)
      ]);
      if(playersError)throw playersError;
      const links=(linkResult&&linkResult.links)||{};
      const skipped=[];
      const playerMap=new Map();
      function leagueForSweepPlayer(player){
        const key=normaliseId(player&&player.id);
        if(playerMap.has(key))return playerMap.get(key);
        let result=null;
        if(player&&!isSweepstakeLeagueGuest(player))result=findLeagueSubmitPlayer(player,leaguePlayers||[],links);
        playerMap.set(key,result);
        return result;
      }
      const deltas={};
      const details={};
      sw.payments.forEach(pay=>{
        const fromGuest=isSweepstakeLeagueGuest(pay.fromPlayer);
        const toGuest=isSweepstakeLeagueGuest(pay.toPlayer);
        const fromLeague=fromGuest?null:leagueForSweepPlayer(pay.fromPlayer);
        const toLeague=toGuest?null:leagueForSweepPlayer(pay.toPlayer);
        if(!fromLeague||!toLeague){
          skipped.push(`${pay.from} -> ${pay.to} ${moneyFromPence(pay.amount)}`);
          return;
        }
        const pounds=(Math.round(pay.amount)||0)/100;
        const fromId=normaliseId(fromLeague.id);
        const toId=normaliseId(toLeague.id);
        deltas[fromId]=(deltas[fromId]||0)-pounds;
        deltas[toId]=(deltas[toId]||0)+pounds;
        if(!details[fromId])details[fromId]={player:fromLeague,lines:[]};
        if(!details[toId])details[toId]={player:toLeague,lines:[]};
        details[fromId].lines.push(`paid ${toLeague.name} £${pounds.toFixed(2)}`);
        details[toId].lines.push(`received from ${fromLeague.name} £${pounds.toFixed(2)}`);
      });
      const ids=Object.keys(deltas).filter(id=>Math.abs(deltas[id])>0.0001);
      if(!ids.length){
        setSweepstakeLeagueSettlement({status:'skipped',changes:[],skipped});
        return;
      }
      // Sweepstake winnings are balance adjustments, not real money paid in.
      // Do not change payments.paid here: the League paid column must stay as actual payments only.
      const logRows=ids.map(id=>({
        player_id:id,
        player_name:(details[id]&&details[id].player&&details[id].player.name)||'Player',
        action:'Sweepstake balance',
        amount:Math.round(deltas[id]*100)/100,
        note:markerNote
      }));
      const {error:logError}=await sb.from('payment_log').insert(logRows);
      if(logError)throw logError;
      const changes=ids.map(id=>({
        player:(details[id]&&details[id].player&&details[id].player.name)||'Player',
        delta:Math.round(deltas[id]*100)/100,
        lines:(details[id]&&details[id].lines)||[]
      })).sort((a,b)=>a.player.localeCompare(b.player));
      setSweepstakeLeagueSettlement({status:'done',changes,skipped});
      if(load)load();
    }catch(e){
      sweepstakeLeagueSettlementRef.current='';
      setSweepstakeLeagueSettlement({status:'error',error:e.message||String(e),changes:[],skipped:[]});
    }
  }
  useEffect(()=>{
    if(isCompletedRound(round)&&!round._cupScoring&&!isFoursomesScorecard&&!dayCompKeyFromRound(round))settleSweepstakeLeagueBalances();
  },[round&&round.id,round&&round.status,canSettleSweepstakeLeagueBalance,activeGroupId,sweepstakeConfig&&sweepstakeConfig.enabled,sweepstakeConfig&&sweepstakeConfig.amountPence,sweepstakeConfig&&sweepstakeConfig.scope]);
  function SweepstakePanel({compact=false,throughHole=null,reviewTitle='',payUp=false,forceEnabled=false}){
    const sw=sweepstakePlayerRows({throughHole,forceEnabled});
    if(isJoinedDaySweepstake)return null;
    if(!sw.enabled)return null;
    const title=reviewTitle||'💰 Sweepstake';
    return <div style={{...S.card,margin:compact?'0 0 10px':16,background:payUp?'linear-gradient(135deg,rgba(245,158,11,0.30),rgba(10,21,40,0.96))':'linear-gradient(135deg,rgba(245,158,11,0.18),rgba(255,255,255,0.05))',borderColor:'rgba(245,158,11,0.55)',boxShadow:payUp?'0 14px 36px rgba(245,158,11,0.18)':'none'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:10}}>
        <div><div style={{fontSize:payUp?21:16,color:'#fff',fontWeight:950}}>{title}</div><div style={{fontSize:11,color:'#fbbf24'}}>Stableford side pots · {moneyFromPence(sw.amountPence)} front/back/overall · {sw.scope==='round'?'all groups':'this group'} · {sw.playerCount} players</div></div>
      </div>
      {!sw.final&&<div style={{padding:'8px 10px',borderRadius:10,background:'rgba(96,184,240,0.12)',border:'1px solid rgba(96,184,240,0.22)',fontSize:12,color:'#dbeafe',fontWeight:800,marginBottom:8}}>Live standings only — final net settlement appears after 18 holes.</div>}
      {sw.pots.map(pot=><div key={pot.key} style={{display:'flex',justifyContent:'space-between',gap:8,padding:'7px 0',borderTop:'1px solid rgba(255,255,255,0.08)'}}>
        <div style={{fontSize:12,color:'#fff',fontWeight:800}}>{pot.label}</div>
        <div style={{fontSize:12,color:'#fbbf24',fontWeight:900,textAlign:'right'}}>{sweepstakeWinnerText(pot)||'-'} <span style={{color:'rgba(255,255,255,0.65)'}}>({pot.best||0} pts)</span>{sweepstakeReasonText(pot)&&<div style={{fontSize:10,color:'rgba(255,255,255,0.70)',fontWeight:800,marginTop:2}}>{sweepstakeReasonText(pot)}</div>}{pot.rolloverIn>0&&pot.key==='overall'&&<div style={{fontSize:10,color:'#86efac',fontWeight:900,marginTop:2}}>Includes rollover {moneyFromPence(pot.rolloverIn)}</div>}</div>
      </div>)}
      {!sw.final&&<>
        <div style={{marginTop:12,fontSize:12,color:'#90ccf0',fontWeight:950,letterSpacing:'0.08em'}}>LIVE SWEEPSTAKE</div>
        {(sw.liveRows||[]).filter(r=>r.displayNet!==0).length?(sw.liveRows||[]).filter(r=>r.displayNet!==0).slice().sort((a,b)=>b.displayNet-a.displayNet||String(a.name).localeCompare(String(b.name))).map(r=><div key={r.id} style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',padding:'7px 0',borderTop:'1px solid rgba(255,255,255,0.08)'}}>
          <div style={{fontSize:13,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</div>
          <span style={{fontSize:15,fontWeight:950,color:r.displayNet>0?'#86efac':r.displayNet<0?'#fca5a5':'#e5e7eb',whiteSpace:'nowrap'}}>{r.displayNet>0?'+':''}{moneyFromPence(r.displayNet)}</span>
        </div>):<div style={{fontSize:13,color:'rgba(255,255,255,0.65)',padding:'8px 0',borderTop:'1px solid rgba(255,255,255,0.08)'}}>No live sweepstake changes yet.</div>}
        {(sw.liveRows||[]).filter(r=>r.snakePenalty>0).length>0&&<div style={{marginTop:7,paddingTop:7,borderTop:'1px solid rgba(245,191,36,0.20)'}}>
          <div style={{fontSize:10,color:'#fbbf24',fontWeight:950,letterSpacing:'0.05em',marginBottom:3}}>CURRENT SNAKE</div>
          {(sw.liveRows||[]).filter(r=>r.snakePenalty>0).map(r=><div key={'snake-'+r.id} style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',padding:'3px 0'}}>
            <div style={{fontSize:12,color:'#fbbf24',fontWeight:850,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</div>
            <span style={{fontSize:13,color:'#fbbf24',fontWeight:950,whiteSpace:'nowrap'}}>-{moneyFromPence(r.snakePenalty)}</span>
          </div>)}
        </div>}
        <div style={{fontSize:10,color:'rgba(255,255,255,0.55)',lineHeight:1.35,marginTop:5}}>Sweepstake stays zero-sum. Snake is shown separately and uses the League snake flow.</div>
      </>}
      {sw.final&&<>
        <div style={{marginTop:12,fontSize:payUp?14:12,color:'#90ccf0',fontWeight:950,letterSpacing:'0.08em'}}>FINAL BALANCES</div>
        {sw.rows.map(r=><div key={r.id} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderTop:'1px solid rgba(255,255,255,0.08)'}}><span style={{fontSize:13,color:'#fff'}}>{r.name}</span><span style={{fontSize:15,fontWeight:950,color:r.net>0?'#86efac':r.net<0?'#fca5a5':'#e5e7eb'}}>{r.net>0?'+':''}{moneyFromPence(r.net)}</span></div>)}
        <div style={{marginTop:12,fontSize:payUp?15:12,color:'#fbbf24',fontWeight:950,letterSpacing:'0.08em'}}>WHO PAYS WHO</div>
        {sw.payments.length?sw.payments.map((p,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',padding:payUp?'11px 0':'8px 0',borderTop:'1px solid rgba(255,255,255,0.10)'}}><span style={{fontSize:payUp?16:13,color:'#fff',fontWeight:payUp?900:500}}>{p.from} → {p.to}</span><span style={{fontSize:payUp?18:13,color:'#fbbf24',fontWeight:950}}>{moneyFromPence(p.amount)}</span></div>):<div style={{fontSize:13,color:'rgba(255,255,255,0.65)',paddingTop:8}}>All square.</div>}
        {payUp&&sweepstakeLeagueSettlement&&<div style={{marginTop:12,padding:'10px 11px',borderRadius:12,background:sweepstakeLeagueSettlement.status==='error'?'rgba(239,68,68,0.12)':'rgba(34,197,94,0.10)',border:'1px solid '+(sweepstakeLeagueSettlement.status==='error'?'rgba(248,113,113,0.30)':'rgba(134,239,172,0.24)')}}>
          <div style={{fontSize:12,color:sweepstakeLeagueSettlement.status==='error'?'#fca5a5':'#86efac',fontWeight:950,letterSpacing:'0.07em',textTransform:'uppercase'}}>League balances</div>
          {sweepstakeLeagueSettlement.status==='checking'&&<div style={{fontSize:12,color:'#dbeafe',marginTop:6}}>Updating League balances...</div>}
          {sweepstakeLeagueSettlement.status==='error'&&<div style={{fontSize:12,color:'#fecaca',marginTop:6}}>Could not update balances: {sweepstakeLeagueSettlement.error}</div>}
          {sweepstakeLeagueSettlement.status==='done'&&sweepstakeLeagueSettlement.already&&<div style={{fontSize:12,color:'#dbeafe',marginTop:6}}>Already added to the League balances.</div>}
          {(sweepstakeLeagueSettlement.status==='done'||sweepstakeLeagueSettlement.status==='skipped')&&!sweepstakeLeagueSettlement.already&&<>
            {(sweepstakeLeagueSettlement.changes||[]).length?<>
              <div style={{fontSize:12,color:'#dbeafe',marginTop:6}}>Sweepstake has been added to the League money table.</div>
              {(sweepstakeLeagueSettlement.changes||[]).map(c=><div key={c.player} style={{display:'flex',justifyContent:'space-between',gap:8,padding:'6px 0',borderTop:'1px solid rgba(255,255,255,0.08)'}}>
                <span style={{fontSize:13,color:'#fff',fontWeight:850}}>{c.player}</span>
                <span style={{fontSize:13,color:c.delta>=0?'#86efac':'#fca5a5',fontWeight:950}}>{c.delta>=0?'+':'-'}£{Math.abs(c.delta).toFixed(Math.abs(c.delta)%1?2:0)}</span>
              </div>)}
            </>:<div style={{fontSize:12,color:'#dbeafe',marginTop:6}}>No League balances changed.</div>}
            {(sweepstakeLeagueSettlement.skipped||[]).length>0&&<div style={{fontSize:11,color:'#fbbf24',lineHeight:1.35,marginTop:7}}>Skipped guest or unlinked sweepstake payments: {sweepstakeLeagueSettlement.skipped.join(', ')}</div>}
          </>}
        </div>}
      </>}
    </div>;
  }

  function matchplayPlayerRecord(pid){
    const key=normaliseId(pid);
    return (grpPlayers||[]).find(p=>[p&&p.id,p&&p.user_id,p&&p.guest_id,p&&p.round_player_id,p&&p.cup_player_id].filter(Boolean).some(id=>normaliseId(id)===key));
  }
  function matchplayPlayerName(pid){
    const p=matchplayPlayerRecord(pid);
    return gameFirstName((p&&(p.display_name||p.name))||getDisplayName(pid)||'Player');
  }
  function matchplayTeamName(ids){return (ids||[]).map(matchplayPlayerName).filter(Boolean).join(' & ');}
  function matchplayIdCandidates(pid){
    const out=[];
    const add=v=>{if(v!==undefined&&v!==null&&v!==''&&!out.some(x=>normaliseId(x)===normaliseId(v)))out.push(String(v));};
    add(pid);
    const p=matchplayPlayerRecord(pid);
    if(p){[p.id,p.user_id,p.guest_id,p.round_player_id,p.cup_player_id].forEach(add);}
    return out;
  }
  function grossForMatchplayPlayer(pid,holeNum){
    const obj=(holeScores&&holeScores[holeNum])||{};
    const candidates=matchplayIdCandidates(pid);
    for(const id of candidates){if(obj[id]!==undefined)return {value:obj[id],key:id};}
    const keys=Object.keys(obj||{});
    for(const id of candidates){const found=keys.find(k=>normaliseId(k)===normaliseId(id));if(found!==undefined)return {value:obj[found],key:found};}
    return {value:undefined,key:candidates[0]||pid};
  }
  function savedStablefordForMatchplayPlayer(pid,holeNum){
    const ids=new Set(matchplayIdCandidates(pid).map(normaliseId));
    const h=parseInt(holeNum,10);
    const source=(overallScores&&overallScores.length?overallScores:(cloudScoreRows||[])).filter(r=>r&&!isMetaScoreRow(r));
    for(let i=source.length-1;i>=0;i--){
      const r=source[i];
      if(ids.has(normaliseId(r.player_id))&&parseInt(r.hole_number,10)===h)return stablefordPointsValue(r.stableford_points);
    }
    return null;
  }
  function getRunningMatchplayPlayer(pid,upTo){
    let t=0;
    for(let h=1;h<=upTo;h++){
      const saved=savedStablefordForMatchplayPlayer(pid,h);
      if(saved!==null&&saved!==undefined){t+=saved;continue;}
      const found=grossForMatchplayPlayer(pid,h);
      const g=found.value;
      if(g===-1)continue;
      const pts=getPts(g,h,found.key||pid);
      if(pts!==null&&pts!==undefined)t+=pts;
    }
    return t;
  }
  function matchplayState(){
    const cfg=matchplayConfig||{};
    const mode=normaliseMatchplayMode(cfg.mode);
    let teamA=(cfg.teamA||[]).map(normaliseId).filter(Boolean);
    let teamB=(cfg.teamB||[]).map(normaliseId).filter(Boolean);
    if(mode==='doubles'&&(!cfg.enabled||!teamA.length||!teamB.length)&&round&&round._spectator&&!round._cupScoring&&(grpPlayers||[]).length===4){
      teamA=[normaliseId(grpPlayers[0].id),normaliseId(grpPlayers[1].id)];
      teamB=[normaliseId(grpPlayers[2].id),normaliseId(grpPlayers[3].id)];
    }
    if(round._cupScoring||!cfg.enabled)return null;
    if(mode==='doubles'&&(!teamA.length||!teamB.length))return null;
    let lead=0,played=0,lastHole=0;
    const holeRows=[];
    holes.filter(h=>h.hole>=1&&h.hole<=18).forEach(hd=>{
      const h=hd.hole;
      if(mode==='foursomes'){
        const aGross=(holeScores[h]||{})[MATCHPLAY_FOURSOMES_A];
        const bGross=(holeScores[h]||{})[MATCHPLAY_FOURSOMES_B];
        if(!hasEnteredGross(aGross)||!hasEnteredGross(bGross))return;
        const markedAWon=isFoursomesWonMarker(aGross)||isFoursomesConcededMarker(bGross);
        const markedBWon=isFoursomesWonMarker(bGross)||isFoursomesConcededMarker(aGross);
        const aShot=shotsOnHole(cfg.teamAShots||0,hd.stroke_index);
        const bShot=shotsOnHole(cfg.teamBShots||0,hd.stroke_index);
        const aNet=isFoursomesOutcomeMarker(aGross)?null:(parseInt(aGross)||0)-aShot;
        const bNet=isFoursomesOutcomeMarker(bGross)?null:(parseInt(bGross)||0)-bShot;
        let winner='halve';
        if(markedAWon&&!markedBWon){lead+=1;winner='A';}
        else if(markedBWon&&!markedAWon){lead-=1;winner='B';}
        else if(aNet!==null&&bNet!==null&&aNet<bNet){lead+=1;winner='A';}
        else if(aNet!==null&&bNet!==null&&bNet<aNet){lead-=1;winner='B';}
        played+=1;lastHole=h;
        holeRows.push({hole:h,aGross,bGross,aNet,bNet,winner,lead});
      }else if(mode==='singles'){
        const aPid=teamA[0];
        const bPid=teamB[0];
        const aFound=grossForMatchplayPlayer(aPid,h);
        const bFound=grossForMatchplayPlayer(bPid,h);
        const aGross=aFound.value;
        const bGross=bFound.value;
        if(!hasEnteredGross(aGross)||!hasEnteredGross(bGross))return;
        const markedAWon=isFoursomesWonMarker(aGross)||isFoursomesConcededMarker(bGross);
        const markedBWon=isFoursomesWonMarker(bGross)||isFoursomesConcededMarker(aGross);
        const aShot=shotsOnHole(cfg.teamAShots||0,hd.stroke_index);
        const bShot=shotsOnHole(cfg.teamBShots||0,hd.stroke_index);
        const aNet=isFoursomesOutcomeMarker(aGross)?null:(parseInt(aGross)||0)-aShot;
        const bNet=isFoursomesOutcomeMarker(bGross)?null:(parseInt(bGross)||0)-bShot;
        let winner='halve';
        if(markedAWon&&!markedBWon){lead+=1;winner='A';}
        else if(markedBWon&&!markedAWon){lead-=1;winner='B';}
        else if(aNet!==null&&bNet!==null&&aNet<bNet){lead+=1;winner='A';}
        else if(aNet!==null&&bNet!==null&&bNet<aNet){lead-=1;winner='B';}
        played+=1;lastHole=h;
        holeRows.push({hole:h,aGross,bGross,aNet,bNet,winner,lead});
      }else{
        const scored=[...teamA,...teamB].every(pid=>hasEnteredGross((holeScores[h]||{})[pid]));
        if(!scored)return;
        const aBest=Math.max(...teamA.map(pid=>stablefordPointsValue(getLivePts(pid,h,(holeScores[h]||{})[pid])||0)));
        const bBest=Math.max(...teamB.map(pid=>stablefordPointsValue(getLivePts(pid,h,(holeScores[h]||{})[pid])||0)));
        let winner='halve';
        if(aBest>bBest){lead+=1;winner='A';}
        else if(bBest>aBest){lead-=1;winner='B';}
        played+=1;lastHole=h;
        holeRows.push({hole:h,aBest,bBest,winner,lead});
      }
    });
    const remaining=Math.max(0,18-played);
    const abs=Math.abs(lead);
    const isFinished=played&&lead!==0&&abs>remaining;
    const isDormie=played&&lead!==0&&remaining>0&&abs===remaining;
    const cfgTeamAName=String(cfg.teamAName||'').trim();
    const cfgTeamBName=String(cfg.teamBName||'').trim();
    const aName=mode==='foursomes'?((cfgTeamAName&&cfgTeamAName!=='Team 1')?cfgTeamAName:(matchplayTeamName(teamA)||'Team 1')):(matchplayTeamName(teamA)||'Team A');
    const bName=mode==='foursomes'?((cfgTeamBName&&cfgTeamBName!=='Team 2')?cfgTeamBName:(matchplayTeamName(teamB)||'Team 2')):(matchplayTeamName(teamB)||'Team B');
    const winningTeam=lead>0?'A':lead<0?'B':null;
    const winningName=winningTeam==='A'?aName:winningTeam==='B'?bName:'';
    const finalScore=isFinished?(abs+'&'+remaining):'';
    let label='A/S';
    let sub=played?'Thru '+lastHole:'Not started yet';
    if(played&&lead!==0){
      const leader=lead>0?aName:bName;
      if(isFinished) { label=leader+' win '+finalScore; sub='Match finished'; }
      else { label=leader+' '+abs+'UP'; sub='Thru '+lastHole; }
    } else if(played){ label='A/S'; sub='Thru '+lastHole; }
    return {mode,teamA,teamB,aName,bName,lead,played,lastHole,remaining,abs,isFinished,isDormie,winningTeam,winningName,finalScore,label,sub,holeRows,teamAShots:parseInt(cfg.teamAShots)||0,teamBShots:parseInt(cfg.teamBShots)||0,keepStableford:cfg.keepStableford!==false};
  }
  useEffect(()=>{
    const mp=matchplayState();
    if(!mp||mp.mode!=='foursomes'){foursomesNotifyStateRef.current=null;return;}
    const editTriggered=!!foursomesScoreEditRef.current;
    if(!canEdit||suppressFoursomesNotifyRef.current||!editTriggered){
      foursomesNotifyStateRef.current={lead:mp.lead,played:mp.played,lastHole:mp.lastHole,holeRows:mp.holeRows||[],isFinished:mp.isFinished,isDormie:mp.isDormie};
      suppressFoursomesNotifyRef.current=false;
      foursomesScoreEditRef.current=false;
      if(canEdit&&mp.isFinished)finishFoursomesMatchAutomatically(mp);
      return;
    }
    foursomesScoreEditRef.current=false;
    const prev=foursomesNotifyStateRef.current;
    if(!prev){
      foursomesNotifyStateRef.current={lead:mp.lead,played:mp.played,lastHole:mp.lastHole,holeRows:mp.holeRows||[],isFinished:mp.isFinished,isDormie:mp.isDormie};
      if(mp.isFinished)finishFoursomesMatchAutomatically(mp);
      return;
    }
    if(mp.played>prev.played){
      notifyFoursomesBirdiesForNewRows(mp,prev).catch(e=>console.warn('Snyder Live foursomes birdie notification error',e));
    }
    if(mp.lead>0&&prev.lead<=0){
      sendFoursomesMatchNotification('foursomes_lead','lead-A-'+mp.lastHole,'🔥 '+mp.aName+' go into the lead!',mp.label+' · '+notifyRoundName(),{hole:mp.lastHole,teamName:mp.aName});
    }else if(mp.lead<0&&prev.lead>=0){
      sendFoursomesMatchNotification('foursomes_lead','lead-B-'+mp.lastHole,'🔥 '+mp.bName+' go into the lead!',mp.label+' · '+notifyRoundName(),{hole:mp.lastHole,teamName:mp.bName});
    }
    const streakTeam=foursomesWinningStreak(mp.holeRows);
    const prevStreakTeam=foursomesWinningStreak(prev.holeRows);
    if(streakTeam&&streakTeam!==prevStreakTeam){
      const name=foursomesTeamNameFromKey(mp,streakTeam);
      sendFoursomesMatchNotification('foursomes_rampage','rampage-'+streakTeam+'-'+mp.lastHole,'🚨 '+name+' are on a rampage!',name+' have won 3 holes in a row · '+notifyRoundName(),{hole:mp.lastHole,teamName:name});
    }
    if(mp.isDormie&&!prev.isDormie&&mp.winningTeam){
      sendFoursomesMatchNotification('foursomes_dormie','dormie-'+mp.winningTeam+'-'+mp.remaining,'🔒 '+mp.winningName+' are dormie!',mp.abs+'UP with '+mp.remaining+' to play · '+notifyRoundName(),{hole:mp.lastHole,teamName:mp.winningName});
    }
    if(mp.isFinished&&!prev.isFinished&&mp.winningTeam){
      sendFoursomesMatchNotification('foursomes_won','won-'+mp.winningTeam+'-'+mp.finalScore,'🏁 '+mp.winningName+' win the match!',mp.finalScore+' · '+notifyRoundName(),{hole:mp.lastHole,teamName:mp.winningName,finalScore:mp.finalScore});
    }
    if(mp.isFinished)finishFoursomesMatchAutomatically(mp);
    foursomesNotifyStateRef.current={lead:mp.lead,played:mp.played,lastHole:mp.lastHole,holeRows:mp.holeRows||[],isFinished:mp.isFinished,isDormie:mp.isDormie};
  },[JSON.stringify(holeScores),matchplayConfig&&matchplayConfig.mode,matchplayConfig&&matchplayConfig.teamAName,matchplayConfig&&matchplayConfig.teamBName,canEdit,round&&round.id]);

  function MatchplayScoreBanner(){
    const mp=matchplayState();
    if(!mp)return null;
    const leadTeam=mp.lead>0?'A':mp.lead<0?'B':'tie';
    const bg=leadTeam==='A'?'linear-gradient(135deg,rgba(251,191,36,0.22),rgba(255,255,255,0.05))':leadTeam==='B'?'linear-gradient(135deg,rgba(0,112,187,0.28),rgba(255,255,255,0.05))':'linear-gradient(135deg,rgba(255,255,255,0.08),rgba(96,184,240,0.10))';
    const upText=mp.lead===0?'':Math.abs(mp.lead)+' UP';
    return <div style={{margin:'12px 16px 10px',...S.card,background:bg,borderColor:leadTeam==='A'?'rgba(251,191,36,0.38)':leadTeam==='B'?'rgba(96,184,240,0.42)':'rgba(255,255,255,0.13)'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:8}}>
        <div>
          <div style={{fontSize:11,color:'#90ccf0',fontWeight:900,letterSpacing:'0.12em'}}>{mp.mode==='foursomes'?'FOURSOMES MATCHPLAY':mp.mode==='singles'?'SINGLES MATCHPLAY':'DOUBLES MATCHPLAY'}</div>
          <div style={{fontSize:13,color:'rgba(255,255,255,0.72)',marginTop:2}}>{mp.mode==='foursomes'?'Alternate shot · lowest net score wins each hole':mp.mode==='singles'?(mp.keepStableford===false?'Singles matchplay only':'Singles matchplay + Stableford'):'Best Stableford score wins each hole'}</div>
        </div>
        <div style={{fontSize:11,color:'#d4af37',fontWeight:950}}>LIVE</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'52px minmax(0,1fr) 52px',gap:8,alignItems:'center'}}>
        <div style={{textAlign:'left',fontSize:24,color:leadTeam==='A'?'#fbbf24':'rgba(255,255,255,0.18)',fontWeight:950,lineHeight:1}}>{leadTeam==='A'?upText:''}</div>
        <div style={{textAlign:'center',minWidth:0}}>
          <div style={{fontSize:15,color:'#fff',fontWeight:950,whiteSpace:'normal',overflowWrap:'anywhere',lineHeight:1.12}}>{mp.aName} <span style={{color:'rgba(255,255,255,0.45)'}}>v</span> {mp.bName}</div>
          <div style={{fontSize:11,color:'#90ccf0',fontWeight:800,marginTop:3}}>{leadTeam==='tie'?mp.label+' · '+mp.sub:mp.sub}</div>
          {mp.mode==='singles'&&<div style={{fontSize:10,color:'rgba(255,255,255,0.62)',fontWeight:850,marginTop:3}}>{(mp.teamAShots||mp.teamBShots)?((mp.teamAShots?mp.aName+' get '+mp.teamAShots+' shot'+(mp.teamAShots===1?'':'s'):mp.bName+' get '+mp.teamBShots+' shot'+(mp.teamBShots===1?'':'s'))):'No shots given'}</div>}
          {mp.mode==='singles'&&mp.keepStableford!==false&&<div style={{marginTop:7,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div style={{background:'rgba(251,191,36,0.10)',border:'1px solid rgba(251,191,36,0.22)',borderRadius:10,padding:'6px 8px'}}><div style={{fontSize:10,color:'#fbbf24',fontWeight:950,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{mp.aName}</div><div style={{fontSize:18,color:'#fff',fontWeight:950}}>{getRunningMatchplayPlayer((mp.teamA||[])[0],holes.length)} <span style={{fontSize:10,color:'#90ccf0'}}>pts</span></div></div>
            <div style={{background:'rgba(96,184,240,0.10)',border:'1px solid rgba(96,184,240,0.22)',borderRadius:10,padding:'6px 8px'}}><div style={{fontSize:10,color:'#60b8f0',fontWeight:950,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{mp.bName}</div><div style={{fontSize:18,color:'#fff',fontWeight:950}}>{getRunningMatchplayPlayer((mp.teamB||[])[0],holes.length)} <span style={{fontSize:10,color:'#90ccf0'}}>pts</span></div></div>
          </div>}
        </div>
        <div style={{textAlign:'right',fontSize:24,color:leadTeam==='B'?'#60b8f0':'rgba(255,255,255,0.18)',fontWeight:950,lineHeight:1}}>{leadTeam==='B'?upText:''}</div>
      </div>
    </div>;
  }
  function MatchplayMiniStatus(){
    const mp=matchplayState();
    if(!mp)return null;
    const leadTeam=mp.lead>0?'A':mp.lead<0?'B':'tie';
    const tone=leadTeam==='A'?'rgba(251,191,36,0.18)':leadTeam==='B'?'rgba(0,112,187,0.24)':'rgba(255,255,255,0.08)';
    const upText=mp.lead===0?'':Math.abs(mp.lead)+' UP';
    return <div style={{marginTop:9,padding:'10px 11px',borderRadius:12,background:tone,border:'1px solid '+(leadTeam==='tie'?'rgba(255,255,255,0.13)':leadTeam==='A'?'rgba(251,191,36,0.34)':'rgba(96,184,240,0.36)'),display:'grid',gridTemplateColumns:'46px minmax(0,1fr) 46px',gap:8,alignItems:'center'}}>
      <div style={{minWidth:0,textAlign:'left',fontSize:20,color:leadTeam==='A'?'#fbbf24':'rgba(255,255,255,0.18)',fontWeight:950,lineHeight:1}}>{leadTeam==='A'?upText:''}</div>
      <div style={{textAlign:'center',minWidth:0}}>
        <div style={{fontSize:10,color:'#90ccf0',fontWeight:950,letterSpacing:'0.1em'}}>MATCHPLAY</div>
        <div style={{fontSize:12,color:'#fff',fontWeight:950,whiteSpace:'normal',overflowWrap:'anywhere',lineHeight:1.12}}><span style={{color:'#fbbf24'}}>{mp.aName}</span> <span style={{color:'rgba(255,255,255,0.48)',fontWeight:900}}>v</span> <span style={{color:'#60b8f0'}}>{mp.bName}</span></div>
        <div style={{fontSize:10,color:'#90ccf0',fontWeight:850,marginTop:2}}>{leadTeam==='tie'?mp.label+' · '+mp.sub:mp.sub}</div>
        {mp.mode==='singles'&&<div style={{fontSize:10,color:'rgba(255,255,255,0.62)',fontWeight:850,marginTop:3}}>{(mp.teamAShots||mp.teamBShots)?((mp.teamAShots?mp.aName+' get '+mp.teamAShots+' shot'+(mp.teamAShots===1?'':'s'):mp.bName+' get '+mp.teamBShots+' shot'+(mp.teamBShots===1?'':'s'))):'No shots given'}</div>}
        {mp.mode==='singles'&&mp.keepStableford!==false&&<div style={{marginTop:7,display:'grid',gridTemplateColumns:'1fr 1fr',gap:7}}>
          <div style={{background:'rgba(251,191,36,0.10)',border:'1px solid rgba(251,191,36,0.22)',borderRadius:9,padding:'5px 7px'}}><div style={{fontSize:9,color:'#fbbf24',fontWeight:950,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{mp.aName}</div><div style={{fontSize:16,color:'#fff',fontWeight:950}}>{getRunningMatchplayPlayer((mp.teamA||[])[0],holes.length)} <span style={{fontSize:9,color:'#90ccf0'}}>pts</span></div></div>
          <div style={{background:'rgba(96,184,240,0.10)',border:'1px solid rgba(96,184,240,0.22)',borderRadius:9,padding:'5px 7px'}}><div style={{fontSize:9,color:'#60b8f0',fontWeight:950,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{mp.bName}</div><div style={{fontSize:16,color:'#fff',fontWeight:950}}>{getRunningMatchplayPlayer((mp.teamB||[])[0],holes.length)} <span style={{fontSize:9,color:'#90ccf0'}}>pts</span></div></div>
        </div>}
      </div>
      <div style={{minWidth:0,textAlign:'right',fontSize:20,color:leadTeam==='B'?'#60b8f0':'rgba(255,255,255,0.18)',fontWeight:950,lineHeight:1}}>{leadTeam==='B'?upText:''}</div>
    </div>;
  }

  function FoursomesScoreInput(){
    if(!inputHole||![MATCHPLAY_FOURSOMES_A,MATCHPLAY_FOURSOMES_B].includes(inputHole.pid))return null;
    const{holeNum,pid}=inputHole;
    const hd=getHole(holeNum);
    const mp=matchplayState();
    const name=pid===MATCHPLAY_FOURSOMES_A?(mp&&mp.aName||'Team 1'):(mp&&mp.bName||'Team 2');
    const otherPid=pid===MATCHPLAY_FOURSOMES_A?MATCHPLAY_FOURSOMES_B:MATCHPLAY_FOURSOMES_A;
    const otherName=otherPid===MATCHPLAY_FOURSOMES_A?(mp&&mp.aName||'Team 1'):(mp&&mp.bName||'Team 2');
    const dv=parseInt(inputVal)||hd.par;
    const opts=Array.from({length:10},(_,i)=>Math.max(1,hd.par-2)+i);
    const modal=(<div style={{position:'fixed',inset:0,width:'100vw',maxWidth:'100vw',overflow:'hidden',background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:16,boxSizing:'border-box'}} onClick={e=>{if(e.target===e.currentTarget)setInputHole(null);}}>
      <div style={{background:'#0d2548',border:'1px solid rgba(255,255,255,0.2)',borderRadius:16,padding:16,width:'100%',maxWidth:'min(340px,calc(100vw - 32px))',boxSizing:'border-box'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}><div><div style={{fontSize:12,color:'#60b8f0',textTransform:'uppercase'}}>Hole {holeNum} · Par {hd.par}</div><div style={{fontSize:22,color:'#fff',fontWeight:900}}>{name}</div></div><button onClick={()=>setInputHole(null)} style={{background:'none',border:'none',color:'#fff',fontSize:24,cursor:'pointer'}}>×</button></div>
        <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:10,marginBottom:10}}>{opts.map(s=>{const isSel=dv===s;return <button key={s} onClick={()=>setInputVal(String(s))} style={{minWidth:52,height:62,flexShrink:0,borderRadius:10,border:'2px solid '+(isSel?'#0070BB':'rgba(255,255,255,0.2)'),background:isSel?'#0070BB':'rgba(255,255,255,0.06)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,color:'#fff',fontWeight:900}}>{s}</button>;})}</div>
        <button onClick={()=>{setScore(holeNum,pid,dv);setInputHole(null);}} style={{...S.pri,width:'100%',padding:13,fontSize:15}}>Save {dv}</button>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
          <button onClick={()=>{setFoursomesHoleOutcome(holeNum,pid);setInputHole(null);}} style={{border:'1px solid rgba(34,197,94,0.45)',background:'rgba(34,197,94,0.16)',color:'#86efac',borderRadius:10,padding:'10px 8px',fontSize:12,fontWeight:950,cursor:'pointer'}}>Won hole</button>
          <button onClick={()=>{setFoursomesHoleOutcome(holeNum,otherPid);setInputHole(null);}} style={{border:'1px solid rgba(239,68,68,0.45)',background:'rgba(239,68,68,0.14)',color:'#fecaca',borderRadius:10,padding:'10px 8px',fontSize:12,fontWeight:950,cursor:'pointer'}}>Concede</button>
        </div>
        <button onClick={()=>{setFoursomesHoleOutcome(holeNum,null);setInputHole(null);}} style={{...S.gho,width:'100%',padding:9,fontSize:12,marginTop:8}}>Clear hole</button>
        <div style={{fontSize:10,color:'rgba(255,255,255,0.48)',textAlign:'center',marginTop:8}}>Concede gives the hole to {otherName}</div>
      </div>
    </div>);
    return ReactDOM.createPortal(modal,document.body);
  }
  function SinglesMatchplayScoreInput(){
    if(!inputHole||!isSinglesMatchplayOnlyPlayer(inputHole.pid))return null;
    const{holeNum,pid}=inputHole;
    const hd=getHole(holeNum);
    const mp=matchplayState();
    if(!mp||mp.mode!=='singles'||mp.keepStableford!==false)return null;
    const ids=singlesMatchplayOnlyIds();
    const name=normaliseId(pid)===normaliseId(ids[0])?mp.aName:mp.bName;
    const otherPid=normaliseId(pid)===normaliseId(ids[0])?ids[1]:ids[0];
    const otherName=normaliseId(otherPid)===normaliseId(ids[0])?mp.aName:mp.bName;
    const dv=parseInt(inputVal)||hd.par;
    const opts=Array.from({length:10},(_,i)=>Math.max(1,hd.par-2)+i);
    const modal=(<div style={{position:'fixed',inset:0,width:'100vw',maxWidth:'100vw',overflow:'hidden',background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:16,boxSizing:'border-box'}} onClick={e=>{if(e.target===e.currentTarget)setInputHole(null);}}>
      <div style={{background:'#0d2548',border:'1px solid rgba(255,255,255,0.2)',borderRadius:16,padding:16,width:'100%',maxWidth:'min(340px,calc(100vw - 32px))',boxSizing:'border-box'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}><div><div style={{fontSize:12,color:'#60b8f0',textTransform:'uppercase'}}>Hole {holeNum} · Par {hd.par}</div><div style={{fontSize:22,color:'#fff',fontWeight:900}}>{name}</div></div><button onClick={()=>setInputHole(null)} style={{background:'none',border:'none',color:'#fff',fontSize:24,cursor:'pointer'}}>×</button></div>
        <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:10,marginBottom:10}}>{opts.map(s=>{const isSel=dv===s;return <button key={s} onClick={()=>setInputVal(String(s))} style={{minWidth:52,height:62,flexShrink:0,borderRadius:10,border:'2px solid '+(isSel?'#0070BB':'rgba(255,255,255,0.2)'),background:isSel?'#0070BB':'rgba(255,255,255,0.06)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,color:'#fff',fontWeight:900}}>{s}</button>;})}</div>
        <button onClick={()=>{setScore(holeNum,pid,dv);setInputHole(null);}} style={{...S.pri,width:'100%',padding:13,fontSize:15}}>Save {dv}</button>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
          <button onClick={()=>{setSinglesMatchplayHoleOutcome(holeNum,pid);setInputHole(null);}} style={{border:'1px solid rgba(34,197,94,0.45)',background:'rgba(34,197,94,0.16)',color:'#86efac',borderRadius:10,padding:'10px 8px',fontSize:12,fontWeight:950,cursor:'pointer'}}>Won hole</button>
          <button onClick={()=>{setSinglesMatchplayHoleOutcome(holeNum,otherPid);setInputHole(null);}} style={{border:'1px solid rgba(239,68,68,0.45)',background:'rgba(239,68,68,0.14)',color:'#fecaca',borderRadius:10,padding:'10px 8px',fontSize:12,fontWeight:950,cursor:'pointer'}}>Concede</button>
        </div>
        <button onClick={()=>{setSinglesMatchplayHoleOutcome(holeNum,null);setInputHole(null);}} style={{...S.gho,width:'100%',padding:9,fontSize:12,marginTop:8}}>Clear hole</button>
        <div style={{fontSize:10,color:'rgba(255,255,255,0.48)',textAlign:'center',marginTop:8}}>Concede gives the hole to {otherName}</div>
      </div>
    </div>);
    return ReactDOM.createPortal(modal,document.body);
  }
  function FoursomesScorecard(){
    const mp=matchplayState();
    if(!mp||mp.mode!=='foursomes')return null;
    const teamIds=[MATCHPLAY_FOURSOMES_A,MATCHPLAY_FOURSOMES_B];
    const names=[mp.aName,mp.bName];
    const shots=[mp.teamAShots,mp.teamBShots];
    const matchFinished=!!(mp.isFinished||foursomesAutoFinished||!isLiveRound(round));
    const canInput=canEdit&&!matchFinished;
    return <div style={{paddingBottom:40}}>
      <FoursomesScoreInput/>
      <div style={{padding:'10px 14px 12px',background:'linear-gradient(135deg,rgba(0,112,187,0.24),rgba(251,191,36,0.10))',borderBottom:'1px solid rgba(96,184,240,0.18)'}}>
        <MatchplayMiniStatus/>
        {matchFinished&&<div style={{marginTop:10,padding:'10px 12px',borderRadius:12,background:'rgba(34,197,94,0.16)',border:'1px solid rgba(34,197,94,0.35)',color:'#bbf7d0',fontSize:13,fontWeight:950,textAlign:'center'}}>🏁 Match finished · {mp.label}</div>}
      </div>
      {['FRONT 9','BACK 9'].map((label,sec)=>{const list=sec===0?front9:back9;return <div key={label}>
        <div style={{padding:'6px 12px',fontSize:11,color:'#60b8f0',letterSpacing:'0.1em',textTransform:'uppercase',background:'rgba(0,0,0,0.3)'}}>{label}</div>
        <div style={{display:'grid',gridTemplateColumns:'80px 1fr 1fr',padding:'8px 12px',borderBottom:'1px solid rgba(255,255,255,0.1)',background:'linear-gradient(135deg,rgba(0,50,120,0.72),rgba(0,112,187,0.32))',gap:6,alignItems:'center'}}>
          <div style={{fontSize:9,color:'#60b8f0',textTransform:'uppercase',letterSpacing:'0.08em'}}>Hole</div>
          {names.map((n,i)=><div key={i} style={{textAlign:'center',minWidth:0}}><ScorecardPlayerBadge player={{id:teamIds[i],display_name:n,name:n}} size={28} compact/><div style={{fontSize:10,color:'#90ccf0',fontWeight:800,marginTop:2}}>{shots[i]?shots[i]+' shots':'No shots'}</div></div>)}
        </div>
        {list.map((hd,i)=>{const vals=teamIds.map(id=>(holeScores[hd.hole]||{})[id]);return <div key={hd.hole} style={{display:'grid',gridTemplateColumns:'80px 1fr 1fr',minHeight:74,borderBottom:'1px solid rgba(255,255,255,0.06)',background:i%2===0?'rgba(255,255,255,0.03)':'rgba(255,255,255,0.06)'}}>
          <div style={{padding:'8px 12px',background:'rgba(0,0,0,0.18)'}}><div style={{fontSize:26,color:'#fff',fontWeight:300}}>{hd.hole}</div><div style={{fontSize:12,color:'#60b8f0'}}>Par {hd.par}</div><div style={{fontSize:11,color:'#d4af37',fontWeight:800}}>SI {hd.stroke_index}</div></div>
          {teamIds.map((id,idx)=>{const g=vals[idx];const marker=isFoursomesOutcomeMarker(g);const has=hasEnteredGross(g);const holeShots=shotsOnHole(shots[idx]||0,hd.stroke_index);const gets=holeShots>0;const other=vals[idx===0?1:0];const otherMarker=isFoursomesOutcomeMarker(other);const both=hasEnteredGross(g)&&hasEnteredGross(other);const net=marker?null:(parseInt(g)||0)-holeShots;const otherHoleShots=shotsOnHole(shots[idx===0?1:0]||0,hd.stroke_index);const otherNet=otherMarker?null:(parseInt(other)||0)-otherHoleShots;const markedWon=isFoursomesWonMarker(g)||isFoursomesConcededMarker(other);const markedLost=isFoursomesConcededMarker(g)||isFoursomesWonMarker(other);const won=both&&(markedWon||(!markedLost&&net!==null&&otherNet!==null&&net<otherNet));const lost=both&&(markedLost||(!markedWon&&net!==null&&otherNet!==null&&net>otherNet));const bg=won?'linear-gradient(135deg,rgba(34,197,94,0.34),rgba(34,197,94,0.12))':lost?'linear-gradient(135deg,rgba(239,68,68,0.22),rgba(255,255,255,0.04))':has?'linear-gradient(135deg,rgba(0,112,187,0.24),rgba(96,184,240,0.08))':'transparent';return <div key={id} onClick={()=>canInput&&(setInputVal(has&&!marker?String(Math.abs(parseInt(g)||0)):''),setInputHole({holeNum:hd.hole,pid:id}))} style={{display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:4,borderLeft:'1px solid rgba(255,255,255,0.06)',cursor:canInput?'pointer':'default',background:bg,boxShadow:won?'inset 0 0 0 1px rgba(34,197,94,0.30)':lost?'inset 0 0 0 1px rgba(239,68,68,0.18)':'none'}}>
            <div style={{fontSize:marker?18:34,color:has?'#fff':'rgba(255,255,255,0.25)',fontWeight:900,letterSpacing:marker?'0.04em':0}}>{marker?(isFoursomesWonMarker(g)?'WON':'CON'):has?grossDisplay(g):canInput?'TAP':'-'}</div>
            {has&&<div style={{fontSize:11,color:won?'#86efac':lost?'#fecaca':'#90ccf0',fontWeight:950}}>{marker?(won?'hole won':'conceded'):(gets?'Net '+net:'Gross')}{won&&!marker?' - won hole':''}</div>}
            {!has&&gets&&<div style={{fontSize:11,color:'#d4af37',fontWeight:900}}>{holeShots} shot{holeShots===1?'':'s'}</div>}
          </div>;})}
        </div>;})}
      </div>;})}
      {matchFinished&&<div style={{padding:'14px 16px 24px'}}><button onClick={()=>setView('home')} style={{...S.pri,width:'100%',padding:15,fontSize:16,background:'#0a8a4a'}}>Home</button></div>}
    </div>;
  }
  function SinglesMatchplayOnlyScorecard(){
    const mp=matchplayState();
    if(!mp||mp.mode!=='singles'||mp.keepStableford!==false)return null;
    const ids=singlesMatchplayOnlyIds();
    if(ids.length!==2)return null;
    const names=[mp.aName,mp.bName];
    const shots=[mp.teamAShots,mp.teamBShots];
    const matchFinished=!!(mp.isFinished||!isLiveRound(round));
    const canInput=canEdit&&!matchFinished;
    return <div style={{paddingBottom:40}}>
      <SinglesMatchplayScoreInput/>
      <div style={{padding:'10px 14px 12px',background:'linear-gradient(135deg,rgba(0,112,187,0.24),rgba(251,191,36,0.10))',borderBottom:'1px solid rgba(96,184,240,0.18)'}}>
        <MatchplayMiniStatus/>
        {matchFinished&&<div style={{marginTop:10,padding:'10px 12px',borderRadius:12,background:'rgba(34,197,94,0.16)',border:'1px solid rgba(34,197,94,0.35)',color:'#bbf7d0',fontSize:13,fontWeight:950,textAlign:'center'}}>Match finished · {mp.label}</div>}
      </div>
      {['FRONT 9','BACK 9'].map((label,sec)=>{const list=sec===0?front9:back9;return <div key={label}>
        <div style={{padding:'6px 12px',fontSize:11,color:'#60b8f0',letterSpacing:'0.1em',textTransform:'uppercase',background:'rgba(0,0,0,0.3)'}}>{label}</div>
        <div style={{display:'grid',gridTemplateColumns:'80px 1fr 1fr',padding:'8px 12px',borderBottom:'1px solid rgba(255,255,255,0.1)',background:'linear-gradient(135deg,rgba(0,50,120,0.72),rgba(0,112,187,0.32))',gap:6,alignItems:'center'}}>
          <div style={{fontSize:9,color:'#60b8f0',textTransform:'uppercase',letterSpacing:'0.08em'}}>Hole</div>
          {names.map((n,i)=><div key={i} style={{textAlign:'center',minWidth:0}}><ScorecardPlayerBadge player={{id:ids[i],display_name:n,name:n}} size={28} compact/><div style={{fontSize:10,color:'#90ccf0',fontWeight:800,marginTop:2}}>{shots[i]?shots[i]+' shots':'No shots'}</div></div>)}
        </div>
        {list.map((hd,i)=>{const vals=ids.map(id=>(holeScores[hd.hole]||{})[id]);return <div key={hd.hole} style={{display:'grid',gridTemplateColumns:'80px 1fr 1fr',minHeight:74,borderBottom:'1px solid rgba(255,255,255,0.06)',background:i%2===0?'rgba(255,255,255,0.03)':'rgba(255,255,255,0.06)'}}>
          <div style={{padding:'8px 12px',background:'rgba(0,0,0,0.18)'}}><div style={{fontSize:26,color:'#fff',fontWeight:300}}>{hd.hole}</div><div style={{fontSize:12,color:'#60b8f0'}}>Par {hd.par}</div><div style={{fontSize:11,color:'#d4af37',fontWeight:800}}>SI {hd.stroke_index}</div></div>
          {ids.map((id,idx)=>{const g=vals[idx];const marker=isFoursomesOutcomeMarker(g);const has=hasEnteredGross(g);const holeShots=shotsOnHole(shots[idx]||0,hd.stroke_index);const gets=holeShots>0;const other=vals[idx===0?1:0];const otherMarker=isFoursomesOutcomeMarker(other);const both=hasEnteredGross(g)&&hasEnteredGross(other);const net=marker?null:(parseInt(g)||0)-holeShots;const otherHoleShots=shotsOnHole(shots[idx===0?1:0]||0,hd.stroke_index);const otherNet=otherMarker?null:(parseInt(other)||0)-otherHoleShots;const markedWon=isFoursomesWonMarker(g)||isFoursomesConcededMarker(other);const markedLost=isFoursomesConcededMarker(g)||isFoursomesWonMarker(other);const won=both&&(markedWon||(!markedLost&&net!==null&&otherNet!==null&&net<otherNet));const lost=both&&(markedLost||(!markedWon&&net!==null&&otherNet!==null&&net>otherNet));const bg=won?'linear-gradient(135deg,rgba(34,197,94,0.34),rgba(34,197,94,0.12))':lost?'linear-gradient(135deg,rgba(239,68,68,0.22),rgba(255,255,255,0.04))':has?'linear-gradient(135deg,rgba(0,112,187,0.24),rgba(96,184,240,0.08))':'transparent';return <div key={id} onClick={()=>canInput&&(setInputVal(has&&!marker?String(Math.abs(parseInt(g)||0)):''),setInputHole({holeNum:hd.hole,pid:id}))} style={{display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:4,borderLeft:'1px solid rgba(255,255,255,0.06)',cursor:canInput?'pointer':'default',background:bg,boxShadow:won?'inset 0 0 0 1px rgba(34,197,94,0.30)':lost?'inset 0 0 0 1px rgba(239,68,68,0.18)':'none'}}>
            <div style={{fontSize:marker?18:34,color:has?'#fff':'rgba(255,255,255,0.25)',fontWeight:900,letterSpacing:marker?'0.04em':0}}>{marker?(isFoursomesWonMarker(g)?'WON':'CON'):has?grossDisplay(g):canInput?'TAP':'-'}</div>
            {has&&<div style={{fontSize:11,color:won?'#86efac':lost?'#fecaca':'#90ccf0',fontWeight:950}}>{marker?(won?'hole won':'conceded'):(gets?'Net '+net:'Gross')}{won&&!marker?' - won hole':''}</div>}
            {!has&&gets&&<div style={{fontSize:11,color:'#d4af37',fontWeight:900}}>{holeShots} shot{holeShots===1?'':'s'}</div>}
          </div>;})}
        </div>;})}
      </div>;})}
      {matchFinished&&<div style={{padding:'14px 16px 24px'}}><button onClick={()=>setView('home')} style={{...S.pri,width:'100%',padding:15,fontSize:16,background:'#0a8a4a'}}>Home</button></div>}
    </div>;
  }

  function SweepstakeMoneyButton(){
    const sw=sweepstakePlayerRows();
    if(!sw.enabled)return null;
    return <button aria-label="Open sweepstake standings" title="Sweepstake" onClick={()=>{refreshScoresFromCloud(false);setShowSweepstake(true);}} style={{width:38,height:38,borderRadius:10,border:'1px solid rgba(245,158,11,0.45)',background:'rgba(245,158,11,0.14)',color:'#fbbf24',fontSize:20,fontWeight:950,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0,lineHeight:1}}>💰</button>;
  }
  function ScorecardNotificationButton(){
    if(!round||!round.id||!isLiveRound(round))return null;
    const enabledGlobally=localStorage.getItem('liveNotificationsEnabled')==='true'||(('Notification' in window)&&Notification.permission==='granted'&&localStorage.getItem('liveNotificationsMuted')!=='true');
    const muted=scorecardNotificationsOff;
    return <button aria-label={muted?'Turn scorecard notifications on':'Turn scorecard notifications off'} title={muted?'Notifications off for this scorecard':'Notifications on for this scorecard'} onClick={()=>{
      const next=!muted;
      setScorecardNotificationsMuted(round.id,next);
      setScorecardNotificationsOff(next);
      flash(next?'Notifications off for this scorecard':'Notifications on for this scorecard');
    }} style={{width:38,height:38,borderRadius:10,border:'1px solid '+(muted?'rgba(148,163,184,0.34)':enabledGlobally?'rgba(34,197,94,0.42)':'rgba(245,158,11,0.38)'),background:muted?'rgba(148,163,184,0.12)':enabledGlobally?'rgba(34,197,94,0.15)':'rgba(245,158,11,0.12)',color:muted?'#94a3b8':enabledGlobally?'#86efac':'#fbbf24',fontSize:18,fontWeight:950,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0,lineHeight:1}}>{muted?'🔕':'🔔'}</button>;
  }

  function leagueSubmitToLocalDate(value){
    if(value instanceof Date)return new Date(value.getFullYear(),value.getMonth(),value.getDate());
    if(typeof value==='string'){
      const m=value.slice(0,10).split('-').map(Number);
      if(m[0]&&m[1]&&m[2])return new Date(m[0],m[1]-1,m[2]);
    }
    const d=value?new Date(value):new Date();
    return new Date(d.getFullYear(),d.getMonth(),d.getDate());
  }
  function leagueSubmitDateKey(value){
    const d=leagueSubmitToLocalDate(value);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function leagueSubmitIsScoreDay(value){
    const day=leagueSubmitToLocalDate(value).getDay();
    return day===3||day===6||day===0;
  }
  function leagueSubmitRoundDateKey(){
    const d=leagueSubmitToLocalDate(roundStartDate(round));
    for(let i=0;i<7;i++){
      const candidate=new Date(d);
      candidate.setDate(d.getDate()-i);
      if(leagueSubmitIsScoreDay(candidate))return leagueSubmitDateKey(candidate);
    }
    return leagueSubmitDateKey(d);
  }
  function leagueSubmitWeekKey(value){
    const d=leagueSubmitToLocalDate(value),t=new Date(d);
    t.setDate(d.getDate()-((d.getDay()+6)%7)+3);
    const j=new Date(t.getFullYear(),0,4);
    const w=1+Math.round((t-j)/604800000);
    return `${t.getFullYear()}-W${String(w).padStart(2,'0')}`;
  }
  function leagueSubmitNameKey(value){
    return String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
  }
  function leagueSubmitFirstName(value){
    return leagueSubmitNameKey(value).split(' ')[0]||'';
  }
  function leagueSubmitPlayerName(player){
    return String((player&&(player.name||player.display_name||player.username))||'Player').trim();
  }
  function findLeagueSubmitPlayer(scorecardPlayer,leaguePlayers,links=leagueSubmitLinks){
    const linked=links&&links[leagueLinkLiveId(scorecardPlayer)];
    if(linked&&linked.league_player_id){
      const byId=(leaguePlayers||[]).find(p=>normaliseId(p&&p.id)===normaliseId(linked.league_player_id));
      if(byId)return byId;
    }
    const name=leagueSubmitPlayerName(scorecardPlayer);
    const key=leagueSubmitNameKey(name);
    const exact=(leaguePlayers||[]).find(p=>leagueSubmitNameKey(p&&p.name)===key);
    if(exact)return exact;
    const first=leagueSubmitFirstName(name);
    if(!first)return null;
    const matches=(leaguePlayers||[]).filter(p=>leagueSubmitFirstName(p&&p.name)===first);
    return matches.length===1?matches[0]:null;
  }
  function leagueSubmitScoresInWeek(playerId,approved,pending,dateKey){
    const w=leagueSubmitWeekKey(dateKey);
    const id=normaliseId(playerId);
    return [...(approved||[]),...(pending||[])].filter(s=>normaliseId(s&&s.player_id)===id&&leagueSubmitWeekKey(s&&s.date)===w).length;
  }
  function leagueSubmitCompletedHoles(pid){
    return holes.filter(h=>hasEnteredGross((holeScores[h.hole]||{})[pid])).length;
  }
  function buildLeagueSubmitData(leaguePlayers,approved,pending,snakeLog,links=leagueSubmitLinks){
    const dateKey=leagueSubmitRoundDateKey();
    const rows=(grpPlayers||[]).map(p=>{
      const leaguePlayer=findLeagueSubmitPlayer(p,leaguePlayers,links);
      const holesPlayed=leagueSubmitCompletedHoles(p.id);
      const points=getRunning(p.id,holes.length);
      const already=leaguePlayer?[...(approved||[]),...(pending||[])].some(s=>normaliseId(s&&s.player_id)===normaliseId(leaguePlayer.id)&&leagueSubmitDateKey(s&&s.date)===dateKey):false;
      const weekCount=leaguePlayer?leagueSubmitScoresInWeek(leaguePlayer.id,approved,pending,dateKey):0;
      let status='Ready';
      let ready=true;
      if(!leaguePlayer){status='Not in League';ready=false;}
      else if(holesPlayed<18){status=`${holesPlayed}/18 holes`;ready=false;}
      else if(already){status='Already submitted';ready=false;}
      else if(weekCount>=2){status='2 this week';ready=false;}
      return {key:normaliseId(p.id),scorecardPlayer:p,leaguePlayer,points,holesPlayed,ready,status};
    });
    const snakeScorecardId=snakeHolderForHole(18);
    const snakeScorecardPlayer=snakeScorecardId?(grpPlayers||[]).find(p=>normaliseId(p.id)===normaliseId(snakeScorecardId)):null;
    const snakeLeaguePlayer=snakeScorecardPlayer?findLeagueSubmitPlayer(snakeScorecardPlayer,leaguePlayers,links):null;
    const snakeAlready=snakeLeaguePlayer?(snakeLog||[]).some(s=>normaliseId(s&&s.player_id)===normaliseId(snakeLeaguePlayer.id)&&leagueSubmitDateKey(s&&s.date)===dateKey):false;
    return {
      dateKey,
      rows,
      leaguePlayers:leaguePlayers||[],
      snake:{scorecardPlayer:snakeScorecardPlayer,leaguePlayer:snakeLeaguePlayer,already:snakeAlready},
    };
  }
  async function loadLeagueSubmitData(){
    if(!sb||!round||round._cupScoring||isFoursomesScorecard)return;
    setLeagueSubmitLoading(true);
    setLeagueSubmitNote('');
    try{
      const [{data:leaguePlayers,error:playersError},{data:approved,error:approvedError},{data:pending,error:pendingError},{data:snakeLog,error:snakeError},linkResult]=await Promise.all([
        sb.from('players').select('*').order('name',{ascending:true}),
        sb.from('scores').select('*').order('date',{ascending:false}),
        sb.from('pending_scores').select('*').order('submitted_at',{ascending:false}),
        sb.from('snake_log').select('*').order('created_at',{ascending:false}),
        fetchLeaguePlayerLinks(sb)
      ]);
      const err=playersError||approvedError||pendingError||snakeError;
      if(err)throw err;
      const links=(linkResult&&linkResult.links)||{};
      setLeagueSubmitLinks(links);
      setLeagueSubmitLinkCloud(!(linkResult&&linkResult.cloudAvailable===false));
      const data=buildLeagueSubmitData(leaguePlayers||[],approved||[],pending||[],snakeLog||[],links);
      setLeagueSubmitData(data);
      setLeagueSubmitSelected(Object.fromEntries((data.rows||[]).filter(r=>r.ready).map(r=>[r.key,true])));
    }catch(e){
      setLeagueSubmitData(null);
      setLeagueSubmitNote('League check failed: '+(e.message||String(e)));
    }finally{
      setLeagueSubmitLoading(false);
    }
  }
  useEffect(()=>{
    if(isCompletedRound(round)&&!round._cupScoring&&!isFoursomesScorecard)loadLeagueSubmitData();
  },[round&&round.id,round&&round.status,activeGroupId]);

  async function submitCompletedRoundToLeague(){
    if(leagueSubmitSubmittingRef.current)return {ok:false,msg:'League submit is already running'};
    if(!leagueSubmitData)return {ok:false,msg:'League scores are still being checked'};
    let selected=(leagueSubmitData.rows||[]).filter(r=>r.ready&&leagueSubmitSelected[r.key]);
    const selectedByPlayer={};
    selected.forEach(r=>{if(r&&r.leaguePlayer&&!selectedByPlayer[normaliseId(r.leaguePlayer.id)])selectedByPlayer[normaliseId(r.leaguePlayer.id)]=r;});
    selected=Object.values(selectedByPlayer);
    if(!selected.length){
      const msg='Choose at least one League score';
      flash(msg,'error');
      return {ok:false,msg};
    }
    leagueSubmitSubmittingRef.current=true;
    setLeagueSubmitSubmitting(true);
    setLeagueSubmitNote('');
    try{
      const [{data:freshApproved,error:freshApprovedError},{data:freshPending,error:freshPendingError}]=await Promise.all([
        sb.from('scores').select('id,player_id,date').eq('date',leagueSubmitData.dateKey),
        sb.from('pending_scores').select('id,player_id,date').eq('date',leagueSubmitData.dateKey)
      ]);
      const freshErr=freshApprovedError||freshPendingError;
      if(freshErr)throw freshErr;
      const existingKeys=new Set([...(freshApproved||[]),...(freshPending||[])].map(s=>normaliseId(s&&s.player_id)+'|'+leagueSubmitDateKey(s&&s.date)));
      const skipped=selected.filter(r=>existingKeys.has(normaliseId(r.leaguePlayer.id)+'|'+leagueSubmitData.dateKey));
      selected=selected.filter(r=>!existingKeys.has(normaliseId(r.leaguePlayer.id)+'|'+leagueSubmitData.dateKey));
      if(!selected.length){
        const msg='Those League scores have already been submitted';
        setLeagueSubmitNote(msg);
        setLeagueSubmitChoice(msg);
        flash(msg);
        await loadLeagueSubmitData();
        return {ok:true,msg};
      }
      const rows=selected.map(r=>({
        player_id:r.leaguePlayer.id,
        player_name:r.leaguePlayer.name,
        points:r.points,
        date:leagueSubmitData.dateKey,
        is_double_chip:false,
        snake_player_id:null,
        snake_player_name:null
      }));
      const {error}=await sb.from('pending_scores').insert(rows);
      if(error)throw error;
      selected.forEach(r=>sendSnyderLeagueNotification(snyderLeagueScoreNotificationText(r.leaguePlayer.name,r.points)));
      let snakeText='';
      const snake=leagueSubmitData.snake;
      if(snake&&snake.leaguePlayer&&!snake.already){
        const {data:existing,error:existingError}=await sb.from('snake_log')
          .select('id')
          .eq('player_id',snake.leaguePlayer.id)
          .eq('date',leagueSubmitData.dateKey)
          .limit(1);
        if(existingError)throw existingError;
        if(!existing||!existing.length){
          const {error:snakeError}=await sb.from('snake_log').insert({
            player_id:snake.leaguePlayer.id,
            player_name:snake.leaguePlayer.name,
            date:leagueSubmitData.dateKey,
            confirmed:false
          });
          if(snakeError)throw snakeError;
          snakeText=' + snake claim';
          sendSnyderLeagueNotification({title:'Snake submitted',body:`🐍 ${snake.leaguePlayer.name} got the snake. That's another £10 in the curry pot.`});
        }
      }
      const msg=`Submitted ${selected.length} League score${selected.length===1?'':'s'}${snakeText}${skipped.length?` · skipped ${skipped.length} duplicate${skipped.length===1?'':'s'}`:''}`;
      setLeagueSubmitNote(msg);
      setLeagueSubmitChoice(msg);
      flash(msg);
      await loadLeagueSubmitData();
      return {ok:true,msg};
    }catch(e){
      const msg=e.message||String(e);
      setLeagueSubmitNote('Submit failed: '+msg);
      flash('League submit failed: '+msg,'error');
      return {ok:false,msg:'Submit failed: '+msg};
    }finally{
      setLeagueSubmitSubmitting(false);
      leagueSubmitSubmittingRef.current=false;
    }
  }

  async function linkScorecardPlayerToLeague(row,leaguePlayerId){
    if(!row||!leaguePlayerId||!leagueSubmitData)return;
    const leaguePlayer=(leagueSubmitData.rows||[]).map(r=>r.leaguePlayer).filter(Boolean).find(p=>normaliseId(p.id)===normaliseId(leaguePlayerId))
      ||((leagueSubmitData&&leagueSubmitData.leaguePlayers)||[]).find(p=>normaliseId(p.id)===normaliseId(leaguePlayerId));
    const allLeaguePlayers=((leagueSubmitData&&leagueSubmitData.leaguePlayers)||[]);
    const chosen=leaguePlayer||allLeaguePlayers.find(p=>normaliseId(p.id)===normaliseId(leaguePlayerId));
    if(!chosen){flash('Choose a League player','error');return;}
    const liveId=leagueLinkLiveId(row.scorecardPlayer);
    if(!liveId){flash('This player cannot be linked','error');return;}
    setLeagueSubmitLinking(row.key);
    try{
      const result=await saveLeaguePlayerLink(sb,{
        live_user_id:liveId,
        live_name:leagueLinkLiveName(row.scorecardPlayer),
        league_player_id:chosen.id,
        league_player_name:chosen.name
      });
      setLeagueSubmitLinks(prev=>({...prev,[liveId]:{
        live_user_id:liveId,
        live_name:leagueLinkLiveName(row.scorecardPlayer),
        league_player_id:chosen.id,
        league_player_name:chosen.name,
        updated_at:new Date().toISOString()
      }}));
      if(result.cloudAvailable===false)setLeagueSubmitLinkCloud(false);
      flash((leagueLinkLiveName(row.scorecardPlayer)||'Player')+' linked to '+chosen.name);
      await loadLeagueSubmitData();
    }catch(e){
      flash('Link failed: '+(e.message||String(e)),'error');
    }finally{
      setLeagueSubmitLinking('');
    }
  }

  function LeagueSubmitCard(){
    if(!isCompletedRound(round)||round._cupScoring||isFoursomesScorecard)return null;
    if(leagueSubmitChoice){
      return <div style={{margin:'0 16px 12px'}}>
        <div style={{...S.card,margin:0,background:'rgba(34,197,94,0.10)',borderColor:'rgba(34,197,94,0.28)'}}>
          <div style={{fontSize:12,color:'#86efac',fontWeight:950,letterSpacing:'0.10em',textTransform:'uppercase',marginBottom:5}}>League</div>
          <div style={{fontSize:15,color:'#fff',fontWeight:850,lineHeight:1.35}}>{leagueSubmitChoice}</div>
        </div>
      </div>;
    }
    const data=leagueSubmitData;
    const selectedCount=(data&&data.rows||[]).filter(r=>r.ready&&leagueSubmitSelected[r.key]).length;
    const snake=data&&data.snake;
    const snakeLabel=snake&&snake.scorecardPlayer?(leagueSubmitPlayerName(snake.scorecardPlayer)+(snake.leaguePlayer?(snake.already?' - already logged':' - ready'):' - not matched to League')):'No snake marked';
    return <div style={{margin:'0 16px 12px'}}>
      <div style={{...S.card,margin:0,background:'linear-gradient(135deg,rgba(34,197,94,0.14),rgba(0,112,187,0.12))',borderColor:'rgba(34,197,94,0.32)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10,marginBottom:10}}>
          <div>
            <div style={{fontSize:18,color:'#fff',fontWeight:950}}>Submit to League</div>
            <div style={{fontSize:11,color:'#90ccf0',marginTop:3}}>League date: {data?data.dateKey:'checking...'}</div>
          </div>
          <button onClick={loadLeagueSubmitData} disabled={leagueSubmitLoading||leagueSubmitSubmitting} style={{...S.gho,padding:'7px 10px',fontSize:12,opacity:leagueSubmitLoading?0.6:1}}>Refresh</button>
        </div>
        {leagueSubmitLoading&&!data&&<div style={{fontSize:13,color:'#90ccf0',padding:'10px 0'}}>Checking League players...</div>}
        {data&&!leagueSubmitLinkCloud&&<div style={{marginBottom:9,padding:'8px 10px',borderRadius:10,background:'rgba(245,158,11,0.12)',border:'1px solid rgba(245,158,11,0.24)',fontSize:11,color:'#fbbf24'}}>League links are saved on this device until the cloud link table is added.</div>}
        {data&&<div style={{display:'flex',flexDirection:'column',gap:8}}>
          {data.rows.map(r=><div key={r.key} style={{display:'grid',gridTemplateColumns:'28px 34px 1fr auto',gap:8,alignItems:'center',padding:'9px 10px',borderRadius:10,background:r.ready?'rgba(255,255,255,0.06)':'rgba(255,255,255,0.035)',border:'1px solid '+(r.ready?'rgba(134,239,172,0.16)':'rgba(255,255,255,0.08)')}}>
            <input type="checkbox" disabled={!r.ready||leagueSubmitSubmitting} checked={!!leagueSubmitSelected[r.key]&&r.ready} onChange={e=>setLeagueSubmitSelected(prev=>({...prev,[r.key]:e.target.checked}))} />
            <Avatar user={scorecardPlayerProfile(r.scorecardPlayer)} size={32}/>
            <div style={{minWidth:0}}>
              <div style={{fontSize:14,color:'#fff',fontWeight:900,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{leagueSubmitPlayerName(r.scorecardPlayer)}</div>
              <div style={{fontSize:11,color:r.ready?'#86efac':'#fca5a5',marginTop:2}}>{r.status}</div>
              {!r.leaguePlayer&&<div style={{marginTop:7}}>
                <select disabled={leagueSubmitLinking===r.key} value="" onChange={e=>linkScorecardPlayerToLeague(r,e.target.value)} style={{...S.inp,padding:'7px 9px',fontSize:12}}>
                  <option value="">Is this player in League?</option>
                  {((data&&data.leaguePlayers)||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>}
            </div>
            <div style={{fontSize:20,color:r.ready?'#60b8f0':'rgba(255,255,255,0.45)',fontWeight:950}}>{r.points}<span style={{fontSize:10,marginLeft:3}}>pts</span></div>
          </div>)}
        </div>}
        {data&&<div style={{marginTop:10,padding:'9px 10px',borderRadius:10,background:'rgba(0,0,0,0.20)',border:'1px solid rgba(255,255,255,0.08)',fontSize:12,color:'#dbeafe'}}>
          Snake: <span style={{fontWeight:900,color:snake&&snake.leaguePlayer&&!snake.already?'#86efac':'#90ccf0'}}>{snakeLabel}</span>
        </div>}
        {leagueSubmitNote&&<div style={{marginTop:10,fontSize:12,color:leagueSubmitNote.toLowerCase().includes('failed')?'#fca5a5':'#86efac'}}>{leagueSubmitNote}</div>}
        <button onClick={submitCompletedRoundToLeague} disabled={!data||selectedCount===0||leagueSubmitSubmitting||leagueSubmitLoading} style={{...S.pri,width:'100%',padding:14,fontSize:15,marginTop:12,background:selectedCount?'#0a8a4a':'rgba(255,255,255,0.10)',opacity:(!data||selectedCount===0||leagueSubmitSubmitting||leagueSubmitLoading)?0.65:1}}>
          {leagueSubmitSubmitting?'Submitting...':`Submit ${selectedCount||0} score${selectedCount===1?'':'s'} to League`}
        </button>
      </div>
    </div>;
  }

  function LeagueSubmitPrompt(){
    if(!showLeagueSubmitPrompt||!isCompletedRound(round)||round._cupScoring||isFoursomesScorecard)return null;
    const data=leagueSubmitData;
    const selectedCount=(data&&data.rows||[]).filter(r=>r.ready&&leagueSubmitSelected[r.key]).length;
    const snake=data&&data.snake;
    const snakeReady=snake&&snake.leaguePlayer&&!snake.already;
    async function submitNow(){
      const result=await submitCompletedRoundToLeague();
      if(result&&result.ok)setShowLeagueSubmitPrompt(false);
    }
    function skipLeague(){
      const msg='League submit skipped';
      setLeagueSubmitChoice(msg);
      setLeagueSubmitNote(msg);
      setShowLeagueSubmitPrompt(false);
    }
    return <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(2,8,23,0.74)',backdropFilter:'blur(6px)',display:'flex',alignItems:'flex-end',justifyContent:'center',padding:16}}>
      <div style={{width:'100%',maxWidth:520,borderRadius:18,background:'linear-gradient(180deg,rgba(15,32,58,0.98),rgba(8,18,34,0.98))',border:'1px solid rgba(96,184,240,0.28)',boxShadow:'0 24px 70px rgba(0,0,0,0.42)',padding:16}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:10}}>
          <div>
            <div style={{fontSize:20,color:'#fff',fontWeight:950}}>Submit this round to League?</div>
            <div style={{fontSize:12,color:'#90ccf0',marginTop:4}}>Send the finished scores straight into League approval.</div>
          </div>
          <button onClick={skipLeague} disabled={leagueSubmitSubmitting} style={{...S.gho,padding:'7px 10px',fontSize:12}}>Not now</button>
        </div>
        {leagueSubmitLoading&&!data&&<div style={{fontSize:13,color:'#90ccf0',padding:'14px 0'}}>Checking League players...</div>}
        {data&&<div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:'48vh',overflowY:'auto',paddingRight:2}}>
          {data.rows.map(r=><div key={r.key} style={{display:'grid',gridTemplateColumns:'28px 34px 1fr auto',gap:8,alignItems:'center',padding:'9px 10px',borderRadius:12,background:r.ready?'rgba(255,255,255,0.07)':'rgba(255,255,255,0.035)',border:'1px solid '+(r.ready?'rgba(134,239,172,0.18)':'rgba(255,255,255,0.08)')}}>
            <input type="checkbox" disabled={!r.ready||leagueSubmitSubmitting} checked={!!leagueSubmitSelected[r.key]&&r.ready} onChange={e=>setLeagueSubmitSelected(prev=>({...prev,[r.key]:e.target.checked}))} />
            <Avatar user={scorecardPlayerProfile(r.scorecardPlayer)} size={32}/>
            <div style={{minWidth:0}}>
              <div style={{fontSize:14,color:'#fff',fontWeight:900,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{leagueSubmitPlayerName(r.scorecardPlayer)}</div>
              <div style={{fontSize:11,color:r.ready?'#86efac':'#fca5a5',marginTop:2}}>{r.status}</div>
            </div>
            <div style={{fontSize:18,color:r.ready?'#60b8f0':'rgba(255,255,255,0.45)',fontWeight:950}}>{r.points}<span style={{fontSize:10,marginLeft:3}}>pts</span></div>
          </div>)}
        </div>}
        {data&&<div style={{marginTop:10,padding:'9px 10px',borderRadius:10,background:'rgba(0,0,0,0.20)',border:'1px solid rgba(255,255,255,0.08)',fontSize:12,color:'#dbeafe'}}>
          Snake: <span style={{fontWeight:900,color:snakeReady?'#86efac':'#90ccf0'}}>{snake&&snake.scorecardPlayer?(leagueSubmitPlayerName(snake.scorecardPlayer)+(snakeReady?' - ready':snake.already?' - already logged':' - not matched to League')):'No snake marked'}</span>
        </div>}
        {leagueSubmitNote&&<div style={{marginTop:10,fontSize:12,color:leagueSubmitNote.toLowerCase().includes('failed')?'#fca5a5':'#86efac'}}>{leagueSubmitNote}</div>}
        <button onClick={submitNow} disabled={!data||selectedCount===0||leagueSubmitSubmitting||leagueSubmitLoading} style={{...S.pri,width:'100%',padding:14,fontSize:15,marginTop:12,background:selectedCount?'#0a8a4a':'rgba(255,255,255,0.10)',opacity:(!data||selectedCount===0||leagueSubmitSubmitting||leagueSubmitLoading)?0.65:1}}>
          {leagueSubmitSubmitting?'Submitting...':`Submit ${selectedCount||0} score${selectedCount===1?'':'s'} to League`}
        </button>
      </div>
    </div>;
  }

  function FinalStablefordSweepstakeBlock({topMargin=12}){
    if(!isCompletedRound(round)||round._cupScoring)return null;
    const finalRows=[...grpPlayers].map(p=>({id:p.id,name:gameFirstName((p.name||p.display_name)||'?'),player:p,total:getRunning(p.id,holes.length)})).sort((a,b)=>b.total-a.total);
    return <div style={{margin:topMargin+'px 16px 12px'}}>
      <div style={{...S.card,margin:0,background:'linear-gradient(135deg,rgba(0,112,187,0.22),rgba(255,255,255,0.05))',borderColor:'rgba(96,184,240,0.42)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:10}}>
          <div>
            <div style={{fontSize:18,color:'#fff',fontWeight:950}}>Final Stableford Scores</div>
            <div style={{fontSize:11,color:'#90ccf0'}}>Completed round · group scorecard</div>
          </div>
          <div style={{fontSize:11,color:'#86efac',fontWeight:950,letterSpacing:'0.08em'}}>FINAL</div>
        </div>
        {finalRows.map((r,idx)=><div key={r.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderTop:idx?'1px solid rgba(255,255,255,0.08)':'none'}}>
          <div style={{width:26,height:26,borderRadius:9,background:idx===0?'rgba(251,191,36,0.22)':'rgba(255,255,255,0.08)',border:'1px solid '+(idx===0?'rgba(251,191,36,0.38)':'rgba(255,255,255,0.10)'),display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:idx===0?'#fbbf24':'rgba(255,255,255,0.78)',fontWeight:950}}>{idx+1}</div>
          <Avatar user={scorecardPlayerProfile(r.player)} size={30}/>
          <div style={{flex:1,fontSize:14,color:'#fff',fontWeight:850}}>{r.name}</div>
          <div style={{fontSize:24,color:'#60b8f0',fontWeight:950,lineHeight:1}}>{r.total} <span style={{fontSize:10,color:'#90ccf0',fontWeight:900}}>pts</span></div>
        </div>)}
      </div>
      <SweepstakePanel throughHole={18} reviewTitle="💰 SWEEPSTAKE - WHO PAYS WHO" payUp={true} forceEnabled={!!round._spectator}/>
    </div>;
  }

    // ---------------------------------------------------------
  // Manual full score save
  // ---------------------------------------------------------
  async function saveAll(){
    setSaving(true);
    setCloudStatus('Syncing scores...');
    setCloudError('');
    let failed=[];
    try{
      // Re-save everything to make sure nothing was missed
      const rows=[];
      for(const[hNum,pMap]of Object.entries(holeScores)){
        for(const[pid,gross]of Object.entries(pMap)){
          if(gross===undefined||gross===null)continue;
          rows.push(buildScoreRow(parseInt(hNum),canonicalFoursomesPlayerId(pid),gross));
        }
      }
      const cloudRows=isFoursomesScorecard?rows.filter(r=>!isFoursomesTeamPlayerId(r.player_id)):rows;
      const result=await saveScoreRowsToCloud(sb,cloudRows);
      if(!result.ok)failed.push(result.error||'Unknown cloud save error');
      if(isFoursomesScorecard){
        const foursomesRows=foursomesRowsToSync();
        const cloudGroup=await ensureFoursomesCloudGroup();
        if(cloudGroup){
          for(const row of foursomesRows){
            const gm=await saveFoursomesScoreToGroupMeta(sb,cloudGroup,row.hole_number,row.player_id,row.gross_score);
            if(gm&&!gm.ok)failed.push(gm.error||'Foursomes group metadata save error');
          }
        }else failed.push('No foursomes cloud group found');
      }
      if(failed.length){
        const msg=failed[0];
        setCloudStatus('Some scores are only saved on this phone');
        setCloudError(msg);
        flash('Cloud sync failed: '+msg,'error');
        return false;
      }
      try{localStorage.removeItem('pending_scores_'+round.id);}catch(e){}
      setCloudStatus('All scores synced');
      setCloudError('');
      flash('Scores synced');
      return true;
    }catch(e){
      setCloudStatus('Some scores are only saved on this phone');
      setCloudError(e.message);
      flash('Error: '+e.message,'error');
      return false;
    }finally{
      setSaving(false);
    }
  }

  async function finishRoundAndGoHome(){
    if(!canEdit)return;
    if(!window.confirm('Finish this round? It will be removed from Live Scores.'))return;
    const synced=await saveAll();
    if(!synced&&!window.confirm('Scores did not sync to cloud. Finish anyway? Other players may not see them.'))return;
    const {error}=await sb.from('cup_rounds').update({status:'complete'}).eq('id',round.id);
    if(error){flash(error.message||'Could not finish round','error');return;}
    notifyFinishedScores().catch(e=>console.warn('Snyder Live finished-round notification error',e));
    round.status='complete';
    await load();
    if(round._cupScoring){
      setShowEnd(false);
      setView('home');
    }else{
      setEndStep(1);
      setShowEnd(true);
      setLeagueSubmitChoice('');
      setShowLeagueSubmitPrompt(true);
      loadLeagueSubmitData();
    }
  }

  const canDeleteRound=currentUser&&!round._spectator&&(
    idMatches(round.created_by,currentUser.id)||
    (allRoundPlayers||[]).some(p=>p.is_host&&(idMatches(p.user_id,currentUser.id)||idMatches(p.id,currentUser.id)))
  );
  async function deleteRoundAndGoHome(){
    if(!canDeleteRound)return;
    if(!window.confirm('Are you sure you want to delete this round? This cannot be undone.'))return;
    await sb.from('cup_scores').delete().eq('round_id',round.id);
    await sb.from('cup_groups').delete().eq('round_id',round.id);
    await sb.from('cup_round_players').delete().eq('round_id',round.id);
    const{error}=await sb.from('cup_rounds').delete().eq('id',round.id);
    if(error){flash(error.message||'Could not delete round','error');return;}
    try{localStorage.removeItem('scores_'+round.id);localStorage.removeItem('pending_scores_'+round.id);}catch(e){}
    await load();
    setShowEnd(false);
    setView('home');
    flash('Round deleted');
  }

    // ---------------------------------------------------------
  // Score input modal
  // ---------------------------------------------------------
  function ScoreInput(){
    if(!inputHole)return null;
    if([MATCHPLAY_FOURSOMES_A,MATCHPLAY_FOURSOMES_B].includes(inputHole.pid))return null;
    if(isSinglesMatchplayOnlyPlayer(inputHole.pid))return null;
    const{holeNum,pid}=inputHole;
    const shouldAutoAdvance=!!(inputHole&&inputHole.autoAdvance);
    const hd=getHole(holeNum);
    const player=grpPlayers.find(p=>p.id===pid);
    const hcp=parseFloat(playingHcps[pid]!=null?playingHcps[pid]:player&&player.current_handicap||0);
    const shots=Math.floor(hcp/18)+((hcp%18)>=hd.stroke_index?1:0);
    const pName=((player&&(player.name||player.display_name))||'Player').split(' ')[0];
    const dv=parseInt(inputVal)||hd.par;
    const dpts=calcStableford(dv,hd.par,hd.stroke_index,hcp);
    const opts=Array.from({length:10},(_,i)=>Math.max(1,hd.par-2)+i);
    const snakeChecked=isSnakeHolder(holeNum,pid);

    function confirm(){
      setScore(holeNum,pid,dv);setInputHole(null);
      const pIdx=grpPlayers.findIndex(p=>p.id===pid);
      if(shouldAutoAdvance&&pIdx<grpPlayers.length-1){
        setTimeout(()=>{setInputVal('');setInputHole({holeNum,pid:grpPlayers[pIdx+1].id,autoAdvance:true});},150);
      }
    }

    function blob(){
      const pickupGross=pickupGrossForNoStableford(hd.par,hd.stroke_index,hcp);
      setScore(holeNum,pid,-pickupGross);setInputHole(null);
      const pIdx=grpPlayers.findIndex(p=>p.id===pid);
      if(shouldAutoAdvance&&pIdx<grpPlayers.length-1){
        setTimeout(()=>{setInputVal('');setInputHole({holeNum,pid:grpPlayers[pIdx+1].id,autoAdvance:true});},150);
      }
    }

    const modal=(
      <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,width:'100vw',maxWidth:'100vw',overflow:'hidden',background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:16,boxSizing:'border-box'}} onClick={e=>{if(e.target===e.currentTarget)setInputHole(null);}}>
        <div style={{background:'#0d2548',border:'1px solid rgba(255,255,255,0.2)',borderRadius:16,padding:16,width:'100%',maxWidth:'min(340px,calc(100vw - 32px))',boxSizing:'border-box'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
            <div>
              <div style={{fontSize:16,color:'#fff'}}>Hole {holeNum} - {pName}</div>
              <div style={{fontSize:12,color:'#60b8f0'}}>Par {hd.par} <span style={{color:'#d4af37',fontWeight:900}}> - SI {hd.stroke_index}</span>{shots>0?' - '+shots+(shots>1?' shots':' shot'):''}</div>
            </div>
            <button onClick={()=>setInputHole(null)} style={{background:'none',border:'none',color:'#60b8f0',fontSize:20,cursor:'pointer',padding:'0 4px'}}>x</button>
          </div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:20,marginBottom:14,padding:12,background:'rgba(0,0,0,0.3)',borderRadius:12}}>
            <div style={{fontSize:56,color:'#fff',lineHeight:1,width:56,textAlign:'center'}}>{dv}</div>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:30,color:'#fff',background:ptsColor(dpts),borderRadius:10,padding:'4px 14px',minWidth:52,textAlign:'center'}}>{dpts}</div>
              <div style={{fontSize:10,color:'#60b8f0',marginTop:3}}>{dv<=hd.par-2?'Eagle+':dv===hd.par-1?'Birdie':dv===hd.par?'Par':dv===hd.par+1?'Bogey':dv===hd.par+2?'Double':'Triple+'}</div>
            </div>
          </div>
          <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:4,marginBottom:10}}>
            {opts.map(s=>{
              const sp=calcStableford(s,hd.par,hd.stroke_index,hcp);
              const isSel=dv===s;
              return(
                <button key={s} onClick={()=>setInputVal(String(s))} style={{minWidth:52,height:62,flexShrink:0,borderRadius:10,border:'2px solid '+(isSel?'#0070BB':'rgba(255,255,255,0.2)'),background:isSel?ptsColor(sp):'rgba(255,255,255,0.06)',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:2}}>
                  <div style={{fontSize:24,color:'#fff',lineHeight:1}}>{s}</div>
                  <div style={{fontSize:10,color:isSel?'rgba(255,255,255,0.9)':'#60b8f0'}}>{sp}pt{sp!==1?'s':''}</div>
                </button>
              );
            })}
          </div>
          <label style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'10px 11px',marginBottom:8,borderRadius:10,border:'1px solid rgba(34,197,94,0.42)',background:snakeChecked?'rgba(34,197,94,0.22)':'rgba(255,255,255,0.06)',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:800}}>
            <input type='checkbox' checked={!!snakeChecked} onChange={e=>setSnakeFromHole(holeNum,pid,e.target.checked)} style={{width:18,height:18,accentColor:'#22c55e'}}/>
            <span style={{flex:1,fontSize:18,lineHeight:1}}>{EMOJI.snake}?</span>
          </label>
          <button onClick={blob} style={{width:'100%',padding:10,marginBottom:8,borderRadius:10,border:'1px solid rgba(255,255,255,0.2)',background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)',cursor:'pointer',fontSize:13}}>
            Blob - pickup ({pickupGrossForNoStableford(hd.par,hd.stroke_index,hcp)}*, 0 pts)
          </button>
          <button onClick={confirm} style={{...S.pri,width:'100%',padding:13,fontSize:15}}>
            {dv} - {dpts} pts
          </button>
        </div>
      </div>
    );
    return ReactDOM.createPortal(modal,document.body);
  }

  const totalPar=holes.reduce((t,h)=>t+h.par,0);
  const totalYards=holes.reduce((t,h)=>t+(h.yards||0),0);
  const front9=holes.slice(0,9);
  const back9=holes.slice(9);
  const roundStartText=formatRoundStart(round);

    // ---------------------------------------------------------
  // Scorecard stats / totals
  // ---------------------------------------------------------
  function getStats(pid){
    let eagles=0,birdies=0,pars=0,bogeys=0,doubles=0,blobs=0;
    holes.forEach(hd=>{
      const g=(holeScores[hd.hole]||{})[pid];
      if(g===undefined||g===null||g===0)return;
      if(g===-1){blobs++;return;}
      const pts=getPts(g,hd.hole,pid)||0;
      if(pts===0){blobs++;return;}
      const diff=g-hd.par;
      if(diff<=-2)eagles++;
      else if(diff===-1)birdies++;
      else if(diff===0)pars++;
      else if(diff===1)bogeys++;
      else if(diff===2)doubles++;
      else blobs++;
    });
    return{eagles,birdies,pars,bogeys,doubles,blobs};
  }
  function hasGivenGrossInList(pid,holeList){
    return (holeList||[]).some(hd=>isGivenGross((holeScores[hd.hole]||{})[pid]));
  }
  function enteredParTotal(pid,holeList){
    return (holeList||[]).reduce((t,hd)=>hasEnteredGross((holeScores[hd.hole]||{})[pid])?t+(parseInt(hd.par)||0):t,0);
  }
  function grossSummaryDisplay(pid,holeList){
    return grossTotalDisplay(getGrossTotal(pid,holeList),hasGivenGrossInList(pid,holeList));
  }
  function grossOverParSummaryDisplay(pid,holeList){
    return grossWithOverParDisplay(getGrossTotal(pid,holeList),hasGivenGrossInList(pid,holeList),enteredParTotal(pid,holeList));
  }
  function overParSummaryDisplay(pid,holeList){
    return overParDisplay(getGrossTotal(pid,holeList),enteredParTotal(pid,holeList));
  }

    // ---------------------------------------------------------
  // Compact 9-hole scorecard table
  // ---------------------------------------------------------
  function splitGrossOverParText(text){
    const s=String(text??'-').trim();
    const m=s.match(/^(.+?)\s*(\([^)]+\))$/);
    return m?{gross:m[1],over:m[2]}:{gross:s,over:''};
  }
  function GrossScoreStack({text,size=16,overSize=13,color='#fff'}){
    const parts=splitGrossOverParText(text);
    return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:size>=20?48:34,lineHeight:1,whiteSpace:'nowrap'}}>
        <div style={{fontFamily:'Barlow Condensed, Inter, sans-serif',fontSize:size,color,fontWeight:950,lineHeight:1,whiteSpace:'nowrap'}}>{parts.gross}</div>
        <div style={{fontFamily:'Barlow Condensed, Inter, sans-serif',fontSize:overSize,color:parts.over?color:'transparent',fontWeight:950,lineHeight:1.05,minHeight:overSize}}>{parts.over||'()'}</div>
      </div>
    );
  }

  function ScoreSummaryBlock({grossText,stableford,totalGrossText,totalStableford}){
    return (
      <div style={{textAlign:'center',overflow:'hidden',display:'flex',flexDirection:'column',alignItems:'stretch',justifyContent:'stretch',gap:4,minHeight:totalGrossText?124:64}}>
        <div style={{minHeight:58,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-start'}}>
          <div style={{fontSize:8,color:'rgba(255,255,255,0.52)',fontWeight:900,textTransform:'uppercase',letterSpacing:'0.04em'}}>Gross</div>
          <GrossScoreStack text={grossText} size={15} overSize={11}/>
          <div style={{fontSize:17,color:'#60b8f0',fontWeight:950,lineHeight:1}}>{stableford} <span style={{fontSize:10,fontWeight:900}}>pts</span></div>
        </div>
        {totalGrossText&&<div style={{minHeight:64,paddingTop:6,borderTop:'1px solid rgba(255,255,255,0.12)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-start'}}>
          <div style={{fontSize:8,color:'rgba(255,255,255,0.52)',fontWeight:900,textTransform:'uppercase',letterSpacing:'0.04em'}}>Total gross</div>
          <GrossScoreStack text={totalGrossText} size={16} overSize={12}/>
          <div style={{fontSize:18,color:'#60b8f0',fontWeight:950,lineHeight:1}}>{totalStableford} <span style={{fontSize:10,fontWeight:900}}>pts</span></div>
        </div>}
      </div>
    );
  }

  function MiniCard({holeList,label}){
    // Compact full-card layout: one column per player so all 4 player totals fit on mobile.
    const cols='42px 30px '+grpPlayers.map(()=>'minmax(54px,1fr)').join(' ');
    return(
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,color:'#60b8f0',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:8,padding:'4px 12px',background:'rgba(0,0,0,0.3)'}}>{label}</div>
        <div style={{border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:cols,background:'rgba(59,111,212,0.15)',padding:'6px 6px',gap:4}}>
            <div style={{fontSize:9,color:'#60b8f0',textAlign:'center',textTransform:'uppercase'}}>H</div>
            <div style={{fontSize:9,color:'#60b8f0',textAlign:'center',textTransform:'uppercase'}}>Par</div>
            {grpPlayers.map(p=><div key={'mini-head-'+p.id} style={{minWidth:0}}><ScorecardPlayerBadge player={p} size={22} compact/></div>)}
          </div>
          {holeList.map((hd,i)=>(
            <div key={hd.hole} style={{display:'grid',gridTemplateColumns:cols,padding:'6px 6px',gap:4,borderBottom:i<holeList.length-1?'1px solid rgba(255,255,255,0.06)':'none',background:i%2===0?'rgba(255,255,255,0.03)':'transparent',alignItems:'center'}}>
              <div style={{textAlign:'center',fontSize:14,color:'#fff'}}>{hd.hole}</div>
              <div style={{textAlign:'center',fontSize:12,color:'#60b8f0'}}>{hd.par}</div>
              {grpPlayers.map(p=>{
                const g=(holeScores[hd.hole]||{})[p.id];
                const pts=(g===-1||isGivenGross(g))?0:getPts(g,hd.hole,p.id);
                const hasScore=hasEnteredGross(g);
                const hasSnake=hasScore&&isSnakeHolder(hd.hole,p.id);
                return(
                  <div key={p.id} style={{textAlign:'center',minHeight:30,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:2,color:(g===-1||isGivenGross(g))?'rgba(255,255,255,0.55)':g?'#fff':'rgba(255,255,255,0.2)'}}>
                    <div style={{fontSize:14,fontWeight:800,lineHeight:1.05}}>{hasSnake?EMOJI.snake+' ':''}{grossDisplay(g)}</div>
                    {hasScore&&<div style={{background:(g===-1||isGivenGross(g))?'rgba(40,40,40,0.9)':ptsColor(pts),borderRadius:4,minWidth:28,height:19,padding:'0 5px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'#fff',fontWeight:800}}>{pts}</div>}
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{display:'grid',gridTemplateColumns:cols,padding:'8px 6px',gap:4,borderTop:'1px solid rgba(255,255,255,0.16)',background:'rgba(0,112,187,0.14)',alignItems:'stretch'}}>
            <div style={{textAlign:'center',fontSize:10,color:'#60b8f0',fontWeight:800}}>{label==='BACK 9'?'Back 9':'Front 9'}</div>
            <div></div>
            {grpPlayers.map(p=>{
              const nineGross=getGrossTotal(p.id,holeList);
              const nineStableford=getStablefordTotal(p.id,holeList);
              const roundGross=getGrossTotal(p.id,holes);
              const roundStableford=getStablefordTotal(p.id,holes);
              return (
                <ScoreSummaryBlock
                  key={p.id+'nine-total'}
                  grossText={grossOverParSummaryDisplay(p.id,holeList)}
                  stableford={nineStableford}
                  totalGrossText={label==='BACK 9'?grossOverParSummaryDisplay(p.id,holes):null}
                  totalStableford={label==='BACK 9'?roundStableford:null}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if(showEnd){
    if(endStep===0)return(
      <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#0a1528 0%,#0d2040 50%,#0a1830 100%)',paddingBottom:40}}>
        <LeagueSubmitPrompt/>
        <div style={{position:'sticky',top:0,background:'#0a1f3d',borderBottom:'1px solid rgba(255,255,255,0.1)',padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{fontSize:16,color:'#fff'}}>Back 9 Review</div>
          <button onClick={()=>setEndStep(1)} style={{...S.pri,padding:'8px 16px',fontSize:14}}>Full Card</button>
        </div>
        <div id="f9-review-page" style={{padding:16}}>
          <div style={{padding:'10px 12px',background:'rgba(0,0,0,0.3)',marginBottom:12,borderRadius:8}}>
            <div style={{fontSize:15,color:'#fff',fontWeight:700}}>{getCourseDisplayName(course,round)}</div>
            <div style={{fontSize:11,color:'#60b8f0',marginTop:3}}>Round start: {roundStartText}</div>
            <div style={{fontSize:11,color:'rgba(255,255,255,0.55)',marginTop:2}}>Front 9 review</div>
          </div>
          <div style={{display:'flex',gap:10,marginBottom:16}}>
            {grpPlayers.map(p=>(
              <div key={p.id} style={{flex:1,...S.card,textAlign:'center'}}>
                <div style={{marginBottom:7}}><ScorecardPlayerBadge player={p} size={32} compact/></div>
                <div style={{fontSize:32,color:'#fff',lineHeight:1}}>{back9.reduce((t,h)=>{const g=(holeScores[h.hole]||{})[p.id];return t+(g===-1?0:(getPts(g,h.hole,p.id)||0));},0)}</div>
                <div style={{fontSize:10,color:'#60b8f0',marginTop:2}}>back 9</div>
                <div style={{fontSize:13,color:'rgba(255,255,255,0.5)',marginTop:4}}>{getRunning(p.id,holes.length)} total</div>
              </div>
            ))}
          </div>
          <MiniCard holeList={back9} label="BACK 9"/>
          <SweepstakePanel throughHole={18} reviewTitle="💰 Sweepstake after Back 9" payUp={false}/>
        </div>
      </div>
    );
    if(endStep===1)return(
      <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#0a1528 0%,#0d2040 50%,#0a1830 100%)',paddingBottom:40}}>
        <LeagueSubmitPrompt/>
        <div style={{position:'sticky',top:0,background:'#0a1f3d',borderBottom:'1px solid rgba(255,255,255,0.1)',padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <button onClick={()=>setEndStep(0)} style={{...S.gho,padding:'6px 12px',fontSize:13}}>Back 9</button>
          <div style={{fontSize:16,color:'#fff'}}>Full Scorecard</div>
          <button onClick={()=>setEndStep(2)} style={{...S.pri,padding:'8px 16px',fontSize:14}}>Stats</button>
        </div>
        <div id="full-card-content" style={{padding:16}}>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
            <button onClick={async()=>{
              try{
                const el=document.getElementById('full-card-content');
                if(!el){flash('Error capturing card','error');return;}
                const canvas=await html2canvas(el,{backgroundColor:'#0a1528',scale:2,useCORS:true,logging:false,allowTaint:true});
                canvas.toBlob(async blob=>{
                  if(!blob)return;
                  const file=new File([blob],'scorecard.png',{type:'image/png'});
                  if(navigator.share&&navigator.canShare({files:[file]})){
                    await navigator.share({files:[file],title:'Scorecard - '+(course&&course.name||'')});
                  } else {
                    const url=URL.createObjectURL(blob);
                    const a=document.createElement('a');a.href=url;a.download='scorecard.png';a.click();
                    URL.revokeObjectURL(url);
                  }
                },'image/png');
              }catch(e){flash('Share: '+e.message,'error');}
            }} style={{...S.pri,padding:'8px 16px',fontSize:13,background:'#25D366'}}>Share Card</button>
          </div>
          <div style={{padding:'10px 12px',background:'rgba(0,0,0,0.3)',marginBottom:12,borderRadius:8}}><div style={{fontSize:15,color:'#fff',fontWeight:700}}>{getCourseDisplayName(course,round)}</div><div style={{fontSize:11,color:'#60b8f0',marginTop:3}}>Round start: {roundStartText}</div><div style={{fontSize:11,color:'rgba(255,255,255,0.55)',marginTop:2}}>{courseSummaryLine(course,round,holes)}</div></div>
          <FinalStablefordSweepstakeBlock topMargin={0}/>
          <LeagueSubmitCard/>
          <div id="f9-card"><MiniCard holeList={front9} label="FRONT 9"/></div>
          <MiniCard holeList={back9} label="BACK 9"/>
          <div style={{...S.card}}>
            <div style={{display:'grid',gridTemplateColumns:'64px '+grpPlayers.map(()=>'minmax(54px,1fr)').join(' '),gap:6,alignItems:'center'}}>
              <div style={{fontSize:11,color:'#60b8f0'}}>Total</div>
              {grpPlayers.map(p=><div key={p.id} style={{minWidth:0}}><ScorecardPlayerBadge player={p} size={24} compact/></div>)}
              <div style={{fontSize:12,color:'rgba(255,255,255,0.5)',borderTop:'1px solid rgba(255,255,255,0.1)',paddingTop:6}}>Gross</div>
              {grpPlayers.map(p=><div key={p.id} style={{textAlign:'center',borderTop:'1px solid rgba(255,255,255,0.1)',paddingTop:4,minHeight:54,display:'flex',alignItems:'center',justifyContent:'center'}}><GrossScoreStack text={grossOverParSummaryDisplay(p.id,holes)} size={20} overSize={15}/></div>)}
              <div style={{fontSize:12,color:'rgba(255,255,255,0.5)',paddingTop:2}}>Points</div>
              {grpPlayers.map(p=><div key={p.id} style={{textAlign:'center',fontSize:22,color:'#60b8f0',paddingTop:2,minHeight:38,display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}>{getRunning(p.id,holes.length)} <span style={{fontSize:11,fontWeight:900,marginLeft:3}}>pts</span></div>)}
            </div>
          </div>
        </div>
        <div style={{padding:'0 16px 24px',display:'flex',flexDirection:'column',gap:10}}>
          {canEdit&&isLiveRound(round)&&<button onClick={finishRoundAndGoHome} style={{...S.pri,width:'100%',padding:15,fontSize:16,marginTop:4,background:'#0a8a4a'}}>Finish Round</button>}
          {canDeleteRound&&<button onClick={deleteRoundAndGoHome} style={{...S.dan,width:'100%',padding:14,fontSize:15}}>Delete Round</button>}
          <button onClick={()=>{setShowEnd(false);setView('home');}} style={{...S.gho,width:'100%',padding:15,fontSize:16,marginTop:canEdit&&isLiveRound(round)?0:4}}>Home</button>
        </div>
      </div>
    );
    if(endStep===2)return(
      <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#0a1528 0%,#0d2040 50%,#0a1830 100%)',paddingBottom:40}}>
        <LeagueSubmitPrompt/>
        <div style={{position:'sticky',top:0,background:'#0a1f3d',borderBottom:'1px solid rgba(255,255,255,0.1)',padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <button onClick={()=>setEndStep(1)} style={{...S.gho,padding:'6px 12px',fontSize:13}}>Full Card</button>
          <div style={{fontSize:16,color:'#fff'}}>Stats</div>
          <button onClick={()=>{setShowEnd(false);setView('home');}} style={{...S.pri,padding:'8px 14px',fontSize:13}}>Done</button>
        </div>
        <div id="stats-card" style={{padding:16,background:'linear-gradient(160deg,#0a1528 0%,#0d2040 50%,#0a1830 100%)'}}>
          <LeagueSubmitCard/>
          <SweepstakePanel throughHole={18} reviewTitle="💰 SWEEPSTAKE - PAY UP" payUp={true}/>
          {grpPlayers.map(p=>{
            const st=getStats(p.id);
            return(
              <div key={p.id} style={{...S.card,marginBottom:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                  <ScorecardPlayerBadge player={p} size={38} align="left"/>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:28,color:'#60b8f0',lineHeight:1}}>{getRunning(p.id,holes.length)}</div>
                    <div style={{fontSize:10,color:'rgba(255,255,255,0.4)'}}>pts</div>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                  {[{label:'Eagles',val:st.eagles,color:'#b8860b'},{label:'Birdies',val:st.birdies,color:'#1565C0'},{label:'Pars',val:st.pars,color:'#1b5e20'},{label:'Bogeys',val:st.bogeys,color:'#8B0000'},{label:'Doubles',val:st.doubles,color:'#5a0a0a'},{label:'Blobs',val:st.blobs,color:'#1a0a0a'}].map(item=>(
                    <div key={item.label} style={{background:item.val>0?item.color:'rgba(255,255,255,0.05)',borderRadius:8,padding:'10px 8px',textAlign:'center',opacity:item.val===0?0.4:1}}>
                      <div style={{fontSize:22,color:'#fff',lineHeight:1}}>{item.val}</div>
                      <div style={{fontSize:10,color:'rgba(255,255,255,0.7)',marginTop:3}}>{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if(showReview){
    return(
      <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#0a1528 0%,#0d2040 50%,#0a1830 100%)',paddingBottom:40}}>
        <div style={{position:'sticky',top:0,background:'#0a1f3d',borderBottom:'1px solid rgba(255,255,255,0.1)',padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{fontSize:16,color:'#fff'}}>Front 9 Review</div>
          <button onClick={goToBack9} style={{...S.pri,padding:'8px 16px',fontSize:14}}>Back 9</button>
        </div>
        <div id="f9-review-page" style={{padding:16}}>
          <div style={{display:'flex',gap:10,marginBottom:16}}>
            {grpPlayers.map(p=>(
              <div key={p.id} style={{flex:1,...S.card,textAlign:'center'}}>
                <div style={{marginBottom:7}}><ScorecardPlayerBadge player={p} size={32} compact/></div>
                <div style={{fontSize:32,color:'#fff',lineHeight:1}}>{front9.reduce((t,h)=>{const g=(holeScores[h.hole]||{})[p.id];return t+(g===-1?0:(getPts(g,h.hole,p.id)||0));},0)}</div>
                <div style={{fontSize:10,color:'#60b8f0',marginTop:2}}>front 9</div>
              </div>
            ))}
          </div>
          <MiniCard holeList={front9} label="FRONT 9"/>
          <SweepstakePanel throughHole={9} reviewTitle="💰 Sweepstake after Front 9" payUp={false}/>
          <div style={{display:'flex',gap:8,marginTop:16}}>
            <button onClick={goToBack9} style={{...S.pri,flex:1,padding:12,fontSize:13}}>Back 9</button>
          </div>
        </div>
      </div>
    );
  }

  const rowH=80;
  const f9complete=front9.every(hd=>grpPlayers.every(p=>(holeScores[hd.hole]||{})[p.id]!==undefined));
  function goToBack9(){
    saveAll();
    setShowReview(false);
    setTimeout(()=>{
      const el=document.getElementById('hole-10');
      if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
    },120);
  }
  function leaveScorecard(){
    if(round._cupScoring){
      const cupDay=(round&&round._cupDayNumber)||(round&&round._cupGroupData&&round._cupGroupData.day)||cupDayFromRound(round)||1;
      try{sessionStorage.setItem('cupReturnDay',String(cupDay));}catch(e){}
      setView('tournaments');
      return;
    }
    setView('home');
  }

  return(
    <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#0a1528 0%,#0d2040 50%,#0a1830 100%)',overflowX:'hidden',touchAction:inputHole?'none':'auto'}}>
      <div style={{position:'sticky',top:0,zIndex:10,background:'linear-gradient(160deg,#0a1528,#0d2040)',borderBottom:'2px solid #0070BB'}}>
        {!canEdit&&isLiveRound(round)&&(
          <div style={{background:'rgba(0,112,187,0.2)',borderBottom:'1px solid rgba(0,112,187,0.3)',padding:'8px 14px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontSize:12,color:'#60b8f0',fontWeight:600}}>Spectator View</div>
            <div style={{fontSize:11,color:'rgba(255,255,255,0.4)'}}>{currentUser&&playerIds.includes(currentUser.id)?'Spectator mode':'Sign in to score'}</div>
          </div>
        )}
        <div style={{padding:'10px 14px',display:'flex',alignItems:'center',gap:8}}>
          <button onClick={leaveScorecard} style={{...S.gho,padding:'6px 10px',fontSize:12}}>{round._cupScoring?'Back':'Exit'}</button>
          <CourseBadge course={course} round={round} size={38}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,color:'#fff',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{dayCompKeyFromRound(round)?dayCompDisplayName(rounds,round):(getCourseDisplayName(course,round)||'Scorecard')}</div>
            <div style={{fontSize:10,color:'#60b8f0'}}>Round start: {roundStartText}</div>
          </div>
          {!round._cupScoring&&<SweepstakeMoneyButton/>}
          <ScorecardNotificationButton/>
          <button onClick={()=>round._cupScoring?openCupOverallSummary(true):openOverallLeaderboard(true)} style={{background:round._cupScoring?'linear-gradient(135deg,rgba(212,175,55,0.95),rgba(37,99,235,0.92))':'rgba(255,255,255,0.08)',border:round._cupScoring?'1px solid rgba(255,255,255,0.35)':'1px solid rgba(96,184,240,0.28)',color:'#fff',borderRadius:10,padding:'8px 11px',fontSize:12,fontWeight:950,cursor:'pointer',flexShrink:0,boxShadow:round._cupScoring?'0 8px 18px rgba(0,0,0,0.26)':'none',letterSpacing:'0.04em'}}>Overall</button>
          {round.join_code&&<button onClick={()=>{
            const url='https://snyder-live.vercel.app?watch='+round.join_code;
            if(navigator.share){navigator.share({title:'Watch live - '+( course&&course.name||''),url});}
            else{navigator.clipboard&&navigator.clipboard.writeText(url);flash('Watch link copied!');}
          }} style={{background:'#0070BB',border:'none',color:'#fff',borderRadius:8,padding:'6px 10px',fontSize:11,fontWeight:600,cursor:'pointer',flexShrink:0}}>Share</button>}
        </div>
        {course&&(
          <div style={{padding:'4px 14px',background:'rgba(0,50,120,0.35)',borderTop:'1px solid rgba(255,255,255,0.1)',display:'flex',gap:'6px 14px',alignItems:'center',flexWrap:'wrap'}}>
            <span style={{fontSize:12,color:'#fff',whiteSpace:'nowrap'}}>Par {totalPar}</span>
            {totalYards>0&&<span style={{fontSize:12,color:'#90ccf0',whiteSpace:'nowrap'}}>{totalYards}y</span>}
            <span style={{fontSize:12,color:'#90ccf0',whiteSpace:'nowrap'}}>{holes.length} holes</span>
            <span style={{fontSize:12,color:'#90ccf0',whiteSpace:'nowrap',textTransform:'capitalize'}}>{round.tee||'White'} tee</span>
            {course.slope_rating&&<span style={{fontSize:12,color:'#90ccf0',whiteSpace:'nowrap'}}>Slope {course.slope_rating}</span>}
            {course.course_rating&&<span style={{fontSize:12,color:'#90ccf0',whiteSpace:'nowrap'}}>Rating {course.course_rating}</span>}
          </div>
        )}
        {activeGroupId!=='leaderboard'&&grpPlayers.length>0&&(
          <div style={{padding:'7px 12px',display:'flex',gap:8,overflowX:'auto',borderTop:'1px solid rgba(255,255,255,0.08)',background:'rgba(0,0,0,0.12)'}}>
            {grpPlayers.map(p=>(
              <div key={'scorecard-top-'+p.id} style={{flex:'0 0 auto',minWidth:92,maxWidth:138,border:'1px solid rgba(96,184,240,0.18)',borderRadius:999,background:'rgba(255,255,255,0.055)',padding:'5px 9px'}}>
                <ScorecardPlayerBadge player={p} size={26} compact align="left"/>
              </div>
            ))}
          </div>
        )}
        {round._cupScoring&&activeGroupId!=='leaderboard'&&(
          <div style={{padding:'8px 12px 6px',background:'rgba(0,0,0,0.18)',borderTop:'1px solid rgba(255,255,255,0.07)'}}>
            <button onClick={()=>openCupOverallSummary(true)} style={{width:'100%',border:'1px solid rgba(255,255,255,0.26)',background:cupProjectedBg(),boxShadow:cupProjectedLeader()==='tie'?'none':'0 10px 24px rgba(0,0,0,0.28)',borderRadius:12,padding:'10px 12px',color:'#fff',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,textAlign:'left'}}>
              <div>
                <div style={{fontSize:12,fontWeight:950,letterSpacing:'0.1em',color:'#fff'}}>PROJECTED SCORE</div>
                <div style={{fontSize:10,color:'rgba(255,255,255,0.78)',marginTop:2}}>Live if current matches finished now</div>
              </div>
              {(()=>{const s=liveCupProjectedScore()||{gold:0,navy:0,goldName:'Team LIV',navyName:'Team Boring'};return (
                <div style={{minWidth:210,flex:1,display:'grid',gridTemplateColumns:`repeat(${CUP_TEAM_KEYS.length},minmax(0,1fr))`,alignItems:'stretch',gap:7}}>
                  {CUP_TEAM_KEYS.map(k=><div key={'scorecard-proj-'+k} style={{minWidth:0,textAlign:'center',border:'1px solid rgba(255,255,255,0.18)',borderRadius:10,background:'rgba(0,0,0,0.14)',padding:'6px 5px'}}>
                    <div style={{fontSize:11,fontWeight:950,color:CUP_THEME[k].accent,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textTransform:'uppercase'}}>{s[k+'Name']||CUP_THEME[k].name}</div>
                    <div style={{fontSize:24,fontWeight:950,color:'#fff',lineHeight:1,marginTop:3}}>{fmtCupPoint(s[k]||0)}</div>
                  </div>)}
                </div>
              );})()}
            </button>
            {(()=>{const l=activeCupLeader();return <button onClick={()=>openCupDaySinglesLeaderboard(true)} style={{width:'100%',marginTop:6,border:'1px solid rgba(94,234,212,0.34)',background:'linear-gradient(135deg,rgba(6,78,59,0.96),rgba(4,47,46,0.94))',boxShadow:'0 10px 24px rgba(6,78,59,0.22)',borderRadius:12,padding:'10px 12px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,color:'#fff',textAlign:'left'}}>
              <span style={{fontSize:12,color:'#fff',fontWeight:950,letterSpacing:'0.1em'}}>{'DAY '+((round&&round._cupDayNumber)||cupDayFromRound(round)||1)+' SINGLES'}</span>
              <span style={{fontSize:15,color:'#fff',fontWeight:950,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l?gameName(l.name)+' - '+l.total+' PTS':'NO SINGLES SCORES YET'}</span>
            </button>;})()}
            {(()=>{const state=cupDoublesMatchState(round&&round._cupGroupData&&round._cupGroupData.doubles);return state?<div style={{marginTop:6,border:'1px solid rgba(216,180,254,0.36)',background:'linear-gradient(135deg,rgba(88,28,135,0.96),rgba(112,26,117,0.92))',boxShadow:'0 10px 24px rgba(88,28,135,0.18)',borderRadius:12,padding:'8px 11px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,color:'#fff'}}>
              <span style={{fontSize:11,color:'#f5d0fe',fontWeight:950,letterSpacing:'0.1em',whiteSpace:'nowrap'}}>DOUBLES MATCH</span>
              <span style={{fontSize:13,color:'#fff',fontWeight:950,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textTransform:'uppercase'}}>{state.label}</span>
            </div>:null;})()}
          </div>
        )}
        {allGroups.length>1&&!(round._cupScoring&&round._spectator)&&<>
          {(()=>{const leader=overallLeaderboardRows()[0];return (
            <button onClick={()=>{setActiveGroupId('leaderboard');openOverallLeaderboard(false);}} style={{width:'calc(100% - 24px)',margin:'8px 12px 6px',padding:'10px 12px',borderRadius:12,border:'1px solid rgba(245,158,11,0.55)',background:'linear-gradient(135deg,rgba(245,158,11,0.95),rgba(180,83,9,0.9))',boxShadow:'0 8px 22px rgba(180,83,9,0.22)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,cursor:'pointer',textAlign:'left'}}>
              <div style={{display:'flex',flexDirection:'column',lineHeight:1.05}}>
                <span style={{fontSize:14,fontWeight:950,letterSpacing:'0.06em',textTransform:'uppercase'}}>Leaderboard</span>
                <span style={{fontSize:10,color:'rgba(255,255,255,0.78)',marginTop:3}}>Tap to view live standings</span>
              </div>
              <div style={{textAlign:'right',minWidth:0,flexShrink:0}}>
                {leader?(
                  <>
                    <div style={{fontSize:12,fontWeight:900,whiteSpace:'nowrap',maxWidth:138,overflow:'hidden',textOverflow:'ellipsis'}}>{gameName(leader.name)}</div>
                    <div style={{fontSize:18,fontWeight:950,lineHeight:1,marginTop:2}}>{leader.total}pt</div>
                  </>
                ):(
                  <>
                    <div style={{fontSize:12,fontWeight:900}}>No scores yet</div>
                    <div style={{fontSize:10,color:'rgba(255,255,255,0.75)',marginTop:2}}>Waiting</div>
                  </>
                )}
              </div>
            </button>
          );})()}
          <div style={{display:'flex',gap:6,padding:'4px 12px 7px',overflowX:'auto',borderTop:'1px solid rgba(255,255,255,0.08)',background:'rgba(0,0,0,0.16)'}}>
            {allGroups.map((g,idx)=>(
              <button key={g.id||idx} onClick={()=>setActiveGroupId(g.id)} style={{border:'1px solid '+(normaliseId(activeGroupId)===normaliseId(g.id)?groupColour(g.group_number||idx+1):'rgba(255,255,255,0.14)'),background:normaliseId(activeGroupId)===normaliseId(g.id)?'rgba(255,255,255,0.14)':'rgba(255,255,255,0.06)',color:'#fff',borderRadius:999,padding:'7px 12px',fontSize:12,fontWeight:900,whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:groupColour(g.group_number||idx+1),display:'inline-block'}}></span> Group {groupLetter(g.group_number||idx+1)}
              </button>
            ))}
          </div>
        </>}
        {activeGroupId!=='leaderboard'&&<div style={{display:'flex',gap:4,padding:'6px 12px',overflowX:'auto'}}>
          {holes.map(h=>{
            const done=grpPlayers.every(p=>(holeScores[h.hole]||{})[p.id]!==undefined);
            return <div key={h.hole} style={{minWidth:32,height:32,borderRadius:6,background:done?'#0070BB':'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:done?'#fff':'#60b8f0',flexShrink:0}}>{h.hole}</div>;
          })}
        </div>}
      </div>

      {activeGroupId==='leaderboard' ? <div style={{padding:16}}>
        <div style={{...S.card,background:'rgba(0,112,187,0.10)',borderColor:'rgba(96,184,240,0.24)',marginBottom:12}}>
          <div style={{fontSize:22,color:'#fff',fontWeight:900}}>Live Leaderboard</div>
          <div style={{fontSize:12,color:'#90ccf0',marginTop:3}}>{dayCompKeyFromRound(round)?'All rounds on this sweepstake board':'All groups in this round'}</div>
        </div>
        <button onClick={async()=>{setOverallRefreshNote('Refreshing...'); overallMode==='cupOverall'?await openCupOverallSummary(false):(overallMode==='cupDay'?await openCupDaySinglesLeaderboard(false):await openOverallLeaderboard(false));}} style={{...S.pri,width:'100%',marginBottom:6,fontSize:13}}>Refresh leaderboard</button>
        {overallRefreshNote&&<div style={{fontSize:11,color:'#90ccf0',textAlign:'center',marginBottom:12}}>{overallRefreshNote}</div>}
        {overallLeaderboardRows().map((r,idx)=>(
          <div key={r.id} style={{display:'flex',alignItems:'center',gap:10,padding:'12px',background:idx===0?'rgba(184,134,11,0.15)':'rgba(255,255,255,0.06)',border:'1px solid '+(idx===0?'rgba(184,134,11,0.3)':'rgba(255,255,255,0.08)'),borderRadius:14,marginBottom:8}}>
            <div style={{width:30,textAlign:'center',fontSize:19,color:idx===0?'#fbbf24':'rgba(255,255,255,0.55)',fontWeight:900}}>{idx+1}</div>
            <div style={{width:10,height:10,borderRadius:'50%',background:groupColour(r.groupNumber||1),flexShrink:0}}></div>
            <Avatar user={scorecardPlayerProfile({id:r.id,display_name:r.name,name:r.name})} size={34}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:16,color:'#fff',fontWeight:900,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{gameName(r.name)}</div>
              <div style={{fontSize:11,color:'#90ccf0'}}>Group {groupLetter(r.groupNumber||1)} - thru {r.holes}</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:28,color:'#fff',fontWeight:900,lineHeight:1}}>{r.total}</div>
              <div style={{fontSize:9,color:'#60b8f0',letterSpacing:'0.12em'}}>PTS</div>
            </div>
          </div>
        ))}
        {isCompletedRound(round)&&!round._cupScoring&&(
          <div style={{marginTop:12}}>
            <div style={{...S.card,margin:'0 0 12px',background:'linear-gradient(135deg,rgba(0,112,187,0.22),rgba(255,255,255,0.05))',borderColor:'rgba(96,184,240,0.42)'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:10}}>
                <div><div style={{fontSize:18,color:'#fff',fontWeight:950}}>Final Stableford Scores</div><div style={{fontSize:11,color:'#90ccf0'}}>Completed round · spectator summary</div></div>
                <div style={{fontSize:11,color:'#86efac',fontWeight:950,letterSpacing:'0.08em'}}>FINAL</div>
              </div>
              {overallLeaderboardRows().map((r,idx)=><div key={'final-'+r.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderTop:idx?'1px solid rgba(255,255,255,0.08)':'none'}}>
                <div style={{width:26,height:26,borderRadius:9,background:idx===0?'rgba(251,191,36,0.22)':'rgba(255,255,255,0.08)',border:'1px solid '+(idx===0?'rgba(251,191,36,0.38)':'rgba(255,255,255,0.10)'),display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:idx===0?'#fbbf24':'rgba(255,255,255,0.78)',fontWeight:950}}>{idx+1}</div>
                <Avatar user={scorecardPlayerProfile({id:r.id,display_name:r.name,name:r.name})} size={30}/>
                <div style={{flex:1,fontSize:14,color:'#fff',fontWeight:850}}>{gameFirstName(r.name||'?')}</div>
                <div style={{fontSize:24,color:'#60b8f0',fontWeight:950,lineHeight:1}}>{r.total} <span style={{fontSize:10,color:'#90ccf0',fontWeight:900}}>pts</span></div>
              </div>)}
            </div>
            <SweepstakePanel throughHole={18} reviewTitle="💰 SWEEPSTAKE - WHO PAYS WHO" payUp={true} forceEnabled={!!round._spectator}/>
          </div>
        )}
      </div> : <>

      <div style={{padding:'6px 14px',fontSize:11,color:'rgba(144,204,240,0.75)',borderBottom:'1px solid rgba(255,255,255,0.06)',background:'rgba(0,0,0,0.14)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
        <span style={{minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{refreshing?'Refreshing latest scores...':lastRefreshed?'Last updated '+lastRefreshed:'Tap refresh for latest scores'}</span>
        <button onClick={()=>refreshScoresFromCloud(true)} disabled={refreshing} style={{border:'1px solid rgba(96,184,240,0.35)',background:'rgba(0,112,187,0.22)',color:'#90ccf0',borderRadius:999,padding:'5px 10px',fontSize:11,fontWeight:700,flexShrink:0,opacity:refreshing?0.6:1}}>Refresh</button>
      </div>

      <FinalStablefordSweepstakeBlock topMargin={12}/>
      {!(matchplayConfig&&matchplayConfig.enabled&&(matchplayConfig.mode==='foursomes'||(matchplayConfig.mode==='singles'&&matchplayConfig.keepStableford===false)))&&<MatchplayScoreBanner/>}
      <FoursomesScorecard/>
      <SinglesMatchplayOnlyScorecard/>

      {/* Spectator live leaderboard */}
      {!(matchplayConfig&&matchplayConfig.enabled)&&!canEdit&&!isCompletedRound(round)&&!isCupSpectatorScorecard&&(
        <div style={{padding:'12px 14px',background:'rgba(0,0,0,0.2)',borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
          <div style={{fontSize:10,color:'#60b8f0',letterSpacing:'0.15em',fontWeight:600,marginBottom:10}}>LIVE LEADERBOARD</div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {[...grpPlayers].sort((a,b)=>getRunning(b.id,18)-getRunning(a.id,18)).map((p,rank)=>{
              const total=getRunning(p.id,holes.length);
              const holesPlayed=Object.keys(holeScores).filter(h=>( holeScores[h]||{})[p.id]!==undefined).length;
              const lastHole=Math.max(0,...Object.keys(holeScores).filter(h=>(holeScores[h]||{})[p.id]!==undefined).map(Number));
              const lastPts=lastHole>0?getPts((holeScores[lastHole]||{})[p.id],lastHole,p.id):null;
              return(
                <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:rank===0?'rgba(184,134,11,0.15)':'rgba(255,255,255,0.05)',borderRadius:10,border:rank===0?'1px solid rgba(184,134,11,0.3)':'1px solid rgba(255,255,255,0.08)'}}>
                  <div style={{fontSize:18,fontWeight:700,color:rank===0?'#fbbf24':'rgba(255,255,255,0.4)',width:24,textAlign:'center'}}>{rank+1}</div>
                  <Avatar user={scorecardPlayerProfile(p)} size={34}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,color:'#fff',fontWeight:600}}>{gameFirstName(p.name||p.display_name||'?')}</div>
                    <div style={{fontSize:11,color:'#60b8f0'}}>{holesPlayed} holes played{lastHole>0?' - Hole '+lastHole:''}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:28,color:'#fff',fontWeight:700,lineHeight:1}}>{total}</div>
                    <div style={{fontSize:9,color:'#60b8f0',letterSpacing:'0.1em'}}>PTS</div>
                  </div>
                  {lastPts!==null&&lastHole>0&&(
                    <div style={{width:32,height:32,borderRadius:8,background:ptsColor(lastPts),display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:'#fff',fontWeight:700}}>{lastPts}</div>
                  )}
                </div>
              );
            })}
          </div>
          <MatchplayMiniStatus/>
          <button onClick={()=>{setEndStep(2);setShowEnd(true);}} style={{...S.pri,width:'100%',marginTop:10,fontSize:13}}>Stats</button>
          <div style={{fontSize:10,color:'rgba(255,255,255,0.3)',textAlign:'center',marginTop:8}}>Scroll down to see full scorecard</div>
        </div>
      )}

      {!(matchplayConfig&&matchplayConfig.enabled&&(matchplayConfig.mode==='foursomes'||(matchplayConfig.mode==='singles'&&matchplayConfig.keepStableford===false)))&&['FRONT 9','BACK 9'].map((label,sec)=>(
        <div key={label}>
          <div style={{padding:'4px 12px',fontSize:10,color:'#60b8f0',letterSpacing:'0.1em',textTransform:'uppercase',background:'rgba(0,0,0,0.3)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
            <span>{label}</span>
            {label==='BACK 9'&&<button onClick={()=>refreshScoresFromCloud(true)} disabled={refreshing} style={{border:'1px solid rgba(96,184,240,0.35)',background:'rgba(0,112,187,0.22)',color:'#90ccf0',borderRadius:999,padding:'4px 9px',fontSize:10,fontWeight:700,opacity:refreshing?0.6:1}}>Refresh</button>}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'80px '+grpPlayers.map(()=>'1fr').join(' '),padding:'4px 12px',borderBottom:'1px solid rgba(255,255,255,0.1)',background:'rgba(0,50,120,0.4)',gap:6,alignItems:'center'}}>
            <div style={{fontSize:9,color:'#60b8f0',textTransform:'uppercase',letterSpacing:'0.08em'}}>Hole</div>
            {grpPlayers.map(p=>(
              <div key={p.id} style={{textAlign:'center',padding:'3px 0',minWidth:0}}>
                <ScorecardPlayerBadge player={p} size={28} compact showHcp/>
              </div>
            ))}
          </div>
          {holes.slice(sec*9,(sec+1)*9).map((hd,idx)=>{
            const hcpMap={};
            grpPlayers.forEach(p=>{hcpMap[p.id]=parseFloat(playingHcps[p.id]!=null?playingHcps[p.id]:p.current_handicap||0);});
            return(
              <div id={'hole-'+hd.hole} key={hd.hole} style={{scrollMarginTop:72,display:'grid',gridTemplateColumns:'80px '+grpPlayers.map(()=>'1fr').join(' '),borderBottom:'1px solid rgba(255,255,255,0.06)',background:idx%2===0?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.1)'}}>
                <div style={{padding:'8px 12px'}}>
                  <div style={{fontSize:22,color:'#fff',lineHeight:1}}>{hd.hole}</div>
                  <div style={{fontSize:11,color:'#60b8f0',marginTop:2}}>Par {hd.par}</div>
                  <div style={{fontSize:9,color:'#d4af37',fontWeight:900}}>SI {hd.stroke_index}</div>
                </div>
                {grpPlayers.map(p=>{
                  const gross=(holeScores[hd.hole]||{})[p.id];
                  const pts=getPts(gross,hd.hole,p.id);
                  const hcp=hcpMap[p.id];
                  const shots=Math.floor(hcp/18)+((hcp%18)>=hd.stroke_index?1:0);
                  const running=getRunning(p.id,hd.hole);
                  const hasScoreEntered=hasEnteredGross(gross);
                  const hasSnake=hasScoreEntered&&isSnakeHolder(hd.hole,p.id);
                  return(
                    <div key={p.id} onClick={()=>{
                          if(!canEdit)return;
                          const skipped=checkSkipped(hd.hole);
                          if(skipped&&skipped!==hd.hole){
                            if(!window.confirm('You have not entered hole '+skipped+' yet. Continue anyway?'))return;
                          }
                          const existingHoleScores=holeScores&&holeScores[hd.hole]&&typeof holeScores[hd.hole]==='object'?holeScores[hd.hole]:{};
                          const holeAlreadyStarted=Object.values(existingHoleScores).some(v=>v!==undefined&&v!==null&&v!=='');
                          setInputVal(grossScoreValue(gross)?String(grossScoreValue(gross)):'');
                          setInputHole({holeNum:hd.hole,pid:p.id,autoAdvance:!holeAlreadyStarted});
                        }} style={{minHeight:rowH,position:'relative',display:'flex',alignItems:'center',justifyContent:'center',cursor:canEdit?'pointer':'default',background:gross&&gross!==-1&&!isGivenGross(gross)?ptsColor(pts):(gross===-1||isGivenGross(gross))?'rgba(20,20,20,0.8)':'rgba(255,255,255,0.04)',borderLeft:'1px solid rgba(255,255,255,0.06)'}}>
                      {shots>0&&<div style={{position:'absolute',top:5,left:6,display:'flex',gap:2}}>{Array.from({length:shots}).map((_,i)=><div key={i} style={{width:6,height:6,borderRadius:'50%',background:'#f59e0b'}}/>)}</div>}
                      {hasSnake&&<div style={{position:'absolute',bottom:4,left:5,fontSize:13,fontWeight:950,filter:'drop-shadow(0 1px 2px rgba(0,0,0,0.5))'}}>{EMOJI.snake}</div>}
                      {hasScoreEntered?(
                        <div>
                          <div style={{fontSize:24,color:'#fff',lineHeight:1,textAlign:'center',fontWeight:800}}>{grossDisplay(gross)}</div>
                          {pts!==null&&<div style={{position:'absolute',top:5,right:5,fontSize:10,color:'rgba(255,255,255,0.95)',background:'rgba(0,0,0,0.35)',borderRadius:6,padding:'2px 5px',fontWeight:800}}>{pts}pt</div>}
                          {grossScoreValue(gross)>0&&<div title='Total points so far' style={{position:'absolute',bottom:5,right:5,minWidth:28,height:19,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'#dbeafe',background:'rgba(96,184,240,0.18)',border:'1px solid rgba(96,184,240,0.32)',borderRadius:999,padding:'1px 6px',fontWeight:800,boxShadow:'0 1px 3px rgba(0,0,0,0.14)'}}>{running}pt</div>}
                        </div>
                      ):(
                        <div style={{fontSize:11,color:'rgba(255,255,255,0.2)'}}>TAP</div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {activeGroupId!=='leaderboard'&&<div style={{display:'grid',gridTemplateColumns:'80px '+grpPlayers.map(()=>'1fr').join(' '),borderBottom:'1px solid rgba(255,255,255,0.12)',background:'rgba(0,112,187,0.12)'}}>
            <div style={{padding:'9px 12px',fontSize:11,color:'#60b8f0',fontWeight:900,textTransform:'uppercase'}}>{sec===0?'Front':'Back'} 9</div>
            {grpPlayers.map(p=>{
              const nine=sec===0?front9:back9;
              return <div key={p.id} style={{borderLeft:'1px solid rgba(255,255,255,0.08)',padding:'7px 5px',textAlign:'center'}}>
                <ScoreSummaryBlock
                  grossText={grossOverParSummaryDisplay(p.id,nine)}
                  stableford={getStablefordTotal(p.id,nine)}
                  totalGrossText={sec===1?grossOverParSummaryDisplay(p.id,holes):null}
                  totalStableford={sec===1?getStablefordTotal(p.id,holes):null}
                />
              </div>;
            })}
          </div>}
        </div>
      ))}

      {f9complete&&!showReview&&(
        <div style={{margin:16,...S.card,textAlign:'center',background:'rgba(0,112,187,0.15)',borderColor:'rgba(0,112,187,0.4)'}}>
          <button onClick={()=>{if(canEdit)saveAll();setEndStep(2);setShowEnd(true);}} style={{...S.pri,fontSize:13}}>Stats</button>
        </div>
      )}

      <div style={{padding:'8px 16px 24px'}}>
        {canEdit&&cloudError&&(
          <div style={{marginBottom:10,padding:'10px 12px',borderRadius:10,background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.35)'}}>
            <div style={{fontSize:11,color:'#fca5a5',marginBottom:8}}>Other players will not see latest scores until this syncs.<br/>Error: {cloudError}</div>
            <button disabled={saving} onClick={saveAll} style={{...S.gho,width:'100%',fontSize:13,opacity:saving?0.6:1}}>{saving?'Retrying...':'Retry cloud sync now'}</button>
          </div>
        )}
        {canEdit&&<button onClick={async()=>{
          if(!window.confirm('Finish this round? It will be removed from Live Scores.'))return;
          const synced=await saveAll();
          if(!synced&&!window.confirm('Scores did not sync to cloud. Finish anyway? Other players may not see them.'))return;
          const{error}=await sb.from('cup_rounds').update({status:'complete'}).eq('id',round.id);
          if(error){flash(error.message||'Could not finish round','error');return;}
          notifyFinishedScores().catch(e=>console.warn('Snyder Live finished-round notification error',e));
          round.status='complete';
          await load();
          setEndStep(1);setShowEnd(true);
        }} style={{...S.pri,width:'100%',padding:13,fontSize:14,background:'#0a8a4a',marginBottom:0}}>Finish Round</button>}
        {canDeleteRound&&<button onClick={deleteRoundAndGoHome} style={{...S.dan,width:'100%',padding:13,fontSize:14,marginTop:10}}>Delete Round</button>}
        {!canEdit&&<div style={{textAlign:'center',padding:'10px',fontSize:12,color:'rgba(255,255,255,0.3)'}}>{isCompletedRound(round)?'Completed round - view only':'View only - sign in as a player to score'}</div>}
      </div>

      </>}

      {showSweepstake&&!isJoinedDaySweepstake&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',zIndex:9998,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)setShowSweepstake(false);}}>
          <div style={{width:'100%',maxWidth:520,maxHeight:'82vh',overflowY:'auto',background:'#0d2548',borderTop:'1px solid rgba(255,255,255,0.16)',borderRadius:'18px 18px 0 0',padding:16}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
              <div><div style={{fontSize:18,color:'#fff',fontWeight:900}}>Sweepstake Money</div><div style={{fontSize:12,color:'#fbbf24'}}>Net settlement only · {sweepstakePlayerRows().scope==='round'?'whole round / all groups':'my group only'}</div></div>
              <button onClick={()=>setShowSweepstake(false)} style={{...S.gho,padding:'6px 12px',fontSize:13}}>Close</button>
            </div>
            <SweepstakePanel compact={false}/>
          </div>
        </div>
      )}

      {showOverall&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',zIndex:9998,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)setShowOverall(false);}}>
          <div style={{width:'100%',maxWidth:520,maxHeight:'82vh',overflowY:'auto',background:'#0d2548',borderTop:'1px solid rgba(255,255,255,0.16)',borderRadius:'18px 18px 0 0',padding:16}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
              <div>
                <div style={{fontSize:18,color:'#fff',fontWeight:800}}>{overallMode==='cupOverall'?'Overall Cup':(overallMode==='cupDay'?('Day '+((round&&round._cupDayNumber)||cupDayFromRound(round)||1)+' Singles Leaderboard'):'Overall Leaderboard')}</div>
                {overallMode!=='cupOverall'&&<div style={{fontSize:12,color:'#60b8f0'}}>{overallMode==='cupDay'?('All singles scores for Day '+((round&&round._cupDayNumber)||cupDayFromRound(round)||1)):(dayCompKeyFromRound(round)?'All rounds on this sweepstake board':'All groups in this round')}</div>}
              </div>
              <button onClick={()=>setShowOverall(false)} style={{...S.gho,padding:'6px 12px',fontSize:13}}>Close</button>
            </div>
            <button onClick={async()=>{setOverallRefreshNote('Refreshing...'); overallMode==='cupOverall'?await openCupOverallSummary(false):(overallMode==='cupDay'?await openCupDaySinglesLeaderboard(false):await openOverallLeaderboard(false));}} style={{...S.pri,width:'100%',marginBottom:6,fontSize:13}}>Refresh leaderboard</button>
        {overallRefreshNote&&<div style={{fontSize:11,color:'#90ccf0',textAlign:'center',marginBottom:12}}>{overallRefreshNote}</div>}
            {overallMode==='cupOverall'&&(()=>{const s=cupIfItStaysScore();const rows=cupOverallSinglesRows();return <>
              <div style={{border:'1px solid rgba(255,255,255,0.22)',background:cupProjectedBg(),borderRadius:16,padding:'12px 14px',marginBottom:12,boxShadow:'0 10px 24px rgba(0,0,0,0.25)'}}>
                <div style={{fontSize:11,fontWeight:950,letterSpacing:'0.12em',color:'rgba(255,255,255,0.86)',textTransform:'uppercase',marginBottom:8}}>If it stays like this...</div>
                <div style={{display:'grid',gridTemplateColumns:`repeat(${CUP_TEAM_KEYS.length},minmax(0,1fr))`,alignItems:'stretch',gap:8}}>
                  {CUP_TEAM_KEYS.map(k=><div key={'overall-cup-proj-'+k} style={{minWidth:0,textAlign:'center',border:'1px solid rgba(255,255,255,0.18)',borderRadius:12,background:'rgba(0,0,0,0.14)',padding:'8px 6px'}}>
                    <div style={{fontSize:12,fontWeight:950,color:CUP_THEME[k].accent,textTransform:'uppercase',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s[k+'Name']||CUP_THEME[k].name}</div>
                    <div style={{fontSize:30,fontWeight:950,color:'#fff',lineHeight:1,marginTop:4}}>{fmtCupPoint(s[k]||0)}</div>
                  </div>)}
                </div>
                <div style={{fontSize:10,color:'rgba(255,255,255,0.78)',marginTop:8,textAlign:'center'}}>Overall total + today's projected team score</div>
              </div>
              <div style={{fontSize:12,fontWeight:950,color:'#fbbf24',letterSpacing:'0.08em',textTransform:'uppercase',margin:'4px 0 8px'}}>Overall singles</div>
              {rows.map((r,idx)=>{const tone=cupRankTone(idx,rows.length);return (
                <div key={r.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:tone.bg,border:'1px solid '+tone.border,borderRadius:12,marginBottom:8,boxShadow:idx<3?'0 10px 22px rgba(0,0,0,0.20)':'0 6px 14px rgba(0,0,0,0.12)'}}>
                  <div style={{width:48,textAlign:'center',fontSize:idx<3?21:18,color:tone.color,fontWeight:950,lineHeight:1.05}}>{cupRankLabel(idx,rows.length)}{cupForfeitMark(idx,rows.length,true)}</div>
                  <Avatar user={scorecardPlayerProfile({id:r.id,display_name:r.name,name:r.name})} size={34}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:15,color:'#fff',fontWeight:900,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{gameName(r.name)}</div>
                    <div style={{fontSize:11,color:'#90ccf0'}}>Thru {r.holes}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:28,color:'#fff',fontWeight:950,lineHeight:1}}>{r.total}</div>
                    <div style={{fontSize:9,color:'#60b8f0',letterSpacing:'0.12em'}}>PTS</div>
                  </div>
                </div>
              )})}
            </>})()}
            {overallMode!=='cupOverall'&&(()=>{const lbRows=overallLeaderboardRows();return lbRows.map((r,idx)=>{const tone=overallMode==='cupDay'?cupRankTone(idx,lbRows.length):null;return (
              <div key={r.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:tone?tone.bg:(idx===0?'rgba(184,134,11,0.15)':'rgba(255,255,255,0.06)'),border:'1px solid '+(tone?tone.border:(idx===0?'rgba(184,134,11,0.3)':'rgba(255,255,255,0.08)')),borderRadius:12,marginBottom:8,boxShadow:tone?'0 6px 14px rgba(0,0,0,0.12)':'none'}}>
                <div style={{width:tone?48:28,textAlign:'center',fontSize:tone&&idx<3?21:18,color:tone?tone.color:(idx===0?'#fbbf24':'rgba(255,255,255,0.48)'),fontWeight:900}}>{tone?cupRankLabel(idx,lbRows.length)+cupForfeitMark(idx,lbRows.length,false):idx+1}</div>
                <Avatar user={scorecardPlayerProfile({id:r.id,display_name:r.name,name:r.name})} size={34}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:15,color:'#fff',fontWeight:800,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{gameName(r.name)}</div>
                  <div style={{fontSize:11,color:'#60b8f0'}}>Thru {r.holes}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:28,color:'#fff',fontWeight:900,lineHeight:1}}>{r.total}</div>
                  <div style={{fontSize:9,color:'#60b8f0',letterSpacing:'0.12em'}}>PTS</div>
                </div>
              </div>
            )})})()}
          </div>
        </div>
      )}
      <ScoreInput/>
    </div>
  );
}

// =========================================================
// Admin panel
// Course, round and tournament administration entry point
// =========================================================
function AdminPanel({courses,rounds,groups,scores,sb,flash,setView,load,cupUsers,guests,cupEvents,cupTeams,cupEventPlayers,cupDays,cupMatches}){
  const[tab,setTab]=useState('courses');
  const[pw,setPw]=useState('');
  const[auth,setAuth]=useState(false);
  const adminTabs=[['courses','Courses'],['days','Days'],['rounds','Rounds'],['users','Users'],['englandGolf','England Golf'],['leagueLinks','League Links'],['cup','Cup']];

  if(!auth)return(
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{...S.card,width:'100%',maxWidth:320}}>
        <div style={{fontSize:16,color:'#fff',marginBottom:16}}>Admin Password</div>
        <input type="password" style={{...S.inp,marginBottom:12}} value={pw} onChange={e=>setPw(e.target.value)} placeholder="Password"/>
        <button onClick={()=>{if(pw===ADMIN_PW)setAuth(true);else flash('Wrong password','error');}} style={{...S.pri,width:'100%'}}>Enter</button>
        <button onClick={()=>setView('home')} style={{...S.gho,width:'100%',marginTop:8}}>Back</button>
      </div>
    </div>
  );

  return(
    <div style={{minHeight:'100vh',paddingBottom:40}}>
      <div style={{padding:'12px 16px',display:'flex',alignItems:'center',gap:12,borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
        <button onClick={()=>setView('home')} style={{...S.gho,padding:'6px 12px',fontSize:13}}>Back</button>
        <div style={{fontSize:16,color:'#fff'}}>Admin</div>
      </div>
      <div style={{display:'flex',gap:4,padding:'10px 12px',overflowX:'auto',borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
        {adminTabs.map(([t,label])=>(
          <button key={t} onClick={()=>setTab(t)} style={{...tab===t?S.pri:S.gho,padding:'7px 14px',fontSize:12,textTransform:'capitalize',flexShrink:0}}>{label}</button>
        ))}
      </div>
      <div style={{padding:16}}>
        {tab==='courses'&&<CoursesTab courses={courses} sb={sb} flash={flash} load={load}/>}
        {tab==='days'&&<DayBoardsTab rounds={rounds} scores={scores} sb={sb} flash={flash} load={load}/>}
        {tab==='rounds'&&<RoundsTab rounds={rounds} groups={groups} sb={sb} flash={flash} load={load}/>}
        {tab==='englandGolf'&&<EnglandGolfAdminTab cupUsers={cupUsers}/>}
        {tab==='leagueLinks'&&<LeagueLinksAdminTab sb={sb} flash={flash} cupUsers={cupUsers} guests={guests}/>}
        {tab==='cup'&&<CupAdminTab sb={sb} flash={flash} load={load} cupUsers={cupUsers} cupEvents={cupEvents} cupTeams={cupTeams} cupEventPlayers={cupEventPlayers} cupDays={cupDays} cupMatches={cupMatches} courses={courses} rounds={rounds}/>}
        {tab==='users'&&(
          <div>
            <div style={{fontSize:12,color:'#60b8f0',fontWeight:900,letterSpacing:'0.12em',margin:'0 0 8px'}}>REGISTERED USERS</div>
            {(cupUsers||[]).map(u=>(
              <div key={u.id} style={{...S.card,marginBottom:8,display:'flex',alignItems:'center',gap:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,color:'#fff',fontWeight:700}}>{u.display_name}</div>
                  <div style={{fontSize:11,color:'#60b8f0'}}>@{u.username} - HCP {u.handicap} - PIN: {u.pin}</div>
                </div>
                <button onClick={async()=>{
                  if(!window.confirm('Remove '+(u.display_name||u.username)+'? They will no longer be able to log in. Past scorecards will stay.'))return;
                  const{error}=await sb.from('cup_users').delete().eq('id',u.id);
                  if(error){flash(error.message||'Could not remove user','error');return;}
                  flash('User removed');
                  await load();
                }} style={{...S.dan,padding:'7px 10px',fontSize:12}}>Remove</button>
              </div>
            ))}
            <div style={{fontSize:12,color:'#60b8f0',fontWeight:900,letterSpacing:'0.12em',margin:'18px 0 8px'}}>GUESTS</div>
            {(!guests||guests.length===0)&&<div style={{...S.card,fontSize:13,color:'rgba(255,255,255,0.55)',textAlign:'center'}}>No guests saved.</div>}
            {(guests||[]).map(g=>{
              const creator=(cupUsers||[]).find(u=>normaliseId(u.id)===normaliseId(g.created_by));
              return(
                <div key={g.id} style={{...S.card,marginBottom:8,display:'flex',alignItems:'center',gap:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,color:'#fff',fontWeight:700}}>{g.name||'Guest'}</div>
                    <div style={{fontSize:11,color:'#60b8f0'}}>Guest - HCP {g.handicap||0}{creator?' - created by '+(creator.display_name||creator.username):''}</div>
                  </div>
                  <button onClick={async()=>{
                    if(!window.confirm('Delete guest '+(g.name||'Guest')+'? Use this for duplicate or mistaken guest records.'))return;
                    const{error}=await sb.from('cup_guests').delete().eq('id',g.id);
                    if(error){flash(error.message||'Could not delete guest','error');return;}
                    flash('Guest deleted');
                    await load();
                  }} style={{...S.dan,padding:'7px 10px',fontSize:12}}>Delete</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EnglandGolfAdminTab({cupUsers}){
  const linked=(cupUsers||[])
    .filter(u=>u&&u.england_golf_member_no)
    .sort((a,b)=>String(a.display_name||a.username||'').localeCompare(String(b.display_name||b.username||'')));
  const formatSyncDate=value=>{
    if(!value)return 'Never';
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return 'Unknown';
    return date.toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'});
  };
  return(
    <div>
      <div style={{fontSize:12,color:'#60b8f0',fontWeight:900,letterSpacing:'0.12em',margin:'0 0 8px'}}>ENGLAND GOLF LINKS</div>
      <div style={{...S.card,marginBottom:10,borderColor:'rgba(96,184,240,0.22)',background:'rgba(0,112,187,0.10)',fontSize:12,color:'#90ccf0',lineHeight:1.45}}>
        Shows who has connected England Golf and whether the last daily sync succeeded. Passwords are encrypted and never shown here.
      </div>
      {!linked.length&&<div style={{...S.card,fontSize:13,color:'rgba(255,255,255,0.55)',textAlign:'center'}}>No England Golf accounts linked yet.</div>}
      {linked.map(u=>{
        const failed=!!u.england_golf_sync_error;
        return(
          <div key={u.id} style={{...S.card,marginBottom:8,borderColor:failed?'rgba(248,113,113,0.32)':'rgba(34,197,94,0.24)',background:failed?'rgba(239,68,68,0.10)':'rgba(34,197,94,0.08)'}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'flex-start'}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:15,color:'#fff',fontWeight:900,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.display_name||u.username||'Player'}</div>
                <div style={{fontSize:11,color:'#90ccf0',marginTop:2}}>@{u.username||'user'} - Member {u.england_golf_member_no}</div>
              </div>
              <div style={{fontSize:18,color:'#F5D76E',fontWeight:950,whiteSpace:'nowrap'}}>{formatHeaderHandicap(u.handicap)}</div>
            </div>
            <div style={{fontSize:11,color:failed?'#fca5a5':'#bbf7d0',marginTop:8,lineHeight:1.4}}>
              Last sync: {formatSyncDate(u.england_golf_last_sync_at)} - {failed?'Error: '+u.england_golf_sync_error:'OK'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeagueLinksAdminTab({sb,flash,cupUsers,guests}){
  const[leaguePlayers,setLeaguePlayers]=useState([]);
  const[links,setLinks]=useState({});
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState('');
  const[cloudAvailable,setCloudAvailable]=useState(true);

  async function loadLinks(){
    setLoading(true);
    try{
      const [{data:players,error:playersError},linkResult]=await Promise.all([
        sb.from('players').select('*').order('name',{ascending:true}),
        fetchLeaguePlayerLinks(sb)
      ]);
      if(playersError)throw playersError;
      setLeaguePlayers(players||[]);
      setLinks((linkResult&&linkResult.links)||{});
      setCloudAvailable(!(linkResult&&linkResult.cloudAvailable===false));
    }catch(e){
      flash('League links failed: '+(e.message||String(e)),'error');
    }finally{
      setLoading(false);
    }
  }
  useEffect(()=>{loadLinks();},[]);

  const livePeople=[
    ...(cupUsers||[]).map(u=>({...u,_type:'Live account',_sort:leagueLinkLiveName(u)})),
    ...(guests||[]).map(g=>({...g,display_name:g.name,_type:'Guest',_sort:leagueLinkLiveName(g)}))
  ].filter(p=>leagueLinkLiveId(p)).sort((a,b)=>String(a._sort||'').localeCompare(String(b._sort||'')));

  async function setLink(person,leaguePlayerId){
    const liveId=leagueLinkLiveId(person);
    if(!leaguePlayerId){
      flash('Choose a Summer League player','error');
      return;
    }
    const leaguePlayer=leaguePlayers.find(p=>normaliseId(p.id)===normaliseId(leaguePlayerId));
    if(!leaguePlayer)return;
    setSaving(liveId);
    try{
      const result=await saveLeaguePlayerLink(sb,{
        live_user_id:liveId,
        live_name:leagueLinkLiveName(person),
        league_player_id:leaguePlayer.id,
        league_player_name:leaguePlayer.name
      });
      setLinks(prev=>({...prev,[liveId]:{
        live_user_id:liveId,
        live_name:leagueLinkLiveName(person),
        league_player_id:leaguePlayer.id,
        league_player_name:leaguePlayer.name,
        updated_at:new Date().toISOString()
      }}));
      if(result.cloudAvailable===false)setCloudAvailable(false);
      flash('Linked '+leagueLinkLiveName(person)+' to '+leaguePlayer.name);
    }catch(e){
      flash('Could not save link: '+(e.message||String(e)),'error');
    }finally{
      setSaving('');
    }
  }

  return <div>
    <div style={{fontSize:12,color:'#60b8f0',fontWeight:900,letterSpacing:'0.12em',margin:'0 0 8px'}}>LIVE TO LEAGUE LINKS</div>
    {!cloudAvailable&&<div style={{...S.card,marginBottom:10,borderColor:'rgba(245,158,11,0.28)',background:'rgba(245,158,11,0.10)',fontSize:12,color:'#fbbf24'}}>Cloud link table not available yet, so links are saved on this device for now.</div>}
    {loading&&<div style={{...S.card,fontSize:13,color:'#90ccf0'}}>Loading League players...</div>}
    {!loading&&livePeople.map(person=>{
      const liveId=leagueLinkLiveId(person);
      const linked=links[liveId]||{};
      return <div key={person._type+'-'+liveId} style={{...S.card,marginBottom:8,display:'grid',gridTemplateColumns:'1fr minmax(140px,220px)',gap:10,alignItems:'center'}}>
        <div style={{minWidth:0}}>
          <div style={{fontSize:14,color:'#fff',fontWeight:850,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{leagueLinkLiveName(person)}</div>
          <div style={{fontSize:11,color:'#60b8f0',marginTop:2}}>{person._type}{linked.league_player_name?' - linked to '+linked.league_player_name:''}</div>
        </div>
        <select value={linked.league_player_id||''} disabled={saving===liveId} onChange={e=>setLink(person,e.target.value)} style={{...S.inp,padding:'9px 10px',fontSize:13}}>
          <option value="">Choose League player</option>
          {leaguePlayers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>;
    })}
    {!loading&&!livePeople.length&&<div style={{...S.card,fontSize:13,color:'rgba(255,255,255,0.55)',textAlign:'center'}}>No live users or guests found.</div>}
  </div>;
}

// =========================================================
// Admin: courses tab
// Course listing, creation and editing actions
// =========================================================
function CoursesTab({courses,sb,flash,load}){
  const[showSearch,setShowSearch]=useState(false);
  const[query,setQuery]=useState('');
  const[results,setResults]=useState([]);
  const[searching,setSearching]=useState(false);
  const[searchError,setSearchError]=useState('');
  const[hasSearched,setHasSearched]=useState(false);
  const[importing,setImporting]=useState(null);
  const[editingCourse,setEditingCourse]=useState(null);

  async function searchCourses(){
    const cleanQuery=query.trim().toLowerCase();
    setHasSearched(true);
    setSearching(false);
    setResults([]);
    if(!cleanQuery){
      setSearchError('Type a golf club or course name first, or use Manual to add one.');
      return;
    }
    const localMatches=(courses||[]).filter(c=>{
      const haystack=((c.name||'')+' '+(c.location||'')).toLowerCase();
      return haystack.includes(cleanQuery);
    });
    if(localMatches.length){
      setSearchError('That course is already saved below. Use Edit Holes to check yardages and stroke indexes.');
      return;
    }
    setSearchError('Live golf API search is disabled for now because it was crashing on mobile. Use Manual to add yardages and stroke indexes safely.');
  }

  async function importCourse(course){
    flash('Import is disabled for now - use Manual instead','error');
  }

  async function deleteCourse(course){
    if(isProtectedCourse(course)){flash('Built-in courses cannot be deleted','error');return;}
    if(!window.confirm('Delete '+course.name+'?'))return;
    try{
      const{data:linkedRounds}=await sb.from('cup_rounds').select('id').eq('course_id',course.id);
      for(const rd of linkedRounds||[]){
        await sb.from('cup_scores').delete().eq('round_id',rd.id);
        await sb.from('cup_groups').delete().eq('round_id',rd.id);
        await sb.from('cup_round_players').delete().eq('round_id',rd.id);
        await sb.from('cup_rounds').delete().eq('id',rd.id);
      }
      await sb.from('cup_courses').delete().eq('id',course.id);
      await load();flash('Deleted');
    }catch(e){flash('Error: '+e.message,'error');}
  }

  return(
    <div>
      <div style={{display:'flex',gap:8,marginBottom:8}}>
        <button onClick={()=>setShowSearch(s=>!s)} style={{...S.pri,flex:1,fontSize:13}}>Search Course</button>
        <button onClick={()=>setEditingCourse({name:'',holes:Array.from({length:18},(_,i)=>({hole:i+1,par:4,stroke_index:i+1,yards:0})),isNew:true})} style={{...S.gho,flex:1,fontSize:13}}>Manual</button>
      </div>
      {showSearch&&(
        <div style={{...S.card,marginBottom:16}}>
          <div style={{display:'flex',gap:8,marginBottom:12}}>
            <input style={{...S.inp,flex:1}} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search saved courses..." onKeyDown={e=>e.key==='Enter'&&searchCourses()}/>
            <button onClick={searchCourses} disabled={searching} style={{...S.pri,padding:'10px 16px',fontSize:13,opacity:searching?0.6:1}}>Search</button>
          </div>
          {searchError&&<div style={{fontSize:12,color:'#ffd36a',marginBottom:10,lineHeight:1.4}}>{searchError}</div>}
          {hasSearched&&!searching&&!searchError&&!results.length&&<div style={{fontSize:12,color:'#8ea0ad',marginBottom:10}}>No saved course found. Use Manual to add yardages and stroke indexes yourself.</div>}
          {results.map(r=>(
            <div key={r.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,padding:'8px 12px',background:'rgba(255,255,255,0.06)',borderRadius:8}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,color:'#fff'}}>{r.club_name||r.name||'Unnamed course'}</div>
                <div style={{fontSize:11,color:'#60b8f0'}}>{r.location||'Location not shown'}</div>
              </div>
              <button onClick={()=>importCourse(r)} disabled={importing===r.id} style={{...S.pri,padding:'6px 12px',fontSize:12,opacity:importing===r.id?0.6:1}}>{importing===r.id?'...':'Import'}</button>
            </div>
          ))}
        </div>
      )}
      {getCourseOptions(courses).map(option=>{
        const teeEntries=Object.entries(option.tees||{}).sort((a,b)=>['White','Yellow','Red','Orange'].indexOf(a[0])-['White','Yellow','Red','Orange'].indexOf(b[0]));
        const protectedCourse=teeEntries.some(([,c])=>isProtectedCourse(c));
        return (
          <div key={option.name} style={{...S.card,marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,gap:8}}>
              <div style={{fontSize:15,color:'#fff',fontWeight:600}}>{option.name}</div>
              {protectedCourse
                ? <div style={{fontSize:11,color:'#86efac',border:'1px solid rgba(134,239,172,0.35)',background:'rgba(22,163,74,0.12)',borderRadius:999,padding:'4px 9px',whiteSpace:'nowrap'}}>Built-in</div>
                : <button onClick={()=>deleteCourse(option.course)} style={{...S.dan,padding:'4px 10px',fontSize:12}}>Delete</button>
              }
            </div>
            <div style={{fontSize:12,color:'#60b8f0',marginBottom:10}}>
              {teeEntries.map(([tee,c])=>tee+' tee ('+((c.holes||[]).length)+' holes)').join(' / ')||'Course'}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(95px,1fr))',gap:8}}>
              {teeEntries.map(([tee,c])=>(
                <button key={tee} onClick={()=>setEditingCourse(c)} style={{...S.gho,width:'100%',fontSize:12,padding:'8px 10px'}}>Edit {tee}</button>
              ))}
            </div>
          </div>
        );
      })}
      {editingCourse&&<CourseEditor course={editingCourse} sb={sb} flash={flash} load={load} onClose={()=>setEditingCourse(null)}/>}
    </div>
  );
}

// =========================================================
// Admin: course editor
// Hole/par/SI/yardage editing for a course
// =========================================================
function CourseEditor({course,sb,flash,load,onClose}){
  const[holes,setHoles]=useState(course.holes&&course.holes.length>0?course.holes:Array.from({length:18},(_,i)=>({hole:i+1,par:4,stroke_index:i+1,yards:0})));
  const[name,setName]=useState(course.name||'');
  const[imageUrl,setImageUrl]=useState(course.image_url||'');
  const[saving,setSaving]=useState(false);
  const[quickSI,setQuickSI]=useState('');

  function applyQuickSI(){
    const vals=quickSI.split(',').map(v=>parseInt(v.trim())).filter(v=>v>=1&&v<=18);
    if(vals.length===18){setHoles(prev=>prev.map((h,i)=>({...h,stroke_index:vals[i]})));flash('Applied');}
    else flash('Need 18 values','error');
  }

  async function save(){
    setSaving(true);
    try{
      if(course.isNew){
        if(!name.trim()){flash('Enter a name','error');setSaving(false);return;}
        const courseData={name:name.trim(),holes,location:''};
        try{courseData.image_url=imageUrl.trim()||null;}catch(e){}
        await sb.from('cup_courses').insert(courseData);
      } else {
        const updateData={name:name.trim()||course.name,holes};
        try{updateData.image_url=imageUrl.trim()||null;}catch(e){}
        await sb.from('cup_courses').update(updateData).eq('id',course.id);
      }
      await load();flash('Saved');onClose();
    }catch(e){flash('Error: '+(e.message||JSON.stringify(e)),'error');console.error('Save error:',e);}
    setSaving(false);
  }

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200}}>
      <div style={{background:'#0d2548',border:'1px solid rgba(255,255,255,0.15)',borderRadius:'16px 16px 0 0',width:'100%',maxWidth:480,maxHeight:'90vh',display:'flex',flexDirection:'column'}}>
        <div style={{padding:'14px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
          <div style={{fontSize:16,color:'#fff'}}>{course.isNew?'Add Course':'Edit: '+course.name}</div>
          <button onClick={onClose} style={{...S.gho,padding:'4px 10px',fontSize:16}}>x</button>
        </div>
        <div style={{flex:1,overflow:'auto',padding:16}}>
          <label style={S.lbl}>Course Name</label>
          <input style={{...S.inp,marginBottom:12}} value={name} onChange={e=>setName(e.target.value)} placeholder="Course name"/>
          <label style={S.lbl}>Course Image URL (optional)</label>
          <input style={{...S.inp,marginBottom:12}} value={imageUrl} onChange={e=>setImageUrl(e.target.value)} placeholder="https://... (photo of the course)"/>
          <label style={S.lbl}>Quick SI (comma separated, 18 values)</label>
          <div style={{display:'flex',gap:6,marginBottom:16}}>
            <input style={{...S.inp,flex:1,fontSize:12}} value={quickSI} onChange={e=>setQuickSI(e.target.value)} placeholder="e.g. 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18"/>
            <button onClick={applyQuickSI} style={{...S.pri,padding:'8px 12px',fontSize:12,whiteSpace:'nowrap'}}>Apply</button>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr>{['H','Par','SI','Yds'].map(h=><th key={h} style={{padding:'4px 6px',color:'#60b8f0',textAlign:'center',fontSize:11}}>{h}</th>)}</tr></thead>
            <tbody>
              {holes.map((h,i)=>(
                <tr key={h.hole} style={{background:i%2===0?'rgba(255,255,255,0.03)':'transparent'}}>
                  <td style={{padding:'3px 6px',textAlign:'center',color:'#60b8f0',fontSize:13}}>{h.hole}</td>
                  <td style={{padding:'3px'}}><input type="number" min="3" max="5" value={h.par} onChange={e=>{const n=[...holes];n[i]={...n[i],par:parseInt(e.target.value)||4};setHoles(n);}} style={{...S.inp,padding:'3px 4px',textAlign:'center',width:40,fontSize:12}}/></td>
                  <td style={{padding:'3px'}}><input type="number" min="1" max="18" value={h.stroke_index} onChange={e=>{const n=[...holes];n[i]={...n[i],stroke_index:parseInt(e.target.value)||i+1};setHoles(n);}} style={{...S.inp,padding:'3px 4px',textAlign:'center',width:40,fontSize:12}}/></td>
                  <td style={{padding:'3px'}}><input type="number" min="0" value={h.yards||''} onChange={e=>{const n=[...holes];n[i]={...n[i],yards:parseInt(e.target.value)||0};setHoles(n);}} style={{...S.inp,padding:'3px 4px',textAlign:'center',width:52,fontSize:12}}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{padding:'12px 16px',borderTop:'1px solid rgba(255,255,255,0.1)',display:'flex',gap:8}}>
          <button onClick={save} disabled={saving} style={{...S.pri,flex:1,padding:12,opacity:saving?0.6:1}}>{saving?'Saving...':'Save'}</button>
          <button onClick={onClose} style={{...S.gho,flex:1,padding:12}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// =========================================================
// Admin: day leaderboard tab
// Create named shared boards before anyone starts their scorecard.
// =========================================================
function DayBoardsTab({rounds,scores,sb,flash,load}){
  const[name,setName]=useState(defaultDaySweepstakeName());
  const[sweepstake,setSweepstake]=useState({enabled:true,amountPence:200,scope:'round'});
  const[saving,setSaving]=useState(false);
  const[finishPreview,setFinishPreview]=useState(null);
  const[finishing,setFinishing]=useState(false);
  const boards=Array.from((rounds||[]).filter(dayCompKeyFromRound).reduce((map,r)=>{const key=dayCompKeyFromRound(r);if(key&&(!map.has(key)||isDayCompBoardRound(r)))map.set(key,r);return map;},new Map()).values()).sort((a,b)=>roundStartDate(b)-roundStartDate(a));
  async function createBoard(){
    const clean=String(name||'').trim();
    if(!clean){flash('Name the day sweepstake','error');return;}
    if((parseInt(sweepstake&&sweepstake.amountPence)||0)<=0){flash('Enter a sweepstake amount','error');return;}
    setSaving(true);
    try{
      const key=makeDayCompKey();
      const payload={name:appendDayCompMarker(clean,key),course_name:'Day Leaderboard',status:'live',tee:'',day_number:1,join_code:Math.random().toString(36).substring(2,6).toUpperCase(),is_private:false};
      const{data:board,error}=await sb.from('cup_rounds').insert(payload).select().single();
      if(error)throw error;
      if(board&&board.id){
        const swSave=await saveSweepstakeConfigToCloud(board.id,{enabled:true,amountPence:parseInt(sweepstake.amountPence)||200,scope:'round'});
        if(!swSave.ok)flash('Day sweepstake created, but sweepstake setting did not sync yet','error');
      }
      flash('Day sweepstake created');
      setName(defaultDaySweepstakeName());
      await load();
    }catch(e){flash('Error: '+(e.message||String(e)),'error');}
    setSaving(false);
  }
  function dayLeaguePlayerName(player){
    return String((player&&(player.name||player.display_name||player.username))||'Player').trim();
  }
  function dayLeagueNameKey(value){
    return String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
  }
  function dayLeagueFirstName(value){
    return dayLeagueNameKey(value).split(' ')[0]||'';
  }
  function daySweepstakeIsGuest(player){
    const id=normaliseId(player&&player.id).toLowerCase();
    return !!(player&&(player.is_guest||player.guest_id||player.is_casual||id.startsWith('guest')||id.startsWith('casual')));
  }
  function findDayLeaguePlayer(scorecardPlayer,leaguePlayers,links){
    const linked=links&&links[leagueLinkLiveId(scorecardPlayer)];
    if(linked&&linked.league_player_id){
      const byId=(leaguePlayers||[]).find(p=>normaliseId(p&&p.id)===normaliseId(linked.league_player_id));
      if(byId)return byId;
    }
    const name=dayLeaguePlayerName(scorecardPlayer);
    const key=dayLeagueNameKey(name);
    const exact=(leaguePlayers||[]).find(p=>dayLeagueNameKey(p&&p.name)===key);
    if(exact)return exact;
    const first=dayLeagueFirstName(name);
    if(!first)return null;
    const matches=(leaguePlayers||[]).filter(p=>dayLeagueFirstName(p&&p.name)===first);
    return matches.length===1?matches[0]:null;
  }
  function dayFinishDateKey(value){
    const d=value?new Date(value):new Date();
    if(Number.isNaN(d.getTime())){
      const now=new Date();
      return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    }
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function daySnakeDateKey(board,playable){
    const first=(playable||[]).slice().sort((a,b)=>roundStartDate(a)-roundStartDate(b))[0]||board;
    return dayFinishDateKey(roundStartDate(first));
  }
  function buildDaySnakeCandidates(board,linked,roundPlayers,scoreRows,leaguePlayers,snakeLog,links){
    const playable=(linked||[]).filter(r=>r&&r.id&&!isDayCompBoardRound(r));
    const roundIds=new Set(playable.map(r=>r&&r.id).filter(Boolean));
    const holderIds=snakeHolderIdsFromScoreRows(scoreRows||[],18,roundIds);
    const aliasMap={};
    const personMap={};
    function addAlias(alias,canonical){
      const a=normaliseId(alias);const c=normaliseId(canonical);
      if(a&&c)aliasMap[a]=c;
    }
    (roundPlayers||[]).filter(rp=>roundIds.has(rp&&rp.round_id)).forEach(raw=>{
      const person=mapRoundPlayerForScorecard(raw,false);
      const canonical=normaliseId(person.id||person.user_id||person.guest_id||person.round_player_id||raw.user_id||raw.guest_id||raw.id);
      if(!canonical)return;
      personMap[canonical]=person;
      [person.id,person.user_id,person.guest_id,person.round_player_id,raw.id,raw.user_id,raw.guest_id,canonical].filter(Boolean).forEach(id=>addAlias(id,canonical));
      scoreAliasesForPerson(person).forEach(id=>addAlias(id,canonical));
    });
    const dateKey=daySnakeDateKey(board,playable);
    const candidates=[];
    holderIds.forEach(rawId=>{
      const canonical=aliasMap[normaliseId(rawId)]||normaliseId(rawId);
      if(!canonical||candidates.some(c=>normaliseId(c.id)===canonical))return;
      const scorecardPlayer=personMap[canonical]||{id:canonical,name:getDisplayName(canonical)||'Player'};
      const leaguePlayer=daySweepstakeIsGuest(scorecardPlayer)?null:findDayLeaguePlayer(scorecardPlayer,leaguePlayers||[],links);
      const existing=leaguePlayer?(snakeLog||[]).find(s=>normaliseId(s&&s.player_id)===normaliseId(leaguePlayer.id)&&dayFinishDateKey(s&&s.date)===dateKey):null;
      const alreadyConfirmed=!!(existing&&existing.confirmed===true);
      candidates.push({
        id:canonical,
        name:dayLeaguePlayerName(scorecardPlayer),
        scorecardPlayer,
        leaguePlayer,
        dateKey,
        existing,
        alreadyConfirmed,
        alreadyPending:!!(existing&&!alreadyConfirmed),
        add:!!(leaguePlayer&&!alreadyConfirmed)
      });
    });
    return candidates.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  }
  function buildDaySweepstakeSettlement(board,linked,roundPlayers,scoreRows){
    const cfg=sweepstakeConfigFromRows(scoreRows||[],board);
    const amountPence=parseInt(cfg&&cfg.amountPence)||200;
    const playable=(linked||[]).filter(r=>r&&r.id&&!isDayCompBoardRound(r));
    const playableIds=new Set(playable.map(r=>normaliseId(r.id)));
    const personMap={};
    const aliasMap={};
    (roundPlayers||[]).filter(rp=>playableIds.has(normaliseId(rp.round_id))).forEach(rp=>{
      const person=mapRoundPlayerForScorecard(rp,false);
      const key=normaliseId(person.id||person.user_id||person.guest_id||person.round_player_id);
      if(!key)return;
      personMap[key]=person;
      scoreAliasesForPerson(person).forEach(alias=>{aliasMap[normaliseId(alias)]=key;});
    });

    // Day Sweepstake entrants are separate from the full day leaderboard.
    // Prefer the central participant map saved on the Day Leaderboard board.
    // Fallback to older per-scorecard entry rows for boards created before v4.33.
    const entrantIds=new Set();
    let hasExplicitEntries=false;
    const linkedState=canonicalSweepstakeEntryStateFromRoundPlayers(linkedDaySweepstakeEntryStateFromRows(scoreRows||[],playable,{includeLocal:false}),roundPlayers||[]);
    const mergedState=linkedState||canonicalSweepstakeEntryStateFromRoundPlayers(mergedDaySweepstakeEntryStateFromRows(scoreRows||[],board,playable,{includeLocal:false}),roundPlayers||[]);
    const boardEntryIds=sweepstakeEntryIdsFromState(mergedState);
    if(boardEntryIds&&boardEntryIds.size){
      hasExplicitEntries=true;
      boardEntryIds.forEach(id=>entrantIds.add(normaliseId(id)));
    }

    const holePoints={};
    const holes={};
    const cleanScores=(scoreRows||[]).filter(row=>row&&playableIds.has(normaliseId(row.round_id))&&!isMetaScoreRow(row));
    cleanScores.forEach(row=>{
      const pidKey=aliasMap[normaliseId(row.player_id)]||normaliseId(row.player_id);
      if(!pidKey)return;
      if(hasExplicitEntries&&!entrantIds.has(pidKey))return;
      if(!personMap[pidKey])personMap[pidKey]={id:pidKey,name:String(row.player_id||'Player')};
      if(!holePoints[pidKey])holePoints[pidKey]={};
      if(!holes[pidKey])holes[pidKey]=new Set();
      const h=parseInt(row.hole_number);
      if(h>=1&&h<=18){
        holePoints[pidKey][h]=stablefordPointsValue(row.stableford_points);
        holes[pidKey].add(h);
      }
    });
    function sum(pid,start,end){
      let total=0;
      for(let h=start;h<=end;h++)total+=stablefordPointsValue((holePoints[pid]||{})[h]||0);
      return total;
    }
    const nameMap=contextualNameMapFromPlayers(Object.keys(holePoints).map(pid=>personMap[pid]||{id:pid,name:String(pid||'Player')}));
    const rows=Object.keys(holePoints).map(pid=>{
      const p=personMap[pid]||{id:pid,name:String(pid||'Player')};
      return {id:pid,player:p,name:nameFromContextMap(nameMap,pid,dayLeaguePlayerName(p)),paid:amountPence*3,winnings:0,net:-(amountPence*3),front:sum(pid,1,9),back:sum(pid,10,18),overall:sum(pid,1,18),holes:holes[pid]?holes[pid].size:0,potWins:[]};
    }).filter(r=>r.holes>0);
    const byId={};
    rows.forEach(r=>{byId[normaliseId(r.id)]=r;});
    function rangeScore(row,start,end){return sum(row.id,start,end);}
    const potDefs=[{key:'front',label:'Front 9',prop:'front',start:1,end:9},{key:'back',label:'Back 9',prop:'back',start:10,end:18},{key:'overall',label:'Overall',prop:'overall',start:1,end:18}];
    let rolloverPence=0;
    const pots=[];
    potDefs.forEach(pot=>{
      const active=rows.filter(r=>r.holes>0);
      const best=active.length?Math.max(...active.map(r=>parseInt(r[pot.prop])||0)):0;
      const tied=best>0?active.filter(r=>(parseInt(r[pot.prop])||0)===best):[];
      const potTotal=amountPence*rows.length;
      let winner=null,reason='',manualDecision=false,rollover=false,payoutAmountPence=potTotal+(pot.key==='overall'?rolloverPence:0);
      if(tied.length){
        const resolved=resolveSweepstakeCountback(tied,pot.key,rangeScore);
        winner=resolved.winner||null;
        reason=resolved.reason||'';
        if(resolved.unresolved&&(pot.key==='front'||pot.key==='back')){rollover=true;rolloverPence+=potTotal;payoutAmountPence=0;}
        else if(resolved.unresolved&&pot.key==='overall'){manualDecision=true;payoutAmountPence=0;winner=null;}
      }
      if(winner&&payoutAmountPence>0){
        const row=byId[normaliseId(winner.id)];
        if(row){row.winnings+=payoutAmountPence;row.potWins.push({label:pot.label,amount:payoutAmountPence,points:winner[pot.prop]||best,reason});}
      }
      pots.push({...pot,best,winner,reason,rollover,manualDecision,potTotal,payoutAmountPence,rolloverIn:pot.key==='overall'?rolloverPence:0});
    });
    rows.forEach(r=>{r.net=r.winnings-r.paid;});
    const creditors=rows.filter(r=>r.net>0).map(r=>({...r,remaining:r.net}));
    const debtors=rows.filter(r=>r.net<0).map(r=>({...r,remaining:-r.net}));
    const payments=[];
    let i=0,j=0;
    while(i<debtors.length&&j<creditors.length){
      const amount=Math.min(debtors[i].remaining,creditors[j].remaining);
      if(amount>0)payments.push({from:debtors[i].name,to:creditors[j].name,fromId:debtors[i].id,toId:creditors[j].id,fromPlayer:debtors[i].player,toPlayer:creditors[j].player,amount});
      debtors[i].remaining-=amount;
      creditors[j].remaining-=amount;
      if(debtors[i].remaining<=0)i++;
      if(creditors[j].remaining<=0)j++;
    }
    return {rows,payments,amountPence,pots,entrantCount:rows.length,hasExplicitEntries};
  }
  function buildDayFinishLeaderboardRows(linkedRounds,roundPlayers,scoreRows){
    const linkedIds=new Set((linkedRounds||[]).filter(r=>r&&r.id&&!isDayCompBoardRound(r)).map(r=>normaliseId(r.id)));
    const totals={};const holes={};const holePoints={};const seen=new Set();const aliasMap={};const nameMap={};
    function setAlias(alias,canonical){const a=normaliseId(alias);const c=normaliseId(canonical);if(a&&c)aliasMap[a]=c;}
    function canonicalId(pid){const key=normaliseId(pid);return aliasMap[key]||key;}
    (roundPlayers||[]).filter(rp=>linkedIds.has(normaliseId(rp&&rp.round_id))).forEach(raw=>{
      const rd=(linkedRounds||[]).find(r=>normaliseId(r&&r.id)===normaliseId(raw&&raw.round_id));
      const rp=mapRoundPlayerForScorecard(raw,isSnyderCupRound(rd));
      const canonical=normaliseId(rp.user_id||rp.guest_id||rp.cup_player_id||rp.id||raw.user_id||raw.guest_id||raw.id);
      [rp.id,rp.user_id,rp.guest_id,rp.cup_player_id,raw.id,raw.user_id,raw.guest_id].filter(Boolean).forEach(id=>setAlias(id,canonical));
      if(canonical){
        if(totals[canonical]==null)totals[canonical]=0;
        nameMap[canonical]=(rp.display_name&&rp.display_name!=='Player'?rp.display_name:null)||rp.name||nameMap[canonical]||getDisplayName(canonical);
      }
    });
    normaliseFoursomesScoreRows(scoreRows||[]).filter(sc=>linkedIds.has(normaliseId(sc.round_id))&&!isMetaScoreRow(sc)&&!isFoursomesTeamPlayerId(sc.player_id)).forEach(sc=>{
      addLeaderboardScore(totals,holes,holePoints,seen,canonicalId(sc.player_id),sc.hole_number,sc.stableford_points);
    });
    return Object.keys(totals).map(pid=>({id:pid,name:nameMap[pid]||getDisplayName(pid),total:totals[pid]||0,holes:holes[pid]?holes[pid].size:0,_holePoints:holePoints[pid]||{}})).sort(compareStablefordLeaderboardRows);
  }
  async function openFinishPreview(board){
    if(!board||!board.id||!sb)return;
    setFinishing(true);
    try{
      const key=dayCompKeyFromRound(board);
      const linked=key?await fetchDayCompRoundsFromCloud(key,(rounds||[]).filter(r=>dayCompKeyFromRound(r)===key)):[board].filter(Boolean);
      const boardRound=linked.find(isDayCompBoardRound)||board;
      const playable=linked.filter(r=>r&&r.id&&!isDayCompBoardRound(r));
      if(!playable.length){flash('No scorecards have joined this day sweepstake yet','error');return;}
      const ids=Array.from(new Set([boardRound&&boardRound.id,...playable.map(r=>r&&r.id)].filter(Boolean)));
      const [scoreRes,rpRes,leagueRes,snakeRes,linkResult]=await Promise.all([
        sb.from('cup_scores').select('*').in('round_id',ids),
        sb.from('cup_round_players').select('*').in('round_id',playable.map(r=>r.id)),
        sb.from('players').select('*').order('name',{ascending:true}),
        sb.from('snake_log').select('*').order('created_at',{ascending:false}),
        fetchLeaguePlayerLinks(sb)
      ]);
      if(scoreRes.error)throw scoreRes.error;
      if(rpRes.error)throw rpRes.error;
      if(leagueRes.error)throw leagueRes.error;
      if(snakeRes.error)throw snakeRes.error;
      const scoreRows=normaliseFoursomesScoreRows(scoreRes.data||[]);
      const roundPlayers=rpRes.data||[];
      const settlement=buildDaySweepstakeSettlement(boardRound,linked,roundPlayers,scoreRows);
      const leaderboardRows=buildDayFinishLeaderboardRows(linked,roundPlayers,scoreRows);
      const links=(linkResult&&linkResult.links)||{};
      const snakeCandidates=buildDaySnakeCandidates(boardRound,linked,roundPlayers,scoreRows,leagueRes.data||[],snakeRes.data||[],links);
      setFinishPreview({board:boardRound,linked,playable,scoreRows,roundPlayers,settlement,leaderboardRows,snakeCandidates});
    }catch(e){
      console.error('Day sweepstake preview failed',e);
      flash('Could not prepare finish summary: '+(e.message||String(e)),'error');
    }finally{
      setFinishing(false);
    }
  }
  async function settleDaySweepstakeLeagueBalances(board,linked){
    if(!board||!board.id||!sb)return {already:false,changes:[],skipped:[]};
    const key=dayCompKeyFromRound(board);
    const markerKey=`league-day-balance-${key||board.id}`;
    const markerNote=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.47`;
    const legacyMarkerNoteV446=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.46`;
    const legacyMarkerNoteV445=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.45`;
    const legacyMarkerNoteV444=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.44`;
    const legacyMarkerNoteV443=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.43`;
    const legacyMarkerNoteV442=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.42`;
    const legacyMarkerNoteV441=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.41`;
    const legacyMarkerNoteV440=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.40`;
    const legacyMarkerNoteV439=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.39`;
    const legacyMarkerNoteV438=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.38`;
    const legacyMarkerNoteV437=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.37`;
    const legacyMarkerNoteV436=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.36`;
    const legacyMarkerNoteV435=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.35`;
    const legacyMarkerNoteV434=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.34`;
    const legacyMarkerNoteV433=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.33`;
    const legacyMarkerNoteV432=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.32`;
    const legacyMarkerNoteV431=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.31`;
    const legacyMarkerNoteV430=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.30`;
    const legacyMarkerNoteV429=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.29`;
    const legacyMarkerNoteV428=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.28`;
    const legacyMarkerNoteV420=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.20`;
    const legacyMarkerNoteV419=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.19`;
    const legacyMarkerNoteV400=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.00`;
    const legacyMarkerNote=`Day sweepstake League balance settlement ${markerKey}`;
    const linkedRounds=key?await fetchDayCompRoundsFromCloud(key,linked||[]):(linked||[]);
    const playable=(linkedRounds||[]).filter(r=>r&&r.id&&!isDayCompBoardRound(r));
    if(!playable.length)return {already:false,changes:[],skipped:[]};
    const roundIds=playable.map(r=>r.id);
    const {data:logMarkers,error:logMarkerError}=await sb.from('payment_log').select('id').or(`note.eq.${markerNote},note.eq.${legacyMarkerNoteV446},note.eq.${legacyMarkerNoteV445},note.eq.${legacyMarkerNoteV444},note.eq.${legacyMarkerNoteV443},note.eq.${legacyMarkerNoteV442},note.eq.${legacyMarkerNoteV441},note.eq.${legacyMarkerNoteV440},note.eq.${legacyMarkerNoteV439},note.eq.${legacyMarkerNoteV438},note.eq.${legacyMarkerNoteV437},note.eq.${legacyMarkerNoteV436},note.eq.${legacyMarkerNoteV435},note.eq.${legacyMarkerNoteV434},note.eq.${legacyMarkerNoteV433},note.eq.${legacyMarkerNoteV432},note.eq.${legacyMarkerNoteV431},note.eq.${legacyMarkerNoteV430},note.eq.${legacyMarkerNoteV429},note.eq.${legacyMarkerNoteV428},note.eq.${legacyMarkerNoteV420},note.eq.${legacyMarkerNoteV419},note.eq.${legacyMarkerNoteV400},note.eq.${legacyMarkerNote}`).limit(1);
    if(logMarkerError)throw logMarkerError;
    if(logMarkers&&logMarkers.length)return {already:true,changes:[],skipped:[]};
    const [{data:roundPlayers,error:roundPlayersError},{data:scoreRows,error:scoreRowsError},{data:leaguePlayers,error:leaguePlayersError},linkResult]=await Promise.all([
      sb.from('cup_round_players').select('*').in('round_id',roundIds),
      sb.from('cup_scores').select('*').in('round_id',[board.id,...roundIds]),
      sb.from('players').select('*').order('name',{ascending:true}),
      fetchLeaguePlayerLinks(sb)
    ]);
    if(roundPlayersError)throw roundPlayersError;
    if(scoreRowsError)throw scoreRowsError;
    if(leaguePlayersError)throw leaguePlayersError;
    let finalScoreRows=scoreRows||[];
    const existingBoardState=canonicalSweepstakeEntryStateFromRoundPlayers(sweepstakeEntryStateFromRows(finalScoreRows,board),roundPlayers||[]);
    const linkedState=canonicalSweepstakeEntryStateFromRoundPlayers(linkedDaySweepstakeEntryStateFromRows(finalScoreRows,playable,{includeLocal:false}),roundPlayers||[]);
    const mergedState=linkedState||canonicalSweepstakeEntryStateFromRoundPlayers(mergedDaySweepstakeEntryStateFromRows(finalScoreRows,board,playable,{includeLocal:false}),roundPlayers||[]);
    if(mergedState&&(!existingBoardState||!sweepstakeEntryStatesEqual(existingBoardState,mergedState))){
      const all=Array.from(mergedState.keys());
      const included=all.filter(id=>mergedState.get(id));
      await saveSweepstakeEntryIdsToCloud(board.id,included,all);
      const refreshed=await sb.from('cup_scores').select('*').in('round_id',[board.id,...roundIds]);
      if(!refreshed.error)finalScoreRows=refreshed.data||finalScoreRows;
    }
    const settlement=buildDaySweepstakeSettlement(board,linkedRounds,roundPlayers||[],finalScoreRows);
    const links=(linkResult&&linkResult.links)||{};
    const skipped=[];
    const deltas={};
    const details={};
    (settlement.rows||[]).filter(row=>row&&Math.abs(parseInt(row.net)||0)>0).forEach(row=>{
      const scorecardPlayer={...(row.player||{}),name:row.name||dayLeaguePlayerName(row.player),display_name:row.name||dayLeaguePlayerName(row.player)};
      const leaguePlayer=daySweepstakeIsGuest(scorecardPlayer)?null:findDayLeaguePlayer(scorecardPlayer,leaguePlayers||[],links);
      if(!leaguePlayer){
        skipped.push(`${row.name||'Player'} ${row.net>0?'+':''}${moneyFromPence(row.net)}`);
        return;
      }
      const id=normaliseId(leaguePlayer.id);
      const pounds=(Math.round(row.net)||0)/100;
      deltas[id]=(deltas[id]||0)+pounds;
      if(!details[id])details[id]={player:leaguePlayer,lines:[]};
      details[id].lines.push(`${pounds>0?'credited':'debited'} GBP ${Math.abs(pounds).toFixed(2)} from Day Sweepstake`);
    });
    if(false)settlement.payments.forEach(pay=>{
      const fromLeague=daySweepstakeIsGuest(pay.fromPlayer)?null:findDayLeaguePlayer(pay.fromPlayer,leaguePlayers||[],links);
      const toLeague=daySweepstakeIsGuest(pay.toPlayer)?null:findDayLeaguePlayer(pay.toPlayer,leaguePlayers||[],links);
      if(!fromLeague||!toLeague){
        skipped.push(`${pay.from} -> ${pay.to} ${moneyFromPence(pay.amount)}`);
        return;
      }
      const pounds=(Math.round(pay.amount)||0)/100;
      const fromId=normaliseId(fromLeague.id);
      const toId=normaliseId(toLeague.id);
      deltas[fromId]=(deltas[fromId]||0)-pounds;
      deltas[toId]=(deltas[toId]||0)+pounds;
      if(!details[fromId])details[fromId]={player:fromLeague,lines:[]};
      if(!details[toId])details[toId]={player:toLeague,lines:[]};
      details[fromId].lines.push(`paid ${toLeague.name} £${pounds.toFixed(2)}`);
      details[toId].lines.push(`received from ${fromLeague.name} £${pounds.toFixed(2)}`);
    });
    const ids=Object.keys(deltas).filter(id=>Math.abs(deltas[id])>0.0001);
    if(ids.length){
      // Day sweepstake winnings are balance adjustments, not real money paid in.
      // Do not change payments.paid here: the League paid column must stay as actual payments only.
      const logRows=ids.map(id=>({
        player_id:id,
        player_name:(details[id]&&details[id].player&&details[id].player.name)||'Player',
        action:'Sweepstake balance',
        amount:Math.round(deltas[id]*100)/100,
        note:markerNote
      }));
      const {error:logError}=await sb.from('payment_log').insert(logRows);
      if(logError)throw logError;
    }
    const changes=ids.map(id=>({
      player:(details[id]&&details[id].player&&details[id].player.name)||'Player',
      delta:Math.round(deltas[id]*100)/100,
      lines:(details[id]&&details[id].lines)||[]
    })).sort((a,b)=>a.player.localeCompare(b.player));
    return {already:false,changes,skipped,rows:settlement.rows,payments:settlement.payments};
  }
  function daySweepstakeWinnerMessage(board,settlement){
    const name=dayCompDisplayName(rounds,board)||'Day Sweepstake';
    const rows=(settlement&&settlement.rows||[]).slice().filter(r=>r&&r.net>0).sort((a,b)=>b.net-a.net||String(a.name).localeCompare(String(b.name)));
    if(!rows.length)return `${name} finished. No sweepstake winner to pay out.`;
    const top=rows[0];
    const tied=rows.filter(r=>r.net===top.net);
    if(tied.length===1)return `${name}: ${gameFirstName(top.name)} wins ${moneyFromPence(top.net)}.`;
    const names=tied.slice(0,3).map(r=>gameFirstName(r.name)).join(', ')+(tied.length>3?` +${tied.length-3}`:'');
    return `${name}: ${names} win ${moneyFromPence(top.net)} each.`;
  }
  async function notifyDaySweepstakeFinished(board,settlement){
    try{
      if(!board||!board.id)return;
      const body=daySweepstakeWinnerMessage(board,settlement);
      await sendSnyderLiveNotification('day_sweepstake_finished',{
        roundId:board.id,
        status:'day-sweepstake-finished',
        title:'🏆 '+(dayCompDisplayName(rounds,board)||'Day Sweepstake')+' finished!',
        body,
        roundName:dayCompDisplayName(rounds,board)||'Day Sweepstake'
      });
    }catch(e){}
  }
  async function addDaySnakeToCurryPot(){
    const {data:potRows,error:potSelectError}=await sb.from('curry_pot').select('id,amount').limit(1);
    if(potSelectError)throw potSelectError;
    if(!potRows||!potRows[0])throw new Error('No curry pot row exists');
    const newAmt=(parseFloat(potRows[0].amount)||0)+10;
    const {error:potError}=await sb.from('curry_pot').update({amount:newAmt,updated_at:new Date().toISOString()}).eq('id',potRows[0].id);
    if(potError)throw potError;
    return newAmt;
  }
  async function addDayFinishedSnakes(preview){
    const selected=(preview&&preview.snakeCandidates||[]).filter(s=>s&&s.add&&s.leaguePlayer&&s.dateKey);
    const results=[];
    for(const snake of selected){
      const leagueId=normaliseId(snake.leaguePlayer&&snake.leaguePlayer.id);
      if(!leagueId)continue;
      const {data:existing,error:existingError}=await sb.from('snake_log')
        .select('*')
        .eq('player_id',leagueId)
        .eq('date',snake.dateKey)
        .limit(1);
      if(existingError)throw existingError;
      const row=(existing||[])[0];
      if(row&&row.confirmed===true){
        results.push({name:snake.leaguePlayer.name,action:'already'});
        continue;
      }
      if(row&&row.id){
        const {error:updateError}=await sb.from('snake_log').update({confirmed:true}).eq('id',row.id);
        if(updateError)throw updateError;
        await addDaySnakeToCurryPot();
        results.push({name:snake.leaguePlayer.name,action:'confirmed',curryPotAdded:true});
        continue;
      }
      const {error:insertError}=await sb.from('snake_log').insert({
        player_id:snake.leaguePlayer.id,
        player_name:snake.leaguePlayer.name,
        date:snake.dateKey,
        confirmed:true
      });
      if(insertError)throw insertError;
      await addDaySnakeToCurryPot();
      results.push({name:snake.leaguePlayer.name,action:'added',curryPotAdded:true});
    }
    return results;
  }
  async function closeBoard(board,preview=null){
    const key=dayCompKeyFromRound(board);
    const wasLive=isLiveRound(board);
    setFinishing(true);
    try{
      const linked=(preview&&preview.linked)|| (key?await fetchDayCompRoundsFromCloud(key,(rounds||[]).filter(r=>dayCompKeyFromRound(r)===key)):[board].filter(Boolean));
      const settlement=await settleDaySweepstakeLeagueBalances(board,linked);
      const snakeResults=preview?await addDayFinishedSnakes(preview):[];
      for(const r of linked){
        if(isLiveRound(r)){
          const {error:updateError}=await sb.from('cup_rounds').update({status:'complete'}).eq('id',r.id);
          if(updateError)throw updateError;
        }
      }
      if(wasLive)await notifyDaySweepstakeFinished(board,settlement);
      setFinishPreview(null);
      await load();
      try{if(window.snyderReloadSweepstakeBalanceAdjustments)window.snyderReloadSweepstakeBalanceAdjustments();}catch(e){}
      const snakeAdded=snakeResults.filter(r=>r.action==='added'||r.action==='confirmed').length;
      const snakeAlready=snakeResults.filter(r=>r.action==='already').length;
      const snakeText=snakeAdded?` + ${snakeAdded} snake${snakeAdded===1?'':'s'} added`:(snakeAlready?' + snake already logged':'');
      if(settlement.already)flash('Day sweepstake finished - League balances already updated'+snakeText);
      else if((settlement.changes||[]).length)flash('Day sweepstake finished - League balances updated'+snakeText);
      else if((settlement.skipped||[]).length)flash('Day sweepstake finished - guests/unlinked/manual payments shown');
      else flash('Day sweepstake finished'+snakeText);
    }catch(e){
      console.error('Day sweepstake finish failed',e);
      flash('Could not finish day sweepstake: '+(e.message||String(e)),'error');
    }finally{
      setFinishing(false);
    }
  }
  async function reverseDaySweepstakeLeagueBalances(board){
    if(!board||!board.id||!sb)return {reversed:false,count:0};
    const key=dayCompKeyFromRound(board);
    const markerKey=`league-day-balance-${key||board.id}`;
    const markerNote=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.47`;
    const legacyMarkerNoteV446=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.46`;
    const legacyMarkerNoteV445=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.45`;
    const legacyMarkerNoteV444=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.44`;
    const legacyMarkerNoteV443=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.43`;
    const legacyMarkerNoteV442=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.42`;
    const legacyMarkerNoteV441=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.41`;
    const legacyMarkerNoteV440=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.40`;
    const legacyMarkerNoteV439=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.39`;
    const legacyMarkerNoteV438=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.38`;
    const legacyMarkerNoteV437=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.37`;
    const legacyMarkerNoteV436=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.36`;
    const legacyMarkerNoteV435=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.35`;
    const legacyMarkerNoteV434=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.34`;
    const legacyMarkerNoteV433=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.33`;
    const legacyMarkerNoteV432=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.32`;
    const legacyMarkerNoteV431=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.31`;
    const legacyMarkerNoteV430=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.30`;
    const legacyMarkerNoteV429=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.29`;
    const legacyMarkerNoteV428=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.28`;
    const legacyMarkerNoteV420=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.20`;
    const legacyMarkerNoteV419=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.19`;
    const legacyMarkerNoteV400=`Day sweepstake League balance settlement ${markerKey} | adjustment-only | v4.00`;
    const legacyMarkerNote=`Day sweepstake League balance settlement ${markerKey}`;
    const reverseNote=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.47`;
    const legacyReverseNoteV446=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.46`;
    const legacyReverseNoteV445=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.45`;
    const legacyReverseNoteV444=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.44`;
    const legacyReverseNoteV443=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.43`;
    const legacyReverseNoteV442=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.42`;
    const legacyReverseNoteV441=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.41`;
    const legacyReverseNoteV440=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.40`;
    const legacyReverseNoteV439=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.39`;
    const legacyReverseNoteV438=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.38`;
    const legacyReverseNoteV437=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.37`;
    const legacyReverseNoteV436=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.36`;
    const legacyReverseNoteV435=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.35`;
    const legacyReverseNoteV434=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.34`;
    const legacyReverseNoteV433=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.33`;
    const legacyReverseNoteV432=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.32`;
    const legacyReverseNoteV431=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.31`;
    const legacyReverseNoteV430=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.30`;
    const legacyReverseNoteV429=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.29`;
    const legacyReverseNoteV428=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.28`;
    const legacyReverseNoteV420=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.20`;
    const legacyReverseNoteV419=`Day sweepstake League balance reversal ${markerKey} | adjustment-only | v4.19`;
    const legacyReverseNote=`Day sweepstake League balance reversal ${markerKey}`;
    const {data:existingReverse,error:reverseCheckError}=await sb.from('payment_log').select('id').or(`note.eq.${reverseNote},note.eq.${legacyReverseNoteV446},note.eq.${legacyReverseNoteV445},note.eq.${legacyReverseNoteV444},note.eq.${legacyReverseNoteV443},note.eq.${legacyReverseNoteV442},note.eq.${legacyReverseNoteV441},note.eq.${legacyReverseNoteV440},note.eq.${legacyReverseNoteV439},note.eq.${legacyReverseNoteV438},note.eq.${legacyReverseNoteV437},note.eq.${legacyReverseNoteV436},note.eq.${legacyReverseNoteV435},note.eq.${legacyReverseNoteV434},note.eq.${legacyReverseNoteV433},note.eq.${legacyReverseNoteV432},note.eq.${legacyReverseNoteV431},note.eq.${legacyReverseNoteV430},note.eq.${legacyReverseNoteV429},note.eq.${legacyReverseNoteV428},note.eq.${legacyReverseNoteV420},note.eq.${legacyReverseNoteV419},note.eq.${legacyReverseNote}`).limit(1);
    if(reverseCheckError)throw reverseCheckError;
    if(existingReverse&&existingReverse.length)return {reversed:false,already:true,count:0};
    const {data:logs,error:logError}=await sb.from('payment_log').select('*').or(`note.eq.${markerNote},note.eq.${legacyMarkerNoteV446},note.eq.${legacyMarkerNoteV445},note.eq.${legacyMarkerNoteV444},note.eq.${legacyMarkerNoteV443},note.eq.${legacyMarkerNoteV442},note.eq.${legacyMarkerNoteV441},note.eq.${legacyMarkerNoteV440},note.eq.${legacyMarkerNoteV439},note.eq.${legacyMarkerNoteV438},note.eq.${legacyMarkerNoteV437},note.eq.${legacyMarkerNoteV436},note.eq.${legacyMarkerNoteV435},note.eq.${legacyMarkerNoteV434},note.eq.${legacyMarkerNoteV433},note.eq.${legacyMarkerNoteV432},note.eq.${legacyMarkerNoteV431},note.eq.${legacyMarkerNoteV430},note.eq.${legacyMarkerNoteV429},note.eq.${legacyMarkerNoteV428},note.eq.${legacyMarkerNoteV420},note.eq.${legacyMarkerNoteV419},note.eq.${legacyMarkerNoteV400},note.eq.${legacyMarkerNote}`);
    if(logError)throw logError;
    const rows=(logs||[]).filter(r=>r&&r.player_id&&Math.abs(parseFloat(r.amount)||0)>0);
    if(!rows.length)return {reversed:false,count:0};
    const deltaById={};
    const nameById={};
    rows.forEach(row=>{
      const id=normaliseId(row.player_id);
      const amount=parseFloat(row.amount)||0;
      deltaById[id]=(deltaById[id]||0)-amount;
      nameById[id]=row.player_name||'Player';
    });
    const reversedIds=Object.keys(deltaById).filter(id=>Math.abs(deltaById[id]||0)>0.0001);
    if(reversedIds.length){
      const logRows=reversedIds.map(id=>({
        player_id:id,
        player_name:nameById[id]||'Player',
        action:'Sweepstake balance reversal',
        amount:Math.round(deltaById[id]*100)/100,
        note:reverseNote
      }));
      const {error:reverseLogError}=await sb.from('payment_log').insert(logRows);
      if(reverseLogError)throw reverseLogError;
    }
    return {reversed:true,count:reversedIds.length};
  }
  async function deleteBoard(board){
    if(!board||!board.id)return;
    const finished=!isLiveRound(board);
    let reversed=false;
    if(finished){
      const reverse=window.confirm('This day sweepstake has finished. Cancel the League balance winnings before deleting it? Press OK to reverse the winnings, or Cancel to delete the sweepstake only.');
      if(reverse){
        try{
          const result=await reverseDaySweepstakeLeagueBalances(board);
          reversed=!!(result&&result.reversed);
        }catch(e){
          flash('Could not reverse sweepstake balances: '+(e.message||String(e)),'error');
          return;
        }
      }
    }
    if(!window.confirm(finished?'Delete this finished day sweepstake from Scores? The actual scorecards will stay as normal rounds.':'Delete this empty day sweepstake? Scorecards already joined to it will stay as normal rounds.'))return;
    const scoreDelete=await sb.from('cup_scores').delete().eq('round_id',board.id);
    if(scoreDelete.error){flash(scoreDelete.error.message||'Could not delete sweepstake scores','error');return;}
    await sb.from('cup_groups').delete().eq('round_id',board.id);
    await sb.from('cup_round_players').delete().eq('round_id',board.id);
    const{error}=await sb.from('cup_rounds').delete().eq('id',board.id);
    if(error){flash(error.message||'Could not delete board','error');return;}
    await load();flash(reversed?'Day sweepstake deleted and League balances reversed':'Day sweepstake deleted');
  }
  return(
    <div>
      {finishPreview&&(
        <div style={{position:'fixed',inset:0,background:'linear-gradient(180deg,rgba(4,12,28,0.94),rgba(2,8,23,0.91))',zIndex:1400,padding:'max(20px,6vh) 14px 14px',overflowY:'auto'}}>
          <div style={{maxWidth:560,margin:'0 auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,marginBottom:12}}>
              <div>
                <div style={{fontSize:20,color:'#fff',fontWeight:950}}>{isLiveRound(finishPreview.board)?'Finish day?':'Check balances?'}</div>
                <div style={{fontSize:12,color:'#90ccf0',fontWeight:850,marginTop:2}}>{dayCompDisplayName(rounds,finishPreview.board)} · check before League balances update</div>
              </div>
              <button onClick={()=>!finishing&&setFinishPreview(null)} disabled={finishing} style={{...S.gho,padding:'7px 12px',fontSize:12,opacity:finishing?0.55:1}}>Cancel</button>
            </div>
            <div style={{...S.card,marginBottom:10,borderColor:'rgba(96,184,240,0.34)',background:'linear-gradient(180deg,rgba(14,60,105,0.32),rgba(13,37,72,0.84))'}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'baseline',marginBottom:8}}>
                <div style={{fontSize:16,color:'#fff',fontWeight:950}}>Leaderboard summary</div>
                <div style={{fontSize:11,color:'#90ccf0',fontWeight:900}}>{finishPreview.playable.length} scorecard{finishPreview.playable.length===1?'':'s'} · {finishPreview.leaderboardRows.length} player{finishPreview.leaderboardRows.length===1?'':'s'}</div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'30px minmax(0,1fr) 46px 42px',gap:8,padding:'7px 0',borderBottom:'1px solid rgba(96,184,240,0.18)',fontSize:10,color:'#90ccf0',fontWeight:950,letterSpacing:'0.05em'}}>
                <div>#</div><div>Player</div><div style={{textAlign:'right'}}>Total</div><div style={{textAlign:'right'}}>Holes</div>
              </div>
              {finishPreview.leaderboardRows.slice(0,8).map((r,idx)=>(
                <div key={r.id} style={{display:'grid',gridTemplateColumns:'30px minmax(0,1fr) 46px 42px',gap:8,alignItems:'center',padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,0.07)',background:idx===0?'linear-gradient(90deg,rgba(245,191,36,0.13),rgba(96,184,240,0.04))':'transparent',borderRadius:idx===0?9:0}}>
                  <div style={{fontSize:13,color:idx===0?'#fbbf24':'rgba(255,255,255,0.62)',fontWeight:950}}>{idx+1}</div>
                  <div style={{fontSize:13,color:'#fff',fontWeight:850,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</div>
                  <div style={{fontSize:16,color:'#60b8f0',fontWeight:950,textAlign:'right'}}>{r.total}</div>
                  <div style={{fontSize:12,color:'rgba(255,255,255,0.62)',fontWeight:800,textAlign:'right'}}>{r.holes}</div>
                </div>
              ))}
              {finishPreview.leaderboardRows.length>8&&<div style={{fontSize:11,color:'rgba(255,255,255,0.6)',fontWeight:800,paddingTop:8}}>+{finishPreview.leaderboardRows.length-8} more player{finishPreview.leaderboardRows.length-8===1?'':'s'} on the full leaderboard.</div>}
              {!finishPreview.leaderboardRows.length&&<div style={{padding:14,textAlign:'center',fontSize:12,color:'rgba(255,255,255,0.6)'}}>No scores found yet.</div>}
            </div>
            <div style={{...S.card,marginBottom:10,borderColor:'rgba(245,158,11,0.28)',background:'linear-gradient(180deg,rgba(75,50,12,0.38),rgba(8,24,48,0.94))'}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'baseline',marginBottom:8}}>
                <div style={{fontSize:16,color:'#fff',fontWeight:950}}>Sweepstake check</div>
                <div style={{fontSize:11,color:'#fbbf24',fontWeight:950}}>{finishPreview.settlement.entrantCount} entered · {moneyFromPence(finishPreview.settlement.amountPence)} each pot</div>
              </div>
              {(finishPreview.settlement.pots||[]).map(pot=>(
                <div key={pot.key} style={{display:'grid',gridTemplateColumns:'76px minmax(0,1fr) auto',gap:8,alignItems:'center',padding:'9px 10px',borderRadius:12,background:pot.winner?'rgba(245,158,11,0.10)':'rgba(255,255,255,0.055)',border:'1px solid '+(pot.winner?'rgba(245,158,11,0.22)':'rgba(255,255,255,0.08)'),marginBottom:7}}>
                  <div style={{fontSize:12,color:pot.winner?'#fbbf24':'#90ccf0',fontWeight:950}}>{pot.label}</div>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:13,color:pot.rollover?'#fbbf24':'#fff',fontWeight:950,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{pot.winner?`Winner: ${pot.winner.name}`:(pot.rollover?'Rolls into overall':(pot.manualDecision?'Manual decision needed':'No winner yet'))}</div>
                    {pot.reason&&<div style={{fontSize:10,color:'rgba(255,255,255,0.68)',fontWeight:800,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{pot.reason}</div>}
                  </div>
                  <div style={{fontSize:15,color:pot.winner&&pot.payoutAmountPence>0?'#86efac':'rgba(255,255,255,0.45)',fontWeight:950,textAlign:'right'}}>{pot.winner&&pot.payoutAmountPence>0?`+${moneyFromPence(Math.max(0,pot.payoutAmountPence-finishPreview.settlement.amountPence))}`:'-'}</div>
                </div>
              ))}
              <div style={{marginTop:10,padding:'10px 10px',borderRadius:14,background:'rgba(96,184,240,0.08)',border:'1px solid rgba(96,184,240,0.16)'}}>
                <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',marginBottom:6}}>
                  <div style={{fontSize:13,color:'#fff',fontWeight:950}}>League balance movements</div>
                  <div style={{fontSize:10,color:'rgba(255,255,255,0.58)',fontWeight:800,textAlign:'right'}}>Writes after confirm</div>
                </div>
                {finishPreview.settlement.rows.filter(r=>r.net!==0).slice().sort((a,b)=>b.net-a.net||String(a.name).localeCompare(String(b.name))).map(r=>(
                  <div key={r.id} style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',padding:'8px 0',borderTop:'1px solid rgba(255,255,255,0.08)'}}>
                    <div style={{fontSize:12,color:'#dbeafe',fontWeight:850,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</div>
                    <div style={{fontSize:15,color:r.net>0?'#86efac':'#f87171',fontWeight:950,whiteSpace:'nowrap'}}>{r.net>0?'+':''}{moneyFromPence(r.net)}</div>
                  </div>
                ))}
                {!finishPreview.settlement.rows.filter(r=>r.net!==0).length&&<div style={{padding:'8px 0',borderTop:'1px solid rgba(255,255,255,0.08)',fontSize:12,color:'rgba(255,255,255,0.62)'}}>No sweepstake balance changes.</div>}
                <div style={{fontSize:10,color:'rgba(255,255,255,0.54)',lineHeight:1.35,marginTop:7}}>Only opted-in players are settled. Opted-out players can appear on the leaderboard but not in these balances.</div>
              </div>
            </div>
            <div style={{...S.card,marginBottom:10,borderColor:'rgba(34,197,94,0.26)',background:'linear-gradient(180deg,rgba(21,96,66,0.24),rgba(8,24,48,0.94))'}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'baseline',marginBottom:8}}>
                <div style={{fontSize:16,color:'#fff',fontWeight:950}}>Snake check</div>
                <div style={{fontSize:11,color:'#86efac',fontWeight:950}}>Max one per player per day</div>
              </div>
              {(finishPreview.snakeCandidates||[]).length?(finishPreview.snakeCandidates||[]).map((snake,idx)=>(
                <label key={snake.id||idx} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',borderTop:'1px solid rgba(255,255,255,0.08)',cursor:snake.leaguePlayer&&!snake.alreadyConfirmed?'pointer':'default'}}>
                  <input type="checkbox" disabled={!snake.leaguePlayer||snake.alreadyConfirmed} checked={!!snake.add} onChange={e=>setFinishPreview(prev=>prev?{...prev,snakeCandidates:(prev.snakeCandidates||[]).map(s=>normaliseId(s.id)===normaliseId(snake.id)?{...s,add:e.target.checked}:s)}:prev)} style={{width:18,height:18,accentColor:'#22c55e',flexShrink:0}}/>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{fontSize:13,color:'#fff',fontWeight:900,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{snake.name}</div>
                    <div style={{fontSize:10,color:snake.alreadyConfirmed?'#fbbf24':snake.alreadyPending?'#86efac':snake.leaguePlayer?'#90ccf0':'#f87171',fontWeight:850,marginTop:2}}>
                      {snake.alreadyConfirmed?'Already logged for this day':snake.alreadyPending?'Pending snake will be confirmed':snake.leaguePlayer?'Add confirmed snake charge':'Not matched to League'}
                    </div>
                  </div>
                </label>
              )):<div style={{padding:'9px 0',borderTop:'1px solid rgba(255,255,255,0.08)',fontSize:12,color:'rgba(255,255,255,0.62)'}}>No snake marked on the linked scorecards.</div>}
              <div style={{fontSize:10,color:'rgba(255,255,255,0.54)',lineHeight:1.35,marginTop:7}}>Untick this if the day was not playing snake. If the player already has a snake for this date, the app will not create another one.</div>
            </div>
            <button onClick={()=>closeBoard(finishPreview.board,finishPreview)} disabled={finishing} style={{...S.pri,width:'100%',padding:13,opacity:finishing?0.58:1}}>{finishing?'Finishing...':(isLiveRound(finishPreview.board)?'Confirm Finish Day':'Confirm League Balances')}</button>
          </div>
        </div>
      )}
      <div style={{...S.card,marginBottom:16,borderColor:'rgba(96,184,240,0.25)',background:'rgba(96,184,240,0.08)'}}>
        <div style={{fontSize:17,color:'#fff',fontWeight:900,marginBottom:6}}>Create Day Sweepstake</div>
        <div style={{fontSize:12,color:'#90ccf0',lineHeight:1.4,marginBottom:12}}>Set this up before the first tee time. Players then join this fixed sweepstake from Start Round.</div>
        <label style={S.lbl}>Sweepstake Name</label>
        <input style={{...S.inp,marginBottom:10}} value={name} onChange={e=>setName(e.target.value)} placeholder="Saturday Sweepstake"/>
        <div style={{padding:'11px 12px',borderRadius:12,background:'rgba(245,158,11,0.12)',border:'1px solid rgba(245,158,11,0.32)',marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
            <div>
              <div style={{fontSize:13,color:'#fff',fontWeight:900}}>Front, back and overall</div>
              <div style={{fontSize:11,color:'#fbbf24',marginTop:2}}>Everyone who joins enters this sweepstake.</div>
            </div>
            <div style={{fontSize:11,color:'#fbbf24',fontWeight:950}}>ON</div>
          </div>
          <label style={{...S.lbl,marginTop:10}}>Amount per pot</label>
          <input type="number" min="0" step="0.5" value={sweepstake.amountPence===''?'':((parseInt(sweepstake.amountPence)||0)/100)} onChange={e=>{const raw=String(e.target.value||'').trim();setSweepstake(q=>({...q,enabled:true,amountPence:raw===''?'':Math.round((Math.max(0,parseFloat(raw)||0))*100),scope:'round'}));}} style={{...S.inp,marginBottom:0,padding:'9px 10px',fontSize:13}} placeholder="2"/>
          <div style={{fontSize:11,color:'rgba(255,255,255,0.72)',marginTop:7}}>Players can win this amount for front 9, back 9 and overall. Max loss: {moneyFromPence((parseInt(sweepstake.amountPence)||0)*3)}.</div>
          {false&&sweepstake.enabled&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:10}}>
            <select value={sweepstake.amountPence} onChange={e=>setSweepstake(q=>({...q,amountPence:parseInt(e.target.value)||200}))} style={{...S.inp,marginBottom:0,padding:'9px 10px',fontSize:13}}>
              <option value={100}>£1 each pot</option>
              <option value={200}>£2 each pot</option>
              <option value={500}>£5 each pot</option>
              <option value={1000}>£10 each pot</option>
            </select>
            <select value={sweepstake.scope||'round'} onChange={e=>setSweepstake(q=>({...q,scope:e.target.value==='group'?'group':'round'}))} style={{...S.inp,marginBottom:0,padding:'9px 10px',fontSize:13}}>
              <option value="round">Whole day board</option>
              <option value="group">Each group only</option>
            </select>
          </div>}
        </div>
        <button onClick={createBoard} disabled={saving} style={{...S.pri,width:'100%',padding:12,opacity:saving?0.6:1}}>{saving?'Creating...':'Create Day Sweepstake'}</button>
      </div>
      <div style={{fontSize:12,color:'#60b8f0',fontWeight:900,letterSpacing:'0.12em',marginBottom:8}}>DAY SWEEPSTAKES</div>
      {!boards.length&&<div style={{...S.card,fontSize:13,color:'#8ea0ad',textAlign:'center'}}>No day sweepstakes yet.</div>}
      {boards.map(board=>{
        const linked=(rounds||[]).filter(r=>dayCompKeyFromRound(r)===dayCompKeyFromRound(board));
        const scorecards=linked.filter(r=>!isDayCompBoardRound(r));
        const boardSweepstake=sweepstakeConfigFromRows(scores||[],board);
        return <div key={board.id} style={{...S.card,marginBottom:10}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10,marginBottom:8}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:15,color:'#fff',fontWeight:900,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{dayCompDisplayName(rounds,board)}</div>
              {boardSweepstake.enabled&&<div style={{fontSize:11,color:'#fbbf24',fontWeight:900,marginTop:4}}>Sweepstake on · {moneyFromPence((parseInt(boardSweepstake.amountPence)||200)*3)} max loss · {boardSweepstake.scope==='group'?'by group':'whole board'}</div>}
              <div style={{fontSize:11,color:'#90ccf0',marginTop:2}}>{scorecards.length} scorecard{scorecards.length===1?'':'s'} joined · {board.status}</div>
            </div>
            <div style={{fontSize:10,color:isLiveRound(board)?'#86efac':'#8ea0ad',fontWeight:900,letterSpacing:'0.09em'}}>{isLiveRound(board)?'OPEN':'CLOSED'}</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {isLiveRound(board)&&<button onClick={()=>openFinishPreview(board)} disabled={finishing} style={{...S.gho,padding:'8px 10px',fontSize:12,opacity:finishing?0.6:1}}>{finishing?'Checking...':'Day Finished'}</button>}
            {!isLiveRound(board)&&<button onClick={()=>openFinishPreview(board)} disabled={finishing} style={{...S.gho,padding:'8px 10px',fontSize:12,opacity:finishing?0.6:1}}>{finishing?'Checking...':'Check Balances'}</button>}
            {(!scorecards.length||!isLiveRound(board))&&<button onClick={()=>deleteBoard(board)} style={{...S.dan,padding:'8px 10px',fontSize:12}}>Delete</button>}
          </div>
        </div>;
      })}
    </div>
  );
}

// =========================================================
// Admin: rounds tab
// Round listing and administrative round controls
// =========================================================
function RoundsTab({rounds,groups,sb,flash,load}){
  const live=rounds.filter(isLiveRound);
  const others=rounds.filter(r=>!isLiveRound(r));

  async function endRound(rd){
    const{error}=await sb.from('cup_rounds').update({status:'complete'}).eq('id',rd.id);
    if(error){flash(error.message||'Could not end round','error');return;}
    await load();flash('Round ended');
  }
  async function deleteRound(rd){
    if(!window.confirm('Delete this round?'))return;
    await sb.from('cup_scores').delete().eq('round_id',rd.id);
    await sb.from('cup_groups').delete().eq('round_id',rd.id);
    await sb.from('cup_scores').delete().eq('round_id',rd.id);
    await sb.from('cup_round_players').delete().eq('round_id',rd.id);
    await sb.from('cup_rounds').delete().eq('id',rd.id);
    await load();flash('Deleted');
  }

  return(
    <div>
      {live.length>0&&(
        <div>
          <div style={{fontSize:12,color:'#ef4444',marginBottom:8,letterSpacing:'0.1em'}}>LIVE ROUNDS</div>
          {live.map(rd=>(
            <div key={rd.id} style={{...S.card,marginBottom:8,borderColor:'rgba(239,68,68,0.3)'}}>
              <div style={{fontSize:14,color:'#fff',marginBottom:6}}>{roundDisplayName(rd)}</div>
              <div style={{display:'flex',gap:6}}>
                <button onClick={()=>endRound(rd)} style={{...S.gho,flex:1,fontSize:12,padding:'6px'}}>End Round</button>
                <button onClick={()=>deleteRound(rd)} style={{...S.dan,flex:1,fontSize:12,padding:'6px'}}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{fontSize:12,color:'#60b8f0',marginBottom:8,marginTop:16,letterSpacing:'0.1em'}}>ALL ROUNDS ({rounds.length})</div>
      {others.slice(0,20).map(rd=>(
        <div key={rd.id} style={{...S.card,marginBottom:6}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:13,color:'#fff'}}>{roundDisplayName(rd)}</div>
              <div style={{fontSize:11,color:'#60b8f0'}}>{new Date(rd.created_at).toLocaleDateString()} - {rd.status}</div>
            </div>
            <button onClick={()=>deleteRound(rd)} style={{...S.dan,padding:'4px 10px',fontSize:12}}>Del</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// =========================================================
// Tournaments / competitions view
// Competition list and related navigation
// =========================================================
function OldTournamentsView({competitions,rounds,groups,scores,players,courses,sb,flash,setView,load,activeComp,selectedComp,setSelectedComp,currentUser,isAdmin}){
  const allComps=competitions||[];

  return(
    <div style={{minHeight:'100vh',paddingBottom:80}}>
      <div style={{background:'linear-gradient(135deg,#0a1528,#0d2040)',padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
        <button onClick={()=>setView('home')} style={{...S.gho,padding:'6px 12px',fontSize:13}}>Back</button>
        <div style={{fontSize:16,color:'#fff',fontWeight:700,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.1em'}}>CUP & TOURNAMENTS</div>
        <div style={{width:60}}/>
      </div>

      <div style={{padding:'20px 16px'}}>
        {/* Snyder Cup highlight */}
        <div style={{borderRadius:16,overflow:'hidden',marginBottom:20,background:'linear-gradient(135deg,#0a3d6b,#b8860b)',position:'relative',cursor:'pointer'}} onClick={()=>activeComp&&setSelectedComp(activeComp)}>
          <div style={{padding:'24px 20px'}}>
            <div style={{fontSize:11,color:'rgba(255,255,255,0.6)',letterSpacing:'0.2em',fontWeight:600,marginBottom:8}}>FLAGSHIP TOURNAMENT</div>
            <div style={{fontSize:28,color:'#fff',fontWeight:700,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.05em',marginBottom:4}}>SNYDER CUP 2025</div>
            <div style={{fontSize:13,color:'rgba(255,255,255,0.7)',marginBottom:16}}>Portugal - August 2025 - 3 Days</div>
            <div style={{display:'flex',gap:16}}>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:22,color:'#fbbf24',fontWeight:700}}>8</div>
                <div style={{fontSize:10,color:'rgba(255,255,255,0.5)',letterSpacing:'0.1em'}}>PLAYERS</div>
              </div>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:22,color:'#fbbf24',fontWeight:700}}>3</div>
                <div style={{fontSize:10,color:'rgba(255,255,255,0.5)',letterSpacing:'0.1em'}}>DAYS</div>
              </div>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:22,color:'#fbbf24',fontWeight:700}}>2</div>
                <div style={{fontSize:10,color:'rgba(255,255,255,0.5)',letterSpacing:'0.1em'}}>TEAMS</div>
              </div>
            </div>
          </div>
          {activeComp&&(
            <div style={{position:'absolute',top:16,right:16,background:'#ef4444',borderRadius:20,padding:'4px 10px',fontSize:10,color:'#fff',fontWeight:700,letterSpacing:'0.05em'}}>LIVE</div>
          )}
        </div>

        {/* All competitions */}
        <div style={{fontSize:12,color:'#60b8f0',letterSpacing:'0.15em',fontWeight:600,marginBottom:12}}>ALL COMPETITIONS</div>
        {allComps.length===0?(
          <div style={{...S.card,textAlign:'center',padding:32}}>
            <div style={{fontSize:14,color:'rgba(255,255,255,0.4)',marginBottom:8}}>No competitions set up yet</div>
            {isAdmin&&<button onClick={()=>setView('admin')} style={{...S.pri,fontSize:13}}>Set up in Admin</button>}
          </div>
        ):allComps.map(comp=>{
          const compRounds=rounds.filter(r=>r.competition_id===comp.id);
          const liveRound=compRounds.find(isLiveRound);
          return(
            <div key={comp.id} style={{borderRadius:14,marginBottom:10,cursor:'pointer',background:'linear-gradient(135deg,rgba(0,112,187,0.2) 0%,rgba(10,32,64,0.8) 100%)',border:'1px solid rgba(0,112,187,0.25)',padding:16,overflow:'hidden'}} onClick={()=>setSelectedComp(comp)}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:16,color:'#fff',fontWeight:600,marginBottom:3}}>{comp.name}</div>
                  <div style={{fontSize:12,color:'#60b8f0',marginBottom:6}}>{comp.venue||'Venue TBC'} - {comp.num_days} Days</div>
                  <div style={{display:'flex',gap:8}}>
                    <div style={{fontSize:11,color:'rgba(255,255,255,0.4)',background:'rgba(255,255,255,0.07)',borderRadius:6,padding:'2px 8px'}}>{comp.format||'Stableford'}</div>
                    <div style={{fontSize:11,color:'rgba(255,255,255,0.4)',background:'rgba(255,255,255,0.07)',borderRadius:6,padding:'2px 8px'}}>{compRounds.length} rounds</div>
                  </div>
                </div>
                {liveRound?(
                  <div style={{background:'#ef4444',borderRadius:20,padding:'4px 10px',fontSize:10,color:'#fff',fontWeight:700,letterSpacing:'0.05em',flexShrink:0}}>LIVE</div>
                ):(
                  <div style={{fontSize:20,color:'rgba(255,255,255,0.2)'}}>&gt;</div>
                )}
              </div>
            </div>
          );
        })}


      </div>
    </div>
  );
}



const CUP_TEAM_KEYS=['gold','navy'];
const CUP_THEME={gold:{name:'Team LIV',primary:'#D4AF37',accent:'#F5E6A3',bg:'rgba(212,175,55,0.11)'},navy:{name:'Team Boring',primary:'#2563EB',accent:'#93C5FD',bg:'rgba(59,130,246,0.12)'},red:{name:'The Stags',primary:'#DC2626',accent:'#FCA5A5',bg:'rgba(220,38,38,0.12)'}};
const CUP_SLOT_TEAMS=[{key:'gold',code:'A',slots:4,note:'Paolo, Jon, Milner and Novak'},{key:'navy',code:'B',slots:5,note:'Smithy, Ben, Coburn, Stokoe and Hullee'},{key:'red',code:'C',slots:3,note:'Slug, Kev and Leng'}];
const CUP_FIXED_MATCHUPS=[
  {day:1,doubles:[['A',1],['A',2],['B',1],['B',3]],singles:[[['A',1],['B',1]],[['A',2],['B',3]]]},
  {day:1,doubles:[['A',3],['A',4],['B',4],['B',5]],singles:[[['A',3],['B',4]],[['A',4],['B',5]]]},
  {day:2,doubles:[['A',1],['A',3],['B',1],['B',2]],singles:[[['A',1],['B',1]],[['A',3],['B',2]]]},
  {day:2,doubles:[['A',2],['A',4],['B',4],['B',5]],singles:[[['A',2],['B',4]],[['A',4],['B',5]]]},
  {day:3,doubles:[['A',1],['A',4],['B',1],['B',5]],singles:[[['A',1],['B',1]],[['A',4],['B',5]]]},
  {day:3,doubles:[['A',2],['A',3],['B',2],['B',3]],singles:[[['A',2],['B',2]],[['A',3],['B',3]]]}
];
const CUP_STAGS_ROTATION={1:'Ben joins The Stags group',2:'Coburn joins The Stags group',3:'Stokoe joins The Stags group'};
const CUP_STAGS_GROUPS=[
  {day:1,players:[['C',1],['C',2],['C',3],['B',2]]},
  {day:2,players:[['C',1],['C',2],['C',3],['B',3]]},
  {day:3,players:[['C',1],['C',2],['C',3],['B',4]]}
];
const CUP_SLOT_DEFAULT_NAMES={A:['Paolo','Jon','Milner','Novak'],B:['Smithy','Ben','Coburn','Stokoe','Hullee'],C:['Slug','Kev','Leng']};
function isCupTeamScoringMatch(match){return String(match&&match.match_type||'').toLowerCase()!=='stags';}
function cupDefaultSlotName(code,slot){return (CUP_SLOT_DEFAULT_NAMES[code]||[])[(parseInt(slot)||1)-1]||code+slot;}
function cupSlotTeamKey(code){return code==='A'?'gold':code==='B'?'navy':'red';}
function cupTeamStyle(teamKey,extra={}){const t=CUP_THEME[teamKey]||CUP_THEME.gold;return {border:'1px solid '+t.primary,background:t.bg,...extra};}
function CupTeamBadge({teamKey,label}){const t=CUP_THEME[teamKey]||CUP_THEME.gold;return <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:10,fontWeight:800,letterSpacing:'0.08em',color:t.accent,textTransform:'uppercase'}}><span style={{width:8,height:8,borderRadius:999,background:t.primary,boxShadow:'0 0 10px '+t.primary}}/> {label||t.name}</span>;}
const CUP_RANK_TONES=[
  {label:'🥇',bg:'linear-gradient(135deg,rgba(212,175,55,0.38),rgba(120,74,7,0.34))',border:'rgba(245,230,163,0.58)',color:'#F5E6A3',chip:'rgba(212,175,55,0.20)'},
  {label:'🥈',bg:'linear-gradient(135deg,rgba(203,213,225,0.30),rgba(71,85,105,0.26))',border:'rgba(226,232,240,0.46)',color:'#e2e8f0',chip:'rgba(203,213,225,0.16)'},
  {label:'🥉',bg:'linear-gradient(135deg,rgba(180,83,9,0.31),rgba(92,45,10,0.27))',border:'rgba(251,146,60,0.46)',color:'#fed7aa',chip:'rgba(251,146,60,0.15)'},
  {bg:'rgba(255,255,255,0.055)',border:'rgba(96,184,240,0.18)',color:'#90ccf0',chip:'rgba(0,0,0,0.16)'},
  {bg:'linear-gradient(135deg,rgba(239,68,68,0.13),rgba(127,29,29,0.18))',border:'rgba(252,165,165,0.28)',color:'#fecaca',chip:'rgba(239,68,68,0.09)'},
  {bg:'linear-gradient(135deg,rgba(185,28,28,0.30),rgba(69,10,10,0.34))',border:'rgba(248,113,113,0.52)',color:'#fecaca',chip:'rgba(185,28,28,0.18)'}
];
function cupRankTone(idx,total=12){
  const count=Math.max(1,parseInt(total)||12);
  const pos=Math.min(Math.max(parseInt(idx)||0,0),count-1);
  if(pos<=2)return CUP_RANK_TONES[pos]||CUP_RANK_TONES[3];
  if(count>4&&pos===count-2)return CUP_RANK_TONES[4];
  if(count>3&&pos===count-1)return CUP_RANK_TONES[5];
  return CUP_RANK_TONES[3];
}
function cupRankLabel(idx,total=12){
  const n=parseInt(idx)||0;
  const tone=cupRankTone(n,total);
  return tone.label||String(n+1);
}
function cupForfeitMark(idx,total,overall=false){
  const last=(parseInt(total)||0)-1;
  return last>=0&&(parseInt(idx)||0)===last?(overall?' 🎩👕✈️':' 🎩👕'):'';
}
function getCupTeams(cup,cupTeams){const rows=(cupTeams||[]).filter(t=>t.cup_id===cup.id);return {gold:rows.find(t=>t.team_key==='gold')||{name:cup.team_a_name||'Team LIV',team_key:'gold'},navy:rows.find(t=>t.team_key==='navy')||{name:cup.team_b_name||'Team Boring',team_key:'navy'},red:rows.find(t=>t.team_key==='red')||{name:cup.team_c_name||'The Stags',team_key:'red'}};}
function CupAdminTab({sb,flash,load,cupUsers,cupEvents,cupTeams,cupEventPlayers,cupDays,cupMatches,courses,rounds}){
  const[name,setName]=useState('Snyder Cup 2026');
  const[goldName,setGoldName]=useState('Team LIV');
  const[navyName,setNavyName]=useState('Team Boring');
  const[redName,setRedName]=useState('The Stags');
  const[selectedCupId,setSelectedCupId]=useState((cupEvents&&cupEvents[0]&&cupEvents[0].id)||'');
  const[matchDay,setMatchDay]=useState('1');
  const[matchType,setMatchType]=useState('doubles');
  const[sideATeam,setSideATeam]=useState('gold');
  const[sideBTeam,setSideBTeam]=useState('navy');
  const[goldPick,setGoldPick]=useState([]);
  const[navyPick,setNavyPick]=useState([]);
  const[cupSlotNameDrafts,setCupSlotNameDrafts]=useState({});
  const[cupEmptySlotDrafts,setCupEmptySlotDrafts]=useState({});
  const[courseFixDay,setCourseFixDay]=useState(null);
  const[courseFixDraft,setCourseFixDraft]=useState(null);
  const cup=(cupEvents||[]).find(c=>c.id===selectedCupId)||(cupEvents||[])[0];
  const teams=cup?getCupTeams(cup,cupTeams):null;
  const cupPlayers=(cup&&cupEventPlayers||[]).filter(p=>p.cup_id===cup.id);
  const goldPlayers=cupPlayers.filter(p=>p.team_key==='gold');
  const navyPlayers=cupPlayers.filter(p=>p.team_key==='navy');
  const redPlayers=cupPlayers.filter(p=>p.team_key==='red');
  const cupPlayersByTeam={gold:goldPlayers,navy:navyPlayers,red:redPlayers};
  const playerKey=p=>p?.id||p?.user_id;
  const sortCupSlotPlayers=rows=>[...(rows||[])].sort((a,b)=>{
    const ca=Date.parse(a.created_at||'')||0,cb=Date.parse(b.created_at||'')||0;
    return ca-cb||String(a.id||'').localeCompare(String(b.id||''));
  });
  const cupSlotRows=teamKey=>sortCupSlotPlayers(cupPlayersByTeam[teamKey]||[]).slice(0,parseInt((CUP_SLOT_TEAMS.find(t=>t.key===teamKey)||{}).slots)||4);
  const slotPlayer=(code,num)=>{
    const rows=cupSlotRows(cupSlotTeamKey(code));
    return rows[(parseInt(num)||1)-1]||null;
  };
  const slotPlayerId=slot=>{
    const p=slotPlayer(slot[0],slot[1]);
    return p?playerKey(p):null;
  };
  const days=(cupDays||[]).filter(d=>cup&&d.cup_id===cup.id).sort((a,b)=>(a.day_number||0)-(b.day_number||0));
  const matches=(cupMatches||[]).filter(m=>cup&&m.cup_id===cup.id).sort((a,b)=>(a.day_number||0)-(b.day_number||0)||String(a.match_type||'').localeCompare(String(b.match_type||'')));
  const cupDayNumbers=Array.from(new Set([1,2,3,...days.map(d=>parseInt(d.day_number)||1),...matches.map(m=>parseInt(m.day_number)||1)])).filter(Boolean).sort((a,b)=>a-b);
  const adminDays=cupDayNumbers.map(n=>days.find(d=>(parseInt(d.day_number)||1)===n)||{day_number:n,_synthetic:true});
  const matchesByDay=groupCupMatchesByDay(matches,adminDays).filter(group=>group.matches.length);
  const cupCourseOptions=(courses||[]).filter(c=>hasCourseHoles(c));
  const selectedCourseForDay=day=>resolveCupDayCourse(courses,days,cup&&cup.id,day);
  const accountName=u=>(u&&(u.display_name||u.name||u.username||u.email))||'Account';
  const accountHandicap=u=>{const n=parseFloat((u&&(u.handicap??u.current_handicap??u.handicap_index))??'');return Number.isFinite(n)?n:null;};
  const accountOptions=[...(cupUsers||[])].sort((a,b)=>accountName(a).localeCompare(accountName(b)));
  const accountForId=id=>accountOptions.find(u=>normaliseId(u.id)===normaliseId(id));
  const accountOptionsForPlayer=player=>accountOptions.filter(u=>!(cupPlayers||[]).some(p=>p.id!==(player&&player.id)&&normaliseId(p.user_id)===normaliseId(u.id)));
  async function createCup(){
    try{
      const{data,error}=await sb.from('snyder_cups').insert({name:name.trim()||'Snyder Cup',team_a_name:goldName.trim()||'Team LIV',team_b_name:navyName.trim()||'Team Boring',team_a_colour:'#D4AF37',team_b_colour:'#2563EB',status:'setup'}).select().single();
      if(error)throw error;
      await sb.from('snyder_cup_teams').insert([{cup_id:data.id,team_key:'gold',name:goldName.trim()||'Team LIV',colour:'#D4AF37'},{cup_id:data.id,team_key:'navy',name:navyName.trim()||'Team Boring',colour:'#2563EB'},{cup_id:data.id,team_key:'red',name:redName.trim()||'The Stags',colour:'#DC2626'}]);
      flash('Cup created');await load();setSelectedCupId(data.id);
    }catch(e){flash('Cup tables missing or save failed. Run the v66 SQL first. '+(e.message||''),'error');}
  }
  async function saveCupPlayer(p,patch,{reload=true}={}){
    const data={...patch};
    if(Object.prototype.hasOwnProperty.call(data,'handicap'))data.handicap=parseFloat(data.handicap||0)||0;
    if(Object.prototype.hasOwnProperty.call(data,'display_name')&&p.team_key==='red'&&p._stored_team_key==='navy')data.display_name=markCupTeamCDisplayName(data.display_name);
    const{error}=await sb.from('snyder_cup_players').update(data).eq('id',p.id);
    if(error){flash(error.message,'error');return false;}
    if(p.user_id&&Object.prototype.hasOwnProperty.call(data,'handicap'))await sb.from('cup_users').update({handicap:data.handicap}).eq('id',p.user_id);
    if(reload)await load();
    return true;
  }
  async function ensureCupTeamRow(teamKey){
    if(!cup||!teamKey)return true;
    if((cupTeams||[]).some(t=>t.cup_id===cup.id&&t.team_key===teamKey))return true;
    const theme=CUP_THEME[teamKey]||CUP_THEME.gold;
    const teamName=(teams&&teams[teamKey]&&teams[teamKey].name)||theme.name;
    const{error}=await sb.from('snyder_cup_teams').insert({cup_id:cup.id,team_key:teamKey,name:teamName,colour:theme.primary});
    if(error&&String(error.message||'').toLowerCase().includes('duplicate'))return true;
    if(teamKey==='red'&&isCupTeamKeyConstraintError(error))return true;
    if(error){flash('Could not create '+teamName+' team row: '+error.message,'error');return false;}
    return true;
  }
  async function insertCupPlayer(teamKey,displayName,hcp,userId=null){
    if(!cup)return {error:{message:'No Cup selected'}};
    const ok=await ensureCupTeamRow(teamKey);
    if(!ok)return {error:{message:'Team setup failed'}};
    const result=await sb.from('snyder_cup_players').insert({cup_id:cup.id,user_id:userId||null,team_key:teamKey,display_name:displayName,handicap:hcp});
    if(teamKey==='red'&&isCupTeamKeyConstraintError(result.error)){
      return sb.from('snyder_cup_players').insert({cup_id:cup.id,user_id:userId||null,team_key:'navy',display_name:markCupTeamCDisplayName(displayName),handicap:hcp});
    }
    return result;
  }
  function cupSlotDraftKey(player){return String(player&&player.id||'');}
  function cupSlotDraftValue(player){
    const key=cupSlotDraftKey(player);
    return Object.prototype.hasOwnProperty.call(cupSlotNameDrafts,key)?cupSlotNameDrafts[key]:(player&&player.display_name)||'';
  }
  function updateCupSlotNameDraft(player,value){
    const key=cupSlotDraftKey(player);
    setCupSlotNameDrafts(prev=>({...prev,[key]:value}));
  }
  async function saveCupSlotName(player){
    const draft=cupSlotDraftValue(player);
    if(String(draft||'')===String((player&&player.display_name)||''))return;
    await saveCupPlayer(player,{display_name:draft},{reload:false});
  }
  async function assignCupPlayerAccount(player,userId){
    const user=accountForId(userId);
    const patch={user_id:user?user.id:null};
    if(user){
      patch.display_name=accountName(user);
      patch.handicap=accountHandicap(user)??18;
    }
    const ok=await saveCupPlayer(player,patch,{reload:true});
    if(ok)flash(user?'Account assigned':'Account cleared');
  }
  function emptySlotDraftKey(teamKey,slotLabel){return teamKey+'-'+slotLabel;}
  function emptySlotDraft(teamKey,slotLabel){
    const key=emptySlotDraftKey(teamKey,slotLabel);
    return cupEmptySlotDrafts[key]||{name:'',handicap:'18',userId:''};
  }
  function updateEmptySlotDraft(teamKey,slotLabel,patch){
    const key=emptySlotDraftKey(teamKey,slotLabel);
    setCupEmptySlotDrafts(prev=>({...prev,[key]:{...(prev[key]||{name:'',handicap:'18',userId:''}),...patch}}));
  }
  function clearEmptySlotDraft(teamKey,slotLabel){
    const key=emptySlotDraftKey(teamKey,slotLabel);
    setCupEmptySlotDrafts(prev=>{const next={...prev};delete next[key];return next;});
  }
  function renderCupSlotPlayerEditor(player){
    const nameDraft=cupSlotDraftValue(player);
    return <>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:6}}>
        <input style={{...S.inp,fontSize:13,padding:'8px 9px',flex:1}} value={nameDraft} onChange={e=>updateCupSlotNameDraft(player,e.target.value)} onBlur={()=>saveCupSlotName(player)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} placeholder="Player name"/>
        <button onClick={()=>removeCupPlayer(player)} style={{...S.dan,padding:'7px 9px',fontSize:11}}>Remove</button>
      </div>
      <select value={player.user_id||''} onChange={e=>assignCupPlayerAccount(player,e.target.value)} style={{...S.inp,fontSize:12,padding:'7px 8px',marginBottom:7}}>
        <option value="">No linked account</option>
        {accountOptionsForPlayer(player).map(u=><option key={'cup-account-'+u.id} value={u.id}>{accountName(u)}</option>)}
      </select>
      <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:8,alignItems:'center'}}><label style={{fontSize:11,color:'#9fb6c9'}}>EG Handicap</label><HandicapPicker value={player.handicap??0} onChange={v=>saveCupPlayer(player,{handicap:v},{reload:false})} style={{width:76,fontSize:13,padding:'7px 8px'}} label={(nameDraft||'Player')+' EG handicap'} step={0.1} min={0} max={54} defaultValue={parseFloat(player.handicap)||18}/></div>
    </>;
  }
  function renderCupEmptySlotEditor(teamKey,slotLabel){
    const draft=emptySlotDraft(teamKey,slotLabel);
    async function addManual(){
      if(!cup)return;
      const displayName=(draft.name||'').trim();
      if(!displayName){flash('Add a name for '+slotLabel,'error');return;}
      const parsedHcp=parseFloat(draft.handicap);
      const hcp=Number.isFinite(parsedHcp)?parsedHcp:18;
      const user=accountForId(draft.userId);
      const{error}=await insertCupPlayer(teamKey,displayName,hcp,user&&user.id);
      if(error){flash(error.message,'error');return;}
      clearEmptySlotDraft(teamKey,slotLabel);
      flash(slotLabel+' assigned');await load();
    }
    function chooseAccount(userId){
      const user=accountForId(userId);
      updateEmptySlotDraft(teamKey,slotLabel,user?{userId,name:accountName(user),handicap:String(accountHandicap(user)??18)}:{userId:'',name:draft.name,handicap:draft.handicap});
    }
    return <div style={{display:'grid',gap:7}}>
      <input style={{...S.inp,fontSize:13,padding:'8px 9px'}} value={draft.name} onChange={e=>updateEmptySlotDraft(teamKey,slotLabel,{name:e.target.value})} placeholder={slotLabel+' player name'}/>
      <select value={draft.userId||''} onChange={e=>chooseAccount(e.target.value)} style={{...S.inp,fontSize:12,padding:'7px 8px'}}>
        <option value="">No linked account</option>
        {accountOptionsForPlayer(null).map(u=><option key={'empty-cup-account-'+slotLabel+'-'+u.id} value={u.id}>{accountName(u)}</option>)}
      </select>
      <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:7}}><HandicapPicker value={draft.handicap} onChange={hcp=>updateEmptySlotDraft(teamKey,slotLabel,{handicap:hcp})} style={{fontSize:12}} label={slotLabel+' EG handicap'} step={0.1} min={0} max={54} defaultValue={18}/><button type="button" onClick={addManual} style={{...S.pri,padding:'8px 12px',fontSize:12}}>Assign</button></div>
    </div>;
  }
  async function ensureFixedCupSlots({reload=true}={}){
    if(!cup)return false;
    for(const t of CUP_SLOT_TEAMS){
      const ok=await ensureCupTeamRow(t.key);
      if(!ok)return false;
      const rows=cupSlotRows(t.key);
      const slotCount=parseInt(t.slots)||4;
      for(let i=rows.length+1;i<=slotCount;i++){
        const{error}=await insertCupPlayer(t.key,cupDefaultSlotName(t.code,i),0);
        if(error){flash(error.message,'error');return false;}
      }
    }
    if(reload)await load();
    return true;
  }
  function fixedScheduleRows(sourcePlayers=cupPlayers){
      const rowsByTeam=CUP_SLOT_TEAMS.reduce((acc,t)=>({...acc,[t.key]:sortCupSlotPlayers((sourcePlayers||[]).filter(p=>p.team_key===t.key)).slice(0,parseInt(t.slots)||4)}),{});
    const idFor=slot=>{
      const p=(rowsByTeam[cupSlotTeamKey(slot[0])]||[])[(parseInt(slot[1])||1)-1];
      return p?playerKey(p):null;
    };
    const rows=[];
    CUP_FIXED_MATCHUPS.forEach(group=>{
      const d=group.doubles;
      const left=d.slice(0,2).map(idFor).filter(Boolean);
      const right=d.slice(2,4).map(idFor).filter(Boolean);
      rows.push({cup_id:cup.id,day_number:group.day,match_type:'doubles',gold_player_ids:left,navy_player_ids:right,status:'locked'});
      group.singles.forEach(pair=>{
        const a=idFor(pair[0]);
        const b=idFor(pair[1]);
        rows.push({cup_id:cup.id,day_number:group.day,match_type:'singles',gold_player_ids:a?[a]:[],navy_player_ids:b?[b]:[],status:'locked'});
      });
    });
    CUP_STAGS_GROUPS.forEach(group=>{
      const ids=group.players.map(idFor).filter(Boolean);
      if(ids.length)rows.push({cup_id:cup.id,day_number:group.day,match_type:'stags',gold_player_ids:ids,navy_player_ids:[],status:'locked'});
    });
    return rows;
  }
  async function buildFixedCupSchedule(){
    if(!cup)return;
    const cupTitleLocal=cup.name||'Snyder Cup 2026';
    const cupRoundExists=(rounds||[]).some(rd=>{
      const nm=String(rd&&rd.name||'');
      return nm.startsWith(cupTitleLocal+' Day ')||nm.startsWith('Synder Cup Day ')||nm.startsWith('Snyder Cup 2026 Day ')||nm.startsWith('Synder Cup 2026 Day ');
    });
    if(cupRoundExists&&!confirm('Cup scorecards already exist. Rebuilding matchups can disconnect old scorecards from the schedule. Continue?'))return;
    const ok=await ensureFixedCupSlots({reload:false});
    if(!ok)return;
    const{data:freshPlayerRows,error:playerLoadError}=await sb.from('snyder_cup_players').select('*').eq('cup_id',cup.id);
    if(playerLoadError){flash(playerLoadError.message,'error');return;}
    const freshPlayers=normaliseCupPlayerRows(freshPlayerRows||[]);
    for(const dayNum of [1,2,3]){
      if(!days.some(d=>(parseInt(d.day_number)||1)===dayNum))await sb.from('snyder_cup_days').insert({cup_id:cup.id,day_number:dayNum});
    }
    await sb.from('snyder_cup_matches').delete().eq('cup_id',cup.id);
    const{error}=await sb.from('snyder_cup_matches').insert(fixedScheduleRows(freshPlayers||cupPlayers));
    if(error){flash(error.message,'error');return;}
    flash('Team LIV v Team Boring matchups built');
    await load();
  }
  async function removeCupPlayer(p){
    const id=playerKey(p);
    const used=matches.some(m=>(m.gold_player_ids||[]).includes(id)||(m.navy_player_ids||[]).includes(id)||(m.gold_player_ids||[]).includes(p.user_id)||(m.navy_player_ids||[]).includes(p.user_id));
    if(used&&!confirm('Remove this player from the team? They are also in matches, so remove them from matches first if needed.'))return;
    await sb.from('snyder_cup_players').delete().eq('id',p.id);flash('Player removed');await load();
  }
  function dayMatches(day){return matches.filter(m=>(parseInt(m.day_number)||1)===(parseInt(day)||1));}
  function isDayReleased(day){const rows=dayMatches(day);return rows.length>0&&rows.some(m=>String(m.status||'locked').toLowerCase()==='live'||String(m.status||'').toLowerCase()==='released');}
  async function recalcCupDayRoundsForCourse(dayNum,course){
    if(!cup||!course)return;
    const cupTitleLocal=cup.name||'Snyder Cup 2026';
    const courseName=cleanCourseName(course.name)||course.name||'';
    const tee=course.tee||courseTeeFromName(course.name)||'White';
    for(let idx=1;idx<=6;idx++){
      const rd=(rounds||[]).find(r=>r.name===((cupTitleLocal)+' Day '+dayNum+' Group '+idx)||r.name==='Synder Cup Day '+dayNum+' Group '+idx);
      if(!rd)continue;
      await sb.from('cup_rounds').update({course_id:safeCourseIdForDb(course,course.id),course_name:courseName,tee}).eq('id',rd.id);
      const {data:rps}=await sb.from('cup_round_players').select('*').eq('round_id',rd.id);
      const nextHcps={};
      for(const rp of (rps||[])){
        const cp=(cupPlayers||[]).find(p=>String(cupDisplayName(p)).trim().toLowerCase()===String(rp.display_name||'').trim().toLowerCase());
        const shots=cp?cupPlayerPlayingShotsForCourse(cp,course,dayNum):(parseInt(rp.playing_handicap)||0);
        nextHcps[(cp&&cupStablePlayerId(cp))||rp.id]=shots;
        await sb.from('cup_round_players').update({playing_handicap:shots}).eq('id',rp.id);
      }
      const {data:grps}=await sb.from('cup_groups').select('*').eq('round_id',rd.id);
      for(const g of (grps||[]))await sb.from('cup_groups').update({playing_handicaps:nextHcps}).eq('id',g.id);
    }
  }
  async function setCupDayCourse(day,courseId){
    if(!cup)return;
    const dayNum=parseInt(day)||1;
    const course=(courses||[]).find(c=>String(c.id)===String(courseId));
    if(!course){flash('Choose a course first','error');return;}
    const chosenTee=course.tee||courseTeeFromName(course.name)||'White';
    saveLocalCupDayCourse(cup.id,dayNum,course);
    const payload={course_id:safeCourseIdForDb(course,course.id),course_name:cleanCourseName(course.name)||course.name||'',tee:chosenTee};
    const existing=days.find(d=>(parseInt(d.day_number)||1)===dayNum);
    let result;
    if(existing&&existing.id){result=await sb.from('snyder_cup_days').update(payload).eq('id',existing.id);}
    else{result=await sb.from('snyder_cup_days').insert({cup_id:cup.id,day_number:dayNum,...payload});}
    if(result&&result.error){
      const basic=existing&&existing.id?null:await sb.from('snyder_cup_days').insert({cup_id:cup.id,day_number:dayNum});
      if(basic&&basic.error)console.warn('Cup day row save failed',basic.error);
      flash('Course remembered on this device. Add course fields to snyder_cup_days later for shared setup.');
    }else{
      await recalcCupDayRoundsForCourse(dayNum,course);
      flash('Day '+dayNum+' course, tee and shots updated');
    }
    await load();
  }
  function openCourseFix(day){
    const dayNum=parseInt(day)||1;
    const course=selectedCourseForDay(dayNum);
    if(!course){flash('Choose a course for Day '+dayNum+' first','error');return;}
    const holes=(course.holes&&course.holes.length?course.holes:Array.from({length:18},(_,i)=>({hole:i+1,par:4,stroke_index:i+1,yards:0}))).map((h,i)=>({hole:parseInt(h.hole)||i+1,par:parseInt(h.par)||4,stroke_index:parseInt(h.stroke_index)||i+1,yards:parseInt(h.yards)||0}));
    setCourseFixDay(dayNum);
    setCourseFixDraft({id:course.id,name:(cleanCourseName(course.name)||course.name||'Cup Day '+dayNum+' Course')+' - Cup Day '+dayNum+' Custom',tee:course.tee||courseTeeFromName(course.name)||'White',course_rating:course.course_rating||'',slope_rating:course.slope_rating||'',holes});
  }
  function updateCourseFixHole(idx,patch){
    setCourseFixDraft(d=>({...d,holes:(d.holes||[]).map((h,i)=>i===idx?{...h,...patch}:h)}));
  }
  async function saveCourseFix(){
    if(!cup||!courseFixDay||!courseFixDraft)return;
    const dayNum=parseInt(courseFixDay)||1;
    const holes=(courseFixDraft.holes||[]).map((h,i)=>({hole:i+1,par:parseInt(h.par)||4,stroke_index:parseInt(h.stroke_index)||i+1,yards:parseInt(h.yards)||0}));
    const coursePayload={name:courseFixDraft.name||('Cup Day '+dayNum+' Custom Course'),location:'Cup setup',tee:courseFixDraft.tee||'White',course_rating:parseFloat(courseFixDraft.course_rating)||null,slope_rating:parseInt(courseFixDraft.slope_rating)||113,holes};
    let savedCourse=null;
    const selected=selectedCourseForDay(dayNum);
    if(selected&&isRealDbId(selected.id)){
      const upd=await sb.from('cup_courses').update(coursePayload).eq('id',selected.id).select().single();
      if(upd.error){flash(upd.error.message,'error');return;}
      savedCourse=upd.data;
    }else{
      const ins=await sb.from('cup_courses').insert(coursePayload).select().single();
      if(ins.error){flash(ins.error.message,'error');return;}
      savedCourse=ins.data;
    }
    saveLocalCupDayCourse(cup.id,dayNum,savedCourse);
    const dayPayload={course_id:savedCourse.id,course_name:cleanCourseName(savedCourse.name)||savedCourse.name||'',tee:savedCourse.tee||courseTeeFromName(savedCourse.name)||'White'};
    const existing=days.find(d=>(parseInt(d.day_number)||1)===dayNum);
    if(existing&&existing.id)await sb.from('snyder_cup_days').update(dayPayload).eq('id',existing.id);
    else await sb.from('snyder_cup_days').insert({cup_id:cup.id,day_number:dayNum,...dayPayload});
    await recalcCupDayRoundsForCourse(dayNum,savedCourse);
    flash('Day '+dayNum+' course, stroke indexes and playing shots updated');
    setCourseFixDay(null);setCourseFixDraft(null);await load();
  }

  async function setDayReleased(day,released){
    if(!cup)return;
    const dayNum=parseInt(day)||1;
    const rows=dayMatches(dayNum);
    if(rows.length===0){flash('Add matches to Day '+dayNum+' before going live','error');return;}
    const course=selectedCourseForDay(dayNum);
    if(!course){flash('Choose the course for Day '+dayNum+' before going live','error');return;}
    saveLocalCupDayCourse(cup.id,dayNum,course);
    const{error}=await sb.from('snyder_cup_matches').update({status:released?'live':'locked'}).eq('cup_id',cup.id).eq('day_number',dayNum);
    if(error){flash(error.message,'error');return;}
    flash(released?'Day '+dayNum+' is now live for scoring':'Day '+dayNum+' locked');
    await load();
  }
  async function addDay(){if(!cup)return;const n=(days[days.length-1]?.day_number||0)+1;const{error}=await sb.from('snyder_cup_days').insert({cup_id:cup.id,day_number:n});if(error)flash(error.message,'error');else{flash('Day added');await load();}}
  async function deleteDay(d){
    if(!cup||!d)return;
    if(!confirm('Delete Day '+d.day_number+' and all matches on that day?'))return;
    await sb.from('snyder_cup_matches').delete().eq('cup_id',cup.id).eq('day_number',d.day_number);
    if(d.id){
      const{error}=await sb.from('snyder_cup_days').delete().eq('id',d.id);
      if(error){flash(error.message,'error');return;}
    }
    flash('Day deleted');await load();
  }
  function togglePick(setter,arr,id,limit){setter(arr.includes(id)?arr.filter(x=>x!==id):(arr.length<limit?[...arr,id]:arr));}
  async function addMatch(){
    if(!cup)return;
    const limit=matchType==='doubles'?2:1;
    const dayNum=parseInt(matchDay)||1;
    if(sideATeam===sideBTeam){flash('Pick two different teams for the match','error');return;}
    if(goldPick.length!==limit||navyPick.length!==limit){flash(matchType==='doubles'?'Pick 2 from each team':'Pick 1 from each team','error');return;}
    if(!days.some(d=>(parseInt(d.day_number)||1)===dayNum)){
      await sb.from('snyder_cup_days').insert({cup_id:cup.id,day_number:dayNum});
    }
    const{error}=await sb.from('snyder_cup_matches').insert({cup_id:cup.id,day_number:dayNum,match_type:matchType,gold_player_ids:goldPick,navy_player_ids:navyPick,status:'locked'});
    if(error){flash(error.message,'error');return;}
    setGoldPick([]);setNavyPick([]);flash('Match added');await load();
  }
  async function removeFromMatch(match,teamKey,id){
    const col=teamKey==='gold'?'gold_player_ids':'navy_player_ids';
    const next=(match[col]||[]).filter(x=>x!==id);
    const{error}=await sb.from('snyder_cup_matches').update({[col]:next}).eq('id',match.id);
    if(error)flash(error.message,'error');else{flash('Player removed from match');await load();}
  }
  async function deleteMatch(match){
    if(!confirm('Delete this match?'))return;
    const{error}=await sb.from('snyder_cup_matches').delete().eq('id',match.id);
    if(error)flash(error.message,'error');else{flash('Match deleted');await load();}
  }
  async function resetCompetition(){
    if(!cup)return;
    if(!confirm('Reset Snyder Cup setup and scorecards? This clears days, matches and all Cup scorecards, but keeps teams and squad players.'))return;
    if(!confirm('Are you sure? This cannot be undone.'))return;
    const cupTitleLocal=cup.name||'Snyder Cup 2026';
    const isCupRound=rd=>{
      const name=String(rd&&rd.name||'');
      return name.startsWith(cupTitleLocal+' Day ')||name.startsWith('Snyder Cup 2026 Day ')||name.startsWith('Synder Cup 2026 Day ')||name.startsWith('Synder Cup Day ');
    };
    const{data:cupRounds,error:roundLoadErr}=await sb.from('cup_rounds').select('id,name');
    if(roundLoadErr){flash(roundLoadErr.message,'error');return;}
    const resetRounds=(cupRounds||[]).filter(isCupRound);
    for(const rd of resetRounds){
      await sb.from('cup_scores').delete().eq('round_id',rd.id);
      await sb.from('cup_groups').delete().eq('round_id',rd.id);
      await sb.from('cup_round_players').delete().eq('round_id',rd.id);
      await sb.from('cup_rounds').delete().eq('id',rd.id);
      try{localStorage.removeItem('scores_'+rd.id);localStorage.removeItem('pending_scores_'+rd.id);}catch(e){}
    }
    await sb.from('snyder_cup_matches').delete().eq('cup_id',cup.id);
    await sb.from('snyder_cup_days').delete().eq('cup_id',cup.id);
    try{
      for(let d=1;d<=10;d++)localStorage.removeItem(cupDayCourseStorageKey(cup.id,d));
      sessionStorage.removeItem('cupReturnDay');
    }catch(e){}
    await load();
    flash('Snyder Cup reset. Teams and squad players kept.');
  }
  function renderTeamAdminCard(teamKey,team,rows){
    const slotMeta=CUP_SLOT_TEAMS.find(t=>t.key===teamKey)||{code:'?',slots:4};
    const slotCount=parseInt(slotMeta.slots)||4;
    const slotRows=cupSlotRows(teamKey);
    return <div style={{...S.card,...cupTeamStyle(teamKey),padding:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginBottom:8}}><CupTeamBadge teamKey={teamKey} label={team.name}/><div style={{fontSize:20,color:'#fff',fontWeight:900}}>{slotRows.length}/{slotCount}</div></div>
      <div style={{fontSize:11,color:'#9fb6c9',marginBottom:8}}>Assign the fixed Cup positions. {slotMeta.note||'The matchups use these slots automatically.'}</div>
      {Array.from({length:slotCount},(_,i)=>({slot:i+1,player:slotRows[i]})).map(({slot,player})=>(
        <div key={teamKey+'-slot-'+slot} style={{borderTop:'1px solid rgba(255,255,255,0.08)',padding:'9px 0'}}>
          <div style={{fontSize:11,color:(CUP_THEME[teamKey]||CUP_THEME.gold).accent,fontWeight:950,letterSpacing:'0.10em',marginBottom:6}}>{(team&&team.name)||CUP_THEME[teamKey].name} - {slot} ({slotMeta.code}{slot})</div>
          {player?renderCupSlotPlayerEditor(player):renderCupEmptySlotEditor(teamKey,slotMeta.code+slot)}
        </div>
      ))}
    </div>;
  }
  return <div>
    <div style={{...S.card,marginBottom:14,background:'linear-gradient(135deg,rgba(212,175,55,0.13),rgba(11,31,77,0.35))'}}>
      <div style={{fontSize:18,color:'#fff',fontWeight:900,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.07em'}}>SNYDER CUP SETUP</div>
      <div style={{fontSize:12,color:'#9fb6c9',marginTop:4}}>Professional setup panel: Cup details, squads, days, matches and quick fixes.</div>
      {cup&&<button onClick={resetCompetition} style={{...S.dan,width:'100%',padding:11,fontSize:13,marginTop:12}}>Reset Competition</button>}
    </div>
    {!cup&&<div style={{...S.card,marginBottom:14}}>
      <div style={{fontSize:14,color:'#fff',fontWeight:800,marginBottom:10}}>Create Cup</div>
      <input style={{...S.inp,marginBottom:8}} value={name} onChange={e=>setName(e.target.value)} placeholder="Cup name"/>
      <input style={{...S.inp,marginBottom:8}} value={goldName} onChange={e=>setGoldName(e.target.value)} placeholder="Team LIV name"/>
      <input style={{...S.inp,marginBottom:8}} value={navyName} onChange={e=>setNavyName(e.target.value)} placeholder="Team Boring name"/>
      <input style={{...S.inp,marginBottom:12}} value={redName} onChange={e=>setRedName(e.target.value)} placeholder="Stags group name"/>
      <button onClick={createCup} style={{...S.pri,width:'100%',background:'linear-gradient(135deg,#D4AF37,#2563EB)'}}>Create Cup</button>
    </div>}
    {cup&&<div>
      <div style={{...S.card,marginBottom:10,padding:10}}>
        <div style={{fontSize:12,color:'#60b8f0',fontWeight:900,letterSpacing:'0.14em',marginBottom:8}}>CUP OVERVIEW</div>
        <select style={{...S.inp,marginBottom:8}} value={cup.id} onChange={e=>setSelectedCupId(e.target.value)}>{(cupEvents||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:7,textAlign:'center',marginBottom:10}}><div style={{...S.card,padding:8}}><div style={{fontSize:18,color:'#fff',fontWeight:900}}>{cupPlayers.length}</div><div style={{fontSize:10,color:'#8ea0ad'}}>Players</div></div><div style={{...S.card,padding:8}}><div style={{fontSize:18,color:'#fff',fontWeight:900}}>{days.length}</div><div style={{fontSize:10,color:'#8ea0ad'}}>Days</div></div><div style={{...S.card,padding:8}}><div style={{fontSize:18,color:'#fff',fontWeight:900}}>{matches.length}</div><div style={{fontSize:10,color:'#8ea0ad'}}>Matches</div></div></div>
        <button onClick={buildFixedCupSchedule} style={{...S.pri,width:'100%',background:'linear-gradient(135deg,#D4AF37,#2563EB)',fontSize:13}}>Build fixed LIV v Boring matchups</button>
        <div style={{fontSize:10,color:'#9fb6c9',lineHeight:1.35,marginTop:7}}>Creates the LIV, Boring and Stags slots if needed, then fills two scoring groups per day. {CUP_STAGS_ROTATION[1]}, {CUP_STAGS_ROTATION[2]}, {CUP_STAGS_ROTATION[3]}.</div>
      </div>
      <div style={{fontSize:12,color:'#60b8f0',fontWeight:900,letterSpacing:'0.14em',margin:'0 0 8px'}}>TEAMS & PLAYERS</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr',gap:10,marginBottom:14}}>
        {renderTeamAdminCard('gold',teams.gold,goldPlayers)}
        {renderTeamAdminCard('navy',teams.navy,navyPlayers)}
        {renderTeamAdminCard('red',teams.red,redPlayers)}
      </div>
      <div style={{...S.card,marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}><div style={{fontSize:14,color:'#fff',fontWeight:800}}>Cup Days</div><div style={{fontSize:11,color:'#9fb6c9',fontWeight:800}}>3 fixed days</div></div>
        {adminDays.map(d=>{const released=isDayReleased(d.day_number);const count=dayMatches(d.day_number).length;const dayCourse=selectedCourseForDay(d.day_number);return <div key={d.id||d.day_number} style={{display:'grid',gap:8,fontSize:13,color:'#60b8f0',padding:'10px 0',borderTop:'1px solid rgba(255,255,255,0.08)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}><span>Day {d.day_number} - {count} matches - {released?'LIVE':'Locked'}</span><div style={{display:'flex',gap:6}}><button onClick={()=>setDayReleased(d.day_number,!released)} disabled={!released&&count===0} style={{...(released?S.gho:S.pri),padding:'5px 9px',fontSize:11,opacity:(!released&&count===0)?0.45:1}}>{released?'Lock Day':'Go Live'}</button><button onClick={()=>deleteDay(d)} disabled={count===0&&d._synthetic} style={{...S.dan,padding:'5px 9px',fontSize:11,opacity:(count===0&&d._synthetic)?0.45:1}}>Delete</button></div></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr',gap:6}}>
            <label style={{fontSize:10,color:'#8ea0ad',letterSpacing:'0.08em',textTransform:'uppercase'}}>Course for Day {d.day_number}</label>
            <select style={{...S.inp,fontSize:12}} value={dayCourse?dayCourse.id:''} onChange={e=>setCupDayCourse(d.day_number,e.target.value)}>
              <option value="">Choose course...</option>{cupCourseOptions.map(c=><option key={c.id} value={c.id}>{cleanCourseName(c.name)} - {c.tee||courseTeeFromName(c.name)||'White'} tee</option>)}
            </select>
            {dayCourse&&<div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:8,alignItems:'center'}}><div style={{fontSize:11,color:'#8ea0ad'}}>Rating {dayCourse.course_rating||'-'} - Slope {dayCourse.slope_rating||'-'}</div><button onClick={()=>openCourseFix(d.day_number)} style={{...S.gho,padding:'6px 10px',fontSize:11}}>Fix card / shots</button></div>}
          </div>
        </div>;})}
      </div>
      {courseFixDraft&&<div style={{...S.card,marginBottom:14,border:'1px solid rgba(212,175,55,0.34)',background:'linear-gradient(135deg,rgba(212,175,55,0.10),rgba(15,23,42,0.92))'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginBottom:8}}><div><div style={{fontSize:14,color:'#fff',fontWeight:950}}>Day {courseFixDay} course fail-safe</div><div style={{fontSize:11,color:'#8ea0ad'}}>Use this if the card is wrong on the day. It updates the Cup day course, stroke indexes and recalculates playing shots.</div></div><button onClick={()=>{setCourseFixDay(null);setCourseFixDraft(null);}} style={{...S.gho,padding:'5px 9px',fontSize:11}}>Close</button></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 70px 70px',gap:7,marginBottom:8}}>
          <input style={{...S.inp,fontSize:12}} value={courseFixDraft.name||''} onChange={e=>setCourseFixDraft(d=>({...d,name:e.target.value}))} placeholder="Course name"/>
          <input style={{...S.inp,fontSize:12,textAlign:'center'}} value={courseFixDraft.course_rating||''} onChange={e=>setCourseFixDraft(d=>({...d,course_rating:e.target.value}))} placeholder="Rating"/>
          <input style={{...S.inp,fontSize:12,textAlign:'center'}} value={courseFixDraft.slope_rating||''} onChange={e=>setCourseFixDraft(d=>({...d,slope_rating:e.target.value}))} placeholder="Slope"/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'32px 1fr 1fr 1fr',gap:4,fontSize:10,color:'#8ea0ad',fontWeight:950,letterSpacing:'0.06em',marginBottom:4}}><div>H</div><div>PAR</div><div>SI</div><div>YDS</div></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,maxHeight:320,overflowY:'auto',paddingRight:2}}>{(courseFixDraft.holes||[]).map((h,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'26px 1fr 1fr 1fr',gap:4,alignItems:'center'}}><div style={{fontSize:11,color:'#60b8f0',fontWeight:950}}>{i+1}</div><input type="number" value={h.par} onChange={e=>updateCourseFixHole(i,{par:e.target.value})} style={{...S.inp,padding:'4px 3px',fontSize:11,textAlign:'center'}}/><input type="number" value={h.stroke_index} onChange={e=>updateCourseFixHole(i,{stroke_index:e.target.value})} style={{...S.inp,padding:'4px 3px',fontSize:11,textAlign:'center'}}/><input type="number" value={h.yards} onChange={e=>updateCourseFixHole(i,{yards:e.target.value})} style={{...S.inp,padding:'4px 3px',fontSize:11,textAlign:'center'}}/></div>)}</div>
        <button onClick={saveCourseFix} style={{...S.pri,width:'100%',marginTop:10}}>Save day card + recalc shots</button>
      </div>}
      <div style={{...S.card,marginBottom:14}}>
        <div style={{fontSize:14,color:'#fff',fontWeight:800,marginBottom:10}}>Fixed Matchup Plan</div>
        <div style={{fontSize:11,color:'#9fb6c9',lineHeight:1.4,marginBottom:10}}>Once the 12 slots are assigned, press the build button above and the Day 1, Day 2 and Day 3 scoreboards will use the full fixed doubles and singles schedule.</div>
        <div style={{display:'grid',gap:7}}>
          {CUP_FIXED_MATCHUPS.map((g,i)=><div key={'fixed-'+i} style={{border:'1px solid rgba(255,255,255,0.10)',borderRadius:10,background:'rgba(0,0,0,0.12)',padding:8}}>
            <div style={{fontSize:11,color:'#60b8f0',fontWeight:950,letterSpacing:'0.10em'}}>DAY {g.day}</div>
            <div style={{fontSize:12,color:'#fff',fontWeight:850,marginTop:3}}>{g.doubles.slice(0,2).map(s=>s[0]+s[1]).join('/')} vs {g.doubles.slice(2,4).map(s=>s[0]+s[1]).join('/')}</div>
            <div style={{fontSize:11,color:'#9fb6c9',marginTop:2}}>{g.singles.map(pair=>pair.map(s=>s[0]+s[1]).join(' vs ')).join(', ')}</div>
          </div>)}
        </div>
      </div>
      <div style={{fontSize:12,color:'#60b8f0',letterSpacing:'0.12em',fontWeight:800,marginBottom:8}}>MATCHES</div>
      {matches.length===0?<div style={{...S.card,color:'#8ea0ad',fontSize:13}}>No matches yet.</div>:matchesByDay.map(group=><div key={group.day} style={{marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',gap:8,margin:'0 0 8px'}}><div style={{fontSize:15,color:'#fff',fontWeight:900,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.08em'}}>DAY {group.day}</div><div style={{height:1,background:'rgba(255,255,255,0.12)',flex:1}}/></div>
        {group.matches.map(m=><CupMatchCard key={m.id} match={m} cupPlayers={cupPlayers} teams={teams} editable={true} onRemove={removeFromMatch} onDelete={deleteMatch}/>)}
      </div>)}
    </div>}
  </div>;
}
function CupMatchLine({match,cupPlayers,teams,editable,onRemove}){
  const findPlayer=id=>(cupPlayers||[]).find(p=>p.id===id||p.user_id===id)||null;
  const sideTeamKey=ids=>{const counts={};(ids||[]).forEach(id=>{const p=findPlayer(id);const k=(p&&p.team_key)||'gold';counts[k]=(counts[k]||0)+1;});return Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0]||'gold';};
  const renderSide=(teamKey,ids)=>{
    const colour=(CUP_THEME[teamKey]||CUP_THEME.gold).accent;
    if(!ids||ids.length===0)return <div style={{fontSize:12,color:'#8ea0ad',fontWeight:800}}>Empty slot</div>;
    return <div style={{display:'flex',flexDirection:'column',gap:5,alignItems:teamKey==='navy'?'flex-end':'flex-start'}}>{ids.map(id=>{const p=findPlayer(id);return <div key={id} style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:12,color:colour,fontWeight:800}}><span>{gameName(p?.display_name||'Player')}</span>{editable&&<button onClick={()=>onRemove(match,teamKey,id)} style={{...S.dan,padding:'2px 6px',fontSize:10}}>x</button>}</div>;})}</div>;
  };
  const leftKey=sideTeamKey(match.gold_player_ids||[]);
  const rightKey=sideTeamKey(match.navy_player_ids||[]);
  return <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:8,alignItems:'center'}}><div>{renderSide(leftKey,match.gold_player_ids||[])}</div><div style={{fontSize:11,color:'#fff',background:'rgba(255,255,255,0.08)',borderRadius:999,padding:'4px 8px'}}>A/S</div><div style={{textAlign:'right'}}>{renderSide(rightKey,match.navy_player_ids||[])}</div></div>;
}
function groupCupMatchesByDay(matches,cupDays){
  const dayNums=new Set([...(cupDays||[]).map(d=>parseInt(d.day_number)||1),...(matches||[]).map(m=>parseInt(m.day_number)||1)]);
  return Array.from(dayNums).sort((a,b)=>a-b).map(day=>({day,matches:(matches||[]).filter(m=>(parseInt(m.day_number)||1)===day)}));
}
function CupMatchCard({match,cupPlayers,teams,editable,onRemove,onDelete,onOpen,locked}){
  const findPlayer=id=>(cupPlayers||[]).find(p=>p.id===id||p.user_id===id)||null;
  const sideTeamKey=ids=>{const counts={};(ids||[]).forEach(id=>{const p=findPlayer(id);const k=(p&&p.team_key)||'gold';counts[k]=(counts[k]||0)+1;});return Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0]||'gold';};
  const type=String(match.match_type||'match').toUpperCase();
  const goldIds=match.gold_player_ids||[];
  const navyIds=match.navy_player_ids||[];
  const leftKey=sideTeamKey(goldIds);
  const rightKey=sideTeamKey(navyIds);
  const totalPlayers=goldIds.length+navyIds.length;
  const playerChip=(teamKey,id,colKey)=>{
    const p=findPlayer(id);
    return <div key={teamKey+'-'+id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:6,border:'1px solid rgba(255,255,255,0.12)',borderRadius:10,padding:'7px 8px',background:'rgba(0,0,0,0.14)',minHeight:34}}>
      <span style={{fontSize:12,color:(CUP_THEME[teamKey]||CUP_THEME.gold).accent,fontWeight:900,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{gameName(p?.display_name||'Player')}</span>
      {editable&&<button onClick={(e)=>{e.stopPropagation();onRemove(match,colKey,id);}} style={{...S.dan,padding:'2px 6px',fontSize:10,flexShrink:0}}>x</button>}
    </div>;
  };
  return <div onClick={()=>{if(onOpen&&!locked)onOpen(match);}} style={{...S.card,marginBottom:8,padding:12,border:locked?'1px solid rgba(255,255,255,0.08)':'1px solid rgba(96,184,240,0.35)',opacity:locked?0.62:1,cursor:onOpen&&!locked?'pointer':'default'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginBottom:10}}>
      <div><div style={{fontSize:11,color:'#60b8f0',fontWeight:900,letterSpacing:'0.12em'}}>{totalPlayers===4?'4 BALL':type}</div><div style={{fontSize:13,color:'#fff',fontWeight:900,marginTop:2}}>{type}</div></div>
      <div style={{display:'flex',alignItems:'center',gap:7}}>{locked&&<div style={{fontSize:10,color:'#fbbf24',background:'rgba(251,191,36,0.12)',border:'1px solid rgba(251,191,36,0.25)',borderRadius:999,padding:'4px 8px',fontWeight:900}}>LOCKED</div>}<div style={{fontSize:11,color:'#fff',background:'rgba(255,255,255,0.08)',borderRadius:999,padding:'4px 8px',fontWeight:800}}>A/S</div>{editable&&onDelete&&<button onClick={(e)=>{e.stopPropagation();onDelete(match);}} style={{...S.dan,padding:'4px 8px',fontSize:11}}>Delete</button>}</div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:8,alignItems:'stretch'}}>
      <div style={cupTeamStyle(leftKey,{borderRadius:12,padding:8})}><CupTeamBadge teamKey={leftKey} label={teams[leftKey].name}/><div style={{display:'grid',gap:6,marginTop:7}}>{goldIds.length?goldIds.map(id=>playerChip(leftKey,id,'gold')):<div style={{fontSize:12,color:'#8ea0ad',fontWeight:800}}>Empty slot</div>}</div></div>
      <div style={{display:'flex',alignItems:'center',fontSize:12,color:'#fff',fontWeight:900}}>v</div>
      <div style={cupTeamStyle(rightKey,{borderRadius:12,padding:8})}><CupTeamBadge teamKey={rightKey} label={teams[rightKey].name}/><div style={{display:'grid',gap:6,marginTop:7}}>{navyIds.length?navyIds.map(id=>playerChip(rightKey,id,'navy')):<div style={{fontSize:12,color:'#8ea0ad',fontWeight:800}}>Empty slot</div>}</div></div>
    </div>
  </div>;
}
function CupDayView({day,course,groups,teams,playersInCup,released,roundForGroup,matchResult,openCupGroup,openingGroup,isAdmin,openFinesGroup,scores}){
  const findPlayer=id=>(playersInCup||[]).find(p=>p.id===id||p.user_id===id)||null;
  const dayFinished=groups.length>0&&groups.every(g=>{const rd=roundForGroup(g.day,g.idx);return rd&&isCompletedRound(rd);});
  const courseName=course?(cleanCourseName(course.name)||course.name||'Course selected'):'Course not selected';
  const courseLine=course?courseSummaryLine(course,{tee:course.tee},course.holes):'Choose a course in Cup Admin';
  function playerName(id){const p=findPlayer(id);return gameName(p&&p.display_name||'Player');}
  function MatchRow({match,round,label}){
    if(String(match&&match.match_type||'').toLowerCase()==='stags'){
      const ids=[...(match.gold_player_ids||[]),...(match.navy_player_ids||[])];
      return <div style={{border:'1px solid rgba(252,165,165,0.26)',borderRadius:12,background:'linear-gradient(135deg,rgba(220,38,38,0.16),rgba(15,23,42,0.70))',padding:10}}>
        <div style={{fontSize:10,color:CUP_THEME.red.accent,fontWeight:950,letterSpacing:'0.14em',marginBottom:7}}>THE STAGS - OVERALL SINGLES ONLY</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>{ids.map(id=><span key={'stags-'+id} style={{border:'1px solid rgba(255,255,255,0.12)',borderRadius:999,padding:'5px 8px',background:'rgba(0,0,0,0.16)',fontSize:12,color:'#fff',fontWeight:900}}>{playerName(id)}</span>)}</div>
      </div>;
    }
    const res=matchResult(match,round);
    const finished=round&&isCompletedRound(round);
    const goldIds=match.gold_player_ids||[];
    const navyIds=match.navy_player_ids||[];
    const leftKey=res.leftTeamKey||'gold';
    const rightKey=res.rightTeamKey||'navy';
    const isLeft=res.winner===leftKey;
    const isRight=res.winner===rightKey;
    const matchTone=res.winner&&res.winner!=='tie'?CUP_THEME[res.winner]:null;
    const matchBg=matchTone
      ? (res.winner==='gold'?'linear-gradient(135deg,rgba(212,175,55,0.98),rgba(120,74,7,0.96))':res.winner==='red'?'linear-gradient(135deg,rgba(220,38,38,0.98),rgba(69,10,10,0.96))':'linear-gradient(135deg,rgba(37,99,235,0.98),rgba(8,24,61,0.97))')
      : 'linear-gradient(135deg,rgba(255,255,255,0.060),rgba(255,255,255,0.025))';
    const matchBorder=matchTone?`2px solid ${matchTone.accent}`:'1px solid rgba(255,255,255,0.10)';
    const centreText=finished?'F':(res.isDoubles?(res.winner==='tie'?'A/S':(res.holes?('THRU '+res.holes):'MATCHPLAY')):(res.winner==='tie'?'A/S':'')).toUpperCase();
    const leftOutside=res.isDoubles?(isLeft&&res.shortLabel?res.shortLabel.toUpperCase():''):String(res.gold||0).toUpperCase();
    const rightOutside=res.isDoubles?(isRight&&res.shortLabel?res.shortLabel.toUpperCase():''):String(res.navy||0).toUpperCase();
    const scoreColWidth=res.isDoubles?46:62;
    const centreColWidth=res.isDoubles?54:54;
    const playerFontSize=res.isDoubles?12:13;
    return <div style={{border:matchBorder,borderRadius:12,background:matchBg,padding:10,boxShadow:matchTone?'0 12px 30px rgba(0,0,0,0.34), inset 0 0 0 1px rgba(255,255,255,0.17)':(finished?'0 10px 24px rgba(0,0,0,0.24)':'none')}}>
      {finished&&<div style={{fontSize:10,color:matchTone?'#fff':'#f8fafc',fontWeight:950,letterSpacing:'0.16em',textAlign:'center',marginBottom:7}}>FINISHED</div>}
      <div style={{display:'grid',gridTemplateColumns:`${scoreColWidth}px minmax(0,1fr) ${centreColWidth}px minmax(0,1fr) ${scoreColWidth}px`,gap:6,alignItems:'center'}}>
        <div style={{fontSize:res.isDoubles?14:20,color:isLeft?'#fff':(res.isDoubles?'rgba(255,255,255,0.22)':CUP_THEME[leftKey].accent),fontWeight:950,textAlign:'left',whiteSpace:'nowrap',lineHeight:1}}>{leftOutside}</div>
        <div style={{display:'grid',gap:4,textAlign:'right',minWidth:0}}>{goldIds.map(id=><div key={id} style={{color:matchTone?'#fff':CUP_THEME[leftKey].accent,fontSize:playerFontSize,fontWeight:950,whiteSpace:'normal',overflowWrap:'anywhere',lineHeight:1.05}}>{playerName(id)}</div>)}</div>
        <div style={{textAlign:'center',display:'grid',gap:3,justifyItems:'center',alignItems:'center',minWidth:centreColWidth}}>
          <div style={{fontSize:finished?22:(res.isDoubles?10:13),color:finished?(matchTone?'#fff':'#f8fafc'):(matchTone?'rgba(255,255,255,0.84)':'#8ea0ad'),fontWeight:950,whiteSpace:'nowrap',lineHeight:1}}>{centreText}</div>
        </div>
        <div style={{display:'grid',gap:4,textAlign:'left',minWidth:0}}>{navyIds.map(id=><div key={id} style={{color:matchTone?'#fff':CUP_THEME[rightKey].accent,fontSize:playerFontSize,fontWeight:950,whiteSpace:'normal',overflowWrap:'anywhere',lineHeight:1.05}}>{playerName(id)}</div>)}</div>
        <div style={{fontSize:res.isDoubles?14:20,color:isRight?'#fff':(res.isDoubles?'rgba(255,255,255,0.22)':CUP_THEME[rightKey].accent),fontWeight:950,textAlign:'right',whiteSpace:'nowrap',lineHeight:1}}>{rightOutside}</div>
      </div>
    </div>;
  }
  return <div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:14}}>
      <div style={{display:'flex',alignItems:'center',gap:11,minWidth:0}}><CourseBadge course={course} size={48}/><div style={{minWidth:0}}><div style={{display:'flex',alignItems:'baseline',gap:8,flexWrap:'wrap'}}><div style={{fontSize:30,color:'#fff',fontWeight:950,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.08em'}}>DAY {day}</div><div style={{fontSize:15,color:'#fff',fontWeight:950,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'62vw'}}>{courseName}</div></div><div style={{fontSize:11,color:'#90ccf0',fontWeight:850,lineHeight:1.35}}>{courseLine}</div><div style={{fontSize:12,color:dayFinished?'#f8fafc':(released?'#34d399':'#fbbf24'),fontWeight:900,marginTop:2}}>{dayFinished?'FINISHED':(released?'Open for scoring':'Locked by admin')}</div></div></div>
      <div style={{fontSize:12,color:'#90ccf0',fontWeight:900}}>{groups.length} groups</div>
    </div>
    {groups.length===0?<div style={{...S.card,color:'#8ea0ad',fontSize:13}}>No matches have been added for Day {day} yet.</div>:groups.map(group=>{
      const rd=roundForGroup(group.day,group.idx);
      const finesTotal=cupFineTotalForRound(rd,scores);
      const firstMatch=group.doubles||group.singles[0];
      const locked=!released;
      const opening=normaliseId(openingGroup)===normaliseId(day+'-'+group.idx);
      const disabled=!firstMatch||opening||locked;
      const finished=rd&&isCompletedRound(rd);
      return <div key={group.idx} role="button" tabIndex={disabled?-1:0} onClick={()=>{if(!disabled)openCupGroup(group);}} onKeyDown={(e)=>{if(!disabled&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openCupGroup(group);}}} style={{border:finished?'1px solid rgba(248,250,252,0.34)':'1px solid rgba(96,184,240,0.22)',borderRadius:16,background:'linear-gradient(180deg,rgba(0,112,187,0.12),rgba(255,255,255,0.04))',padding:12,marginBottom:14,opacity:disabled?0.58:1,cursor:disabled?'default':'pointer'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:10}}>
          <div><div style={{fontSize:18,color:'#fff',fontWeight:950,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.08em'}}>GROUP {group.idx}</div><div style={{fontSize:11,color:finished?'#f8fafc':'#8ea0ad',fontWeight:finished?900:500}}>{opening?'Opening scorecard...':rd?finished?'FINISHED':'Scorecard live':locked?'Locked until Go Live':'No scorecard yet'}</div></div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <button onClick={(e)=>{e.stopPropagation(); if(rd&&!locked&&openFinesGroup)openFinesGroup(group);}} disabled={!rd||locked} style={{border:'1px solid rgba(212,175,55,0.38)',borderRadius:999,padding:'7px 10px',background:rd&&!locked?'rgba(212,175,55,0.16)':'rgba(255,255,255,0.05)',color:rd&&!locked?'#F5E6A3':'#8ea0ad',fontSize:11,fontWeight:950,cursor:rd&&!locked?'pointer':'default',whiteSpace:'nowrap',display:'inline-flex',alignItems:'center',gap:7}}><span>{EMOJI.moneyWings}</span><span>FINES</span><span style={{fontSize:12,color:rd&&!locked?'#fff':'#8ea0ad',fontWeight:950}}>{EMOJI.pound}{finesTotal}</span></button>
            <div style={{fontSize:11,color:finished?'#f8fafc':(disabled?'#8ea0ad':'#90ccf0'),fontWeight:900,letterSpacing:'0.08em'}}>{locked?'LOCKED':opening?'OPENING':finished?'VIEW FINISHED':'TAP TO OPEN'}</div>
          </div>
        </div>
        <div style={{display:'grid',gap:8}}>
          {group.doubles&&<><div style={{fontSize:11,color:'#60b8f0',fontWeight:950,letterSpacing:'0.12em',margin:'2px 0 -2px'}}>DOUBLES MATCH</div><MatchRow match={group.doubles} round={rd} label="DOUBLES MATCH"/></>}
          {group.singles.map((m,i)=><div key={m.id}><div style={{fontSize:11,color:'#60b8f0',fontWeight:950,letterSpacing:'0.12em',margin:'2px 0 6px'}}>SINGLES {i+1}</div><MatchRow match={m} round={rd} label={'SINGLES '+(i+1)}/></div>)}
        </div>
      </div>;
    })}
  </div>;
}

function CupFinesCard({group,day,round,teams,playersInCup,courses,scores,sb,flash,load,onClose}){
  const[playerFineRows,setPlayerFineRows]=useState({});
  const findPlayer=id=>(playersInCup||[]).find(p=>p.id===id||p.user_id===id||p.guest_id===id)||null;
  const playerIds=Array.from(new Set([...(group&&group.players||[]),...((group&&group.doubles&&group.doubles.gold_player_ids)||[]),...((group&&group.doubles&&group.doubles.navy_player_ids)||[]),...((group&&group.singles||[]).flatMap(m=>[...(m.gold_player_ids||[]),...(m.navy_player_ids||[])]))].filter(Boolean)));
  const normalScores=(scores||[]).filter(sc=>round&&sc.round_id===round.id&&!isMetaScoreRow(sc));
  const course=(courses||[]).find(c=>round&&normaliseId(c.id)===normaliseId(round.course_id))||null;
  const courseHoles=(course&&Array.isArray(course.holes)&&course.holes.length)?course.holes:Array.from({length:18},(_,i)=>({hole:i+1,par:4,stroke_index:i+1,yards:0}));
  function holeInfo(h){return courseHoles.find(x=>parseInt(x.hole)===parseInt(h))||{hole:h,par:4,stroke_index:h,yards:0};}
  function playerName(id){const p=findPlayer(id);return gameFirstName(p&&p.display_name||p&&p.name||'Player');}
  function readFinesFromScores(){
    const next={};
    (scores||[]).filter(sc=>round&&sc.round_id===round.id&&isFineScoreRow(sc)).forEach(sc=>{
      const parsed=parseFineScoreRow(sc);
      if(!parsed||!parsed.pid||!parsed.key)return;
      const h=parseInt(parsed.hole)||0;
      const count=Math.max(0,parseInt(sc.gross_score)||0);
      if(!h||!count)return;
      if(!next[h])next[h]={};
      if(!next[h][parsed.pid])next[h][parsed.pid]={};
      next[h][parsed.pid][parsed.key]=count;
    });
    return next;
  }
  const fineRowsSignature=(scores||[]).filter(sc=>round&&sc.round_id===round.id&&isFineScoreRow(sc)).map(sc=>{const p=parseFineScoreRow(sc);return [p&&p.pid,p&&p.key,p&&p.hole,sc.gross_score].join(':');}).join('|');
  useEffect(()=>{setPlayerFineRows(readFinesFromScores());},[round&&round.id,fineRowsSignature]);
  function hasBlobScore(pid,h){
    const row=normalScores.find(sc=>normaliseId(sc.player_id)===normaliseId(pid)&&parseInt(sc.hole_number)===parseInt(h)&&Number.isFinite(parseInt(sc.gross_score)));
    return !!row&&stablefordPointsValue(row.stableford_points)===0;
  }
  function storedCount(pid,h,key){return parseInt(playerFineRows&&playerFineRows[h]&&playerFineRows[h][pid]&&playerFineRows[h][pid][key])||0;}
  function effectiveCount(pid,h,key){return key==='blob'&&hasBlobScore(pid,h)?1:storedCount(pid,h,key);}
  function playerHoleFine(pid,h){return CUP_FINE_DEFS.reduce((t,d)=>t+fineAmount(d.key,effectiveCount(pid,h,d.key)),0);}
  function playerTotal(pid){let total=0;for(let h=1;h<=18;h++)total+=playerHoleFine(pid,h);return total;}
  function dayTotal(){return playerIds.reduce((t,pid)=>t+playerTotal(pid),0);}
  async function saveFine(pid,h,key,count){
    if(!round){flash&&flash('No scorecard found for this group yet');return;}
    const cleanCount=Math.max(0,parseInt(count)||0);
    const pairedPuttKey=key==='threePutt'?'fourPutt':key==='fourPutt'?'threePutt':null;
    setPlayerFineRows(prev=>{
      const next={...(prev||{})};
      next[h]={...(next[h]||{})};
      next[h][pid]={...(next[h][pid]||{})};
      if(cleanCount)next[h][pid][key]=cleanCount; else delete next[h][pid][key];
      if(cleanCount&&pairedPuttKey)delete next[h][pid][pairedPuttKey];
      return next;
    });
    if(key==='blob')return;
    try{
      const row={round_id:round.id,player_id:pid,hole_number:makeFineScoreHoleNumber(h,key),gross_score:cleanCount,stableford_points:fineAmount(key,cleanCount),par:0,stroke_index:0};
      const res=await saveScoreRowToCloud(sb,row);
      if(!res||!res.ok)throw new Error((res&&res.error)||'Unknown cloud save error');
      if(cleanCount&&pairedPuttKey){
        const pairedRow={round_id:round.id,player_id:pid,hole_number:makeFineScoreHoleNumber(h,pairedPuttKey),gross_score:0,stableford_points:0,par:0,stroke_index:0};
        const pairedRes=await saveScoreRowToCloud(sb,pairedRow);
        if(!pairedRes||!pairedRes.ok)throw new Error((pairedRes&&pairedRes.error)||'Unknown cloud save error');
      }
      if(load)await load(false);
    }catch(e){flash&&flash('Fines save failed: '+(e&&e.message?e.message:String(e)));}
  }
  function toggleFine(pid,h,key){
    if(key==='blob')return;
    const cur=storedCount(pid,h,key);
    saveFine(pid,h,key,cur?0:1);
  }
  if(!group)return null;
  return <div style={{minHeight:'100vh',paddingBottom:118}}>
    <div style={{background:'linear-gradient(135deg,#064E3B,#042F2E)',padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid rgba(94,234,212,0.18)'}}>
      <button onClick={onClose} style={{...S.gho,padding:'6px 12px',fontSize:13}}>Back</button>
      <div style={{fontSize:16,color:'#fff',fontWeight:950,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.12em'}}>{EMOJI.moneyWings} FINES CARD</div>
      <div style={{width:60}}/>
    </div>
    <div style={{padding:16}}>
      <div style={{borderRadius:16,padding:12,marginBottom:10,border:'1px solid rgba(212,175,55,0.30)',background:'linear-gradient(135deg,rgba(212,175,55,0.16),rgba(8,30,58,0.94))'}}>
        <div style={{fontSize:22,color:'#fff',fontWeight:950,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.08em'}}>DAY {day} - GROUP {group.idx}</div>
        <div style={{marginTop:8,display:'grid',gridTemplateColumns:'auto 1fr auto',alignItems:'center',gap:8}}><div style={{fontSize:24,color:'#F5E6A3',fontWeight:950,lineHeight:1}}>{EMOJI.moneyWings}</div><div style={{fontSize:11,color:'#8ea0ad',fontWeight:900}}>Group total</div><div style={{fontSize:24,color:'#F5E6A3',fontWeight:950}}>{EMOJI.pound}{dayTotal()}</div></div>
      </div>
      <div style={{...S.card,marginBottom:14}}>
        <div style={{fontSize:12,color:'#fff',fontWeight:950,marginBottom:7}}>Fines leaderboard</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:6}}>{playerIds.slice().sort((a,b)=>playerTotal(b)-playerTotal(a)).map(pid=><div key={pid} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:6,alignItems:'center',padding:'6px 7px',borderRadius:10,background:'rgba(255,255,255,0.055)',border:'1px solid rgba(255,255,255,0.08)'}}><div style={{fontSize:12,color:'#fff',fontWeight:900,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{playerName(pid)}</div><div style={{fontSize:15,color:'#F5E6A3',fontWeight:950}}>{EMOJI.pound}{playerTotal(pid)}</div></div>)}</div>
      </div>
      <div style={{fontSize:11,color:'#60b8f0',fontWeight:950,letterSpacing:'0.12em',margin:'10px 0 6px'}}>HOLE-BY-HOLE FINES</div>
      <div style={{display:'grid',gap:8}}>{Array.from({length:18},(_,i)=>i+1).map(h=>{
        const holeTotal=playerIds.reduce((t,pid)=>t+playerHoleFine(pid,h),0);
        const hd=holeInfo(h);
        return <div key={h} style={{border:'1px solid rgba(96,184,240,0.18)',borderRadius:13,background:'rgba(255,255,255,0.045)',padding:8}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6,gap:8}}><div style={{display:'flex',alignItems:'baseline',gap:6,minWidth:0}}><span style={{fontSize:10,color:'#60b8f0',fontWeight:950,letterSpacing:'0.16em'}}>HOLE</span><span style={{fontSize:28,color:'#fff',fontWeight:950,fontFamily:"'Barlow Condensed',sans-serif",lineHeight:0.85,letterSpacing:'0.04em'}}>{h}</span><span style={{fontSize:11,color:'#8ea0ad',fontWeight:950,letterSpacing:'0.08em'}}>- PAR {hd.par||'-'}</span></div><div style={{fontSize:14,color:holeTotal?'#F5E6A3':'#8ea0ad',fontWeight:950}}>{EMOJI.pound}{holeTotal}</div></div>
          <div style={{display:'grid',gap:6}}>{playerIds.map(pid=>{
            const playerFine=playerHoleFine(pid,h);
            return <div key={pid} style={{border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,padding:6,background:playerFine?'rgba(212,175,55,0.10)':'rgba(0,0,0,0.12)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}><div style={{fontSize:12,color:'#fff',fontWeight:950}}>{playerName(pid)}</div><div style={{fontSize:12,color:playerFine?'#F5E6A3':'#8ea0ad',fontWeight:950}}>{EMOJI.pound}{playerFine}</div></div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(6,minmax(0,1fr))',gap:4}}>{CUP_FINE_DEFS.map(def=>{
                const autoBlob=def.key==='blob'&&hasBlobScore(pid,h);
                const count=effectiveCount(pid,h,def.key);
                const active=count>0;
                const puttBlocked=(def.key==='threePutt'&&storedCount(pid,h,'fourPutt')>0)||(def.key==='fourPutt'&&storedCount(pid,h,'threePutt')>0);
                const tileColor=active?'#F5E6A3':puttBlocked?'rgba(255,255,255,0.34)':'#fff';
                const tileBg=active?'rgba(212,175,55,0.16)':puttBlocked?'rgba(255,255,255,0.025)':'rgba(255,255,255,0.05)';
                if(def.type==='counter')return <div key={def.key} style={{border:'1px solid '+(active?'rgba(212,175,55,0.50)':'rgba(255,255,255,0.10)'),borderRadius:9,padding:4,background:active?'rgba(212,175,55,0.14)':'rgba(255,255,255,0.05)',textAlign:'center'}}>
                  <div style={{display:'grid',gridTemplateRows:'18px 18px',alignItems:'center',justifyItems:'center',minHeight:36}}><div style={{fontSize:15,lineHeight:1}}>{def.emoji}</div><div style={{fontSize:8,color:'#8ea0ad',fontWeight:900,lineHeight:1.05,whiteSpace:'nowrap'}}>{def.label}</div></div>
                  <div style={{display:'flex',gap:2,alignItems:'center',justifyContent:'center',marginTop:3}}><button onClick={()=>saveFine(pid,h,def.key,Math.max(0,storedCount(pid,h,def.key)-1))} style={{...S.gho,padding:'1px 5px',fontSize:11,minHeight:20}}>-</button><div style={{fontSize:12,color:'#fff',fontWeight:950,minWidth:12}}>{count}</div><button onClick={()=>saveFine(pid,h,def.key,storedCount(pid,h,def.key)+1)} style={{...S.gho,padding:'1px 5px',fontSize:11,minHeight:20}}>+</button></div>
                </div>;
                const blobLocked=def.key==='blob';
                return <button key={def.key} onClick={()=>toggleFine(pid,h,def.key)} disabled={blobLocked||puttBlocked} title={blobLocked?'Blob fines are automatic from scoring':puttBlocked?'A 3 putt and 4 putt cannot both apply on the same hole':''} style={{border:'1px solid '+(active?'rgba(212,175,55,0.55)':'rgba(255,255,255,0.10)'),borderRadius:9,padding:'5px 2px',minHeight:54,background:tileBg,color:blobLocked?'rgba(255,255,255,0.55)':tileColor,fontSize:8,fontWeight:950,cursor:(blobLocked||puttBlocked)?'default':'pointer',lineHeight:1.05,opacity:puttBlocked?0.58:1}}><div style={{display:'grid',gridTemplateRows:'18px 18px',alignItems:'center',justifyItems:'center',minHeight:36}}><div style={{fontSize:15,lineHeight:1}}>{def.emoji}</div><div style={{whiteSpace:'nowrap'}}>{def.label}</div></div>{blobLocked&&<div style={{fontSize:7,color:autoBlob?'#90ccf0':'#8ea0ad',marginTop:1}}>{autoBlob?'AUTO':'AUTO ONLY'}</div>}</button>;
              })}</div>
            </div>;
          })}</div>
        </div>;
      })}</div>
    </div>
  </div>;
}

function TournamentsView({competitions,rounds,groups,scores,players,courses,sb,flash,setView,load,setSelectedRound,currentUser,isAdmin,cupUsers,cupEvents,cupTeams,cupEventPlayers,cupDays,cupMatches}){
  const[selectedDay,setSelectedDay]=useState(()=>{try{const d=parseInt(sessionStorage.getItem('cupReturnDay')||'');if(d){sessionStorage.removeItem('cupReturnDay');return d;}}catch(e){}return null;});
  const[showCupHandicaps,setShowCupHandicaps]=useState(false);
  const[showCupSummary,setShowCupSummary]=useState(false);
  const[showCupFinesSummary,setShowCupFinesSummary]=useState(false);
  const[selectedCupPlayerSummary,setSelectedCupPlayerSummary]=useState(null);
  const[selectedCupPlayerDetail,setSelectedCupPlayerDetail]=useState(null);
  const[activeFinesGroup,setActiveFinesGroup]=useState(null);
  const[cupRoundPlayers,setCupRoundPlayers]=useState([]);
  const[cupRefreshing,setCupRefreshing]=useState(false);
  useEffect(()=>{
    function handleCupBack(){
      if(activeFinesGroup){setActiveFinesGroup(null);return;}
      if(selectedCupPlayerDetail){setSelectedCupPlayerDetail(null);return;}
      if(selectedCupPlayerSummary){setSelectedCupPlayerSummary(null);return;}
      if(selectedDay){setSelectedDay(null);return;}
      if(showCupFinesSummary){setShowCupFinesSummary(false);return;}
      if(showCupSummary){setShowCupSummary(false);return;}
      if(showCupHandicaps){setShowCupHandicaps(false);return;}
      setView('home');
    }
    window.addEventListener('popstate',handleCupBack);
    return()=>window.removeEventListener('popstate',handleCupBack);
  },[selectedDay,showCupSummary,showCupFinesSummary,showCupHandicaps,selectedCupPlayerSummary,selectedCupPlayerDetail,activeFinesGroup]);
  function openCupDay(day){
    try{window.history.pushState({view:'tournaments',cupDay:day},'',null);}catch(e){}
    setSelectedCupPlayerDetail(null);
    setSelectedCupPlayerSummary(null);
    setShowCupSummary(false);
    setShowCupFinesSummary(false);
    setShowCupHandicaps(false);
    setSelectedDay(day);
  }
  function openCupFinesGroup(group){
    try{window.history.pushState({view:'tournaments',cupFines:true,cupDay:group&&group.day,cupGroup:group&&group.idx},'',null);}catch(e){}
    setActiveFinesGroup(group||null);
  }
  function openCupSummary(){
    try{window.history.pushState({view:'tournaments',cupSummary:true},'',null);}catch(e){}
    setSelectedCupPlayerDetail(null);
    setSelectedCupPlayerSummary(null);
    setSelectedDay(null);
    setShowCupHandicaps(false);
    setShowCupFinesSummary(false);
    setShowCupSummary(true);
  }
  function openCupFinesSummary(){
    try{window.history.pushState({view:'tournaments',cupFinesSummary:true},'',null);}catch(e){}
    setSelectedCupPlayerDetail(null);
    setSelectedCupPlayerSummary(null);
    setSelectedDay(null);
    setShowCupHandicaps(false);
    setShowCupSummary(false);
    setShowCupFinesSummary(true);
  }
  function openCupPlayerSummary(p){
    try{window.history.pushState({view:'tournaments',cupPlayer:p&&p.id},'',null);}catch(e){}
    setSelectedCupPlayerDetail(null);
    setSelectedCupPlayerSummary(p||null);
  }
  function openCupPlayerDetail(daySummary){
    try{window.history.pushState({view:'tournaments',cupPlayerDetail:daySummary&&daySummary.day},'',null);}catch(e){}
    setSelectedCupPlayerDetail(daySummary||null);
  }
  function openCupHandicaps(){
    try{window.history.pushState({view:'tournaments',cupHandicaps:true},'',null);}catch(e){}
    setSelectedCupPlayerDetail(null);
    setSelectedCupPlayerSummary(null);
    setSelectedDay(null);
    setShowCupSummary(false);
    setShowCupFinesSummary(false);
    setShowCupHandicaps(true);
  }
  function openCupHome(){
    try{window.history.pushState({view:'tournaments',cupHome:true},'',null);}catch(e){}
    setActiveFinesGroup(null);
    setSelectedCupPlayerDetail(null);
    setSelectedCupPlayerSummary(null);
    setSelectedDay(null);
    setShowCupSummary(false);
    setShowCupFinesSummary(false);
    setShowCupHandicaps(false);
  }
  async function refreshCupPage(){
    if(cupRefreshing)return;
    setCupRefreshing(true);
    try{
      if(load)await load();
      flash&&flash('Snyder Cup refreshed');
    }catch(e){
      flash&&flash('Cup refresh failed: '+(e&&e.message?e.message:String(e)),'error');
    }finally{
      setCupRefreshing(false);
    }
  }
  function goBackOnePage(){
    if(window.history&&window.history.length>1)window.history.back();
    else if(activeFinesGroup)setActiveFinesGroup(null);
    else if(selectedCupPlayerDetail)setSelectedCupPlayerDetail(null);
    else if(selectedCupPlayerSummary)setSelectedCupPlayerSummary(null);
    else if(showCupHandicaps)setShowCupHandicaps(false);
    else if(showCupFinesSummary)setShowCupFinesSummary(false);
    else if(showCupSummary)setShowCupSummary(false);
    else if(selectedDay)setSelectedDay(null);
    else setView('home');
  }
  const cup=(cupEvents||[])[0];
  const teams=cup?getCupTeams(cup,cupTeams):null;
  const playersInCup=(cupEventPlayers||[]).filter(p=>cup&&p.cup_id===cup.id);
  const matches=(cupMatches||[]).filter(m=>cup&&m.cup_id===cup.id);
  const days=(cupDays||[]).filter(d=>cup&&d.cup_id===cup.id);
  const cupDayNumbers=Array.from(new Set([1,2,3,...days.map(d=>parseInt(d.day_number)||1),...matches.map(m=>parseInt(m.day_number)||1)])).filter(Boolean).sort((a,b)=>a-b);
  const matchesByDay=groupCupMatchesByDay(matches,cupDayNumbers.map(day_number=>({day_number})));
  const[openingGroup,setOpeningGroup]=useState(null);
  const cupTitle=(cup&&cup.name)||'Snyder Cup 2026';
  const cupRoundName=(day,idx)=>cupTitle+' Day '+day+' Group '+idx;
  const roundForGroup=(day,idx)=>(rounds||[]).find(r=>r.name===cupRoundName(day,idx)||r.name==='Synder Cup Day '+day+' Group '+idx);
  useEffect(()=>{
    let alive=true;
    const cupRoundIds=(rounds||[]).filter(r=>r&&((String(r.name||'').startsWith(cupTitle+' Day '))||String(r.name||'').startsWith('Synder Cup Day '))).map(r=>r.id).filter(Boolean);
    if(!cupRoundIds.length){setCupRoundPlayers([]);return()=>{alive=false;};}
    sb.from('cup_round_players').select('*').in('round_id',cupRoundIds).then(({data,error})=>{
      if(!alive)return;
      if(error){console.warn('Cup round players load failed',error);setCupRoundPlayers([]);return;}
      setCupRoundPlayers(data||[]);
    });
    return()=>{alive=false;};
  },[cup&&cup.id,rounds&&rounds.length,cupTitle]);
  const findCupPlayer=id=>(playersInCup||[]).find(p=>p.id===id||p.user_id===id||p.guest_id===id)||null;
  function cupTeamName(key){return (teams&&teams[key]&&teams[key].name)||(CUP_THEME[key]&&CUP_THEME[key].name)||'Team';}
  function teamKeyForCupPlayer(id){const p=findCupPlayer(id);return (p&&p.team_key)||'gold';}
  function sideTeamKey(ids){
    const counts={};
    (ids||[]).forEach(id=>{const k=teamKeyForCupPlayer(id);counts[k]=(counts[k]||0)+1;});
    return Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0]||'gold';
  }
  function cupScoreIds(id){
    const p=findCupPlayer(id);
    return [id,p&&p.id,p&&p.user_id,p&&p.guest_id,p&&p.round_player_id,p&&p.cup_player_id].filter(Boolean).map(normaliseId);
  }
  function cupScoreIdsForRound(round,p){
    const ids=new Set();
    const add=id=>{const key=normaliseId(id);if(key)ids.add(key);};
    if(p){
      add(p.id);add(p.user_id);add(p.guest_id);add(p.round_player_id);add(p.cup_player_id);
      cupScoreIds(cupStablePlayerId(p)).forEach(add);
    }
    const targetName=String(cupDisplayName(p)||'').trim().toLowerCase();
    if(round&&targetName){
      (cupRoundPlayers||[]).forEach(rp=>{
        if(!rp||rp.round_id!==round.id)return;
        const rpName=String(rp.display_name||rp.name||'').trim().toLowerCase();
        if(rpName&&rpName===targetName){
          add(rp.id);add(rp.user_id);add(rp.guest_id);add(rp.cup_player_id);add(rp.round_player_id);
        }
      });
    }
    return [...ids];
  }
  function playerPointsFromRound(round,playerId){
    if(!round)return 0;
    const p=findCupPlayer(playerId);
    return cupPlayerScoreRowsForRound(round,p||{id:playerId}).reduce((t,s)=>t+stablefordPointsValue(s.stableford_points),0);
  }
  function cupDayFromRound(round){
    if(!round)return 1;
    const direct=parseInt(round.day_number);
    if(direct)return direct;
    const m=String(round.name||'').match(/Day\s+(\d+)/i);
    return m?(parseInt(m[1])||1):1;
  }
  function cupRoundBasePlayingShots(round,p,course){
    if(!round||!p)return cupPlayerBasePlayingShotsForCourse(p,course);
    const ids=new Set(cupScoreIds(cupStablePlayerId(p)));
    cupScoreIdsForRound(round,p).forEach(id=>ids.add(normaliseId(id)));
    ids.add(normaliseId(p.id));
    ids.add(normaliseId(p.user_id));
    ids.add(normaliseId(p.guest_id));
    ids.add(normaliseId(p.cup_player_id));
    ids.add(normaliseId(p.round_player_id));
    const rdGroup=(groups||[]).find(g=>g&&g.round_id===round.id);
    const hmap=(rdGroup&&rdGroup.playing_handicaps)||{};
    for(const id of ids){
      if(id&&hmap[id]!=null&&hmap[id]!==''&&!Number.isNaN(parseFloat(hmap[id])))return parseFloat(hmap[id])||0;
    }
    if(p.playing_handicap!=null&&p.playing_handicap!==''&&!Number.isNaN(parseFloat(p.playing_handicap))&&parseFloat(p.playing_handicap)>0)return parseFloat(p.playing_handicap)||0;
    if(p.current_handicap!=null&&p.current_handicap!==''&&!Number.isNaN(parseFloat(p.current_handicap))&&parseFloat(p.current_handicap)>0)return parseFloat(p.current_handicap)||0;
    return cupPlayerBasePlayingShotsForCourse(p,course);
  }
  function cupAdjustedStablefordForScore(row,p,day,course,singlesPlayingShots){
    if(!row||!p)return 0;
    const gross=grossScoreValue(row.gross_score);
    if(gross<=0||isGivenGross(row.gross_score))return 0;
    const hole=parseInt(row.hole_number)||0;
    const courseHoles=(course&&Array.isArray(course.holes))?course.holes:[];
    const hd=courseHoles.find(x=>parseInt(x.hole)===hole)||{};
    const par=parseInt(hd.par)||parseInt(row.par)||0;
    const si=parseInt(hd.stroke_index)||parseInt(row.stroke_index)||hole||18;
    if(!par)return stablefordPointsValue(row.stableford_points);
    const hcp=Number.isFinite(parseFloat(singlesPlayingShots))?parseFloat(singlesPlayingShots):cupPlayerPlayingShotsForCourse(p,course,day);
    return calcStableford(gross,par,si,hcp)||0;
  }
  function playerAdjustedSinglesPointsFromRound(round,p,day){
    // Overall Singles must add up the same points the finished scorecard shows.
    // The day-of +/- singles adjustment is handled when the round players/shots are set up;
    // do not re-score from gross here, otherwise the home summary can drift from the card.
    if(!round||!p)return 0;
    return cupPlayerScoreRowsForRound(round,p).reduce((t,s)=>t+stablefordPointsValue(s.stableford_points),0);
  }
  function formatMatchplayShortLabel(winner,diff,remaining){
    const d=Math.abs(parseInt(diff)||0);
    const r=Math.max(0,parseInt(remaining)||0);
    if(!d)return 'A/S';
    if(r>0)return d+'&'+r;
    return d+' UP';
  }
  function matchResult(match,round){
    const goldIds=match.gold_player_ids||[];
    const navyIds=match.navy_player_ids||[];
    const leftTeamKey=sideTeamKey(goldIds);
    const rightTeamKey=sideTeamKey(navyIds);
    const complete=round&&isCompletedRound(round);
    const isDoubles=String(match.match_type||'').toLowerCase()==='doubles';
    const roundScores=(scores||[]).filter(s=>round&&s.round_id===round.id);
    const scoreIdsFor=id=>new Set(cupScoreIdsForRound(round,findCupPlayer(id)||{id}));
    const scoreRowForHole=(id,h)=>{
      const ids=scoreIdsFor(id);
      return roundScores.find(s=>ids.has(normaliseId(s.player_id))&&parseInt(s.hole_number)===parseInt(h))||null;
    };
    const netForHole=(id,h)=>{
      const row=scoreRowForHole(id,h);
      const p=findCupPlayer(id)||{id};
      const g=grossScoreValue(row&&row.gross_score);
      if(!row||g<=0)return null;
      const day=parseInt(match.day_number)||cupDayFromRound(round)||1;
      const matchCourse=resolveCupDayCourse(courses,days,cup&&cup.id,day);
      const courseHoles=(matchCourse&&Array.isArray(matchCourse.holes))?matchCourse.holes:[];
      const hd=courseHoles.find(x=>parseInt(x.hole)===parseInt(h))||{hole:h,stroke_index:parseInt(row.stroke_index)||h};
      const hcp=cupRoundBasePlayingShots(round,p,matchCourse);
      return g-shotsOnHole(hcp,hd.stroke_index);
    };
    if(isDoubles){
      let goldHoles=0,navyHoles=0,played=0,closedDiff=0,closedRemaining=0;
      for(let h=1;h<=18;h++){
        const gNets=goldIds.map(id=>netForHole(id,h)).filter(v=>v!==null&&v!==undefined);
        const nNets=navyIds.map(id=>netForHole(id,h)).filter(v=>v!==null&&v!==undefined);
        if(!gNets.length||!nNets.length)continue;
        played++;
        const g=Math.min(...gNets);
        const n=Math.min(...nNets);
        if(g<n)goldHoles++; else if(n<g)navyHoles++;
        const runningDiff=Math.abs(goldHoles-navyHoles);
        const runningRemaining=Math.max(0,18-played);
        if(!closedDiff&&runningDiff>runningRemaining){closedDiff=runningDiff;closedRemaining=runningRemaining;}
      }
      const diff=Math.abs(goldHoles-navyHoles);
      const winner=goldHoles===navyHoles?'tie':goldHoles>navyHoles?leftTeamKey:rightTeamKey;
      const shortLabel=!played?'A/S':winner==='tie'?'A/S':formatMatchplayShortLabel(winner,closedDiff||diff,closedDiff?closedRemaining:0);
      const label=!played?'A/S':winner==='tie'?'A/S':cupTeamName(winner)+' '+shortLabel;
      return{gold:goldHoles,navy:navyHoles,leftTeamKey,rightTeamKey,leftTeamName:cupTeamName(leftTeamKey),rightTeamName:cupTeamName(rightTeamKey),holes:played,complete:!!complete,label,shortLabel,winner,pointsByTeam:winner==='tie'?{[leftTeamKey]:0.5,[rightTeamKey]:0.5}:{[winner]:1},isDoubles:true};
    }
    const gold=goldIds.reduce((t,id)=>t+playerPointsFromRound(round,id),0);
    const navy=navyIds.reduce((t,id)=>t+playerPointsFromRound(round,id),0);
    const holes=Math.max(...[...goldIds,...navyIds].map(id=>cupPlayerScoreRowsForRound(round,findCupPlayer(id)||{id}).length),0);
    const winner=!holes?'tie':gold===navy?'tie':gold>navy?leftTeamKey:rightTeamKey;
    const label=!holes?'A/S':winner==='tie'?'A/S':cupTeamName(winner)+' +'+Math.abs(gold-navy)+' pts';
    return{gold,navy,leftTeamKey,rightTeamKey,leftTeamName:cupTeamName(leftTeamKey),rightTeamName:cupTeamName(rightTeamKey),holes,complete:!!complete,label,winner,pointsByTeam:winner==='tie'?{[leftTeamKey]:0.5,[rightTeamKey]:0.5}:{[winner]:1},isDoubles:false};
  }
  function cupDayGroups(day){
    const dayMatches=matches.filter(m=>(parseInt(m.day_number)||1)===(parseInt(day)||1));
    const doubles=dayMatches.filter(m=>String(m.match_type||'').toLowerCase()==='doubles');
    const singles=dayMatches.filter(m=>String(m.match_type||'').toLowerCase()!=='doubles');
    const usedSingles=new Set();
    const groups=doubles.map((dbl,idx)=>{
      const ids=new Set([...(dbl.gold_player_ids||[]),...(dbl.navy_player_ids||[])].map(normaliseId));
      const linked=singles.filter(s=>{
        const sIds=[...(s.gold_player_ids||[]),...(s.navy_player_ids||[])].map(normaliseId);
        const ok=sIds.every(id=>ids.has(id));
        if(ok)usedSingles.add(s.id);
        return ok;
      });
      return{day,idx:idx+1,doubles:dbl,singles:linked,players:[...(dbl.gold_player_ids||[]),...(dbl.navy_player_ids||[])]};
    });
    singles.filter(s=>!usedSingles.has(s.id)).forEach((s,i)=>groups.push({day,idx:groups.length+1,doubles:null,singles:[s],players:[...(s.gold_player_ids||[]),...(s.navy_player_ids||[])]}));
    return groups;
  }
  function teamPoints(){
    const totals={gold:0,navy:0,red:0};
    const projected={gold:0,navy:0,red:0};
    matchesByDay.forEach(dayGroup=>cupDayGroups(dayGroup.day).forEach(group=>{
      const rd=roundForGroup(group.day,group.idx);
      [group.doubles,...group.singles].filter(Boolean).filter(isCupTeamScoringMatch).forEach(match=>{
        const res=matchResult(match,rd);
        if(res.complete&&res.pointsByTeam)Object.keys(res.pointsByTeam).forEach(k=>{totals[k]=(totals[k]||0)+(parseFloat(res.pointsByTeam[k])||0);});
        if(res.winner&&res.winner!=='tie')projected[res.winner]=(projected[res.winner]||0)+1;
      });
    }));
    return{...totals,projected,bonusRows:[]};
  }
  const teamTotals=teamPoints();
  const goldPts=teamTotals.gold;
  const navyPts=teamTotals.navy;
  const redPts=teamTotals.red;
  function cupScoreSummary(){return{gold:goldPts,navy:navyPts,red:redPts,goldName:teams&&teams.gold&&teams.gold.name||'Team LIV',navyName:teams&&teams.navy&&teams.navy.name||'Team Boring',redName:teams&&teams.red&&teams.red.name||'The Stags'};}
  function fmtCupPoint(v){const n=parseFloat(v)||0;return Number.isInteger(n)?String(n):String(n).replace(/\.0$/,'');}
  function cupResultsSummaryRows(){
    const rows=[];
    matchesByDay.forEach(dayGroup=>cupDayGroups(dayGroup.day).forEach(group=>{
      const rd=roundForGroup(group.day,group.idx);
      [group.doubles,...group.singles].filter(Boolean).filter(isCupTeamScoringMatch).forEach(match=>{
        const res=matchResult(match,rd);
        const isDoubles=String(match.match_type||'').toLowerCase()==='doubles';
        const leftTeamKey=res.leftTeamKey||sideTeamKey(match.gold_player_ids||[]);
        const rightTeamKey=res.rightTeamKey||sideTeamKey(match.navy_player_ids||[]);
        const goldNames=(match.gold_player_ids||[]).map(id=>cupDisplayName(findCupPlayer(id))).filter(Boolean).join(' / ');
        const navyNames=(match.navy_player_ids||[]).map(id=>cupDisplayName(findCupPlayer(id))).filter(Boolean).join(' / ');
        rows.push({day:dayGroup.day,group:group.idx,groupData:group,match,type:isDoubles?'Doubles':'Singles',goldNames,navyNames,leftTeamKey,rightTeamKey,result:res,round:rd,finished:rd&&isCompletedRound(rd)});
      });
    }));
    return rows.sort((a,b)=>a.day-b.day||a.group-b.group||String(a.type).localeCompare(String(b.type)));
  }
  function cupDayContext(day){
    const dayGroups=cupDayGroups(day);
    return {
      _cupDayNumber: day,
      _cupDayReleased: dayReleased(day),
      _cupDayAllPlayers: playersInCup,
      _cupDayRounds: dayGroups.map(g=>roundForGroup(g.day,g.idx)).filter(Boolean),
      _cupDayGroups: dayGroups
    };
  }
  function cupPlayerEgHandicap(p){
    return parseFloat((p&&(p.handicap??p.eg_handicap??p.current_handicap??p.playing_handicap))??0)||0;
  }
  function cupPlayerBasePlayingShotsForCourse(p,course){
    const eg=cupPlayerEgHandicap(p);
    return course?calcPlayingHandicap(eg,course,1):Math.round(eg);
  }
  function cupDayRounds(day){
    return cupDayGroups(day).map(g=>roundForGroup(g.day,g.idx)).filter(Boolean);
  }
  function isCupDayComplete(day){
    const groupsForDay=cupDayGroups(day);
    if(!groupsForDay.length)return false;
    return groupsForDay.every(g=>{const rd=roundForGroup(g.day,g.idx);return rd&&isCompletedRound(rd);});
  }
  function cupDaySinglesRows(day){
    const dayRounds=cupDayRounds(day);
    return (playersInCup||[]).map(p=>{
      const total=dayRounds.reduce((t,r)=>t+playerAdjustedSinglesPointsFromRound(r,p,day),0);
      return {...p,total};
    }).sort((a,b)=>(b.total||0)-(a.total||0)||String(cupDisplayName(a)).localeCompare(String(cupDisplayName(b))));
  }
  function cupDaySinglesResult(day){
    if(!isCupDayComplete(day))return null;
    const rows=cupDaySinglesRows(day);
    if(!rows.length)return null;
    const top=rows[0];
    const bottom=rows[rows.length-1];
    return {winner:top,loser:bottom,winnerId:normaliseId(cupStablePlayerId(top)),loserId:normaliseId(cupStablePlayerId(bottom))};
  }
  function cupPlayerAdjustmentForDay(p,day){
    const n=parseInt(day)||1;
    if(n<=1)return 0;
    const pid=normaliseId(cupStablePlayerId(p));
    const previous=cupDaySinglesResult(n-1);
    if(!previous||!pid)return 0;
    let adjustment=0;
    if(pid===previous.winnerId)adjustment=-1;
    if(pid===previous.loserId)adjustment=1;
    if(n===3&&adjustment!==0){
      const dayOne=cupDaySinglesResult(1);
      if(dayOne){
        if(adjustment<0&&pid===dayOne.winnerId)adjustment=-2;
        if(adjustment>0&&pid===dayOne.loserId)adjustment=2;
      }
    }
    return adjustment;
  }
  function cupPlayerPlayingShotsForCourse(p,course,day){
    const base=cupPlayerBasePlayingShotsForCourse(p,course);
    const adjustment=cupPlayerAdjustmentForDay(p,day);
    return Math.max(0,base+adjustment);
  }
  function cupDayHandicapCards(){
    return cupDayNumbers.map(day=>{
      const course=resolveCupDayCourse(courses,days,cup&&cup.id,day);
      const courseName=course?(cleanCourseName(course.name)||course.name||'Course selected'):'No course selected';
      const tee=course&&(course.tee||courseTeeFromName(course.name));
      const slope=course&&parseFloat(course.slope_rating);
      const rating=course&&parseFloat(course.course_rating);
      const rows=[...(playersInCup||[])].sort((a,b)=>String(a.team_key||'').localeCompare(String(b.team_key||''))||String(cupDisplayName(a)).localeCompare(String(cupDisplayName(b)))).map(p=>{
        const eg=cupPlayerEgHandicap(p);
        const doubles=cupPlayerBasePlayingShotsForCourse(p,course);
        const adjustment=cupPlayerAdjustmentForDay(p,day);
        const singles=Math.max(0,doubles+adjustment);
        return {...p,_eg:eg,_doublesShots:doubles,_singlesAdjustment:adjustment,_singlesShots:singles};
      });
      return {day,course,courseName,tee,slope,rating,rows};
    });
  }
  const leading=CUP_TEAM_KEYS.reduce((best,k)=>parseFloat(teamTotals[k]||0)>parseFloat(teamTotals[best]||0)?k:best,'gold');
  const tiedLead=CUP_TEAM_KEYS.filter(k=>parseFloat(teamTotals[k]||0)===parseFloat(teamTotals[leading]||0));
  const summaryScoreBg=tiedLead.length>1?'linear-gradient(90deg,rgba(212,175,55,0.72),rgba(37,99,235,0.66))':(leading==='gold'?'linear-gradient(90deg,rgba(212,175,55,0.98),rgba(146,96,10,0.92))':'linear-gradient(90deg,rgba(37,99,235,0.96),rgba(8,24,61,0.97))');
  const cupScoreBannerBg=summaryScoreBg;
  const cupFineGrandTotal=(rounds||[]).filter(r=>r&&((String(r.name||'').startsWith(cupTitle+' Day '))||String(r.name||'').startsWith('Synder Cup Day '))).reduce((t,r)=>t+cupFineTotalForRound(r,scores),0);
  function cupFineTotalForRoundAndPlayer(round,p){
    if(!round||!p)return 0;
    const ids=new Set(cupScoreIds(cupStablePlayerId(p)));
    ids.add(normaliseId(p.id));
    ids.add(normaliseId(p.user_id));
    ids.add(normaliseId(p.guest_id));
    const roundScores=(scores||[]).filter(sc=>sc&&sc.round_id===round.id);
    const fineRows=roundScores.filter(isFineScoreRow);
    let total=fineRows.reduce((t,sc)=>{
      const parsed=parseFineScoreRow(sc);
      return parsed&&ids.has(normaliseId(parsed.pid))?t+fineAmount(parsed.key,parseInt(sc.gross_score)||0):t;
    },0);
    const storedBlobKeys=new Set(fineRows.map(sc=>{
      const parsed=parseFineScoreRow(sc);
      return parsed&&parsed.key==='blob'&&ids.has(normaliseId(parsed.pid))?normaliseId(parsed.pid)+'|'+(parseInt(parsed.hole)||0):null;
    }).filter(Boolean));
    roundScores.filter(sc=>!isMetaScoreRow(sc)&&ids.has(normaliseId(sc.player_id))&&stablefordPointsValue(sc.stableford_points)===0).forEach(sc=>{
      const h=parseInt(sc.hole_number)||0;
      const blobAlreadyStored=[...ids].some(id=>storedBlobKeys.has(normaliseId(id)+'|'+h));
      if(!blobAlreadyStored)total+=fineAmount('blob',1);
    });
    return total;
  }
  function cupFinesSummaryRows(){
    return [...(playersInCup||[])].sort((a,b)=>String(cupDisplayName(a)).localeCompare(String(cupDisplayName(b)))).map(p=>{
      const daysMap={};
      cupDayNumbers.forEach(day=>{
        daysMap[day]=cupDayGroups(day).map(g=>roundForGroup(g.day,g.idx)).filter(Boolean).reduce((t,rd)=>t+cupFineTotalForRoundAndPlayer(rd,p),0);
      });
      const total=Object.values(daysMap).reduce((t,v)=>t+(parseInt(v)||0),0);
      return {...p,_fineDays:daysMap,_fineTotal:total};
    }).sort((a,b)=>(b._fineTotal||0)-(a._fineTotal||0)||String(cupDisplayName(a)).localeCompare(String(cupDisplayName(b))));
  }
  function singlesLeaderboard(){
    // Cup home overall singles is live: include every saved score row from every Cup day,
    // not just finished days, so the home screen moves as scores are entered.
    return (playersInCup||[]).map(p=>{
      const dayScores=cupDayNumbers.map(day=>{
        const dayRounds=cupRoundsForDay(day);
        const points=dayRounds.reduce((t,r)=>t+playerAdjustedSinglesPointsFromRound(r,p,day),0);
        const holesForDay=dayRounds.reduce((t,r)=>t+cupPlayerScoreRowsForRound(r,p).filter(s=>{
          const h=parseInt(s&&s.hole_number);
          return h>=1&&h<=18;
        }).length,0);
        return{day,points,holes:holesForDay,finished:dayRounds.some(isCompletedRound),live:dayRounds.some(r=>r&&!isCompletedRound(r))};
      });
      const total=dayScores.reduce((sum,d)=>sum+(parseInt(d.points)||0),0);
      const holes=dayScores.reduce((sum,d)=>sum+(parseInt(d.holes)||0),0);
      return{...p,total,holes,dayScores};
    }).sort((a,b)=>(b.total||0)-(a.total||0)||String(cupDisplayName(a)).localeCompare(String(cupDisplayName(b))));
  }
  function cupRoundsForDay(day){
    return cupDayGroups(day).map(g=>roundForGroup(g.day,g.idx)).filter(Boolean);
  }
  function cupPlayerScoreRowsForRound(rd,p){
    if(!rd||!p)return[];
    const ids=new Set(cupScoreIdsForRound(rd,p));
    const byHole={};
    (scores||[]).forEach((s,idx)=>{
      if(!s||s.round_id!==rd.id||isMetaScoreRow(s)||!ids.has(normaliseId(s.player_id)))return;
      const h=parseInt(s.hole_number);
      if(h<1||h>18)return;
      byHole[h]={...s,_idx:idx};
    });
    return Object.values(byHole).sort((a,b)=>(parseInt(a.hole_number)||0)-(parseInt(b.hole_number)||0)).map(({_idx,...row})=>row);
  }
  function cupPlayerDayScoreSummary(p,day){
    const dayRounds=cupRoundsForDay(day);
    const rows=dayRounds.flatMap(rd=>cupPlayerScoreRowsForRound(rd,p));
    const byHole={};
    rows.forEach(s=>{const h=parseInt(s.hole_number);if(h)byHole[h]=s;});
    const course=(dayRounds[0]&&(courses.find(co=>co.id===dayRounds[0].course_id)||findCourseForTee(courses,dayRounds[0].course_name,dayRounds[0].tee)))||resolveCupDayCourse(courses,days,cup&&cup.id,day)||null;
    const courseHoles=(course&&Array.isArray(course.holes))?course.holes:[];
    const courseName=course?(cleanCourseName(course.name)||course.name||'Course'):'Course';
    const tee=course&&(course.tee||courseTeeFromName(course.name));
    const sumRange=(from,to,field)=>{let total=0;for(let h=from;h<=to;h++){const r=byHole[h];if(!r)continue;if(field==='gross'){total+=grossScoreValue(r.gross_score);}else total+=stablefordPointsValue(r.stableford_points);}return total;};
    const hasGivenRange=(from,to)=>{for(let h=from;h<=to;h++){const r=byHole[h];if(r&&isGivenGross(r.gross_score))return true;}return false;};
    const parRange=(from,to)=>{let total=0;for(let h=from;h<=to;h++){const r=byHole[h];if(!r)continue;const hd=courseHoles.find(x=>parseInt(x.hole)===h);total+=parseInt(hd&&hd.par)||0;}return total;};
    const holes=Object.keys(byHole).map(Number).filter(Boolean).sort((a,b)=>a-b);
    return {
      day,
      course,
      courseHoles,
      courseName,
      tee,
      finished:cupRoundsForDay(day).some(isCompletedRound),
      holes:holes.length,
      frontGross:sumRange(1,9,'gross'),
      backGross:sumRange(10,18,'gross'),
      totalGross:sumRange(1,18,'gross'),
      frontGrossDisplay:grossTotalDisplay(sumRange(1,9,'gross'),hasGivenRange(1,9)),
      backGrossDisplay:grossTotalDisplay(sumRange(10,18,'gross'),hasGivenRange(10,18)),
      totalGrossDisplay:grossTotalDisplay(sumRange(1,18,'gross'),hasGivenRange(1,18)),
      frontOverPar:overParDisplay(sumRange(1,9,'gross'),parRange(1,9)),
      backOverPar:overParDisplay(sumRange(10,18,'gross'),parRange(10,18)),
      totalOverPar:overParDisplay(sumRange(1,18,'gross'),parRange(1,18)),
      frontStableford:sumRange(1,9,'stableford'),
      backStableford:sumRange(10,18,'stableford'),
      totalStableford:sumRange(1,18,'stableford'),
      byHole
    };
  }
  function cupPlayerAllDaySummaries(p){
    return cupDayNumbers.map(day=>cupPlayerDayScoreSummary(p,day)).filter(d=>d.holes>0||d.finished);
  }
  const dayReleased=day=>{
    const rows=matches.filter(m=>(parseInt(m.day_number)||1)===(parseInt(day)||1));
    return rows.length>0&&rows.some(m=>String(m.status||'locked').toLowerCase()==='live'||String(m.status||'').toLowerCase()==='released');
  };
  function cupDisplayName(p){
    return (p&&(p.display_name||p.name||p.username||p.full_name))||'Player';
  }
  function cupStablePlayerId(p){
    // For Cup scoring, the safest stable id is the Snyder Cup player row id.
    // Do not use user_id by default here: cup_round_players.user_id has a DB FK to cup_users,
    // and some Cup players can be manual/legacy rows where user_id is absent or not valid for that FK.
    return p&&(p.id||p.guest_id||p.user_id);
  }
  function validCupUserId(id){
    const key=normaliseId(id);
    return !!key&&(cupUsers||[]).some(u=>normaliseId(u.id)===key);
  }
  function cupRoundPlayerPayload(rd,p,courseForDay,day){
    const pid=cupStablePlayerId(p);
    const nm=cupDisplayName(p);
    // Cup player handicap is the England Golf / WHS handicap index.
    // Playing shots for the scorecard are calculated from that day's course slope/rating.
    const egHandicap=parseFloat((p&&(p.handicap??p.eg_handicap??p.current_handicap??p.playing_handicap))??0)||0;
    // Team scorecards always use the full course playing handicap.
    // Singles-only shot adjustments are applied only in Overall Singles totals/summaries.
    const playingShots=cupPlayerBasePlayingShotsForCourse(p,courseForDay);
    // Cup scorecards must not depend on user_id or guest_id foreign keys.
    // Cup players can be manual entries, legacy rows or linked users from different tables.
    // We save the display name/playing handicap here, then use the generated cup_round_players.id as the score id.
    return{
      round_id:rd.id,
      user_id:null,
      guest_id:null,
      display_name:nm,
      playing_handicap:playingShots,
      is_host:normaliseId(pid)===normaliseId(currentUser&&currentUser.id)
    };
  }
  function cupPlayersForGroup(group){
    const ids=[...(group&&group.players||[]),...((group&&group.doubles&&group.doubles.gold_player_ids)||[]),...((group&&group.doubles&&group.doubles.navy_player_ids)||[]),...((group&&group.singles||[]).flatMap(m=>[...(m.gold_player_ids||[]),...(m.navy_player_ids||[])]))];
    const seen=new Set();
    return ids.map(id=>findCupPlayer(id)).filter(Boolean).filter(p=>{const key=normaliseId(cupStablePlayerId(p));if(seen.has(key))return false;seen.add(key);return true;});
  }
  function cupScoreGroupFromRoundRows(rd,roundRows,originalPlayers){
    const originals=(originalPlayers||[]);
    const byName={};
    originals.forEach(p=>{byName[String(cupDisplayName(p)).trim().toLowerCase()]=p;});
    const participants=(roundRows||[]).map(rp=>{
      // Cup scorecards score against cup_round_players.id because it is guaranteed to exist in this table.
      // We keep a local cup_player_id mapping for match/team calculations, but do not depend on extra DB columns.
      const original=byName[String(rp.display_name||'').trim().toLowerCase()]||null;
      const stableCupId=original&&cupStablePlayerId(original);
      const pid=stableCupId||rp.id;
      const h=parseFloat(rp.playing_handicap||0)||0;
      const nm=rp.display_name||cupDisplayName(original)||'Player';
      return{id:pid,name:nm,display_name:nm,current_handicap:h,handicap:h,playing_handicap:h,user_id:(original&&original.user_id)||rp.user_id||null,guest_id:(original&&original.guest_id)||rp.guest_id||null,round_player_id:rp.id,cup_player_id:stableCupId||null,is_host:!!rp.is_host};
    });
    const playerIds=participants.map(p=>p.id).filter(Boolean);
    const playingHcps={};participants.forEach(p=>{playingHcps[p.id]=parseFloat(p.playing_handicap||0)||0;});
    const cupPlayerMap={};participants.forEach(p=>{if(p.cup_player_id)cupPlayerMap[normaliseId(p.cup_player_id)]=p.id;});
    return{round_id:rd&&rd.id,group_number:1,player_ids:playerIds,playing_handicaps:playingHcps,participants,_cupPlayerMap:cupPlayerMap};
  }
  async function ensureCupRoundRows(rd,matchPlayers,courseForDay,day){
    // Cup rounds are one scorecard per Cup group. Repair rows without wiping existing scores.
    // Older builds deleted cup_scores here, which is why scores disappeared when you left and re-opened.
    const wanted=(matchPlayers||[]).filter(Boolean);
    const wantedNames=wanted.map(p=>String(cupDisplayName(p)).trim().toLowerCase());
    let{data:existing,error:exErr}=await sb.from('cup_round_players').select('*').eq('round_id',rd.id);
    if(exErr)throw exErr;
    existing=existing||[];
    const used=new Set();
    const finalRows=[];
    for(let i=0;i<wanted.length;i++){
      const p=wanted[i];
      const nm=cupDisplayName(p);
      const key=String(nm).trim().toLowerCase();
      let row=existing.find(r=>!used.has(r.id)&&String(r.display_name||'').trim().toLowerCase()===key);
      if(!row){
        row=existing.find(r=>!used.has(r.id)&&(!r.display_name||String(r.display_name).trim().toLowerCase()==='player'));
      }
      if(!row){
        row=existing.find(r=>!used.has(r.id));
      }
      const payload=cupRoundPlayerPayload(rd,p,courseForDay,day);
      if(row){
        used.add(row.id);
        const upd=await sb.from('cup_round_players').update(payload).eq('id',row.id).select().single();
        if(upd.error)throw upd.error;
        finalRows.push(upd.data||{...row,...payload});
      }else{
        const ins=await sb.from('cup_round_players').insert(payload).select().single();
        if(ins.error)throw ins.error;
        finalRows.push(ins.data);
      }
    }
    // Remove any spare unused rows only if they have no scores attached, otherwise leave them harmlessly orphaned.
    for(const row of existing.filter(r=>!used.has(r.id)&&!wantedNames.includes(String(r.display_name||'').trim().toLowerCase()))){
      const{data:rowScores}=await sb.from('cup_scores').select('player_id').eq('round_id',rd.id).eq('player_id',row.id).limit(1);
      if(!rowScores||rowScores.length===0)await sb.from('cup_round_players').delete().eq('id',row.id);
    }
    const scoreGroup=cupScoreGroupFromRoundRows(rd,finalRows,wanted);
    await sb.from('cup_groups').delete().eq('round_id',rd.id);
    const made=await sb.from('cup_groups').insert({round_id:rd.id,group_number:1,player_ids:scoreGroup.player_ids,playing_handicaps:scoreGroup.playing_handicaps}).select().single();
    if(made.error)throw made.error;
    return{...made.data,participants:scoreGroup.participants,playing_handicaps:scoreGroup.playing_handicaps,player_ids:scoreGroup.player_ids,_cupPlayerMap:scoreGroup._cupPlayerMap};
  }
  async function openRoundForScoring(rd,group){
    const fallbackPlayers=cupPlayersForGroup(group);
    if(fallbackPlayers.length){
      const courseForDay=resolveCupDayCourse(courses,days,cup&&cup.id,group&&group.day||rd.day_number||1);
      const repaired=await ensureCupRoundRows(rd,fallbackPlayers,courseForDay,group&&group.day||rd.day_number||1);
      try{sessionStorage.setItem('cupReturnDay',String(group&&group.day||rd.day_number||1));}catch(e){}
      setSelectedRound({...rd,_cupScoring:true,_cupSummary:cupScoreSummary(),_cupGroupData:group,_cupTeams:teams,...cupDayContext(group&&group.day||rd.day_number||1),_group:repaired});
      setView('play');
      return;
    }
    let{data:rps,error:rpsErr}=await sb.from('cup_round_players').select('*').eq('round_id',rd.id);
    if(rpsErr)throw rpsErr;
    let scoreGroup=cupScoreGroupFromRoundRows(rd,rps||[],[]);
    const{data:rdGroups,error:gErr}=await sb.from('cup_groups').select('*').eq('round_id',rd.id).order('group_number',{ascending:true});
    if(gErr)throw gErr;
    let grp=(rdGroups&&rdGroups[0])||{round_id:rd.id,group_number:1,player_ids:scoreGroup.player_ids,playing_handicaps:scoreGroup.playing_handicaps};
    const validIds=new Set(scoreGroup.participants.map(p=>normaliseId(p.id)));
    const groupIds=(grp.player_ids||[]).map(normaliseId);
    if(!groupIds.length||groupIds.some(id=>!validIds.has(id))){grp={...grp,player_ids:scoreGroup.player_ids,playing_handicaps:scoreGroup.playing_handicaps};}
    try{sessionStorage.setItem('cupReturnDay',String(group&&group.day||rd.day_number||1));}catch(e){}
    setSelectedRound({...rd,_cupScoring:true,_cupSummary:cupScoreSummary(),_cupGroupData:group,_cupTeams:teams,...cupDayContext(group&&group.day||rd.day_number||1),_group:{...grp,participants:scoreGroup.participants,playing_handicaps:grp.playing_handicaps||scoreGroup.playing_handicaps,_cupPlayerMap:scoreGroup._cupPlayerMap}});
    setView('play');
  }
  async function openCupGroup(group){
    const firstMatch=group&&((group.doubles)||(group.singles&&group.singles[0]));
    const day=parseInt(group&&group.day)||parseInt(firstMatch&&firstMatch.day_number)||1;
    const openingKey=day+'-'+(group&&group.idx||1);
    if(!currentUser){flash('Sign in first to mark a Cup card','error');return;}
    if(!dayReleased(day)){flash('This day is locked until admin releases it','error');return;}
    const course=resolveCupDayCourse(courses,days,cup&&cup.id,day);
    if(!course){flash('Choose a course for Day '+day+' in Cup Admin before scoring','error');return;}
    if(!group||!firstMatch){flash('Add matches to this group first','error');return;}
    setOpeningGroup(openingKey);
    try{
      const matchName=cupRoundName(day,group.idx);
      const existing=roundForGroup(day,group.idx);
      const matchPlayers=cupPlayersForGroup(group);
      if(matchPlayers.length===0){flash('Add players to this match first','error');return;}
      if(existing){await openRoundForScoring(existing,group);return;}
      const joinCode=Math.random().toString(36).substring(2,6).toUpperCase();
      const roundPayload={name:matchName,course_id:safeCourseIdForDb(course,course.id),course_name:cleanCourseName(course.name)||course.name||'',status:'live',tee:course.tee||courseTeeFromName(course.name)||'White',day_number:day,join_code:joinCode,is_private:false,created_by:currentUser.id};
      let{data:rd,error:roundErr}=await sb.from('cup_rounds').insert(roundPayload).select().single();
      if(roundErr&&String(roundErr.message||'').toLowerCase().includes('course')){roundPayload.course_id=null;const retry=await sb.from('cup_rounds').insert(roundPayload).select().single();rd=retry.data;roundErr=retry.error;}
      if(roundErr)throw roundErr;
      const grp=await ensureCupRoundRows(rd,matchPlayers,course,day);
      try{sessionStorage.setItem('cupReturnDay',String(day));}catch(e){}
      setSelectedRound({...rd,_cupScoring:true,_cupSummary:cupScoreSummary(),_cupGroupData:group,_cupTeams:teams,...cupDayContext(day),_group:grp});
      setView('play');
      await load();
    }catch(e){
      console.error('Could not open Cup scorecard',e);
      flash('Could not open Cup scorecard: '+(e&&e.message?e.message:String(e)),'error');
      alert('Could not open Cup scorecard: '+(e&&e.message?e.message:String(e)));
    }finally{
      setOpeningGroup(null);
    }
  }
  async function openCupMatch(match){
    const day=parseInt(match&&match.day_number)||1;
    const group=cupDayGroups(day).find(g=>(g.doubles&&match&&g.doubles.id===match.id)||(g.singles||[]).some(s=>match&&s.id===match.id))||{day,idx:1,doubles:match,singles:[],players:[...((match&&match.gold_player_ids)||[]),...((match&&match.navy_player_ids)||[])]};
    await openCupGroup(group);
  }
  async function openCupResultRow(row){
    if(!row)return;
    const group=row.groupData||cupDayGroups(row.day).find(g=>parseInt(g.idx)===parseInt(row.group));
    try{
      if(row.round){
        try{sessionStorage.setItem('cupReturnDay',String(row.day||row.round.day_number||1));}catch(e){}
        await openRoundForScoring(row.round,group);
        return;
      }
      if(group){await openCupGroup(group);return;}
      if(row.match){await openCupMatch(row.match);return;}
      flash('Could not find that Cup scorecard','error');
    }catch(e){
      console.error('Could not open result scorecard',e);
      flash('Could not open scorecard: '+(e&&e.message?e.message:String(e)),'error');
    }
  }
  function CupBottomNav(){
    const days=[1,2,3];
    const navBtn=(label,onClick,active,sub)=> <button onClick={onClick} style={{border:'1px solid '+(active?'rgba(212,175,55,0.70)':'rgba(255,255,255,0.14)'),borderRadius:14,background:active?'linear-gradient(135deg,rgba(212,175,55,0.34),rgba(8,30,58,0.96))':'rgba(8,30,58,0.88)',color:'#fff',padding:'8px 4px',minHeight:50,display:'grid',placeItems:'center',gap:1,cursor:'pointer',boxShadow:active?'0 0 18px rgba(212,175,55,0.18)':'none'}}>
      <span style={{fontSize:14,fontWeight:950,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.08em',lineHeight:1}}>{label}</span>
      {sub&&<span style={{fontSize:8,color:active?'#F5E6A3':'#90ccf0',fontWeight:900,lineHeight:1}}>{sub}</span>}
    </button>;
    return <div style={{position:'fixed',left:10,right:10,bottom:10,zIndex:9000,border:'1px solid rgba(255,255,255,0.14)',borderRadius:18,background:'linear-gradient(180deg,rgba(2,8,23,0.94),rgba(8,30,58,0.96))',boxShadow:'0 18px 50px rgba(0,0,0,0.45)',backdropFilter:'blur(10px)',padding:7,display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:6}}>
      {navBtn('HOME',openCupHome,!selectedDay&&!showCupSummary&&!showCupFinesSummary&&!showCupHandicaps&&!selectedCupPlayerSummary&&!selectedCupPlayerDetail,'scores')}
      {days.map(d=>navBtn('DAY '+d,()=>openCupDay(d),parseInt(selectedDay)===d,'play'))}
      {navBtn('HCPS',openCupHandicaps,showCupHandicaps,'shots')}
    </div>;
  }
  const cupHandicapsPanel = (
    <div style={{border:'1px solid rgba(96,184,240,0.26)',borderRadius:14,background:'linear-gradient(135deg,rgba(0,112,187,0.28),rgba(8,30,58,0.92))',padding:'18px 16px',color:'#fff',margin:'16px 0 10px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:12}}>
              <span><span style={{display:'block',fontSize:24,fontWeight:950,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.08em'}}>HANDICAPS</span><span style={{fontSize:12,color:'#90ccf0'}}>Playing shots by Cup day</span></span>
              <span style={{fontSize:16,color:'#90ccf0',fontWeight:950}}>HC</span>
            </div>
            <div style={{display:'grid',gap:10}}>{cupDayHandicapCards().map(card=><div key={card.day} style={{...S.card,padding:12,background:'linear-gradient(135deg,rgba(15,23,42,0.92),rgba(0,112,187,0.10))'}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'flex-start',marginBottom:8}}>
                <div><div style={{fontSize:18,color:'#fff',fontWeight:950,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.08em'}}>DAY {card.day}</div><div style={{fontSize:12,color:'#90ccf0',fontWeight:800}}>{card.courseName}{card.tee?' - '+card.tee+' tee':''}</div></div>
                <div style={{textAlign:'right',fontSize:10,color:'#8ea0ad',lineHeight:1.35}}>{Number.isFinite(card.slope)?'Slope '+card.slope:''}{Number.isFinite(card.slope)&&Number.isFinite(card.rating)?<br/>:null}{Number.isFinite(card.rating)?'Rating '+card.rating:''}</div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 54px 70px 70px',gap:8,alignItems:'center',padding:'6px 0',borderTop:'1px solid rgba(255,255,255,0.08)',borderBottom:'1px solid rgba(255,255,255,0.08)',marginBottom:2}}>
                <div style={{fontSize:10,color:'#8ea0ad',fontWeight:950,letterSpacing:'0.08em'}}>PLAYER</div>
                <div style={{fontSize:10,color:'#8ea0ad',fontWeight:950,letterSpacing:'0.08em',textAlign:'center'}}>EG</div>
                <div style={{fontSize:10,color:'#8ea0ad',fontWeight:950,letterSpacing:'0.08em',textAlign:'center'}}>DOUBLES</div>
                <div style={{fontSize:10,color:'#8ea0ad',fontWeight:950,letterSpacing:'0.08em',textAlign:'center'}}>SINGLES</div>
              </div>
              <div style={{display:'grid',gap:6}}>{card.rows.map(p=>{const adjustment=p._singlesAdjustment||0;return <div key={card.day+'-'+p.id} style={{display:'grid',gridTemplateColumns:'1fr 54px 70px 70px',gap:8,alignItems:'center',borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:6}}>
                <div style={{fontSize:13,color:'#fff',fontWeight:900,textTransform:'uppercase',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cupDisplayName(p)}</div>
                <div style={{fontSize:11,color:'#8ea0ad',fontWeight:800,textAlign:'center'}}>{Number(p._eg||0).toFixed(1)}</div>
                <div title="Team match / doubles handicap" style={{minWidth:42,textAlign:'center',borderRadius:999,padding:'5px 8px',background:'rgba(96,184,240,0.13)',border:'1px solid rgba(96,184,240,0.26)',color:'#90ccf0',fontSize:13,fontWeight:950}}>{p._doublesShots}</div>
                <div title={adjustment?('Singles adjustment '+(adjustment>0?'+':'')+adjustment):'Singles handicap'} style={{minWidth:42,textAlign:'center',borderRadius:999,padding:'5px 8px',background:adjustment<0?'rgba(248,113,113,0.20)':adjustment>0?'rgba(52,211,153,0.18)':'rgba(212,175,55,0.16)',border:'1px solid '+(adjustment<0?'rgba(248,113,113,0.44)':adjustment>0?'rgba(52,211,153,0.38)':'rgba(212,175,55,0.34)'),color:adjustment<0?'#fecaca':adjustment>0?'#bbf7d0':'#F5E6A3',fontSize:13,fontWeight:950}}>{p._singlesShots}{adjustment?<span style={{fontSize:9,marginLeft:3}}>({adjustment>0?'+':''}{adjustment})</span>:null}</div>
              </div>;})}</div>
            </div>)}</div>
          </div>
  );
  if(activeFinesGroup){
    const rd=roundForGroup(activeFinesGroup.day,activeFinesGroup.idx);
    return <CupFinesCard group={activeFinesGroup} day={activeFinesGroup.day} round={rd} teams={teams} playersInCup={playersInCup} courses={courses} scores={scores} sb={sb} flash={flash} load={load} onClose={goBackOnePage}/>;
  }
  return <div style={{minHeight:'100vh',paddingBottom:80}}>
    <div style={{background:'linear-gradient(135deg,#064E3B,#042F2E)',padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid rgba(94,234,212,0.18)'}}><button onClick={goBackOnePage} style={{...S.gho,padding:'6px 12px',fontSize:13}}>Back</button><div style={{display:'flex',alignItems:'center',gap:8,fontSize:16,color:'#fff',fontWeight:900,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.12em'}}><span style={{color:'#D4AF37'}}>{EMOJI.trophy}</span><span>SNYDER CUP</span></div><div style={{width:60}}/></div>
    <div style={{padding:16}}>
      {!cup?<div style={{...S.card,textAlign:'center',padding:28}}><div style={{fontSize:18,color:'#fff',fontWeight:800,marginBottom:8}}>No Cup set up yet</div><div style={{fontSize:13,color:'#8ea0ad',marginBottom:14}}>Admin can create the Cup in the Admin Cup tab.</div>{isAdmin&&<button onClick={()=>setView('admin')} style={S.pri}>Open Admin</button>}</div>:<>
        {selectedCupPlayerDetail?(()=>{const p=selectedCupPlayerSummary;const d=selectedCupPlayerDetail;const rows=Array.from({length:18},(_,i)=>i+1).map(h=>{const hd=(d.courseHoles||[]).find(x=>parseInt(x.hole)===h)||{hole:h,par:'-',stroke_index:'-',yards:'-'};return {hole:h,hd,row:d.byHole[h]};});const totalPar=(d.courseHoles||[]).reduce((t,h)=>t+(parseInt(h.par)||0),0);const totalYards=(d.courseHoles||[]).reduce((t,h)=>t+(parseInt(h.yards)||0),0);return <>
          <div style={{fontSize:30,color:'#fff',fontWeight:950,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.06em',margin:'2px 0 8px'}}>{cupDisplayName(p)} - DAY {d.day}</div>
          <div style={{fontSize:12,color:'#8ea0ad',marginBottom:12}}>{d.courseName}{d.tee?' - '+d.tee+' tee':''}{totalPar?' - Par '+totalPar:''}{totalYards?' - '+totalYards+' yds':''}</div>
          <div style={{...S.card,padding:0,overflow:'hidden'}}>
            <div style={{display:'grid',gridTemplateColumns:'40px 40px 42px 56px 1fr 1fr',gap:6,padding:'9px 10px',borderBottom:'1px solid rgba(255,255,255,0.08)',color:'#8ea0ad',fontSize:10,fontWeight:950,letterSpacing:'0.06em',alignItems:'center'}}>
              <div>HOLE</div><div style={{textAlign:'center'}}>PAR</div><div style={{textAlign:'center'}}>SI</div><div style={{textAlign:'center'}}>YDS</div><div style={{textAlign:'center'}}>GROSS</div><div style={{textAlign:'center'}}>PTS</div>
            </div>
            {rows.map(({hole,hd,row})=><div key={hole} style={{display:'grid',gridTemplateColumns:'40px 40px 42px 56px 1fr 1fr',gap:6,padding:'9px 10px',borderBottom:hole<18?'1px solid rgba(255,255,255,0.06)':'none',alignItems:'center',background:hole%2===0?'rgba(255,255,255,0.025)':'transparent'}}>
              <div style={{fontSize:14,color:'#60b8f0',fontWeight:950}}>{hole}</div>
              <div style={{fontSize:13,color:'#fff',fontWeight:800,textAlign:'center'}}>{hd.par||'-'}</div>
              <div style={{fontSize:13,color:'#d4af37',fontWeight:900,textAlign:'center'}}>{hd.stroke_index||'-'}</div>
              <div style={{fontSize:12,color:'#8ea0ad',fontWeight:800,textAlign:'center'}}>{hd.yards||'-'}</div>
              <div style={{fontSize:16,color:'#fff',fontWeight:950,textAlign:'center'}}>{row?grossDisplay(row.gross_score):'-'}</div>
              <div style={{fontSize:16,color:'#fff',fontWeight:950,textAlign:'center'}}>{row?stablefordPointsValue(row.stableford_points):'-'}</div>
            </div>)}
            <div style={{display:'grid',gridTemplateColumns:'40px 40px 42px 56px 1fr 1fr',gap:6,padding:'10px',borderTop:'1px solid rgba(96,184,240,0.24)',background:'rgba(96,184,240,0.10)',alignItems:'center'}}>
              <div style={{fontSize:12,color:'#60b8f0',fontWeight:950}}>TOT</div><div style={{fontSize:13,color:'#fff',fontWeight:950,textAlign:'center'}}>{totalPar||'-'}</div><div></div><div style={{fontSize:12,color:'#8ea0ad',fontWeight:900,textAlign:'center'}}>{totalYards||'-'}</div><div style={{textAlign:'center'}}><div style={{fontSize:17,color:'#fff',fontWeight:950}}>{grossTotalWithOverParText(d.totalGrossDisplay||d.totalGross,d.totalOverPar)}</div></div><div style={{fontSize:17,color:'#fff',fontWeight:950,textAlign:'center'}}>{d.totalStableford}</div>
            </div>
          </div>
        </>;})():selectedCupPlayerSummary?(()=>{const p=selectedCupPlayerSummary;const daysForPlayer=cupPlayerAllDaySummaries(p);return <>
          <div style={{fontSize:30,color:'#fff',fontWeight:950,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.06em',margin:'2px 0 8px'}}>{cupDisplayName(p)}</div>
          <div style={{fontSize:12,color:'#8ea0ad',marginBottom:12}}>Scores so far. Tap a day to see every hole.</div>
          <div style={{display:'grid',gap:10}}>{daysForPlayer.length?daysForPlayer.map(d=><button key={d.day} onClick={()=>openCupPlayerDetail(d)} style={{...S.card,width:'100%',textAlign:'left',cursor:'pointer',background:'linear-gradient(135deg,rgba(0,112,187,0.18),rgba(15,23,42,0.92))'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginBottom:8}}><div style={{fontSize:20,color:'#fff',fontWeight:950,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.08em'}}>DAY {d.day}</div><div style={{fontSize:11,color:d.finished?'#f8fafc':'#90ccf0',fontWeight:950}}>{d.finished?'FINISHED':'THRU '+d.holes}</div></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
              <div style={{border:'1px solid rgba(255,255,255,0.08)',borderRadius:12,padding:8,textAlign:'center'}}><div style={{fontSize:10,color:'#8ea0ad',fontWeight:900}}>FRONT 9</div><div style={{fontSize:17,color:'#fff',fontWeight:950}}>{grossTotalWithOverParText(d.frontGrossDisplay||d.frontGross,d.frontOverPar)}</div><div style={{fontSize:12,color:'#60b8f0',fontWeight:900}}>{d.frontStableford} pts</div></div>
              <div style={{border:'1px solid rgba(255,255,255,0.08)',borderRadius:12,padding:8,textAlign:'center'}}><div style={{fontSize:10,color:'#8ea0ad',fontWeight:900}}>BACK 9</div><div style={{fontSize:17,color:'#fff',fontWeight:950}}>{grossTotalWithOverParText(d.backGrossDisplay||d.backGross,d.backOverPar)}</div><div style={{fontSize:12,color:'#60b8f0',fontWeight:900}}>{d.backStableford} pts</div></div>
              <div style={{border:'1px solid rgba(96,184,240,0.20)',borderRadius:12,padding:8,textAlign:'center',background:'rgba(96,184,240,0.08)'}}><div style={{fontSize:10,color:'#8ea0ad',fontWeight:900}}>TOTAL</div><div style={{fontSize:17,color:'#fff',fontWeight:950}}>{grossTotalWithOverParText(d.totalGrossDisplay||d.totalGross,d.totalOverPar)}</div><div style={{fontSize:12,color:'#60b8f0',fontWeight:900}}>{d.totalStableford} pts</div></div>
            </div>
          </button>):<div style={{...S.card,color:'#8ea0ad',textAlign:'center'}}>No finished Cup scores found for this player yet.</div>}</div>
        </>;})():showCupFinesSummary?(()=>{const rows=cupFinesSummaryRows();return <>
          <div style={{fontSize:30,color:'#fff',fontWeight:950,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.06em',margin:'2px 0 8px'}}>FINES SUMMARY</div>
          <div style={{fontSize:12,color:'#8ea0ad',marginBottom:12}}>Every player's fines by Cup day, plus the running total.</div>
          <div style={{border:'1px solid rgba(212,175,55,0.30)',borderRadius:16,background:'linear-gradient(135deg,rgba(212,175,55,0.14),rgba(15,23,42,0.90))',padding:14,marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}><div><div style={{fontSize:11,color:'#F5E6A3',fontWeight:950,letterSpacing:'0.13em'}}>{EMOJI.moneyWings} TOTAL FINES POT</div><div style={{fontSize:11,color:'#90ccf0',fontWeight:800}}>All days and groups</div></div><div style={{fontSize:32,color:'#fff',fontWeight:950}}>{EMOJI.pound}{cupFineGrandTotal}</div></div>
          <div style={{...S.card,padding:0,overflow:'hidden'}}>
            <div style={{display:'grid',gridTemplateColumns:`1fr ${cupDayNumbers.map(()=> '54px').join(' ')} 64px`,gap:0,alignItems:'center',padding:'10px 10px',borderBottom:'1px solid rgba(255,255,255,0.10)',background:'rgba(255,255,255,0.04)'}}>
              <div style={{fontSize:10,color:'#8ea0ad',fontWeight:950,letterSpacing:'0.10em'}}>PLAYER</div>{cupDayNumbers.map(day=><div key={'head-'+day} style={{fontSize:10,color:'#8ea0ad',fontWeight:950,textAlign:'center'}}>D{day}</div>)}<div style={{fontSize:10,color:'#F5E6A3',fontWeight:950,textAlign:'right'}}>TOTAL</div>
            </div>
            {rows.map((p,i)=><div key={p.id||p.user_id||i} style={{display:'grid',gridTemplateColumns:`1fr ${cupDayNumbers.map(()=> '54px').join(' ')} 64px`,gap:0,alignItems:'center',padding:'11px 10px',borderTop:i?'1px solid rgba(255,255,255,0.07)':'none',background:i%2?'rgba(255,255,255,0.025)':'rgba(255,255,255,0.045)'}}>
              <div style={{fontSize:13,color:'#fff',fontWeight:950,textTransform:'uppercase',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cupDisplayName(p)}</div>{cupDayNumbers.map(day=><div key={(p.id||p.user_id||i)+'-'+day} style={{fontSize:13,color:(p._fineDays&&p._fineDays[day])?'#F5E6A3':'#8ea0ad',fontWeight:950,textAlign:'center'}}>{(p._fineDays&&p._fineDays[day])||0}</div>)}<div style={{fontSize:16,color:'#fff',fontWeight:950,textAlign:'right'}}>{EMOJI.pound}{p._fineTotal||0}</div>
            </div>)}
          </div>
        </>;})():showCupHandicaps?<>
          <div style={{fontSize:30,color:'#fff',fontWeight:950,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.06em',margin:'2px 0 14px'}}>HANDICAPS</div>
          {cupHandicapsPanel}
        </>:showCupSummary?<>
          <div style={{fontSize:30,color:'#fff',fontWeight:950,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.06em',margin:'2px 0 8px'}}>RESULTS SO FAR</div>
          <div style={{fontSize:12,color:'#8ea0ad',marginBottom:12}}>Tap Back to return to the main Snyder Cup page.</div>
          <div style={{borderRadius:20,padding:18,marginBottom:14,border:'1px solid rgba(255,255,255,0.22)',background:summaryScoreBg,boxShadow:'0 18px 42px rgba(0,0,0,0.30)',overflow:'hidden'}}>
            <div style={{display:'grid',gridTemplateColumns:`repeat(${CUP_TEAM_KEYS.length},1fr)`,gap:10,alignItems:'stretch'}}>{CUP_TEAM_KEYS.map(k=><div key={'summary-score-'+k} style={{border:'1px solid rgba(255,255,255,0.20)',borderRadius:14,background:'rgba(0,0,0,0.16)',padding:10,textAlign:'center'}}><CupTeamBadge teamKey={k} label={teams[k].name}/><div style={{fontSize:42,color:'#fff',fontWeight:950,lineHeight:1,marginTop:7,textShadow:'0 2px 14px rgba(0,0,0,0.38)'}}>{fmtCupPoint(teamTotals[k]||0)}</div></div>)}</div>
          </div>
          <div style={{display:'grid',gap:14}}>{cupDayNumbers.map(day=>{
            const dayRows=cupResultsSummaryRows().filter(r=>parseInt(r.day)===parseInt(day));
            if(!dayRows.length)return null;
            return <div key={'summary-day-'+day} style={{display:'grid',gap:8}}>
              <div style={{fontSize:18,color:'#fff',fontWeight:950,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.10em'}}>DAY {day}</div>
              {dayRows.map((row,i)=>{
                const res=row.result||{};
                const winner=res.winner;
                const leftKey=row.leftTeamKey||res.leftTeamKey||'gold';
                const rightKey=row.rightTeamKey||res.rightTeamKey||'navy';
                const tone=winner&&winner!=='tie'?CUP_THEME[winner]:null;
                const filled=!!tone&&res.holes>0;
                const isSingles=row.type==='Singles';
                const resultText=isSingles?'':(res.shortLabel||res.label||'A/S');
                const goldScore=isSingles?((res.gold||0)+' pts'):'';
                const navyScore=isSingles?((res.navy||0)+' pts'):'';
                const bg=filled?(winner==='gold'?'linear-gradient(135deg,rgba(212,175,55,0.96),rgba(120,74,7,0.94))':winner==='red'?'linear-gradient(135deg,rgba(220,38,38,0.96),rgba(69,10,10,0.94))':'linear-gradient(135deg,rgba(37,99,235,0.96),rgba(8,24,61,0.97))'):'rgba(255,255,255,0.04)';
                return <button key={'summary-row-'+day+'-'+i} onClick={()=>openCupResultRow(row)} style={{width:'100%',border:'1px solid '+(tone?tone.accent:'rgba(255,255,255,0.10)'),borderRadius:14,background:bg,padding:12,boxShadow:filled?'0 10px 22px rgba(0,0,0,0.26)':'none',cursor:'pointer',textAlign:'initial',color:'inherit'}}>
                  <div style={{display:'flex',justifyContent:'space-between',gap:8,marginBottom:6}}><div style={{fontSize:11,color:filled?'rgba(255,255,255,0.92)':'#60b8f0',fontWeight:950,letterSpacing:'0.12em'}}>{row.type.toUpperCase()}</div><div style={{fontSize:11,color:filled?'rgba(255,255,255,0.84)':'#8ea0ad',fontWeight:950}}>{row.finished?'FINISHED':'TAP TO OPEN'}</div></div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 54px 1fr',gap:8,alignItems:'center'}}>
                    <div style={{display:'grid',gap:4,textAlign:'right',minWidth:0}}><div style={{fontSize:18,color:filled?'#fff':CUP_THEME[leftKey].accent,fontWeight:950,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{row.goldNames||teams[leftKey].name}</div>{goldScore&&<div style={{fontSize:16,color:filled?'#fff':CUP_THEME[leftKey].accent,fontWeight:950}}>{goldScore}</div>}</div>
                    <div style={{display:'grid',gap:2,justifyItems:'center',alignItems:'center'}}>{resultText&&<div style={{fontSize:22,lineHeight:1,color:'#fff',fontWeight:950,textAlign:'center'}}>{resultText}</div>}<div style={{fontSize:18,lineHeight:1,color:'#fff',fontWeight:950}}>v</div></div>
                    <div style={{display:'grid',gap:4,textAlign:'left',minWidth:0}}><div style={{fontSize:18,color:filled?'#fff':CUP_THEME[rightKey].accent,fontWeight:950,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{row.navyNames||teams[rightKey].name}</div>{navyScore&&<div style={{fontSize:16,color:filled?'#fff':CUP_THEME[rightKey].accent,fontWeight:950}}>{navyScore}</div>}</div>
                  </div>
                </button>;
              })}
            </div>;
          })}</div>
        </>:!selectedDay?<>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,margin:'2px 0 14px'}}>
            <div style={{fontSize:30,color:'#fff',fontWeight:950,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.06em',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cupTitle}</div>
            <div aria-label="Portugal" title="Portugal" style={{width:36,height:36,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',flex:'0 0 auto',fontSize:24,background:'rgba(255,255,255,0.10)',border:'1px solid rgba(255,255,255,0.20)',boxShadow:'0 8px 18px rgba(0,0,0,0.22)',overflow:'hidden'}}>{EMOJI.portugalFlag}</div>
            <button onClick={refreshCupPage} disabled={cupRefreshing} style={{flex:'0 0 auto',border:'1px solid rgba(96,184,240,0.32)',borderRadius:999,background:'rgba(0,112,187,0.16)',padding:'7px 10px',display:'inline-flex',alignItems:'center',gap:6,cursor:cupRefreshing?'default':'pointer',color:'#90ccf0',fontSize:11,fontWeight:950,opacity:cupRefreshing?0.65:1}}>Refresh</button>
            <button onClick={openCupFinesSummary} aria-label={'Open fines table, total '+EMOJI.pound+cupFineGrandTotal} style={{flex:'0 0 auto',border:'1px solid rgba(212,175,55,0.38)',borderRadius:999,background:'linear-gradient(135deg,rgba(212,175,55,0.22),rgba(15,23,42,0.80))',padding:'7px 11px',display:'inline-flex',alignItems:'center',gap:7,cursor:'pointer',boxShadow:'0 8px 20px rgba(0,0,0,0.20)'}}>
              <span style={{fontSize:14,lineHeight:1,color:'#F5E6A3',fontWeight:950}}>{EMOJI.moneyWings}</span>
              <span style={{fontSize:11,lineHeight:1,color:'#F5E6A3',fontWeight:950}}>{EMOJI.pound}</span>
              <span style={{fontSize:16,color:'#fff',fontWeight:950,lineHeight:1}}>{cupFineGrandTotal}</span>
            </button>
          </div>
          <div style={{fontSize:12,color:'#60b8f0',fontWeight:900,letterSpacing:'0.14em',marginBottom:8}}>TEAM SCORE</div>
          <button onClick={openCupSummary} style={{width:'100%',borderRadius:18,padding:'13px 14px',marginBottom:10,border:'1px solid rgba(255,255,255,0.22)',background:cupScoreBannerBg,cursor:'pointer',textAlign:'initial',boxShadow:'0 14px 34px rgba(0,0,0,0.28)',overflow:'hidden'}}>
            <div style={{display:'grid',gridTemplateColumns:`repeat(${CUP_TEAM_KEYS.length},1fr)`,gap:8,alignItems:'stretch'}}>{CUP_TEAM_KEYS.map(k=><div key={'home-score-'+k} style={{border:'1px solid rgba(255,255,255,0.16)',borderRadius:13,background:'rgba(0,0,0,0.16)',padding:'8px 5px',textAlign:'center'}}><CupTeamBadge teamKey={k} label={teams[k].name}/><div style={{fontSize:34,color:'#fff',fontWeight:950,lineHeight:1,marginTop:5,textShadow:'0 2px 14px rgba(0,0,0,0.38)'}}>{fmtCupPoint(teamTotals[k]||0)}</div></div>)}</div>
            <div style={{fontSize:10,color:'#90ccf0',fontWeight:900,textAlign:'center',letterSpacing:'0.08em',marginTop:5}}>TAP FOR RESULTS SUMMARY</div>
          </button>
          <div style={{fontSize:11,color:'#60b8f0',fontWeight:900,letterSpacing:'0.14em',margin:'12px 0 7px'}}>OVERALL SINGLES</div>
          <div style={{...S.card,marginBottom:12,padding:7,overflow:'hidden',display:'grid',gap:6}}>{(()=>{const rows=singlesLeaderboard().slice(0,12);return rows.map((p,i)=>{const tone=cupRankTone(i,rows.length);const playedDays=(p.dayScores||[]).filter(d=>(parseInt(d.holes)||0)>0||(parseInt(d.points)||0)>0);return <button key={p.id} onClick={()=>openCupPlayerSummary(p)} style={{width:'100%',border:'1px solid '+tone.border,display:'grid',gridTemplateColumns:'52px 1fr auto',gap:8,alignItems:'center',padding:'9px 10px',borderRadius:11,background:tone.bg,textAlign:'left',cursor:'pointer',boxShadow:i<3?'0 10px 22px rgba(0,0,0,0.20)':'0 6px 14px rgba(0,0,0,0.12)'}}><div style={{fontSize:i<3?21:15,color:tone.color,fontWeight:950,textAlign:'center',lineHeight:1.05}}>{cupRankLabel(i,rows.length)}{cupForfeitMark(i,rows.length,true)}</div><div style={{display:'grid',gap:6,minWidth:0}}><div style={{fontSize:13,color:'#fff',fontWeight:900,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.display_name||'Player'}</div><div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{playedDays.length?playedDays.map(d=><span key={(p.id||p.display_name)+'-d'+d.day} style={{fontSize:10,color:tone.color,fontWeight:950,border:'1px solid rgba(255,255,255,0.14)',background:tone.chip,borderRadius:999,padding:'2px 6px'}}>D{d.day}: {d.points} pts</span>):<span style={{fontSize:10,color:'#8ea0ad',fontWeight:850}}>No day scores yet</span>}</div></div><div style={{display:'grid',gap:2,justifyItems:'end'}}><div style={{fontSize:17,color:'#fff',fontWeight:950}}>{p.total}</div><div style={{fontSize:10,color:tone.color,fontWeight:900}}>{p.holes} holes</div></div></button>;});})()}</div>
        </>:<CupDayView day={selectedDay} course={resolveCupDayCourse(courses,days,cup&&cup.id,selectedDay)} groups={cupDayGroups(selectedDay)} teams={teams} playersInCup={playersInCup} released={dayReleased(selectedDay)} roundForGroup={roundForGroup} matchResult={matchResult} openCupGroup={openCupGroup} openingGroup={openingGroup} isAdmin={isAdmin} openFinesGroup={openCupFinesGroup} scores={scores}/>}
        <CupBottomNav/>
      </>}
    </div>
  </div>;
}


// =========================================================
// Breaking news modal
// Full-screen blocking announcement shown before users enter the app
// =========================================================
function BreakingNewsModal(){
  const[open,setOpen]=useState(SHOW_BREAKING_NEWS);
  if(!open)return null;
  const overlay={position:'fixed',inset:0,zIndex:100000,background:'rgba(2,8,23,0.88)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20};
  const card={width:'100%',maxWidth:420,borderRadius:24,overflow:'hidden',border:'1px solid rgba(248,113,113,0.58)',background:'linear-gradient(160deg,rgba(127,29,29,0.98),rgba(15,23,42,0.98))',boxShadow:'0 28px 90px rgba(0,0,0,0.55)'};
  const siren={fontSize:30,filter:'drop-shadow(0 0 14px rgba(248,113,113,0.85))'};
  return ReactDOM.createPortal(
    <div style={overlay} role="dialog" aria-modal="true" aria-label="Breaking news announcement">
      <div style={card}>
        <div style={{background:'linear-gradient(90deg,#dc2626,#991b1b,#dc2626)',padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'center',gap:10,borderBottom:'1px solid rgba(255,255,255,0.16)'}}>
          <span style={siren}>!</span>
          <div style={{fontSize:15,color:'#fff',fontWeight:950,letterSpacing:'0.16em'}}>BREAKING NEWS</div>
          <span style={siren}>!</span>
        </div>
        <div style={{padding:26,textAlign:'center'}}>
          <div style={{fontSize:30,lineHeight:1.12,color:'#fff',fontWeight:950,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:'0.04em',marginBottom:18,textTransform:'uppercase'}}>{BREAKING_NEWS_MESSAGE}</div>
          <div style={{fontSize:13,lineHeight:1.45,color:'rgba(255,255,255,0.72)',marginBottom:22}}>You must close this announcement before entering Snyder Golf.</div>
          <button onClick={()=>setOpen(false)} style={{width:'100%',border:'none',borderRadius:16,padding:'15px 18px',background:'linear-gradient(135deg,#ffffff,#e5e7eb)',color:'#7f1d1d',fontSize:16,fontWeight:950,cursor:'pointer',boxShadow:'0 12px 32px rgba(0,0,0,0.26)'}}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}



// =========================================================
// React mount / app bootstrap
// =========================================================
const root=ReactDOM.createRoot(document.getElementById('root'));
root.render(<><App/><BreakingNewsModal/></>);
