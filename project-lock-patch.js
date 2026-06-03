<!-- Project Lock UI Injection -->
<!-- OpenClaw WebUI 项目锁定补丁 v8 -->
<!-- 更新日期: 2026-06-03 -->
<!-- 注入位置: dist/control-ui/index.html 的 </body> 标签前 -->
<!-- 功能: 聊天输入框下方的 📌 项目路径锁定 UI -->
<!-- v7 修复: ①Shadow DOM 穿透（openclaw-app shadowRoot MutationObserver） -->
<!--          ②WS 劫持增加 debug 日志 ③备用轮询 fallback ④DOMContentLoaded 时二次 attach -->
<script>
// OpenClaw WebUI 项目锁定 v8 — 流式渲染检测修复 + Shadow DOM characterData
(function(){'use strict';
var SK;
var GRACE_MS = 3500;
var graceActive = true;
var _lockEl=null,_lockInp=null,_lockBd=null,_lockIcon=null;

setTimeout(function(){ graceActive = false; }, GRACE_MS);

function agentKey(){
  var m=location.search.match(/agent[=:]([^&]+)/)||location.hash.match(/agent[=:]([^&]+)/);
  var p=location.pathname.match(/agent\/([^/]+)/);
  var name=(m&&m[1])||(p&&p[1])||'main';
  // 解析 session 参数中的 agent name（格式 xxx:agentName）
  var s=location.search.match(/session=([^&]+)/);
  if(s){
    try{
      var d=decodeURIComponent(s[1]);
      var parts=d.split(':');
      if(parts.length>=2&&parts[1].length>0){name=parts[1]}
    }catch(e){}
  }
  return 'openclaw_project_lock_'+name.replace(/[^a-zA-Z0-9_-]/g,'_');
}
function resetSK(){ SK = null; }
function gp(){if(!SK)SK=agentKey();try{return localStorage.getItem(SK)||''}catch(e){return ''}}
function sp(p){if(!SK)SK=agentKey();try{localStorage.setItem(SK,p)}catch(e){}}
var TP='\n[Project: ',TS=']';

// ===== 修复 ①：统一路径扫描函数（WS + DOM 共用） =====
function scanForProjectPath(text){
  if(graceActive) return false;
  if(!text||typeof text!=='string') return false;
  var mm=text.match(/\[Project:\s*([^\]]+)\]/);
  if(mm&&mm[1]){
    var pp=mm[1].trim();
    if(pp.length>5&&pp!==gp()){
      if(_lockInp){
        _lockInp.value=pp;
        sp(pp);
        ub();
        // 修复 ④：自动检测到路径后重置 lastVal，防止后续消息被吞
        lastVal='';
      }
      console.log('[ProjectLock] Detected:', pp);
      return true;
    }
  }
  return false;
}

// ===== Monkey-patch history.pushState/replaceState =====
var _origPushState = history.pushState;
var _origReplaceState = history.replaceState;
var _lastHref = location.href;

function onUrlChange(){
  if(location.href === _lastHref) return;
  var oldSK = SK ? SK : agentKey();
  _lastHref = location.href;
  resetSK();
  var newSK = agentKey();
  if(oldSK !== newSK){
    console.log('[ProjectLock] Agent changed:', oldSK, '->', newSK);
    refreshUI();
  }
}

history.pushState = function(){
  var ret = _origPushState.apply(this, arguments);
  onUrlChange();
  return ret;
};
history.replaceState = function(){
  var ret = _origReplaceState.apply(this, arguments);
  onUrlChange();
  return ret;
};

// popstate 备用（浏览器前进后退按钮）
window.addEventListener('popstate', function(){
  _lastHref = location.href;
  resetSK();
  refreshUI();
});

// 优化 ③：移除冗余的 URL MutationObserver
// pushState/replaceState 已被 monkey-patch，popstate 也已监听
// 不再需要额外的 MutationObserver 来检测 URL 变化

function refreshUI(){
  if(!_lockInp) return;
  var val = gp();
  _lockInp.value = val;
  if(_lockBd){
    if(val){
      var s=val.replace(/\\/g,'/').split('/').filter(Boolean);
      _lockBd.textContent=s.slice(-2).join('/');
    }else{
      _lockBd.textContent='';
    }
  }
  // ⑨ 切换图标 emoji
  if(_lockIcon){
    _lockIcon.textContent=val?'\u{1F512}':'\u{1F4CC}';
    _lockIcon.title=val
      ?'\u{1F512} '+val+' — 点击解除锁定'
      :'点击自动检测项目路径';
  }
}

// ===== 徽章更新函数（提到顶层供 scanForProjectPath 调用） =====
// ⑨ badge 不再重复 emoji，图标状态由 ub()/refreshUI() 统一管理
function ub(){
  if(!_lockBd||!_lockInp) return;
  if(_lockInp.value){
    var s=_lockInp.value.replace(/\\/g,'/').split('/').filter(Boolean);
    _lockBd.textContent=s.slice(-2).join('/');
  }else{
    _lockBd.textContent='';
  }
  // ⑨ 合并 📌🔒：按钮 emoji 随锁定状态切换
  if(_lockIcon){
    _lockIcon.textContent=_lockInp.value?'\u{1F512}':'\u{1F4CC}';
    _lockIcon.title=_lockInp.value
      ?'\u{1F512} '+_lockInp.value+' — 点击解除锁定'
      :'点击自动检测项目路径';
  }
}

function mkEl(){
  var w=document.createElement('div');
  w.id='openclaw-project-lock';
  w.style.cssText='display:inline-flex;align-items:center;gap:4px;margin-left:8px;font-size:11px;opacity:0.6;transition:opacity 0.2s;flex-shrink:0;vertical-align:middle;';
  w.onmouseenter=function(){w.style.opacity='1'};
  w.onmouseleave=function(){w.style.opacity='0.6'};

  var lb=document.createElement('span');
  // ⑨ 统一图标按钮：未锁定=📌，已锁定=🔒，hover 时显示完整路径
  lb.textContent=gp()?'\u{1F512}':'\u{1F4CC}';
  lb.title=gp()?'\u{1F512} '+gp()+' — 点击解除锁定':'点击自动检测项目路径';
  lb.style.cssText='font-size:12px;cursor:pointer;flex-shrink:0;';
  lb.onclick=function(){
    if(gp()){inp.value='';sp('');ub();return}
    var ta=document.querySelector('textarea');
    if(!ta)return;
    var ns=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
    ns.call(ta,'[detect-project]');
    ta.dispatchEvent(new Event('input',{bubbles:true}));
    ta.focus();
    setTimeout(function(){
      var sb=document.querySelector('button[aria-label*="send" i],button[aria-label*="\u53D1\u9001" i],button[data-testid="send"]');
      if(sb&&!sb.disabled){sb.click()}
      else{ta.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))}
    },150);
  };
  _lockIcon=lb; // 保存引用供 ub() 切换 emoji

  var inp=document.createElement('input');
  inp.type='text';
  inp.placeholder='\u9879\u76EE\u8DEF\u5F84';
  inp.value=gp();
  inp.style.cssText='width:140px;min-width:60px;background:transparent;border:1px solid var(--oc-border,rgba(128,128,128,0.2));border-radius:4px;padding:2px 6px;color:inherit;font-size:11px;outline:none;flex-shrink:1;';
  inp.title='\u8F93\u5165\u9879\u76EE\u8DEF\u5F84\u540E\u6309 Enter \u9501\u5B9A\uFF0C\u6E05\u7A7A\u540E\u6309 Enter \u89E3\u9664';

  var bd=document.createElement('span');
  // ⑨ badge 只显示最后两段路径，不再重复 emoji
  bd.style.cssText='font-size:10px;white-space:nowrap;color:var(--oc-text-muted,#888);flex-shrink:0;overflow:hidden;text-overflow:ellipsis;max-width:160px;';
  ub();
  inp.onkeydown=function(e){
    if(e.key==='Enter'){e.preventDefault();e.stopPropagation();sp(inp.value);ub();inp.blur()}
  };
  inp.onchange=function(){sp(inp.value);ub()};

  // 保存 UI 引用供 refreshUI() 和 scanForProjectPath() 使用
  _lockEl=w; _lockInp=inp; _lockBd=bd; // _lockIcon 已在上方赋值

  // ===== 修复 ①：链式 WebSocket 劫持（防覆盖） =====
  var _origWS=window.WebSocket;
  if(_origWS&&window.WebSocket!==_origWS){
    // 已有其他脚本劫持了 WebSocket，用链式包装
    _origWS=window.WebSocket;
  }
  function wrapWS(ws){
    var _origAdd=ws.addEventListener.bind(ws);
    ws.addEventListener=function(type,listener,opts){
      if(type==='message'){
        var wrapped=function(event){
          var data=typeof event.data==='string'?event.data:(event.data&&event.data.toString?event.data.toString():'');
          scanForProjectPath(data);
          console.log('[ProjectLock] WS addEventListener msg:', data.substring(0,200));
          return listener.call(this,event);
        };
        return _origAdd.call(ws,type,wrapped,opts);
      }
      return _origAdd.call(ws,type,listener,opts);
    };
    var _msgDesc=Object.getOwnPropertyDescriptor(_origWS.prototype,'onmessage');
    if(_msgDesc){
      Object.defineProperty(ws,'onmessage',{
        configurable:true,
        enumerable:true,
        get:function(){return ws._plOrigOnMsg||_msgDesc.get.call(ws)},
        set:function(fn){
          if(typeof fn==='function'){
            var wrapped=function(event){
              var data=typeof event.data==='string'?event.data:(event.data&&event.data.toString?event.data.toString():'');
              scanForProjectPath(data);
              console.log('[ProjectLock] WS onmessage msg:', data.substring(0,200));
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
  }
  if(_origWS){
    // 保存链式引用，防止多实例互相覆盖
    window.WebSocket=function(url,protocols){
      var ws=protocols?new _origWS(url,protocols):new _origWS(url);
      return wrapWS(ws);
    };
    window.WebSocket.prototype=_origWS.prototype;
    window.WebSocket.CONNECTING=_origWS.CONNECTING;
    window.WebSocket.OPEN=_origWS.OPEN;
    window.WebSocket.CLOSING=_origWS.CLOSING;
    window.WebSocket.CLOSED=_origWS.CLOSED;
    // 标记已劫持，让后续补丁能链式包装
    window.WebSocket._plPatched=true;
  }

  // ===== v7 修复：Shadow DOM 穿透 + DOM MutationObserver =====
  // OpenClaw 用 Lit web component (openclaw-app)，消息渲染在 Shadow DOM 内部
  // document.body 上的 MutationObserver 看不到 shadow 内部，需要穿透

  function scanElements(root){
    var bubbles=root.querySelectorAll('.chat-bubble:not(.chat-reading-indicator)');
    var assists=root.querySelectorAll('[class*="assistant"]');
    var targets=[];
    var seen={};
    for(var i=0;i<bubbles.length;i++) targets.push(bubbles[i]);
    for(var i=0;i<assists.length;i++) targets.push(assists[i]);
    for(var t=0;t<targets.length;t++){
      var el=targets[t];
      // 修复 ⑧：不在首次扫描时标记，只在匹配成功后标记
      // 流式渲染时 bubble 内容会逐步填充，过早 plScanned 会导致完整内容无法被扫描
      if(el.dataset.plDone) continue; // 已成功匹配过才跳过
      var html=el.innerHTML||'';
      var raw=el.textContent||'';
      if(scanForProjectPath(html)||scanForProjectPath(raw)){
        el.dataset.plDone='1'; // 匹配成功才标记，防止重复处理
        return true;
      }
    }
    return false;
  }

  var scanTimer=null;
  var shadowObs=null;

  function createShadowObserver(){
    if(shadowObs) return;
    var app=document.querySelector('openclaw-app');
    if(!app||!app.shadowRoot) return false;
    console.log('[ProjectLock] Shadow DOM observer attached');
    shadowObs=new MutationObserver(function(mutations){
      if(graceActive) return;
      if(scanTimer) return;
      scanTimer=setTimeout(function(){
        scanTimer=null;
        if(scanElements(app.shadowRoot)) return;
        // 也检查嵌套 shadow（如果有）
        var nested=app.shadowRoot.querySelectorAll('*');
        for(var i=0;i<nested.length;i++){
          if(nested[i].shadowRoot&&scanElements(nested[i].shadowRoot)) return;
        }
      },500);
    });
    // 修复 ⑧：加 characterData:true，流式渲染的文本节点变更也能触发扫描
    shadowObs.observe(app.shadowRoot,{childList:true,subtree:true,characterData:true});
    return true;
  }

  // 尝试立即 attach（如果 openclaw-app 已经有 shadowRoot）
  createShadowObserver();

  // DOMContentLoaded 时二次尝试（web component 可能延迟渲染）
  document.addEventListener('DOMContentLoaded',function(){
    setTimeout(function(){ createShadowObserver(); },500);
  });

  // 保留 document.body 观察作为 fallback（处理 light DOM 中的内容）
  var replyObs=new MutationObserver(function(mutations){
    if(graceActive) return;
    if(scanTimer) return;
    scanTimer=setTimeout(function(){
      scanTimer=null;
      // 尝试穿透 shadow DOM
      var app=document.querySelector('openclaw-app');
      if(app&&app.shadowRoot){
        if(scanElements(app.shadowRoot)) return;
      }
      // fallback: light DOM 扫描
      var added=[];
      for(var i=0;i<mutations.length;i++){
        var ml=mutations[i].addedNodes;
        for(var j=0;j<ml.length;j++) added.push(ml[j]);
      }
      for(var i=0;i<added.length;i++){
        var n=added[i];
        if(n.nodeType!==1) continue;
        // 修复 ⑧：用 plDone 代替 plScanned
        var targets=[];
        if(n.classList&&(n.classList.contains('chat-bubble')&&!n.classList.contains('chat-reading-indicator'))){
          targets.push(n);
        }else if(n.classList&&/assistant/i.test(n.className)){
          targets.push(n);
        }else if(n.querySelectorAll){
          var kids=n.querySelectorAll('.chat-bubble:not(.chat-reading-indicator),[class*="assistant"]');
          for(var j=0;j<kids.length;j++) targets.push(kids[j]);
        }
        for(var t=0;t<targets.length;t++){
          var el=targets[t];
          if(el.dataset.plDone) continue;
          var html=el.innerHTML||'';
          var raw=el.textContent||'';
          if(scanForProjectPath(html)||scanForProjectPath(raw)){
            el.dataset.plDone='1';
            return;
          }
        }
      }
    },500);
  });
  // 修复 ⑧：加 characterData:true
  replyObs.observe(document.body,{childList:true,subtree:true,characterData:true});

  w.appendChild(lb);
  w.appendChild(inp);
  w.appendChild(bd);
  return w;
}

// Intercept send to append project tag
var lastVal='';
var _sendLock=false; // 修复 ⑤：防重发锁
function injectTag(ta){
  var pp=gp();
  if(!pp||!ta.value) return;
  if(ta.value==='[detect-project]') return;
  var tag=TP+pp+TS;
  if(ta.value.indexOf('[Project: ')>=0){
    ta.value=ta.value.replace(/\[Project: [^\]]*\]/,tag);
  }else{
    ta.value=ta.value+tag;
  }
}
document.addEventListener('keydown',function(e){
  var ta=e.target;
  if(ta.tagName!=='TEXTAREA') return;
  var isSend=e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey;
  var isCtrlSend=e.key==='Enter'&&(e.ctrlKey||e.metaKey);
  if(isSend||isCtrlSend){
    requestAnimationFrame(function(){
      if(ta.value&&ta.value!==lastVal){
        var bef=ta.value;
        injectTag(ta);
        lastVal=ta.value;
        if(bef!==ta.value&&!_sendLock){
          _sendLock=true;
          ta.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
          setTimeout(function(){ _sendLock=false; },200);
        }
      }
    });
  }
});

// Bind send button
function bindSendBtns(){
  var btns=document.querySelectorAll('button[data-testid="send"],button[aria-label*="send" i],button[aria-label*="\u53D1\u9001" i]');
  for(var i=0;i<btns.length;i++){
    var btn=btns[i];
    if(!btn.dataset.ps){
      btn.dataset.ps='1';
      btn.addEventListener('click',function(){
        var ta=document.querySelector('textarea');
        if(ta&&ta.value){injectTag(ta);lastVal=ta.value}
      },true);
    }
  }
}
var btnObs=new MutationObserver(function(){bindSendBtns()});
btnObs.observe(document.body,{childList:true,subtree:false});
setTimeout(function(){btnObs.disconnect();bindSendBtns()},5000);

// Track textarea input reset
var taList=document.querySelectorAll('textarea');
for(var i=0;i<taList.length;i++){
  if(!taList[i].dataset.po){
    taList[i].dataset.po='1';
    taList[i].addEventListener('input',function(){lastVal=''});
  }
}

// Wait for toolbar, then insert
var _plInserted=false;
function tryInsert(){
  if(document.getElementById('openclaw-project-lock')) return true;
  var tb=document.querySelector('.agent-chat__toolbar');
  if(!tb) return false;
  var btns=tb.querySelectorAll('.agent-chat__input-btn');
  if(btns.length){btns[btns.length-1].after(mkEl())}
  else{tb.appendChild(mkEl())}
  _plInserted=true;
  return true;
}
function waitToolbar(){
  if(tryInsert()) return;
  var ob=new MutationObserver(function(){
    if(tryInsert()){ob.disconnect();return}
    if(_plInserted&&!document.getElementById('openclaw-project-lock')){
      _plInserted=false;
    }
  });
  ob.observe(document.body,{childList:true,subtree:true});
  // 优化 ⑥：SPA 轮询间隔从 3s 提升到 5s（降低 CPU 开销）
  setInterval(function(){
    if(!document.getElementById('openclaw-project-lock')&&document.querySelector('.agent-chat__toolbar')){
      tryInsert();
    }
  },5000);
}

// Wait for app mount
function waitApp(){
  var a=document.querySelector('openclaw-app,#root,#app');
  if(a&&a.children.length>0){waitToolbar();return}
  var ob=new MutationObserver(function(){
    var el=document.querySelector('openclaw-app,#root,#app');
    if(el&&el.children.length>0){ob.disconnect();waitToolbar()}
  });
  ob.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(function(){ob.disconnect()},15000);
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',waitApp);
}else{
  waitApp();
}
})();
</script>
<!-- End Project Lock UI Injection -->
