// SNYDER GOLF v4.11 League Money display repair
// Lightweight DOM repair only: does not wrap React, does not capture clicks,
// does not write to Supabase, and does not change payments.paid.
(function(){
  'use strict';
  if(window.__snyderMoneyFixV411)return;
  window.__snyderMoneyFixV411=true;

  var scheduled=false;
  var runs=0;

  function normText(el){
    return String((el&&el.textContent)||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  }
  function kids(el){
    return Array.prototype.slice.call((el&&el.children)||[]).filter(function(x){return x&&x.nodeType===1;});
  }
  function valueFromMoney(text){
    var s=String(text||'').replace(/,/g,'').replace(/−/g,'-').replace(/\u00a0/g,' ');
    var m=s.match(/([+\-])?\s*£\s*([0-9]+(?:\.[0-9]+)?)/);
    if(!m)return 0;
    var n=parseFloat(m[2]);
    if(!isFinite(n))return 0;
    return m[1]==='-'?-n:n;
  }
  function fmtMoney(v){
    var n=Math.round((Number(v)||0)*100)/100;
    var a=Math.abs(n);
    var body=Number.isInteger(a)?String(a):a.toFixed(2);
    if(n>0)return '+£'+body;
    if(n<0)return '-£'+body;
    return '£0';
  }
  function isHeader(row){
    var c=kids(row);
    if(c.length!==6)return false;
    var t=c.map(function(x){return normText(x).toLowerCase();});
    return t[0]==='player' && t[1]==='entry' && t[2]==='rounds' && t[3]==='snake' && (t[4]==='paid'||t[4]==='paid in') && t[5]==='balance';
  }
  function isMoneyRow(row){
    var c=kids(row);
    if(c.length!==6)return false;
    var first=normText(c[0]).toLowerCase();
    if(!first || first==='player')return false;
    if(first.indexOf('round')===-1)return false;
    if(normText(c[1]).indexOf('£')===-1)return false;
    if(normText(c[4]).indexOf('£')===-1)return false;
    return true;
  }
  function writeBalance(cell,balance){
    if(!cell)return;
    var n=Math.round((Number(balance)||0)*100)/100;
    cell.textContent='';
    cell.style.textAlign='right';
    cell.style.minWidth='72px';
    var top=document.createElement('div');
    top.textContent=fmtMoney(n);
    top.style.fontSize='18px';
    top.style.fontWeight='700';
    top.style.lineHeight='1.12';
    top.style.color=n>0?'#60b8f0':n<0?'#f87171':'#d4af37';
    var bottom=document.createElement('div');
    bottom.textContent=n>0?'in credit':n<0?'owes':'settled';
    bottom.style.fontSize='9px';
    bottom.style.lineHeight='1.15';
    bottom.style.color=n>0?'#4a8a5a':n<0?'#7a3a3a':'#8ea0ad';
    cell.appendChild(top);
    cell.appendChild(bottom);
  }
  function patchMoneyTable(){
    runs++;
    var patchedRows=0;
    try{
      var all=Array.prototype.slice.call(document.querySelectorAll('div'));
      var headers=all.filter(isHeader);
      headers.forEach(function(header){
        var table=header.parentElement;
        if(!table)return;
        table.style.border='1px solid rgba(96,184,240,0.22)';
        table.style.borderRadius='14px';
        table.style.overflow='hidden';
        table.style.width='100%';
        var headerCells=kids(header);
        header.style.display='grid';
        header.style.gridTemplateColumns='minmax(124px,1fr) 44px 52px 52px 52px 76px';
        header.style.gap='4px';
        header.style.alignItems='center';
        if(headerCells[4])headerCells[4].textContent='Paid';
        if(headerCells[5])headerCells[5].textContent='Balance';
        kids(table).forEach(function(row){
          if(row===header)return;
          var c=kids(row);
          var rowText=normText(row).toLowerCase();
          if(c.length===6 && !normText(c[0]) && rowText.indexOf('owes')!==-1){
            row.style.display='none';
            return;
          }
          if(!isMoneyRow(row))return;
          var entry=valueFromMoney(normText(c[1]))||10;
          var rounds=valueFromMoney(normText(c[2]));
          var snake=valueFromMoney(normText(c[3]));
          var paid=valueFromMoney(normText(c[4]));
          var balance=Math.round((paid-entry-rounds-snake)*100)/100;
          row.style.display='grid';
          row.style.gridTemplateColumns='minmax(124px,1fr) 44px 52px 52px 52px 76px';
          row.style.gap='4px';
          row.style.alignItems='center';
          row.style.padding='11px 10px';
          row.style.borderLeft=balance>0?'4px solid #60b8f0':balance<0?'4px solid #ef4444':'4px solid rgba(96,184,240,0.22)';
          [1,2,3,4].forEach(function(i){if(c[i]){c[i].style.textAlign='center';c[i].style.minWidth='0';}});
          writeBalance(c[5],balance);
          row.setAttribute('data-money-v411','paid='+paid+' entry='+entry+' rounds='+rounds+' snake='+snake+' balance='+balance);
          patchedRows++;
        });
      });
      if(patchedRows){
        window.__snyderMoneyFixV411LastRun={runs:runs,rows:patchedRows,at:new Date().toISOString()};
      }
    }catch(e){
      console.warn('Snyder money fix v4.11 skipped safely',e);
    }
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    setTimeout(function(){scheduled=false;patchMoneyTable();},80);
  }
  window.snyderFixLeagueMoneyBalances=patchMoneyTable;
  window.snyderReloadSweepstakeBalanceAdjustments=schedule;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
  var count=0;
  var timer=setInterval(function(){
    patchMoneyTable();
    count++;
    if(count>120)clearInterval(timer);
  },300);
  try{
    var obs=new MutationObserver(schedule);
    obs.observe(document.body,{childList:true,subtree:true,characterData:true});
  }catch(e){}
})();
