"use client";
import {useCallback,useEffect,useRef,useState,useTransition} from "react";
import {autosaveSheet,type SheetSnapshot,type SavedSheet} from "./autosave-actions";

export function useSheetAutosave(key:string,snapshot:SheetSnapshot,enabled:boolean){
  const [saved,setSaved]=useState<SavedSheet|null>(null);
  const [existingDeal,setExistingDeal]=useState<{id:string;number:string;status:string}|null>(null);
  const stopped=useRef(false);
  const [terminal,setTerminal]=useState(false);
  const [error,setError]=useState("");const [busy,start]=useTransition();
  const [ready,setReady]=useState(false);const [tick,setTick]=useState(0);
  const state=useRef<{sessionId:string;revision:number;ack:string;saved:SavedSheet|null;pending?:{sessionId:string;revision:number;requestId:string;snapshot:SheetSnapshot}}>({sessionId:"",revision:0,ack:"",saved:null});
  const flight=useRef<Promise<SavedSheet|null>|null>(null);
  const serialized=JSON.stringify(snapshot);const latest=useRef(serialized);latest.current=serialized;
  const storageKey=`${key}:autosave`;
  useEffect(()=>{
    if(!key)return;
    try{const raw=sessionStorage.getItem(storageKey);if(raw)state.current=JSON.parse(raw);}catch{/* Storage is optional. */}
    state.current.sessionId||=crypto.randomUUID();
    // Hydrate the terminal browser-session marker after SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try{if(sessionStorage.getItem(`${storageKey}:terminal`)){stopped.current=true;setTerminal(true);}}catch{}
    try{if(sessionStorage.getItem(`${storageKey}:paused`))stopped.current=true;}catch{}
    setSaved(state.current.saved);setReady(true);
  },[key,storageKey]);
  const flush=useCallback(async():Promise<SavedSheet|null>=>{
    if(flight.current)return flight.current;
    if(!state.current.sessionId||stopped.current)return null;
    const run=async()=>{
      for(;;){
        if(stopped.current)return state.current.saved;
        if(!state.current.pending&&state.current.ack===latest.current)return state.current.saved;
        state.current.pending??={sessionId:state.current.sessionId,revision:state.current.revision,requestId:crypto.randomUUID(),snapshot:JSON.parse(latest.current)};
        try{sessionStorage.setItem(storageKey,JSON.stringify(state.current));}catch{}
        try{
          const result=await autosaveSheet(state.current.pending);
          if(result.existingDeal){
            // This snapshot was NOT applied. Never replay its deposits/trades into that Deal.
            stopped.current=true;delete state.current.pending;
            try{sessionStorage.setItem(storageKey,JSON.stringify(state.current));}catch{}
            setExistingDeal(result.existingDeal);setError("");return null;
          }
          if(result.error||!result.saved){if(!result.uncertain)delete state.current.pending;try{sessionStorage.setItem(storageKey,JSON.stringify(state.current));}catch{}setError(result.error??"Automatic saving failed.");return null;}
          state.current.ack=JSON.stringify(state.current.pending.snapshot);state.current.revision=result.saved.revision;state.current.saved=result.saved;delete state.current.pending;
          try{sessionStorage.setItem(storageKey,JSON.stringify(state.current));}catch{}
          setSaved(result.saved);setError("");
        }catch{setError("Connection interrupted. Retry to safely confirm the same save; no duplicate Deal or payment will be created.");return null;}
      }
    };
    flight.current=run();try{return await flight.current;}finally{flight.current=null;}
  },[storageKey]);
  useEffect(()=>{
    if(!ready||!enabled||error||stopped.current||state.current.ack===serialized)return;
    const timer=setTimeout(()=>start(async()=>{await flush();}),650);
    return()=>clearTimeout(timer);
  },[ready,enabled,serialized,flush,error,tick]);
  const dirty=state.current.ack!==serialized;
  const stopAndDrain=useCallback(async()=>{
    stopped.current=true;
    try{sessionStorage.setItem(`${storageKey}:paused`,"true");}catch{}
    if(flight.current)await flight.current;
    return{sessionId:state.current.sessionId,dealId:state.current.saved?.id,version:state.current.saved?.version};
  },[storageKey]);
  const completeTerminal=useCallback(()=>{
    stopped.current=true;delete state.current.pending;setTerminal(true);
    try{sessionStorage.setItem(`${storageKey}:terminal`,"closed");sessionStorage.removeItem(`${storageKey}:paused`);sessionStorage.removeItem(storageKey);}catch{}
  },[storageKey]);
  const resume=useCallback(()=>{stopped.current=false;try{sessionStorage.removeItem(`${storageKey}:paused`);}catch{}setTick(t=>t+1);},[storageKey]);
  useEffect(()=>{
    if(!dirty||!enabled||existingDeal||terminal)return;
    const warn=(event:BeforeUnloadEvent)=>event.preventDefault();window.addEventListener("beforeunload",warn);
    return()=>window.removeEventListener("beforeunload",warn);
  },[dirty,enabled,existingDeal,terminal]);
  return{saved,existingDeal,error,busy,dirty,terminal,stopAndDrain,completeTerminal,resume,flush,uncertain:Boolean(state.current.pending)&&Boolean(error),retry:()=>{setError("");setTick(t=>t+1);},recordedDeposits:state.current.ack?JSON.parse(state.current.ack).deposits.length:0,recordedTrades:state.current.ack?JSON.parse(state.current.ack).trades.length:0};
}
