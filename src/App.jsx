import { useState, useEffect, useRef, useCallback } from "react";

// ── Constants
const DIGIT_WORDS = ["zero","one","two","three","four","five","six","seven","eight","nine"];
const PRIZES = ["Early Five","Top Line","Middle Line","Bottom Line","Full House"];
const PRIZE_COLORS = { "Early Five":"#4aaee8","Top Line":"#e84545","Middle Line":"#e8824a","Bottom Line":"#d4b84a","Full House":"#f0a830" };
const ROW_COLORS = ["#e84545","#e8824a","#d4b84a"];

// ── Helpers
const genCode = () => Math.random().toString(36).substr(2,6).toUpperCase();
const genId   = () => Math.random().toString(36).substr(2,12);

function shuffle(arr) {
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

function generateTicket() {
  const used=new Set();
  return Array.from({length:3},()=>{
    const cols=shuffle([0,1,2,3,4,5,6,7,8]).slice(0,5).sort((a,b)=>a-b);
    return cols.map(col=>{
      const lo=col===0?1:col*10, hi=col===8?90:col*10+9;
      let n,t=0; do{n=lo+Math.floor(Math.random()*(hi-lo+1));t++;}while(used.has(n)&&t<50);
      used.add(n); return n;
    }).sort((a,b)=>a-b);
  });
}

// ── Speech
function getCallName(n) {
  const m={1:"Kelly's Eye",2:"One and Two",3:"Cup of Tea",4:"Knock at the Door",5:"Man Alive",6:"Half a Dozen",7:"Lucky Seven",8:"Garden Gate",9:"Doctor's Orders",10:"Prime Minister's Den",11:"Legs Eleven",13:"Unlucky Thirteen",16:"Sweet Sixteen",21:"Key of the Door",22:"Two Little Ducks",25:"Duck and Dive",30:"Dirty Gertie",33:"Dirty Knees",40:"Life Begins",44:"Droopy Drawers",45:"Halfway There",50:"Half a Century",55:"Snakes Alive",60:"Five Dozen",66:"Clickety Click",69:"Same Both Ways",76:"Trombones",77:"Sunset Strip",88:"Two Fat Ladies",90:"Top of the Shop"};
  return m[n]||"";
}
function speakSeq(phrases,onDone) {
  if(!window.speechSynthesis){onDone?.();return;}
  window.speechSynthesis.cancel();
  const voices=window.speechSynthesis.getVoices();
  const pref=voices.find(v=>v.lang.startsWith("en")&&(v.name.includes("Google")||v.name.includes("Samantha")))||voices.find(v=>v.lang.startsWith("en"));
  let i=0;
  const next=()=>{
    if(i>=phrases.length){onDone?.();return;}
    const{text,rate=0.85,pause=0}=phrases[i++];
    setTimeout(()=>{const u=new SpeechSynthesisUtterance(text);u.rate=rate;u.pitch=1.05;u.volume=1;if(pref)u.voice=pref;u.onend=next;u.onerror=next;window.speechSynthesis.speak(u);},pause);
  };
  next();
}
function announceNum(num,onDone) {
  const name=getCallName(num),phrases=[];
  if(num>=10){phrases.push({text:`${DIGIT_WORDS[Math.floor(num/10)]} ${DIGIT_WORDS[num%10]}`,rate:0.8});phrases.push({text:String(num),rate:0.82,pause:200});}
  else phrases.push({text:String(num),rate:0.82});
  if(name)phrases.push({text:name,rate:0.88,pause:240});
  speakSeq(phrases,onDone);
}

// ── Firebase REST
function makeDB(url) {
  const base=url.replace(/\/+$/,'');
  const req=(p,opts)=>fetch(`${base}/${p}.json`,{headers:{'Content-Type':'application/json'},...opts}).then(r=>r.json()).catch(()=>null);
  return {
    get:  p=>req(p),
    put:  (p,d)=>req(p,{method:'PUT',body:JSON.stringify(d)}),
    patch:(p,d)=>req(p,{method:'PATCH',body:JSON.stringify(d)}),
    del:  p=>req(p,{method:'DELETE'}),
  };
}

// ── Shared UI
const Btn=({onClick,children,color="gold",disabled,style={}})=>{
  const bg=color==="gold"?"linear-gradient(90deg,#f0a830,#ff6b35)":color==="blue"?"rgba(74,174,232,0.15)":color==="green"?"rgba(123,198,123,0.15)":color==="red"?"rgba(232,69,69,0.15)":"rgba(255,255,255,0.08)";
  const border=color==="gold"?"none":color==="blue"?"1.5px solid #4aaee8":color==="green"?"1.5px solid #7bc67b":color==="red"?"1.5px solid #e84545":"1px solid rgba(255,255,255,0.2)";
  const tc=color==="gold"?"#1a0533":color==="blue"?"#4aaee8":color==="green"?"#7bc67b":color==="red"?"#e84545":"rgba(255,255,255,0.7)";
  return <button onClick={onClick} disabled={disabled} style={{background:disabled?"#333":bg,border,color:disabled?"#555":tc,padding:"12px 20px",borderRadius:"50px",fontSize:"clamp(12px,2vw,15px)",fontWeight:700,fontFamily:"inherit",cursor:disabled?"not-allowed":"pointer",letterSpacing:"0.5px",transition:"all 0.2s",...style}}>{children}</button>;
};

const Card=({children,style={}})=>(
  <div style={{background:"rgba(0,0,0,0.28)",borderRadius:"16px",padding:"14px",border:"1px solid rgba(255,255,255,0.08)",...style}}>{children}</div>
);

const Label=({children,color="#f0a83088"})=>(
  <div style={{fontSize:"10px",letterSpacing:"3px",textTransform:"uppercase",color,marginBottom:"8px"}}>{children}</div>
);

// ── Main App
export default function TambolaLive() {
  // Config
  const [dbUrl,  setDbUrlRaw]  = useState(()=>localStorage.getItem('tlv_db')||'');
  const [myId]                 = useState(()=>{let id=localStorage.getItem('tlv_id');if(!id){id=genId();localStorage.setItem('tlv_id',id);}return id;});
  const [myName, setMyNameRaw] = useState(()=>localStorage.getItem('tlv_name')||'');

  // Nav
  const [screen, setScreen] = useState(()=>localStorage.getItem('tlv_db')?'home':'config');
  const [gameCode,  setGameCode]  = useState('');
  const [joinCode,  setJoinCode]  = useState('');
  const [isAdmin,   setIsAdmin]   = useState(false);
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  // Game state
  const [game,          setGame]          = useState(null);
  const [myMarked,      setMyMarked]      = useState([]);
  const [claimModal,    setClaimModal]    = useState(false);
  const [claimSent,     setClaimSent]     = useState(false);
  const [viewingPlayer, setViewingPlayer] = useState(null); // playerId whose board to show

  // Admin caller
  const [curNum,    setCurNum]    = useState(null);
  const [animating, setAnimating] = useState(false);
  const [flash,     setFlash]     = useState(false);
  const [autoPlay,  setAutoPlay]  = useState(false);
  const [voiceOn,   setVoiceOn]   = useState(true);
  const [countdown, setCountdown] = useState(null);

  const spinRef      = useRef(null);
  const cdRef        = useRef(null);
  const autoPlayRef  = useRef(false);
  const voiceOnRef   = useRef(true);
  const animRef      = useRef(false);
  const gameRef      = useRef(null);

  autoPlayRef.current = autoPlay;
  voiceOnRef.current  = voiceOn;
  animRef.current     = animating;
  gameRef.current     = game;

  const db = dbUrl ? makeDB(dbUrl) : null;

  // ── Computed
  const calledNums  = game?.calledNums ? game.calledNums.split(',').filter(Boolean).map(Number) : [];
  const players     = game?.players ? Object.entries(game.players) : [];
  const myPlayer    = game?.players?.[myId];
  const myTicket    = myPlayer?.ticket ? JSON.parse(myPlayer.ticket) : null;
  const claims      = game?.claims ? Object.values(game.claims).sort((a,b)=>b.time-a.time) : [];
  const latestClaim = claims[0] || null;
  const remaining   = Array.from({length:90},(_,i)=>i+1).filter(n=>!calledNums.includes(n));

  // ── Poll Firebase
  useEffect(()=>{
    if(!gameCode||!db) return;
    const poll=async()=>{const d=await db.get(`games/${gameCode}`);if(d)setGame(d);};
    poll();
    const t=setInterval(poll,1500);
    return ()=>clearInterval(t);
  },[gameCode]);

  // ── Auto-transition lobby → game
  useEffect(()=>{
    if(game?.status==='playing'&&screen==='lobby') setScreen('game');
  },[game?.status]);

  // ── Init marked from Firebase
  useEffect(()=>{
    if(myPlayer?.marked&&myMarked.length===0)
      setMyMarked(myPlayer.marked.split(',').filter(Boolean).map(Number));
  },[myPlayer?.marked]);

  // ── Admin: schedule next call
  const scheduleNext=useCallback(()=>{
    if(!autoPlayRef.current) return;
    clearInterval(cdRef.current);
    let t=3; setCountdown((t*0.5).toFixed(1));
    cdRef.current=setInterval(()=>{
      t--;
      if(t<=0){clearInterval(cdRef.current);setCountdown(null);if(autoPlayRef.current)doCall();}
      else setCountdown((t*0.5).toFixed(1));
    },500);
  },[]);

  const doCall=useCallback(()=>{
    if(animRef.current) return;
    const called=(gameRef.current?.calledNums||'').split(',').filter(Boolean).map(Number);
    const rem=Array.from({length:90},(_,i)=>i+1).filter(n=>!called.includes(n));
    if(!rem.length) return;
    clearInterval(cdRef.current); setCountdown(null);
    setAnimating(true); setFlash(false);
    let ticks=0; const pool=[...rem];
    spinRef.current=setInterval(async()=>{
      setCurNum(pool[Math.floor(Math.random()*pool.length)]);
      if(++ticks>=12){
        clearInterval(spinRef.current);
        const num=rem[Math.floor(Math.random()*rem.length)];
        setCurNum(num); setAnimating(false); setFlash(true);
        setTimeout(()=>setFlash(false),800);
        const prev=gameRef.current?.calledNums||'';
        const newCalled=prev?`${prev},${num}`:String(num);
        await db.patch(`games/${gameCode}`,{calledNums:newCalled,currentNumber:num});
        setGame(g=>g?{...g,calledNums:newCalled,currentNumber:num}:g);
        if(voiceOnRef.current) announceNum(num,()=>{if(autoPlayRef.current)scheduleNext();});
        else if(autoPlayRef.current) scheduleNext();
      }
    },55);
  },[gameCode,scheduleNext]);

  useEffect(()=>{
    if(autoPlay){if(!remaining.length){setAutoPlay(false);return;}if(!animating)doCall();}
    else{clearInterval(cdRef.current);setCountdown(null);window.speechSynthesis?.cancel();}
    return()=>clearInterval(cdRef.current);
  },[autoPlay]);

  useEffect(()=>()=>{clearInterval(spinRef.current);clearInterval(cdRef.current);},[]);

  // ── Actions
  const setDbUrl  = u=>{setDbUrlRaw(u);};
  const setMyName = n=>{setMyNameRaw(n);localStorage.setItem('tlv_name',n);};

  const saveConfig=()=>{
    if(!dbUrl.includes('firebaseio.com')&&!dbUrl.includes('firebase')){setError('Paste your Firebase Realtime Database URL');return;}
    localStorage.setItem('tlv_db',dbUrl);
    setScreen('home');setError('');
  };

  const createGame=async()=>{
    if(!myName.trim()){setError('Enter your name');return;}
    setLoading(true);setError('');
    try{
      const code=genCode(), ticket=generateTicket();
      await db.put(`games/${code}`,{
        adminId:myId,adminName:myName,status:'lobby',calledNums:'',currentNumber:null,
        players:{[myId]:{name:myName,ticket:JSON.stringify(ticket),marked:'',showBoard:false,isAdmin:true}},
        claims:{}
      });
      setGameCode(code);setIsAdmin(true);setScreen('lobby');
    }catch(e){setError('Could not create game. Check Firebase URL.');}
    setLoading(false);
  };

  const joinGame=async()=>{
    if(!myName.trim()){setError('Enter your name');return;}
    const code=joinCode.toUpperCase().trim();
    if(!code){setError('Enter a game code');return;}
    setLoading(true);setError('');
    try{
      const data=await db.get(`games/${code}`);
      if(!data){setError('Game not found. Check the code.');setLoading(false);return;}
      if(data.status==='finished'){setError('This game has already ended.');setLoading(false);return;}
      const ticket=generateTicket();
      await db.patch(`games/${code}/players/${myId}`,{name:myName,ticket:JSON.stringify(ticket),marked:'',showBoard:false,isAdmin:false});
      setGame(data);setGameCode(code);setIsAdmin(false);
      setScreen(data.status==='playing'?'game':'lobby');
    }catch(e){setError('Error joining. Try again.');}
    setLoading(false);
  };

  const startGame=async()=>{
    await db.patch(`games/${gameCode}`,{status:'playing'});
    setGame(g=>g?{...g,status:'playing'}:g);
    setScreen('game');
  };

  const toggleMark=async num=>{
    const nm=myMarked.includes(num)?myMarked.filter(n=>n!==num):[...myMarked,num];
    setMyMarked(nm);
    await db.patch(`games/${gameCode}/players/${myId}`,{marked:nm.join(',')});
  };

  const claimWin=async prize=>{
    const id=Date.now().toString();
    await db.patch(`games/${gameCode}/claims`,{[id]:{playerId:myId,playerName:myName,prize,time:Date.now()}});
    setClaimModal(false);setClaimSent(true);
  };

  const toggleShowBoard=async()=>{
    const sb=!(myPlayer?.showBoard||false);
    await db.patch(`games/${gameCode}/players/${myId}`,{showBoard:sb});
    setGame(g=>g&&g.players?{...g,players:{...g.players,[myId]:{...g.players[myId],showBoard:sb}}}:g);
  };

  const leaveGame=()=>{
    clearInterval(spinRef.current);clearInterval(cdRef.current);window.speechSynthesis?.cancel();
    setGame(null);setGameCode('');setIsAdmin(false);setMyMarked([]);setCurNum(null);
    setAutoPlay(false);setClaimSent(false);setClaimModal(false);setViewingPlayer(null);
    setScreen('home');
  };

  // ── Style base
  const outerStyle={
    height:'100dvh',width:'100dvw',overflow:'hidden',
    background:'linear-gradient(160deg,#110228 0%,#1e0840 55%,#0a1535 100%)',
    display:'flex',flexDirection:'column',alignItems:'stretch',
    fontFamily:"'Georgia',serif",color:'#fff',boxSizing:'border-box',
    WebkitUserSelect:'none',userSelect:'none',touchAction:'manipulation'
  };

  // Win claim banner (shown on all game screens when someone announces)
  const ClaimBanner=()=>{
    if(!latestClaim) return null;
    const isMe=latestClaim.playerId===myId;
    return(
      <div style={{flexShrink:0,background:`${PRIZE_COLORS[latestClaim.prize]}22`,borderBottom:`2px solid ${PRIZE_COLORS[latestClaim.prize]}`,padding:"8px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"8px"}}>
        <div style={{fontSize:"clamp(11px,2vw,14px)"}}>
          🎉 <b style={{color:PRIZE_COLORS[latestClaim.prize]}}>{latestClaim.playerName}</b> announced <b style={{color:PRIZE_COLORS[latestClaim.prize]}}>{latestClaim.prize}</b>!
        </div>
        {!isMe&&(()=>{const p=game?.players?.[latestClaim.playerId];return p?.showBoard?(
          <button onClick={()=>setViewingPlayer(viewingPlayer===latestClaim.playerId?null:latestClaim.playerId)} style={{background:PRIZE_COLORS[latestClaim.prize],border:"none",color:"#1a0533",padding:"4px 10px",borderRadius:"20px",fontSize:"11px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
            {viewingPlayer===latestClaim.playerId?"Hide Board":"View Board"}
          </button>
        ):<span style={{fontSize:"10px",color:"rgba(255,255,255,0.35)"}}>Board hidden</span>;})()}
      </div>
    );
  };

  // Ticket viewer for another player
  const PlayerBoardView=({playerId})=>{
    const p=game?.players?.[playerId];
    if(!p) return null;
    const ticket=p.ticket?JSON.parse(p.ticket):null;
    const marked=p.marked?p.marked.split(',').filter(Boolean).map(Number):[];
    if(!ticket) return null;
    return(
      <Card style={{marginBottom:"10px",border:"1px solid rgba(240,168,48,0.2)"}}>
        <Label>{p.name}'s Ticket</Label>
        {ticket.map((row,ri)=>(
          <div key={ri} style={{display:"flex",gap:"4px",marginBottom:"4px"}}>
            <div style={{width:"4px",background:ROW_COLORS[ri],borderRadius:"2px",flexShrink:0}}/>
            <div style={{display:"flex",gap:"4px",flex:1}}>
              {row.map(n=>{
                const isCalled=calledNums.includes(n),isMarked=marked.includes(n);
                return(
                  <div key={n} style={{flex:1,textAlign:"center",padding:"6px 2px",borderRadius:"8px",fontSize:"clamp(12px,2.5vw,16px)",fontWeight:700,background:isMarked&&isCalled?"#7bc67b":isMarked?"#d4b84a":isCalled?"rgba(240,168,48,0.2)":"rgba(255,255,255,0.05)",color:isMarked?"#fff":isCalled?"#f0a830":"rgba(255,255,255,0.4)",border:isCalled?"1px solid rgba(240,168,48,0.4)":"1px solid rgba(255,255,255,0.06)"}}>
                    {isMarked?"✓":n}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </Card>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // SCREEN: CONFIG
  // ═══════════════════════════════════════════════════════════
  if(screen==='config') return(
    <div style={{...outerStyle,overflow:'auto',padding:"24px 16px"}}>
      <div style={{maxWidth:"480px",margin:"0 auto",width:"100%"}}>
        <div style={{textAlign:"center",marginBottom:"32px"}}>
          <div style={{fontSize:"clamp(28px,6vw,42px)",fontWeight:900,background:"linear-gradient(90deg,#f0a830,#ff6b35)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>TAMBOLA LIVE</div>
          <div style={{fontSize:"13px",color:"rgba(255,255,255,0.4)",marginTop:"4px",letterSpacing:"2px"}}>MULTIPLAYER SETUP</div>
        </div>

        <Card style={{marginBottom:"20px"}}>
          <Label>Step 1 — Create a Firebase Project</Label>
          <div style={{fontSize:"13px",color:"rgba(255,255,255,0.6)",lineHeight:"1.8"}}>
            1. Go to <b style={{color:"#f0a830"}}>console.firebase.google.com</b><br/>
            2. Click <b>Add project</b> → name it anything<br/>
            3. Go to <b>Build → Realtime Database</b><br/>
            4. Click <b>Create Database</b> → choose any location → <b>Start in test mode</b><br/>
            5. Copy the database URL (looks like <b style={{color:"#4aaee8"}}>https://your-app.firebaseio.com</b>)
          </div>
        </Card>

        <Card>
          <Label>Step 2 — Paste Your Database URL</Label>
          <input
            value={dbUrl} onChange={e=>setDbUrl(e.target.value)}
            placeholder="https://your-app-default-rtdb.firebaseio.com"
            style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:"10px",padding:"12px 14px",color:"#fff",fontSize:"14px",fontFamily:"inherit",outline:"none",marginBottom:"12px"}}
          />
          {error&&<div style={{color:"#e84545",fontSize:"12px",marginBottom:"10px"}}>{error}</div>}
          <Btn onClick={saveConfig} style={{width:"100%",textAlign:"center"}}>Save & Continue →</Btn>
        </Card>
      </div>
      <style>{`* { -webkit-tap-highlight-color:transparent; } input::placeholder{color:rgba(255,255,255,0.25);}`}</style>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // SCREEN: HOME
  // ═══════════════════════════════════════════════════════════
  if(screen==='home') return(
    <div style={{...outerStyle,overflow:'auto',padding:"24px 16px",justifyContent:"center",alignItems:"center"}}>
      <div style={{maxWidth:"420px",width:"100%"}}>
        <div style={{textAlign:"center",marginBottom:"32px"}}>
          <div style={{fontSize:"clamp(32px,7vw,52px)",fontWeight:900,background:"linear-gradient(90deg,#f0a830,#ff6b35)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:"2px"}}>🎱 TAMBOLA</div>
          <div style={{fontSize:"clamp(12px,2vw,16px)",letterSpacing:"4px",color:"#f0a83077",textTransform:"uppercase",marginTop:"4px"}}>Live Multiplayer</div>
        </div>

        <Card style={{marginBottom:"16px"}}>
          <Label>Your Name</Label>
          <input value={myName} onChange={e=>setMyName(e.target.value)}
            placeholder="Enter your name…"
            style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:"10px",padding:"12px 14px",color:"#fff",fontSize:"16px",fontFamily:"inherit",outline:"none"}}
          />
        </Card>

        <div style={{display:"flex",flexDirection:"column",gap:"10px",marginBottom:"16px"}}>
          <Btn onClick={createGame} disabled={loading} style={{width:"100%",textAlign:"center",padding:"16px"}}>
            {loading?"Creating…":"🎮 Create New Game"}
          </Btn>
        </div>

        <Card>
          <Label>Join Existing Game</Label>
          <input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())}
            placeholder="Enter 6-letter code…"
            maxLength={6}
            style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:"10px",padding:"12px 14px",color:"#fff",fontSize:"20px",fontFamily:"inherit",outline:"none",letterSpacing:"4px",textAlign:"center",textTransform:"uppercase",marginBottom:"10px"}}
          />
          <Btn onClick={joinGame} disabled={loading} color="blue" style={{width:"100%",textAlign:"center"}}>
            {loading?"Joining…":"🤝 Join Game"}
          </Btn>
        </Card>

        {error&&<div style={{color:"#e84545",fontSize:"13px",textAlign:"center",marginTop:"12px"}}>{error}</div>}

        <button onClick={()=>{localStorage.removeItem('tlv_db');setDbUrl('');setScreen('config');}} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.2)",fontSize:"11px",cursor:"pointer",fontFamily:"inherit",width:"100%",textAlign:"center",marginTop:"24px"}}>
          ⚙ Change Firebase Settings
        </button>
      </div>
      <style>{`* { -webkit-tap-highlight-color:transparent; } input::placeholder{color:rgba(255,255,255,0.25);}`}</style>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // SCREEN: LOBBY
  // ═══════════════════════════════════════════════════════════
  if(screen==='lobby') return(
    <div style={{...outerStyle,overflow:'auto',padding:"24px 16px",alignItems:"center",justifyContent:"center"}}>
      <div style={{maxWidth:"420px",width:"100%"}}>
        <div style={{textAlign:"center",marginBottom:"24px"}}>
          <Label color="#f0a83099">Game Code</Label>
          <div style={{fontSize:"clamp(42px,12vw,72px)",fontWeight:900,letterSpacing:"8px",color:"#f0a830",lineHeight:1}}>{gameCode}</div>
          <button onClick={()=>navigator.clipboard?.writeText(gameCode)} style={{background:"transparent",border:"1px solid rgba(240,168,48,0.3)",color:"#f0a83088",padding:"5px 14px",borderRadius:"20px",cursor:"pointer",fontSize:"11px",fontFamily:"inherit",marginTop:"8px",letterSpacing:"1px"}}>
            📋 Copy Code
          </button>
          <div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)",marginTop:"8px"}}>Share this code with players</div>
        </div>

        <Card style={{marginBottom:"16px"}}>
          <Label>Players ({players.length})</Label>
          <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
            {players.map(([pid,p])=>(
              <div key={pid} style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 10px",background:"rgba(255,255,255,0.05)",borderRadius:"10px",border:"1px solid rgba(255,255,255,0.08)"}}>
                <div style={{width:"8px",height:"8px",borderRadius:"50%",background:"#7bc67b",flexShrink:0}}/>
                <span style={{fontWeight:700,fontSize:"15px"}}>{p.name}</span>
                {p.isAdmin&&<span style={{fontSize:"10px",background:"rgba(240,168,48,0.15)",color:"#f0a830",padding:"2px 8px",borderRadius:"10px",border:"1px solid rgba(240,168,48,0.3)"}}>Admin</span>}
                {pid===myId&&<span style={{fontSize:"10px",color:"rgba(255,255,255,0.3)"}}>(you)</span>}
              </div>
            ))}
            {players.length===0&&<div style={{color:"rgba(255,255,255,0.3)",fontSize:"13px",textAlign:"center",padding:"8px"}}>Waiting for players…</div>}
          </div>
        </Card>

        {isAdmin
          ?<Btn onClick={startGame} disabled={players.length<1} style={{width:"100%",textAlign:"center",padding:"16px",fontSize:"16px"}}>▶ Start Game</Btn>
          :<div style={{textAlign:"center",color:"rgba(255,255,255,0.4)",fontSize:"14px",padding:"16px",background:"rgba(255,255,255,0.04)",borderRadius:"12px"}}>⏳ Waiting for admin to start…</div>
        }

        <button onClick={leaveGame} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.25)",fontSize:"12px",cursor:"pointer",fontFamily:"inherit",width:"100%",textAlign:"center",marginTop:"20px"}}>← Leave</button>
      </div>
      <style>{`* { -webkit-tap-highlight-color:transparent; }`}</style>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // SCREEN: GAME — ADMIN (CALLER)
  // ═══════════════════════════════════════════════════════════
  if(screen==='game'&&isAdmin) return(
    <div style={outerStyle}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,padding:"8px 12px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:"8px"}}>
          <span style={{fontSize:"clamp(16px,3vw,24px)",fontWeight:900,background:"linear-gradient(90deg,#f0a830,#ff6b35)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>TAMBOLA LIVE</span>
          <span style={{fontSize:"11px",letterSpacing:"3px",color:"#f0a83055",textTransform:"uppercase"}}>Admin</span>
        </div>
        <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
          <span style={{background:"rgba(255,255,255,0.07)",borderRadius:"20px",padding:"3px 10px",fontSize:"12px",color:"#f0a830",fontWeight:700,border:"1px solid rgba(255,255,255,0.1)"}}>{gameCode}</span>
          <button onClick={leaveGame} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.4)",padding:"4px 10px",borderRadius:"20px",cursor:"pointer",fontSize:"11px",fontFamily:"inherit"}}>✕</button>
        </div>
      </div>

      {/* Win claim banner */}
      <ClaimBanner/>

      {/* Viewed player board */}
      {viewingPlayer&&(
        <div style={{flexShrink:0,padding:"8px 12px 0",overflow:"auto",maxHeight:"220px"}}>
          <PlayerBoardView playerId={viewingPlayer}/>
        </div>
      )}

      {/* Main caller */}
      <div style={{flex:1,minHeight:0,overflow:"auto",padding:"10px 12px",display:"flex",flexDirection:"column",gap:"10px"}}>

        {/* Number display + controls */}
        <div style={{display:"flex",gap:"10px",alignItems:"center",flexShrink:0}}>
          {/* Big circle */}
          <div style={{width:"clamp(90px,18vw,140px)",height:"clamp(90px,18vw,140px)",borderRadius:"50%",flexShrink:0,background:flash?"radial-gradient(circle,#f0a830,#ff6b35)":"radial-gradient(circle,#2a1060,#140830)",border:`3px solid ${flash?"#fff":"#f0a830"}`,boxShadow:flash?"0 0 40px #f0a830":"0 0 20px rgba(240,168,48,0.2)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",transition:"all 0.15s",position:"relative"}}>
            {countdown!==null&&<div style={{position:"absolute",inset:"-5px",borderRadius:"50%",border:"3px solid transparent",borderTopColor:"#4aaee8",animation:"spin 1s linear infinite",pointerEvents:"none"}}/>}
            {curNum?<>
              <div style={{fontSize:"clamp(32px,8vw,60px)",fontWeight:900,color:flash?"#1a0533":"#f0a830"}}>{curNum}</div>
              {getCallName(curNum)&&<div style={{fontSize:"clamp(6px,1vw,9px)",color:flash?"#1a053388":"#f0a83088",textAlign:"center",padding:"0 6px",textTransform:"uppercase",lineHeight:1.2}}>{getCallName(curNum)}</div>}
            </>:<div style={{color:"#f0a83033",fontSize:"12px"}}>READY</div>}
          </div>

          {/* Controls */}
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:"7px"}}>
            <Btn onClick={doCall} disabled={!remaining.length||animating||autoPlay} style={{textAlign:"center"}}>
              {!remaining.length?"All Done!":animating?"Calling…":"Call Number"}
            </Btn>
            <Btn onClick={()=>{if(!remaining.length)return;setAutoPlay(p=>!p);}} color="blue" style={{textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
              <span>{autoPlay?"⏸ Pause":"▶ Auto"}</span>
              {countdown&&<span style={{fontSize:"11px",opacity:0.7}}>({countdown}s)</span>}
            </Btn>
            <div style={{display:"flex",gap:"7px"}}>
              <Btn onClick={()=>{const n=!voiceOn;setVoiceOn(n);if(!n)window.speechSynthesis?.cancel();}} color="green" style={{flex:1,textAlign:"center",padding:"8px"}}>
                {voiceOn?"🔊":"🔇"}
              </Btn>
              <div style={{flex:2,background:"rgba(255,255,255,0.05)",borderRadius:"50px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",color:"rgba(255,255,255,0.4)",border:"1px solid rgba(255,255,255,0.08)"}}>
                <span style={{color:"#f0a830",fontWeight:700}}>{calledNums.length}</span>&nbsp;/ 90
              </div>
            </div>
          </div>
        </div>

        {/* Recent called */}
        {calledNums.length>0&&(
          <Card>
            <Label>Called Numbers</Label>
            <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
              {[...calledNums].reverse().map((n,i)=>(
                <div key={n} style={{width:i===0?"36px":"28px",height:i===0?"36px":"28px",borderRadius:"50%",background:i===0?"linear-gradient(135deg,#f0a830,#ff6b35)":`rgba(255,255,255,${Math.max(0.07,0.18-i*0.008)})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:i===0?"14px":"11px",fontWeight:700,color:i===0?"#1a0533":"rgba(255,255,255,0.7)"}}>
                  {n}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Players + claims */}
        <Card>
          <Label>Players ({players.length})</Label>
          <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
            {players.map(([pid,p])=>{
              const pClaims=claims.filter(c=>c.playerId===pid);
              return(
                <div key={pid} style={{display:"flex",alignItems:"center",gap:"8px",padding:"8px 10px",background:"rgba(255,255,255,0.04)",borderRadius:"10px",border:pClaims.length?"1px solid rgba(240,168,48,0.3)":"1px solid rgba(255,255,255,0.06)"}}>
                  <div style={{width:"7px",height:"7px",borderRadius:"50%",background:"#7bc67b",flexShrink:0}}/>
                  <span style={{flex:1,fontWeight:600,fontSize:"14px"}}>{p.name}{pid===myId?" (you)":""}</span>
                  {pClaims.length>0&&<span style={{fontSize:"11px",background:"rgba(240,168,48,0.15)",color:"#f0a830",padding:"2px 8px",borderRadius:"10px",border:"1px solid rgba(240,168,48,0.3)"}}>🏆 {pClaims[0].prize}</span>}
                  {p.showBoard&&pid!==myId&&(
                    <button onClick={()=>setViewingPlayer(viewingPlayer===pid?null:pid)} style={{background:viewingPlayer===pid?"rgba(74,174,232,0.2)":"rgba(255,255,255,0.08)",border:"1px solid rgba(74,174,232,0.3)",color:"#4aaee8",padding:"3px 8px",borderRadius:"20px",cursor:"pointer",fontSize:"10px",fontFamily:"inherit"}}>
                      {viewingPlayer===pid?"Hide":"View"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Win claims list */}
        {claims.length>0&&(
          <Card>
            <Label color="#f0a830">🏆 Win Announcements</Label>
            {claims.map((c,i)=>(
              <div key={i} style={{padding:"8px 10px",background:`${PRIZE_COLORS[c.prize]}15`,borderRadius:"10px",border:`1px solid ${PRIZE_COLORS[c.prize]}33`,marginBottom:"6px"}}>
                <span style={{fontWeight:700,color:PRIZE_COLORS[c.prize]}}>{c.playerName}</span>
                <span style={{color:"rgba(255,255,255,0.6)",fontSize:"13px"}}> — {c.prize}</span>
              </div>
            ))}
          </Card>
        )}
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg);}}* { -webkit-tap-highlight-color:transparent; }`}</style>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // SCREEN: GAME — PLAYER
  // ═══════════════════════════════════════════════════════════
  return(
    <div style={outerStyle}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,padding:"8px 12px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        <div>
          <span style={{fontSize:"clamp(14px,2.5vw,20px)",fontWeight:900,background:"linear-gradient(90deg,#f0a830,#ff6b35)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>TAMBOLA LIVE</span>
          <span style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginLeft:"8px"}}>{myName}</span>
        </div>
        <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
          <span style={{background:"rgba(255,255,255,0.07)",borderRadius:"20px",padding:"3px 10px",fontSize:"12px",color:"#f0a830",fontWeight:700}}>{gameCode}</span>
          <button onClick={leaveGame} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.4)",padding:"4px 10px",borderRadius:"20px",cursor:"pointer",fontSize:"11px",fontFamily:"inherit"}}>✕</button>
        </div>
      </div>

      {/* Win claim banner */}
      <ClaimBanner/>

      {/* Viewed player board */}
      {viewingPlayer&&viewingPlayer!==myId&&(
        <div style={{flexShrink:0,padding:"6px 10px 0",maxHeight:"200px",overflow:"auto"}}>
          <PlayerBoardView playerId={viewingPlayer}/>
        </div>
      )}

      {/* Current number strip */}
      <div style={{flexShrink:0,display:"flex",gap:"8px",alignItems:"center",padding:"8px 12px",background:"rgba(0,0,0,0.2)"}}>
        {/* Current number */}
        <div style={{width:"clamp(52px,12vw,68px)",height:"clamp(52px,12vw,68px)",borderRadius:"50%",flexShrink:0,background:game?.currentNumber?"radial-gradient(circle,#f0a830,#ff6b35)":"rgba(255,255,255,0.05)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",border:"2px solid #f0a830",boxShadow:"0 0 16px rgba(240,168,48,0.3)"}}>
          <div style={{fontSize:"clamp(18px,5vw,28px)",fontWeight:900,color:"#1a0533",lineHeight:1}}>{game?.currentNumber||"–"}</div>
        </div>
        {/* Recent numbers */}
        <div style={{flex:1,overflow:"hidden"}}>
          <div style={{fontSize:"9px",letterSpacing:"2px",color:"rgba(255,255,255,0.3)",textTransform:"uppercase",marginBottom:"4px"}}>Called: {calledNums.length}/90</div>
          <div style={{display:"flex",gap:"4px",overflow:"hidden"}}>
            {[...calledNums].reverse().slice(1,12).map(n=>(
              <div key={n} style={{width:"26px",height:"26px",borderRadius:"50%",flexShrink:0,background:"rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:600,color:myMarked.includes(n)?"#7bc67b":"rgba(255,255,255,0.6)",border:myMarked.includes(n)?"1px solid #7bc67b":"1px solid rgba(255,255,255,0.1)"}}>
              {n}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ticket */}
      <div style={{flex:1,minHeight:0,overflow:"auto",padding:"10px 12px",display:"flex",flexDirection:"column",gap:"8px"}}>
        {myTicket&&(
          <Card style={{flexShrink:0}}>
            <Label>Your Ticket — tap to mark</Label>
            {myTicket.map((row,ri)=>(
              <div key={ri} style={{display:"flex",gap:"5px",marginBottom:"6px"}}>
                <div style={{width:"5px",background:ROW_COLORS[ri],borderRadius:"3px",flexShrink:0}}/>
                <div style={{display:"flex",gap:"5px",flex:1}}>
                  {row.map(n=>{
                    const isCalled=calledNums.includes(n);
                    const isMarked=myMarked.includes(n);
                    return(
                      <button key={n} onClick={()=>toggleMark(n)} style={{
                        flex:1,padding:"clamp(10px,2.5vh,16px) 0",
                        borderRadius:"10px",border:"none",cursor:"pointer",
                        background: isMarked&&isCalled?"#7bc67b": isMarked?"#d4b84a": isCalled?"rgba(240,168,48,0.18)":"rgba(255,255,255,0.07)",
                        color: isMarked?"#fff": isCalled?"#f0a830":"rgba(255,255,255,0.6)",
                        fontSize:"clamp(14px,3.5vw,22px)",fontWeight:900,
                        boxShadow: isCalled&&!isMarked?"0 0 8px rgba(240,168,48,0.4)":isMarked?"inset 0 -2px 0 rgba(0,0,0,0.2)":"none",
                        fontFamily:"inherit",transition:"all 0.15s",
                        outline: isCalled&&!isMarked?"2px solid rgba(240,168,48,0.5)":"none",
                        outlineOffset:"2px"
                      }}>
                        {isMarked?"✓":n}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div style={{display:"flex",gap:"8px",marginTop:"8px",flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:"4px"}}><div style={{width:"12px",height:"12px",borderRadius:"3px",background:"#7bc67b"}}/><span style={{fontSize:"10px",color:"rgba(255,255,255,0.4)"}}>Marked & called</span></div>
              <div style={{display:"flex",alignItems:"center",gap:"4px"}}><div style={{width:"12px",height:"12px",borderRadius:"3px",background:"rgba(240,168,48,0.3)",outline:"1px solid rgba(240,168,48,0.5)"}}/><span style={{fontSize:"10px",color:"rgba(255,255,255,0.4)"}}>Called — tap to mark</span></div>
              <div style={{display:"flex",alignItems:"center",gap:"4px"}}><div style={{width:"12px",height:"12px",borderRadius:"3px",background:"#d4b84a"}}/><span style={{fontSize:"10px",color:"rgba(255,255,255,0.4)"}}>Marked (not yet called)</span></div>
            </div>
          </Card>
        )}

        {/* Claim modal */}
        {claimModal&&(
          <Card style={{border:"1px solid rgba(240,168,48,0.3)",flexShrink:0}}>
            <Label color="#f0a830">🏆 Announce Win — Select Prize</Label>
            <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
              {PRIZES.map(p=>(
                <button key={p} onClick={()=>claimWin(p)} style={{padding:"12px 16px",background:`${PRIZE_COLORS[p]}15`,border:`1px solid ${PRIZE_COLORS[p]}44`,borderRadius:"12px",color:PRIZE_COLORS[p],fontWeight:700,fontSize:"14px",cursor:"pointer",fontFamily:"inherit",textAlign:"left",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span>{p}</span>
                  <span style={{fontSize:"11px",opacity:0.6,fontWeight:400}}>{p==="Early Five"?"5 numbers":p==="Full House"?"All 15":"5 in a row"}</span>
                </button>
              ))}
              <button onClick={()=>setClaimModal(false)} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.4)",padding:"10px",borderRadius:"12px",cursor:"pointer",fontFamily:"inherit",fontSize:"13px"}}>Cancel</button>
            </div>
          </Card>
        )}

        {/* Players list */}
        {players.length>0&&(
          <Card>
            <Label>Players</Label>
            <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
              {players.map(([pid,p])=>{
                const pClaims=claims.filter(c=>c.playerId===pid);
                return(
                  <div key={pid} style={{display:"flex",alignItems:"center",gap:"8px",padding:"7px 10px",background:"rgba(255,255,255,0.04)",borderRadius:"10px"}}>
                    <div style={{width:"6px",height:"6px",borderRadius:"50%",background:"#7bc67b",flexShrink:0}}/>
                    <span style={{flex:1,fontSize:"13px",fontWeight:600}}>{p.name}{pid===myId?" (you)":""}</span>
                    {pClaims.length>0&&<span style={{fontSize:"10px",color:"#f0a830"}}>🏆 {pClaims[0].prize}</span>}
                    {p.showBoard&&pid!==myId&&(
                      <button onClick={()=>setViewingPlayer(viewingPlayer===pid?null:pid)} style={{background:"transparent",border:"1px solid rgba(74,174,232,0.3)",color:"#4aaee8",padding:"3px 8px",borderRadius:"20px",cursor:"pointer",fontSize:"10px",fontFamily:"inherit"}}>
                        {viewingPlayer===pid?"Hide":"View"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{flexShrink:0,display:"flex",gap:"8px",padding:"10px 12px",borderTop:"1px solid rgba(255,255,255,0.06)",background:"rgba(0,0,0,0.3)"}}>
        {claimSent
          ?<div style={{flex:1,textAlign:"center",padding:"12px",background:"rgba(240,168,48,0.1)",borderRadius:"50px",border:"1px solid rgba(240,168,48,0.3)",color:"#f0a830",fontSize:"13px",fontWeight:700}}>🏆 Win Announced!</div>
          :<Btn onClick={()=>setClaimModal(true)} color="gold" style={{flex:2,textAlign:"center"}}>🏆 Announce Win!</Btn>
        }
        <Btn onClick={toggleShowBoard} color={myPlayer?.showBoard?"blue":"ghost"} style={{flex:1,textAlign:"center"}}>
          {myPlayer?.showBoard?"👁 Visible":"👁 Hidden"}
        </Btn>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg);}}* { -webkit-tap-highlight-color:transparent; } button:active{opacity:0.85;transform:scale(0.97);}`}</style>
    </div>
  );
}
