// SNYDER GOLF v4.46 League Money display repair
// Adds completed Day Sweepstake net to the Money table without changing payments.paid.
// Balance = Paid + Sweepstake net - Entry - Extra Rounds - Snakes.
(function(){
  'use strict';
  if(window.__snyderMoneyFixV419)return;
  window.__snyderMoneyFixV419=true;

  var scheduled=false;
  var runCount=0;
  var sweepLoaded=false;
  var sweepLoading=false;
  var sweepByName={};
  var sweepById={};
  var lastSweepLoad=0;
  var COLS='minmax(72px,1fr) 42px 42px 46px 42px 54px';
  var FIX_VERSION='v4.46';
  var SURL='https://qggylmfyrnlwnkhjldjl.supabase.co';
  var SKEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnZ3lsbWZ5cm5sd25raGpsZGpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1OTU5ODQsImV4cCI6MjA5MjE3MTk4NH0.StHB-C5UZfxpBTWSmKvGWMGPp0q9O35XGcKtKed4cnw';

  function normaliseName(name){return String(name||'').trim().toLowerCase().replace(/\s+/g,' ');}
  function round2(v){return Math.round((Number(v)||0)*100)/100;}
  function cleanText(el){return String((el&&el.textContent)||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();}
  function kids(el){return Array.prototype.slice.call((el&&el.children)||[]).filter(function(x){return x&&x.nodeType===1;});}
  function firstMoneyText(cell){
    if(!cell)return '';
    var childList=kids(cell);
    for(var i=0;i<childList.length;i++){
      var t=cleanText(childList[i]);
      if(t.indexOf('£')!==-1)return t;
    }
    return cleanText(cell);
  }
  function moneyFromCell(cell){
    var s=firstMoneyText(cell).replace(/,/g,'').replace(/−/g,'-').replace(/\u00a0/g,' ');
    var m=s.match(/([+\-])?\s*£\s*([0-9]+(?:\.[0-9]+)?)/);
    if(!m)return 0;
    var n=parseFloat(m[2]);
    if(!isFinite(n))return 0;
    return m[1]==='-'?-n:n;
  }
  function fmt(v){
    var n=round2(v), a=Math.abs(n), body=Number.isInteger(a)?String(a):a.toFixed(2);
    if(n>0)return '+£'+body;
    if(n<0)return '-£'+body;
    return '£0';
  }
  function status(v){return v>0?'in credit':v<0?'owes':'settled';}
  function playerNameFromCell(cell){
    var c=kids(cell);
    if(c.length)return cleanText(c[0]);
    return cleanText(cell).replace(/\d+\s*rounds?.*$/i,'').trim();
  }
  function getSupabaseClient(){
    try{
      if(window.__snyderMoneySupabase&&window.__snyderMoneySupabaseKey===SKEY)return window.__snyderMoneySupabase;
      if(window.supabase&&window.supabase.createClient){
        window.__snyderMoneySupabase=window.supabase.createClient(SURL,SKEY);
        window.__snyderMoneySupabaseKey=SKEY;
        return window.__snyderMoneySupabase;
      }
    }catch(e){}
    return null;
  }
  async function loadSweepstakeNets(force){
    var now=Date.now();
    if(sweepLoading)return;
    if(!force&&sweepLoaded&&(now-lastSweepLoad)<60000)return;
    var client=getSupabaseClient();
    if(!client)return;
    sweepLoading=true;
    try{
      var res=await client.from('payment_log').select('player_id,player_name,action,amount,note').or('action.eq.Sweepstake balance,action.eq.Sweepstake balance reversal').limit(1000);
      if(res.error)throw res.error;
      var byId={}, byName={};
      (res.data||[]).forEach(function(row){
        if(!row)return;
        var action=String(row.action||'');
        var note=String(row.note||'');
        // Completed Day Sweepstakes and normal scorecard sweepstakes both affect League Money.
        // Old manual/test repairs stay out unless they use one of these settlement markers.
        var isDaySweep=note.indexOf('Day sweepstake League balance settlement')!==-1 || note.indexOf('Day sweepstake League balance reversal')!==-1;
        var isRoundSweep=note.indexOf('Sweepstake League balance settlement')!==-1 || note.indexOf('Sweepstake League balance reversal')!==-1;
        if(!isDaySweep&&!isRoundSweep)return;
        if(note.indexOf('test sweepstake ignored')!==-1 || note.indexOf('exclude from league money')!==-1)return;
        var amount=round2(parseFloat(row.amount)||0);
        if(!amount)return;
        var id=String(row.player_id||'').trim();
        var name=normaliseName(row.player_name||'');
        if(id)byId[id]=round2((byId[id]||0)+amount);
        if(name)byName[name]=round2((byName[name]||0)+amount);
      });
      sweepById=byId;
      sweepByName=byName;
      sweepLoaded=true;
      lastSweepLoad=Date.now();
      schedule();
    }catch(e){console.warn('Snyder sweepstake net load skipped safely',e);}
    finally{sweepLoading=false;}
  }
  function sweepNetForRow(row,cells){
    var id=String(row.getAttribute('data-league-player-id')||row.getAttribute('data-player-id')||'').trim();
    if(id&&Object.prototype.hasOwnProperty.call(sweepById,id))return sweepById[id];
    var name=normaliseName(playerNameFromCell(cells[0]));
    return round2(sweepByName[name]||0);
  }
  function isMoneyHeader(row){
    var c=kids(row);
    if(c.length!==6&&c.length!==7)return false;
    var t=c.map(function(x){return cleanText(x).toLowerCase();});
    return t[0]==='player'&&(t.indexOf('rounds')!==-1)&&(t.indexOf('snake')!==-1)&&(t.indexOf('paid')!==-1||t.indexOf('paid in')!==-1);
  }
  function isPlayerRow(row){
    var c=kids(row);
    if(c.length!==6&&c.length!==7)return false;
    var first=cleanText(c[0]).toLowerCase();
    if(!first||first==='player'||first.indexOf('round')===-1)return false;
    // The original League row has a hidden entry cell, but v4.46 removes it visually.
    return cleanText(row).indexOf('£')!==-1;
  }
  function normaliseMoneyRow(row){
    var c=kids(row);
    // If an older v4.15 repair has inserted a 7th cell, remove the dedicated Entry cell.
    // Original/order becomes: Player, Rounds, Snake, Sweep, Paid, Balance.
    if(c.length===7){
      if(c[1]&&c[1].remove)c[1].remove();
      c=kids(row);
    }
    return c;
  }
  function styleCell(cell,idx,isHeader){
    if(!cell)return;
    cell.style.minWidth='0';
    cell.style.boxSizing='border-box';
    cell.style.overflow='visible';
    cell.style.whiteSpace=idx===0?'normal':'nowrap';
    cell.style.textAlign=idx===0?'left':(idx===5?'right':'center');
    cell.style.height='100%';
    cell.style.display='flex';
    cell.style.flexDirection='column';
    cell.style.justifyContent='center';
    cell.style.alignItems=idx===0?'flex-start':(idx===5?'flex-end':'center');
    if(idx>0)cell.style.fontSize=isHeader?'7px':'11px';
    kids(cell).forEach(function(child,childIdx){
      child.style.margin='0';
      child.style.padding='0';
      child.style.lineHeight=childIdx===0?'1.05':'1.05';
      child.style.textAlign=idx===5?'right':(idx===0?'left':'center');
      child.style.width='100%';
    });
  }
  function applyGrid(row,isHeader){
    row.style.display='grid';
    row.style.gridTemplateColumns=COLS;
    row.style.gap='2px';
    row.style.alignItems='stretch';
    row.style.boxSizing='border-box';
    row.style.width='100%';
    row.style.maxWidth='100%';
    row.style.overflow='visible';
    row.style.minHeight=isHeader?'28px':'54px';
    row.style.padding=isHeader?'6px 4px':'7px 4px';
    kids(row).forEach(function(cell,idx){styleCell(cell,idx,isHeader);});
  }
  function writePlainMoneyCell(cell,value,sub,colour){
    if(!cell)return;
    var n=round2(value);
    var amount=n?('£'+(Number.isInteger(Math.abs(n))?String(Math.abs(n)):Math.abs(n).toFixed(2))):'—';
    cell.style.display='flex';
    cell.style.flexDirection='column';
    cell.style.justifyContent='center';
    cell.style.alignItems='center';
    cell.style.visibility='visible';
    cell.style.opacity='1';
    cell.style.textAlign='center';
    cell.style.whiteSpace='nowrap';
    cell.innerHTML='<div style="font-size:11px;font-weight:850;line-height:1.02;color:'+(colour||'#dbeafe')+';text-align:center;width:100%">'+amount+'</div>'+
      '<div style="font-size:7px;line-height:1.02;color:#8ea0ad;text-align:center;width:100%;margin-top:1px">'+(sub||'')+'</div>';
  }
  function writeRoundsCell(cell,value){
    if(!cell)return;
    var n=round2(value);
    var amount=n?('£'+(Number.isInteger(Math.abs(n))?String(Math.abs(n)):Math.abs(n).toFixed(2))):'—';
    var extra=n?Math.round(n/2):0;
    var sub=extra?String(extra)+' extra':'rounds';
    cell.style.display='flex';
    cell.style.flexDirection='column';
    cell.style.justifyContent='center';
    cell.style.alignItems='center';
    cell.style.visibility='visible';
    cell.style.opacity='1';
    cell.style.textAlign='center';
    cell.style.whiteSpace='nowrap';
    cell.innerHTML='<div style="font-size:11px;font-weight:850;line-height:1.02;color:#dbeafe;text-align:center;width:100%">'+amount+'</div>'+
      '<div style="font-size:7px;line-height:1.02;color:#8ea0ad;text-align:center;width:100%;margin-top:1px">'+sub+'</div>';
  }
  function ensureEntryNote(table){
    if(!table||table.getAttribute('data-money-entry-note')==='v4.46')return;
    table.setAttribute('data-money-entry-note','v4.46');
    try{
      var note=document.createElement('div');
      note.textContent='Balance includes £10 entry fee, extra rounds, snakes and completed sweepstakes.';
      note.style.fontSize='10px';
      note.style.color='#8ea0ad';
      note.style.textAlign='center';
      note.style.padding='7px 8px';
      note.style.borderTop='1px solid rgba(96,184,240,0.12)';
      table.appendChild(note);
    }catch(e){}
  }
  function writeAmountCell(cell,value,sub,mainColour){
    if(!cell)return;
    var n=round2(value);
    var colour=mainColour||(n>0?'#60b8f0':n<0?'#f87171':'#8ea0ad');
    cell.style.display='flex';
    cell.style.flexDirection='column';
    cell.style.justifyContent='center';
    cell.style.alignItems='center';
    cell.style.visibility='visible';
    cell.style.opacity='1';
    cell.style.textAlign='center';
    cell.style.whiteSpace='nowrap';
    cell.innerHTML='<div style="font-size:11px;font-weight:850;line-height:1.02;color:'+colour+';text-align:center;width:100%">'+fmt(n)+'</div>'+
      '<div style="font-size:7px;line-height:1.02;color:#8ea0ad;text-align:center;width:100%;margin-top:1px">'+(sub||'sweep')+'</div>';
  }
  function writeBalance(cell,balance){
    if(!cell)return;
    var n=round2(balance);
    var colour=n>0?'#60b8f0':n<0?'#f87171':'#d4af37';
    var subColour=n>0?'#4a8a5a':n<0?'#7a3a3a':'#8ea0ad';
    cell.style.display='flex';
    cell.style.flexDirection='column';
    cell.style.justifyContent='center';
    cell.style.alignItems='flex-end';
    cell.style.visibility='visible';
    cell.style.opacity='1';
    cell.style.textAlign='right';
    cell.style.whiteSpace='nowrap';
    cell.innerHTML='<div style="font-size:14px;font-weight:850;line-height:1.02;color:'+colour+';text-align:right;width:100%">'+fmt(n)+'</div>'+
      '<div style="font-size:7px;line-height:1.02;color:'+subColour+';text-align:right;width:100%;margin-top:1px">'+status(n)+'</div>';
  }
  function patch(){
    runCount++;
    loadSweepstakeNets(false);
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
        var hc=normaliseMoneyRow(header);
        if(hc.length===6){
          hc[0].textContent='Player';hc[1].textContent='Rounds';hc[2].textContent='Snake';hc[3].textContent='Sweep';hc[4].textContent='Paid';hc[5].textContent='Balance';
          applyGrid(header,true);
          ensureEntryNote(table);
        }
        kids(table).forEach(function(row){
          if(row===header)return;
          var before=kids(row);
          var lower=cleanText(row).toLowerCase();
          if(before.length>=6 && !cleanText(before[0]) && lower.indexOf('owes')!==-1){row.style.display='none';return;}
          if(!isPlayerRow(row))return;
          var original=kids(row);
          var entry=10;
          var rounds=NaN, snake=NaN, paid=NaN;
          // v4.46: make the repair idempotent. v4.16 overwrote the Entry cell with Rounds,
          // then a later pass parsed the already-repaired row as if Entry still existed.
          // Store the original money inputs on the row the first time we see them, and reuse them
          // on every later MutationObserver/interval pass so Rounds/Snake cannot be cleared.
          if(row.getAttribute('data-money-base-rounds')!==null){
            rounds=parseFloat(row.getAttribute('data-money-base-rounds'))||0;
            snake=parseFloat(row.getAttribute('data-money-base-snake'))||0;
            paid=parseFloat(row.getAttribute('data-money-base-paid'))||0;
          }else if(original.length===7){
            rounds=moneyFromCell(original[2]);
            snake=moneyFromCell(original[3]);
            paid=moneyFromCell(original[5]);
          }else{
            var header=kids(header||row.parentElement&&row.parentElement.firstElementChild);
            var rowText=cleanText(row).toLowerCase();
            // Original League order is Player, Entry, Rounds, Snake, Paid, Balance.
            // Already-repaired order is Player, Rounds, Snake, Sweep, Paid, Balance.
            // Detect repaired rows from our data flag or the visible sweep sub-label.
            var alreadyRepaired=row.getAttribute('data-money-repaired')==='v4.46' || rowText.indexOf(' sweep ')!==-1 || cleanText(original[3]).toLowerCase().indexOf('sweep')!==-1;
            if(alreadyRepaired){
              rounds=moneyFromCell(original[1]);
              snake=moneyFromCell(original[2]);
              paid=moneyFromCell(original[4]);
            }else{
              rounds=moneyFromCell(original[2]);
              snake=moneyFromCell(original[3]);
              paid=moneyFromCell(original[4]);
            }
          }
          rounds=round2(rounds); snake=round2(snake); paid=round2(paid);
          row.setAttribute('data-money-base-rounds',String(rounds));
          row.setAttribute('data-money-base-snake',String(snake));
          row.setAttribute('data-money-base-paid',String(paid));
          var c=normaliseMoneyRow(row);
          if(c.length!==6)return;
          var sweep=sweepNetForRow(row,c);
          var balance=round2(paid+sweep-entry-rounds-snake);
          applyGrid(row,false);
          row.style.borderLeft=balance>0?'4px solid #60b8f0':balance<0?'4px solid #ef4444':'4px solid rgba(96,184,240,0.22)';
          writeRoundsCell(c[1],rounds);
          writePlainMoneyCell(c[2],snake,snake?'snake':'snake','#fb923c');
          writeAmountCell(c[3],sweep,'sweep');
          writePlainMoneyCell(c[4],paid,'paid','#60b8f0');
          writeBalance(c[5],balance);
          row.setAttribute('data-money-repaired','v4.46');
          row.setAttribute('data-money-v419','paid='+paid+' sweep='+sweep+' entry='+entry+' rounds='+rounds+' snake='+snake+' balance='+balance);
          rowsFixed++;
        });
      });
      if(rowsFixed)window.__snyderMoneyFixV419LastRun={runs:runCount,rows:rowsFixed,sweepLoaded:sweepLoaded,at:new Date().toISOString()};
    }catch(e){console.warn('Snyder money fix v4.46 skipped safely',e);}
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    setTimeout(function(){scheduled=false;patch();},100);
  }
  window.snyderFixLeagueMoneyBalances=patch;
  window.snyderReloadSweepstakeBalanceAdjustments=function(){loadSweepstakeNets(true);schedule();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
  var ticks=0;
  var timer=setInterval(function(){patch();ticks++;if(ticks>240)clearInterval(timer);},250);
  try{new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true});}catch(e){}
})();
