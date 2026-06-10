// SNYDER GOLF v4.12 League Money display repair
// Fixes the v4.11 issue where the Balance column could disappear on narrow screens.
// Display-only: no Supabase writes, no React wrapping, no click interception.
(function(){
  'use strict';
  if(window.__snyderMoneyFixV412)return;
  window.__snyderMoneyFixV412=true;

  var scheduled=false;
  var runCount=0;
  var COLS='minmax(72px,1fr) 36px 44px 44px 44px 58px';

  function text(el){
    return String((el&&el.textContent)||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  }
  function kids(el){
    return Array.prototype.slice.call((el&&el.children)||[]).filter(function(x){return x&&x.nodeType===1;});
  }
  function money(textValue){
    var s=String(textValue||'').replace(/,/g,'').replace(/−/g,'-').replace(/\u00a0/g,' ');
    var m=s.match(/([+\-])?\s*£\s*([0-9]+(?:\.[0-9]+)?)/);
    if(!m)return 0;
    var n=parseFloat(m[2]);
    if(!isFinite(n))return 0;
    return m[1]==='-'?-n:n;
  }
  function fmt(v){
    var n=Math.round((Number(v)||0)*100)/100;
    var a=Math.abs(n);
    var body=Number.isInteger(a)?String(a):a.toFixed(2);
    if(n>0)return '+£'+body;
    if(n<0)return '-£'+body;
    return '£0';
  }
  function status(v){return v>0?'in credit':v<0?'owes':'settled';}
  function isMoneyHeader(row){
    var c=kids(row);
    if(c.length!==6)return false;
    var t=c.map(function(x){return text(x).toLowerCase();});
    return t[0]==='player'&&t[1]==='entry'&&t[2]==='rounds'&&t[3]==='snake'&&(t[4]==='paid'||t[4]==='paid in');
  }
  function isPlayerRow(row){
    var c=kids(row);
    if(c.length!==6)return false;
    var first=text(c[0]).toLowerCase();
    if(!first||first==='player'||first.indexOf('round')===-1)return false;
    return text(c[1]).indexOf('£')!==-1 && text(c[4]).indexOf('£')!==-1;
  }
  function applyGrid(row,isHeader){
    row.style.display='grid';
    row.style.gridTemplateColumns=COLS;
    row.style.gap='2px';
    row.style.alignItems='center';
    row.style.boxSizing='border-box';
    row.style.width='100%';
    row.style.overflow='visible';
    if(!isHeader)row.style.padding='10px 8px';
    var c=kids(row);
    c.forEach(function(cell,idx){
      cell.style.minWidth='0';
      cell.style.boxSizing='border-box';
      cell.style.overflow='visible';
      cell.style.whiteSpace=idx===0?'normal':'nowrap';
      cell.style.textAlign=idx===0?'left':(idx===5?'right':'center');
      if(idx>0)cell.style.fontSize=isHeader?'8px':'12px';
    });
  }
  function writeBalance(cell,balance){
    if(!cell)return;
    var n=Math.round((Number(balance)||0)*100)/100;
    var colour=n>0?'#60b8f0':n<0?'#f87171':'#d4af37';
    var subColour=n>0?'#4a8a5a':n<0?'#7a3a3a':'#8ea0ad';
    cell.style.display='block';
    cell.style.visibility='visible';
    cell.style.opacity='1';
    cell.style.textAlign='right';
    cell.style.minWidth='58px';
    cell.style.whiteSpace='nowrap';
    cell.innerHTML='<div style="font-size:16px;font-weight:800;line-height:1.05;color:'+colour+'">'+fmt(n)+'</div>'+
      '<div style="font-size:8px;line-height:1.1;color:'+subColour+'">'+status(n)+'</div>';
  }
  function patch(){
    runCount++;
    var rowsFixed=0;
    try{
      var divs=Array.prototype.slice.call(document.querySelectorAll('div'));
      var headers=divs.filter(isMoneyHeader);
      headers.forEach(function(header){
        var table=header.parentElement;
        if(!table)return;
        table.style.overflow='visible';
        table.style.width='100%';
        table.style.maxWidth='100%';
        table.style.boxSizing='border-box';
        applyGrid(header,true);
        var hc=kids(header);
        if(hc[4])hc[4].textContent='Paid';
        if(hc[5])hc[5].textContent='Balance';
        kids(table).forEach(function(row){
          if(row===header)return;
          var c=kids(row);
          var lower=text(row).toLowerCase();
          if(c.length===6 && !text(c[0]) && lower.indexOf('owes')!==-1){row.style.display='none';return;}
          if(!isPlayerRow(row))return;
          var entry=money(text(c[1]))||10;
          var rounds=money(text(c[2]));
          var snake=money(text(c[3]));
          var paid=money(text(c[4]));
          var balance=Math.round((paid-entry-rounds-snake)*100)/100;
          applyGrid(row,false);
          row.style.borderLeft=balance>0?'4px solid #60b8f0':balance<0?'4px solid #ef4444':'4px solid rgba(96,184,240,0.22)';
          writeBalance(c[5],balance);
          row.setAttribute('data-money-v412','paid='+paid+' entry='+entry+' rounds='+rounds+' snake='+snake+' balance='+balance);
          rowsFixed++;
        });
      });
      if(rowsFixed)window.__snyderMoneyFixV412LastRun={runs:runCount,rows:rowsFixed,at:new Date().toISOString()};
    }catch(e){console.warn('Snyder money fix v4.12 skipped safely',e);}
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    setTimeout(function(){scheduled=false;patch();},100);
  }
  window.snyderFixLeagueMoneyBalances=patch;
  window.snyderReloadSweepstakeBalanceAdjustments=schedule;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
  var ticks=0;
  var timer=setInterval(function(){patch();ticks++;if(ticks>160)clearInterval(timer);},250);
  try{new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true});}catch(e){}
})();
