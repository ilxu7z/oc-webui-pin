<!-- Project Lock UI Injection (v32) -->
<!-- 1会话=1工作目录 · per-session localStorage + Agent .current-projects.json -->
<!-- v32: 修复多会话隔离 — 增加 page-load sync 修复 Agent 端状态断裂 -->
<script>
(function(){'use strict';
var _lockEl=null,_lockInp=null,_lockIcon=null;
var _pendingLockPath=null;
var _pendingDetect=false,_detectTimer=null;
var _pendingLock=false,_pendingUnlock=false,_lockTimer=null,_unlockTimer=null;
var _syncedOnLoad=false;
var _resyncTimer=null;

// ===== 会话维度 key =====
// 从 URL session= 参数提取，每个 Tab 独立
// 格式: /chat?agent=main&session=agent:main:explicit:xxx
function getSessionKey(){
  var sel=document.querySelector('[data-chat-session-picker-option][aria-selected="true"]');
  if(sel){var k=sel.getAttribute('data-session-key');if(k) return k;}
  var s=location.search.match(/session=([^&]+)/)||location.hash.match(/session=([^&]+)/);
  if(s){try{return decodeURIComponent(s[1]);}catch(e){}}
  return 'main';
}
// localStorage key: 每个 session 独立，关 Tab 再开保留
function getSK(){return 'openclaw_project_lock_'+getSessionKey().replace(/[^a-zA-Z0-9_.:-]/g,'_');}
function gp(){try{return localStorage.getItem(getSK())||'';}catch(e){return ''}}
function sp(p){try{localStorage.setItem(getSK(),p);}catch(e){}}
function rp(){try{localStorage.removeItem(getSK());}catch(e){}}

// ===== 路径校验 =====
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
// Agent 回复格式: [TYPE: sessionKey::value]
// sessionKey 固定为 'main'（WebChat 通道）
function parseMarker(text,type){
  var re=new RegExp('\\['+type+':\\s*([^\\]]+)\\]');
  var m=text.match(re);
  if(!m||!m[1]) return null;
  var inner=m[1].trim();
  var sep=inner.indexOf('::');
  if(sep<0) return {sessionKey:inner,value:''};
  return {sessionKey:inner.slice(0,sep).trim(),value:inner.slice(sep+2).trim()};
}
// 判断标记是否属于当前会话
// Agent 发 'main'，前端 URL session= 是完整 key
// 两者都接受：'main' 匹配所有 WebChat 会话（每个 Tab 独立 WS 连接，不会串）
function isForMe(markerKey){
  if(markerKey==='main') return true;
  return markerKey===getSessionKey();
}

// ===== 扫描协议标记 =====
function scanForMarkers(text){
  if(!text||typeof text!=='string') return false;
  var changed=false;

  // [LockConfirmed: main::/path] — Agent 确认锁定
  var lc=parseMarker(text,'LockConfirmed');
  if(lc&&isForMe(lc.sessionKey)&&isValidPath(lc.value)&&_pendingLock){
    sp(lc.value);_pendingLockPath=null;changed=true;
    _pendingLock=false;if(_lockTimer){clearTimeout(_lockTimer);_lockTimer=null;}
    console.log('[ProjectLock] Lock confirmed:', lc.value);
  }

  // [LockCleared: main] — Agent 确认解锁
  var clr=parseMarker(text,'LockCleared');
  if(clr&&isForMe(clr.sessionKey)&&_pendingUnlock){
    rp();_pendingLockPath=null;changed=true;
    _pendingUnlock=false;if(_unlockTimer){clearTimeout(_unlockTimer);_unlockTimer=null;}
    console.log('[ProjectLock] Lock cleared');
  }

  // [Project: main::/path] — Agent 返回检测到的路径
  var pm=parseMarker(text,'Project');
  if(pm&&isForMe(pm.sessionKey)){
    if(_pendingDetect){
      if(isValidPath(pm.value)){
        // Agent 有记录或从上下文推断出了路径 — 同步 OK
        sp(pm.value);changed=true;
        console.log('[ProjectLock] Detected:', pm.value);
      } else {
        // Agent 返回空路径 [Project: main::] — Agent 端没有记录
        var stored=gp();
        if(stored){
          // 前端有锁但 Agent 没有 → 自动重发 lock 修复
          console.log('[ProjectLock] Agent has no lock, re-sending [lock: '+stored+']');
          _pendingLock=true;_pendingLockPath=stored;updateUI();
          if(_lockTimer) clearTimeout(_lockTimer);
          _lockTimer=setTimeout(function(){_pendingLock=false;_lockTimer=null;},60000);
          sendToAgent('[lock: '+stored+']');
        }
      }
      if(_detectTimer) clearTimeout(_detectTimer);
      _detectTimer=setTimeout(function(){_pendingDetect=false;_detectTimer=null;},60000);
    }
  }

  if(changed) updateUI();
  return changed;
}

// ===== MutationObserver（捕获 DOM 中的标记） =====
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
        if(mutations[m].type==='characterData'){
          var p=mutations[m].target.parentNode;
          while(p&&p.nodeType===1){
            if(p.classList&&p.classList.contains('chat-bubble')&&!p.classList.contains('chat-reading-indicator')){
              if(!p.dataset.plDone){
                if(scanForMarkers(p.innerHTML)||scanForMarkers(p.textContent)){
                  p.dataset.plDone='1';
                }
              }
              break;
            }
            p=p.parentNode;
          }
        }
      }
    },300);
  });
  _obs.observe(root,{childList:true,subtree:true,characterData:true});
}

// ===== WebSocket 劫持（捕获流式响应中的标记） =====
var _bracketBuf={};
function accumulateStreamChunk(chunk,sourceId){
  var id=sourceId||'default';
  if(!_bracketBuf[id]) _bracketBuf[id]='';
  _bracketBuf[id]+=chunk;
  var buf=_bracketBuf[id];
  if(buf.indexOf(']')>=0){
    var markers=['[Project:','[LockConfirmed:','[LockCleared:'];
    for(var mi=0;mi<markers.length;mi++){
      if(buf.indexOf(markers[mi])>=0&&buf.indexOf(']',buf.indexOf(markers[mi]))>=0){
        _bracketBuf[id]='';
        scanForMarkers(buf);
        return;
      }
    }
  }
  if(buf.length>1000||buf.indexOf('\n')>=0) _bracketBuf[id]='';
}

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
          if(data){scanForMarkers(data);accumulateStreamChunk(data,wsId);}
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
              if(data){scanForMarkers(data);accumulateStreamChunk(data,wsId);}
              return fn.call(this,event);
            };
            ws._plOrigOnMsg=wrapped;
            _msgDesc.set.call(ws,wrapped);
          }else{ws._plOrigOnMsg=null;_msgDesc.set.call(ws,fn);}
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

// ===== UI 更新 =====
function updateUI(){
  if(!_lockInp||!_lockIcon) return;
  var val=gp();
  var displayVal=_pendingLockPath&&_pendingLockPath!=='__unlocking__'?_pendingLockPath:val;
  var locked=!!val&&!_pendingLockPath;
  _lockInp.value=displayVal;
  _lockIcon.textContent=_pendingLockPath?'\u{1F504}':locked?'\u{1F512}':'\u{1F4CC}';
  _lockIcon.title=_pendingLockPath?'\u7B49\u5F85 Agent \u786E\u8BA4...':locked?'\u{1F512} '+val:'\u70B9\u51FB\u81EA\u52A8\u68C0\u6D4B\u9879\u76EE\u8DEF\u5F84';
  _lockIcon.style.color=_pendingLockPath?'var(--oc-warning,#f59e0b)':locked?'var(--oc-success,#22c55e)':'';
}

// ===== 📌 UI 组件 =====
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
      _pendingUnlock=true;
      _pendingLockPath='__unlocking__';updateUI();
      sendToAgent('[unlock]');
    }else{
      _pendingDetect=true;
      if(_detectTimer) clearTimeout(_detectTimer);
      _detectTimer=setTimeout(function(){_pendingDetect=false;_detectTimer=null;},60000);
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
        _pendingUnlock=true;
        _pendingLockPath='__unlocking__';updateUI();
        sendToAgent('[unlock]');
      }else if(isValidPath(path)){
        _pendingLockPath=path;updateUI();
        _pendingLock=true;if(_lockTimer) clearTimeout(_lockTimer);
        _lockTimer=setTimeout(function(){_pendingLock=false;_lockTimer=null;},60000);
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
  w.appendChild(lb);w.appendChild(inp);
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

// ===== 页面加载同步 =====
// 场景：前端 localStorage 有锁，但 Agent 端 .current-projects.json 被清空
// 原因：Agent restart、文件被误清、或之前用 'main' 做 key 导致互相覆盖
// 修复：页面加载后如果 localStorage 有锁，发 [detect-project] 让 Agent 重新确认
//      如果 Agent 回复 [Project: main::] (空)，说明 Agent 端确实没有，自动重发 [lock:]
// 已禁用：页面加载不再自动发送 [detect-project]
// 之前的设计是 localStorage 有锁时自动同步 Agent 端状态（状态断裂修复）
// 但会导致不必要的 WS 流量和 Agent 回复，用户选择停用此功能
function syncOnLoad(){
  _syncedOnLoad=true; // 直接标记完成，不做任何事
}

// 在 tryInsert 成功后触发同步
var _origTryInsert=tryInsert;
tryInsert=function(){
  var ok=_origTryInsert.apply(this,arguments);
  if(ok && !_syncedOnLoad){ syncOnLoad(); }
  return ok;
};

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