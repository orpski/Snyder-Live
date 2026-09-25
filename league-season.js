// SNYDER GOLF v5.29 — shared 2026 league rules; no live scores are deleted.
(function(root){
  'use strict';
  const END='2026-09-16';
  const ACTION='League playoffs 2026';
  function dateKey(value){
    if(typeof value==='string')return value.slice(0,10);
    if(!(value instanceof Date)||!Number.isFinite(value.getTime()))return '';
    return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
  }
  function eligible(value){const key=dateKey(value);return /^2026-\d{2}-\d{2}$/.test(key)&&key<=END;}
  function empty(){return {season:2026,seeds:[],sf1:'',sf2:'',champion:'',spoon:''};}
  function bracket(result,rankings){
    const state=result||empty();
    const ids=state.seeds&&state.seeds.length?state.seeds:(rankings||[]).map(p=>String(p.id));
    const byId=new Map((rankings||[]).map(p=>[String(p.id),p]));
    const seeds=ids.map(id=>byId.get(String(id))||null);
    const semi1=[seeds[0],seeds[3]].filter(Boolean),semi2=[seeds[1],seeds[2]].filter(Boolean);
    const sf1=semi1.find(p=>String(p.id)===String(state.sf1))||null;
    const sf2=semi2.find(p=>String(p.id)===String(state.sf2))||null;
    const finalists=[sf1,sf2].filter(Boolean);
    const champion=finalists.length===2?finalists.find(p=>String(p.id)===String(state.champion))||null:null;
    const runnerUp=champion?finalists.find(p=>p.id!==champion.id):null;
    const bottom=seeds.length>=6?seeds.slice(-2).filter(Boolean):[];
    const spoon=bottom.find(p=>String(p.id)===String(state.spoon))||null;
    return {seeds,semi1,semi2,sf1,sf2,finalists,champion,runnerUp,bottom,spoon};
  }
  function change(state,field,value){
    const next={...state,[field]:value};
    if((field==='sf1'||field==='sf2')&&state[field]!==value)next.champion='';
    return next;
  }
  function validate(state,rankings){
    if(state.season!==2026)return 'Invalid season.';
    if(!Array.isArray(state.seeds)||state.seeds.length<4||new Set(state.seeds).size!==state.seeds.length)return 'At least four unique seeded players are required.';
    const b=bracket(state,rankings);
    if(b.seeds.some(p=>!p))return 'A seeded player is missing. Restore the player before saving results.';
    for(const key of ['sf1','sf2','champion','spoon'])if(state[key]&&!b[key])return 'Choose a valid '+({sf1:'semi-final 1 winner',sf2:'semi-final 2 winner',champion:'final winner',spoon:'wooden spoon recipient'}[key])+'.';
    return '';
  }
  function finalPrizes(remainder){const pence=Math.max(0,Math.round(remainder*100));const winner=Math.round(pence*0.7);return {winner:winner/100,runnerUp:(pence-winner)/100};}
  root.SnyderLeagueSeason={END,ACTION,dateKey,eligible,empty,bracket,change,validate,finalPrizes};
})(typeof window==='undefined'?globalThis:window);
