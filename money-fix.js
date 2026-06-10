// SNYDER GOLF v4.06 Money page hard fix
// Diagnosed issue: the Money table columns were showing the correct Paid/Entry/Rounds/Snake values,
// but the Balance cell was still using stale polluted balance values from previous sweepstake repair/adjustment attempts.
// This display-layer fix recalculates Balance only from the visible columns and never writes to Supabase.
(function(){
  'use strict';
  if(window.__snyderMoneyHardFixV406)return;
  window.__snyderMoneyHardFixV406=true;

  function txt(el){return String((el&&el.textContent)||'').replace(/\u00a0/g,' ').trim();}
  function kids(el){return Array.from((el&&el.children)||[]).filter(function(x){return x&&x.nodeType===1;});}
  function money(text){
    var raw=String(text||'').replace(/,/g,'').replace(/−/g,'-');
    var m=raw.match(/-?\s*£\s*([0-9]+(?:\.[0-9]+)?)/);
    if(!m)return 0;
    var n=parseFloat(m[1]);
    if(!isFinite(n))return 0;
    return raw.trim().charAt(0)==='-'?-n:n;
  }
  function fmt(n){
    n=Math.round((Number(n)||0)*100)/100;
    var a=Math.abs(n);
    var body=Number.isInteger(a)?String(a):a.toFixed(2);
    if(n>0)return '+£'+body;
    if(n<0)return '-£'+body;
    return '£0';
  }
  function setBalance(cell,balance){
    if(!cell)return;
    var children=kids(cell);
    var big=children[0];
    var small=children[1];
    if(!big){big=document.createElement('div');cell.appendChild(big);}
    if(!small){small=document.createElement('div');cell.appendChild(small);}
    while(kids(cell).length>2){cell.removeChild(kids(cell)[2]);}
    cell.style.textAlign='right';
    big.textContent=fmt(balance);
    big.style.fontSize='18px';
    big.style.fontWeight='400';
    big.style.textAlign='right';
    big.style.color=balance>0?'#60b8f0':balance<0?'#f87171':'#d4af37';
    small.textContent=balance>0?'in credit':balance<0?'owes':'settled';
    small.style.fontSize='9px';
    small.style.textAlign='right';
    small.style.color=balance>0?'#4a8a5a':balance<0?'#7a3a3a':'#8ea0ad';
  }
  function isMoneyHeader(row){
    var c=kids(row);
    if(c.length!==6)return false;
    var labels=c.map(function(x){return txt(x).toLowerCase();});
    return labels[0]==='player'&&labels[1]==='entry'&&labels[2]==='rounds'&&labels[3]==='snake';
  }
  function isPlayerRow(row){
    var c=kids(row);
    if(c.length!==6)return false;
    var player=txt(c[0]).toLowerCase();
    if(!player||player==='player')return false;
    if(player.indexOf('round')===-1)return false;
    return txt(c[1]).indexOf('£')!==-1 && txt(c[4]).indexOf('£')!==-1;
  }
  function patch(){
    try{
      var all=Array.from(document.querySelectorAll('div'));
      var headers=all.filter(isMoneyHeader);
      headers.forEach(function(header){
        var hc=kids(header);
        hc[4].textContent='Paid';
        hc[5].textContent='Balance';
        var container=header.parentElement;
        if(!container)return;
        kids(container).forEach(function(row){
          if(row===header)return;
          var c=kids(row);
          if(c.length!==6)return;
          var joined=c.map(txt).join(' ').toLowerCase();
          if(!txt(c[0]) && joined.indexOf('owes')!==-1){
            row.style.display='none';
            return;
          }
          if(!isPlayerRow(row))return;
          var entry=money(txt(c[1])) || 10;
          var rounds=money(txt(c[2]));
          var snake=money(txt(c[3]));
          var paid=money(txt(c[4]));
          var balance=Math.round((paid-entry-rounds-snake)*100)/100;
          setBalance(c[5],balance);
          row.style.borderLeft=balance>0?'4px solid #60b8f0':balance<0?'4px solid #ef4444':'4px solid rgba(96,184,240,0.22)';
          row.setAttribute('data-snyder-money-v406','paid:'+paid+' owed:'+(entry+rounds+snake)+' balance:'+balance);
        });
      });
    }catch(e){
      console.warn('Snyder v4.06 Money fix skipped safely',e);
    }
  }
  function schedule(){setTimeout(patch,0);setTimeout(patch,80);setTimeout(patch,250);setTimeout(patch,750);}
  window.snyderFixLeagueMoneyBalances=patch;
  window.snyderReloadSweepstakeBalanceAdjustments=schedule;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
  try{new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});}catch(e){}
  var n=0;
  var int=setInterval(function(){patch();if(++n>240)clearInterval(int);},250);
})();
