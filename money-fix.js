// SNYDER GOLF v4.09 League Money root-cause display fix
// Root cause: league-section.js is a separate file. The bad Balance value is rendered there,
// not in app.js. This runs after the normal League file loads and rewrites only the Money table
// display from the four visible columns: Paid - Entry - Rounds - Snake. It never writes to Supabase.
(function(){
  'use strict';
  if(window.__snyderMoneyFixV409)return;
  window.__snyderMoneyFixV409=true;
  var patchCount=0;
  function text(el){return String((el&&el.textContent)||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();}
  function children(el){return Array.prototype.slice.call((el&&el.children)||[]).filter(function(x){return x&&x.nodeType===1;});}
  function moneyValue(s){
    s=String(s||'').replace(/,/g,'').replace(/−/g,'-');
    var m=s.match(/([+\-])?\s*£\s*([0-9]+(?:\.[0-9]+)?)/);
    if(!m)return 0;
    var n=parseFloat(m[2]);
    if(!isFinite(n))return 0;
    return m[1]==='-'?-n:n;
  }
  function fmt(v){
    v=Math.round((Number(v)||0)*100)/100;
    var a=Math.abs(v);
    var body=Number.isInteger(a)?String(a):a.toFixed(2);
    return v>0?'+£'+body:v<0?'-£'+body:'£0';
  }
  function setCell(cell,balance){
    if(!cell)return;
    cell.innerHTML='';
    cell.style.textAlign='right';
    var big=document.createElement('div');
    big.textContent=fmt(balance);
    big.style.fontSize='18px';
    big.style.color=balance>0?'#60b8f0':balance<0?'#f87171':'#d4af37';
    big.style.textAlign='right';
    var small=document.createElement('div');
    small.textContent=balance>0?'in credit':balance<0?'owes':'settled';
    small.style.fontSize='9px';
    small.style.color=balance>0?'#4a8a5a':balance<0?'#7a3a3a':'#8ea0ad';
    small.style.textAlign='right';
    cell.appendChild(big);cell.appendChild(small);
  }
  function isHeaderRow(row){
    var c=children(row);
    if(c.length<6)return false;
    var labels=c.slice(0,6).map(function(x){return text(x).toLowerCase();});
    return labels[0]==='player'&&labels[1]==='entry'&&labels[2]==='rounds'&&labels[3]==='snake'&&(labels[4]==='paid'||labels[4]==='paid in')&&labels[5]==='balance';
  }
  function isPlayerMoneyRow(row){
    var c=children(row);
    if(c.length<6)return false;
    var first=text(c[0]).toLowerCase();
    if(!first||first==='player'||first.indexOf('round')===-1)return false;
    return text(c[1]).indexOf('£')!==-1 && text(c[4]).indexOf('£')!==-1;
  }
  function patchRow(row){
    var c=children(row).slice(0,6);
    if(c.length<6)return false;
    var entry=moneyValue(text(c[1]))||10;
    var rounds=moneyValue(text(c[2]));
    var snake=moneyValue(text(c[3]));
    var paid=moneyValue(text(c[4]));
    var balance=Math.round((paid-entry-rounds-snake)*100)/100;
    var before=text(c[5]);
    setCell(c[5],balance);
    row.style.borderLeft=balance>0?'4px solid #60b8f0':balance<0?'4px solid #ef4444':'4px solid rgba(96,184,240,0.22)';
    row.setAttribute('data-snyder-money-v409','paid='+paid+' entry='+entry+' rounds='+rounds+' snake='+snake+' balance='+balance);
    return before!==text(c[5]);
  }
  function findMoneyContainers(){
    var headers=Array.prototype.slice.call(document.querySelectorAll('div,section,article')).filter(isHeaderRow);
    var containers=[];
    headers.forEach(function(h){ if(h.parentElement&&containers.indexOf(h.parentElement)===-1)containers.push(h.parentElement); });
    // Fallback: find a known player row and walk to the six-column row's parent.
    Array.prototype.slice.call(document.querySelectorAll('div')).forEach(function(el){
      var t=text(el).toLowerCase();
      if((t.indexOf('paolo')!==-1||t.indexOf('coburn')!==-1)&&t.indexOf('round')!==-1){
        var cur=el;
        for(var i=0;i<5&&cur;i++,cur=cur.parentElement){
          if(isPlayerMoneyRow(cur)&&cur.parentElement&&containers.indexOf(cur.parentElement)===-1)containers.push(cur.parentElement);
        }
      }
    });
    return containers;
  }
  function patch(){
    try{
      var changed=0, rows=0;
      findMoneyContainers().forEach(function(container){
        children(container).forEach(function(row){
          if(isHeaderRow(row)){
            var hc=children(row); if(hc[4])hc[4].textContent='Paid'; if(hc[5])hc[5].textContent='Balance';
            return;
          }
          var c=children(row);
          if(c.length>=6 && !text(c[0]) && text(row).toLowerCase().indexOf('owes')!==-1){row.style.display='none';return;}
          if(isPlayerMoneyRow(row)){rows++; if(patchRow(row))changed++;}
        });
      });
      if(rows){patchCount++;window.__snyderMoneyFixV409Patched={runs:patchCount,rows:rows,changed:changed,at:new Date().toISOString()};}
    }catch(e){console.warn('Snyder money fix v4.09 skipped',e);}
  }
  function schedule(){requestAnimationFrame(patch);setTimeout(patch,50);setTimeout(patch,250);setTimeout(patch,1000);}
  window.snyderFixLeagueMoneyBalances=patch;
  window.snyderReloadSweepstakeBalanceAdjustments=schedule;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
  ['click','touchend','popstate','hashchange'].forEach(function(ev){window.addEventListener(ev,schedule,true);});
  try{new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});}catch(e){}
  var n=0;var int=setInterval(function(){patch(); if(++n>600)clearInterval(int);},200);
})();
