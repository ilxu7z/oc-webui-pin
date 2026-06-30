<!-- Project Lock UI Injection (v18) -->
<!-- 修复: 移除第二循环 + 移除离线同步 + WS 累积兜底 -->
<script>
(function(){'use strict';
var SK;
var _lockEl=null,_lockInp=null,_lockIcon=null;
var _pendingLockPath=null;
var _pendingDetect=false,_detectTimer=null;
var _pendingLock=false,_pendingUnlock=false,_lockTimer=null,_unlockTimer=null;

// ===== sessionStorage: 完整 session key 隔离 =====
function getSessionKey(){
  var sel=document.querySelector('[data-chat-session-picker-option][aria-selected="true"]');
  if(sel){var key=sel.getAttribute('data-session-key');if(key) return key;}
  var s=location.search.match(/session=([^&]+)/);
  if(s){try{return decodeURIComponent(s[1]);}catch(e){}}
  return 'main';
}
function getSK(){
  return 'openclaw_project_lock_'+getSessionKey().replace(/[^a-zA-Z0-9_-]/g,'_');
}
function gp(){if(!SK)SK=getSK();try{return sessionStorage.getItem(SK)||''}catch(e){return ''}}
function sp(p){if(!SK)SK=getSK();try{sessionStorage.setItem(SK,p)}catch(e){}}
function rp(){if(!SK)SK=getSK();try{sessionStorage.removeItem(SK)}catch(e){}}
function resetSK(){SK=null;}

function isValidPath(p){return /^[\/~]|[A-Za-z]:[\\\/]/.test(p)}

// ===== 发送命令到 Agent =====
function sendToAgent(text){
  var app=document.querySelector('openclaw-app');
  if(!app) return false;
  var root=app.shadowRoot||app;
  var ta=root.querySelector('textarea');
  if(!ta) return false;
  var ns=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
  ns.call(ta,text);
  ta.dispatchEvent(new Event('input',{bubbles:true}));
  ta.focus();
  setTimeout(function(){
    var sb=root.querySelector('.chat-send-btn');
    if(sb&&!sb.disabled){sb.click();return;}
    ta.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  },100);
  return true;
}

// ===== 标记解析 =====
function parseMarker(text,type){
  var re=new RegExp('\\['+type+':\\s*([^\\]]+)\\]');
  var m=text.match(re);
  if(!m||!m[1]) return null;
  var inner=m[1].trim();
  var sep=inner.indexOf('::');
  if(sep<0) return {sessionKey:inner,value:''};
  return {sessionKey:inner.slice(0,sep).trim(),value:inner.slice(sep+2).trim()};
}
function isForMe(markerKey){
  if(markerKey==='main'){
    var cur=getSessionKey();
    var parts=cur.split(':');
    return parts.length>=2?parts[1]==='main':cur==='main';
  }
  return markerKey===getSessionKey();
}

// ===== 入站命令监听 =====
function watchForPendingCommands(){
  var app=document.querySelector('openclaw-app');
  if(!app) return;
  var root=app.shadowRoot||app;
  var ta=root.querySelector('textarea');
  var _lastVal='';
  setInterval(function(){
    if(!ta||!ta.value) return;
    var v=ta.value.trim();
    if(v===_lastVal) return;
    _lastVal=v;
    if(v.indexOf('[lock:')===0){
      _pendingLock=true;
      if(_lockTimer) clearTimeout(_lockTimer);
      _lockTimer=setTimeout(function(){_pendingLock=false;_lockTimer=null;},15000);
    }
    if(v==='[unlock]'){
      _pendingUnlock=true;
      if(_unlockTimer) clearTimeout(_unlockTimer);
      _unlockTimer=setTimeout(function(){_pendingUnlock=false;_unlockTimer=null;},15000);
    }
  },50);
}
setTimeout(watchForPendingCommands,1000);

// ===== 核心：扫描标记 =====
function scanForMarkers(text){
  if(!text||typeof text!=='string') return false;
  var changed=false;

  // [LockConfirmed:]
  var lc=parseMarker(text,'LockConfirmed');
  if(lc&&isForMe(lc.sessionKey)&&isValidPath(lc.value)){
    sp(lc.value);_pendingLockPath=null;changed=true;
    _pendingLock=false;if(_lockTimer){clearTimeout(_lockTimer);_lockTimer=null;}
  }

  // [LockCleared:]
  var clr=parseMarker(text,'LockCleared');
  if(clr&&isForMe(clr.sessionKey)){
    rp();_pendingLockPath=null;changed=true;
    _pendingUnlock=false;if(_unlockTimer){clearTimeout(_unlockTimer);_unlockTimer=null;}
  }

  // [Project:] -- 只在 _pendingDetect 窗口内接受
  // 移除离线同步路径：防止旧气泡中字面量 [Project: main::/path] 串扰
  var pm=parseMarker(text,'Project');
  if(pm&&isForMe(pm.sessionKey)&&isValidPath(pm.value)){
    if(_pendingDetect){
      sp(pm.value);_pendingDetect=false;changed=true;
      if(_detectTimer){clearTimeout(_detectTimer);_detectTimer=null;}
    }
  }

  if(changed) updateUI();
  return changed;
}

// ===== DOM MutationObserver =====
var _obs=null;
function createObserver(root){
  if(_obs) _obs.disconnect();
  var timer=null;
  _obs=new MutationObserver(function(mutations){
    if(timer) return;
    timer=setTimeout(function(){
      timer=null;
      for(var m=0;m<mutations.length;m++){
        var nodes=mutations[m].addedNodes;
        for(var j=0;j<nodes.length;j++){
          var n=nodes[j];
          if(n.nodeType!==1) continue;
          var bubbles=n.classList&&n.classList.contains('chat-bubble')&&!n.classList.contains('chat-reading-indicator')
            ?[n]
            :(n.querySelectorAll?n.querySelectorAll('.chat-bubble:not(.chat-reading-indicator)'):[]);
          for(var t=0;t<bubbles.length;t++){
            var el=bubbles[t];
            if(el.dataset.plDone) continue;
            if(scanForMarkers(el.innerHTML)||scanForMarkers(el.textContent)){
              el.dataset.plDone='1';return;
            }
          }
        }
      }
    },300);
  });
  _obs.observe(root,{childList:true,subtree:true,characterData:true});
}

// ===== 流式响应分裂保护 =====
var _bracketBuf = {};
function accumulateStreamChunk(chunk, sourceId){
  var id=sourceId||'default';
  if(!_bracketBuf[id]) _bracketBuf[id]='';
  _bracketBuf[id]+=chunk;
  var buf=_bracketBuf[id];
  if(buf.indexOf(']')>=0){
    var markers=['[Project:','[LockConfirmed:','[LockCleared:'];
    for(var mi=0;mi<markers.length;mi++){
      if(buf.indexOf(markers[mi])>=0 && buf.indexOf(']',buf.indexOf(markers[mi]))>=0){
        _bracketBuf[id]='';
        scanForMarkers(buf);
        return;
      }
    }
  }
  if(buf.length>1000||buf.indexOf('\n')>=0) _bracketBuf[id]='';
}

// ===== WS 原型劫持（流式累积 + 标记扫描） =====
(function(){
  var _origWS=window.WebSocket;
  if(!_origWS||window.WebSocket._plPatched) return;
  window.WebSocket=function(url,protocols){
    var ws=protocols?new _origWS(url,protocols):new _origWS(url);
    var wsId='ws_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
    var _origAdd=ws.addEventListener.bind(ws);
    ws.addEventListener=function(type,listener,opts){
      if(type==='message'){
        var wrapped=function(event){
          var data=typeof event.data==='string'?event.data:(event.data&&event.data.toString?event.data.toString():'');
          if(data){scanForMarkers(data);accumulateStreamChunk(data, wsId);}
          return listener.call(this,event);
        };
        return _origAdd.call(ws,type,wrapped,opts);
      }
      return _origAdd.call(ws,type,listener,opts);
    };
    var _msgDesc=Object.getOwnPropertyDescriptor(_origWS.prototype,'onmessage');
    if(_msgDesc){
      Object.defineProperty(ws,'onmessage',{
        configurable:true,enumerable:true,
        get:function(){return ws._plOrigOnMsg||_msgDesc.get.call(ws)},
        set:function(fn){
          if(typeof fn==='function'){
            var wrapped=function(event){
              var data=typeof event.data==='string'?event.data:(event.data&&event.data.toString?event.data.toString():'');
              if(data){scanForMarkers(data);accumulateStreamChunk(data, wsId);}
              return fn.call(this,event);
            };
            ws._plOrigOnMsg=wrapped;
            _msgDesc.set.call(ws,wrapped);
          }else{
            ws._plOrigOnMsg=null;
            _msgDesc.set.call(ws,fn);
          }
        }
      });
    }
    return ws;
  };
  window.WebSocket.prototype=_origWS.prototype;
  window.WebSocket.CONNECTING=_origWS.CONNECTING;
  window.WebSocket.OPEN=_origWS.OPEN;
  window.WebSocket.CLOSING=_origWS.CLOSING;
  window.WebSocket.CLOSED=_origWS.CLOSED;
  window.WebSocket._plPatched=true;
})();

// ===== UI =====
function updateUI(){
  if(!_lockInp||!_lockIcon) return;
  var val=gp();
  var displayVal=_pendingLockPath&&_pendingLockPath!=='__unlocking__'?_pendingLockPath:val;
  var locked=!!val&&!_pendingLockPath;
  _lockInp.value=displayVal;
  _lockIcon.textContent=_pendingLockPath?'\u{1F504}':locked?'\u{1F512}':'\u{1F4CC}';
  _lockIcon.title=_pendingLockPath?'等待 Agent 确认...':locked?'\u{1F512} '+val+' -- \u70B9\u51FB\u89E3\u9664\u9501\u5B9A':'\u70B9\u51FB\u81EA\u52A8\u68C0\u6D4B\u9879\u76EE\u8DEF\u5F84';
  _lockIcon.style.color=_pendingLockPath?'var(--oc-warning,#f59e0b)':locked?'var(--oc-success,#22c55e)':'';
}

function mkEl(){
  var w=document.createElement('div');
  w.id='openclaw-project-lock';
  w.style.cssText='display:inline-flex;align-items:center;gap:4px;margin-left:8px;font-size:11px;opacity:0.6;transition:opacity 0.2s;flex-shrink:0;vertical-align:middle;';
  w.onmouseenter=function(){w.style.opacity='1'};
  w.onmouseleave=function(){w.style.opacity='0.6'};

  var lb=document.createElement('span');
  lb.style.cssText='font-size:12px;cursor:pointer;flex-shrink:0;';
  _lockIcon=lb;
  lb.onclick=function(){
    if(_pendingLockPath) return;
    if(gp()){
      _pendingLockPath='__unlocking__';updateUI();
      sendToAgent('[unlock]');
    }else{
      _pendingDetect=true;
      if(_detectTimer) clearTimeout(_detectTimer);
      _detectTimer=setTimeout(function(){_pendingDetect=false;_detectTimer=null;},15000);
      sendToAgent('[detect-project]');
    }
  };

  var inp=document.createElement('input');
  inp.type='text';
  inp.placeholder='\u9879\u76EE\u8DEF\u5F84';
  inp.style.cssText='width:140px;min-width:60px;background:transparent;border:1px solid var(--oc-border,rgba(128,128,128,0.2));border-radius:4px;padding:2px 6px;color:inherit;font-size:11px;outline:none;flex-shrink:1;';
  inp.title='\u8F93\u5165\u8DEF\u5F84\u540E\u6309 Enter \u53D1\u9001\u9501\u5B9A\u547D\u4EE4\uFF0C\u7B49\u5F85 Agent \u786E\u8BA4';
  inp.onkeydown=function(e){
    if(e.key==='Enter'){
      e.preventDefault();e.stopPropagation();
      var path=inp.value.trim();
      if(!path){
        _pendingLockPath='__unlocking__';updateUI();
        sendToAgent('[unlock]');
      }else if(isValidPath(path)){
        _pendingLockPath=path;updateUI();
        _pendingLock=true;
        if(_lockTimer) clearTimeout(_lockTimer);
        _lockTimer=setTimeout(function(){_pendingLock=false;_lockTimer=null;},15000);
        sendToAgent('[lock: '+path+']');
      }else{
        sp(path);updateUI();
      }
      inp.blur();
    }
  };

  _lockEl=w;_lockInp=inp;
  updateUI();

  var app=document.querySelector('openclaw-app');
  if(app) createObserver(app.shadowRoot||app);
  document.addEventListener('DOMContentLoaded',function(){
    setTimeout(function(){
      var app=document.querySelector('openclaw-app');
      if(app) createObserver(app.shadowRoot||app);
    },500);
  });

  w.appendChild(lb);
  w.appendChild(inp);
  return w;
}

// ===== 插入 UI =====
function tryInsert(){
  if(_lockEl&&document.contains(_lockEl)) return true;
  document.querySelectorAll('#openclaw-project-lock').forEach(function(el){el.remove();});
  _lockEl=null;_lockInp=null;_lockIcon=null;
  var app=document.querySelector('openclaw-app');
  if(!app) return false;
  var root=app.shadowRoot||app;
  var tb=root.querySelector('.agent-chat__toolbar');
  if(!tb) return false;
  var btns=tb.querySelectorAll('.agent-chat__input-btn');
  if(btns.length){btns[btns.length-1].after(mkEl())}
  else{tb.appendChild(mkEl())}
  return true;
}

var _pollCount=0;
var _pollTimer=setInterval(function(){
  _pollCount++;
  if(tryInsert()){clearInterval(_pollTimer);}
  else if(_pollCount>=40){clearInterval(_pollTimer);}
},500);

var _bodyObs=new MutationObserver(function(){
  if(!_lockEl) tryInsert();
});
_bodyObs.observe(document.body,{childList:true,subtree:true});
setTimeout(function(){_bodyObs.disconnect();},20000);

setInterval(function(){
  var all=document.querySelectorAll('#openclaw-project-lock');
  if(all.length>1){
    all.forEach(function(el){el.remove();});
    _lockEl=null;_lockInp=null;_lockIcon=null;
    tryInsert();
  }else if(_lockEl&&!document.contains(_lockEl)){
    _lockEl=null;_lockInp=null;_lockIcon=null;
    tryInsert();
  }
},2000);
})();
</script>
<!-- End Project Lock UI Injection -->