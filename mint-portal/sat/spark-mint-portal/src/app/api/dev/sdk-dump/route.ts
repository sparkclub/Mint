import { NextResponse } from 'next/server';
import { dumpSurface, getIssuerWallet, newTokenService } from '@/lib/spark';

export async function GET(){
  try{
    const surface = dumpSurface();
    let wallet:any=null, walletMethods:string[]=[];
    let tts:any=null, ttsMethods:string[]=[];
    try{
      wallet = await getIssuerWallet();
      const seen = new Set<string>();
      let p:any = wallet;
      for(let i=0;i<5 && p;i++, p=Object.getPrototypeOf(p)){
        Object.getOwnPropertyNames(p).forEach(n=>{
          if(n!=='constructor' && typeof (wallet as any)[n]==='function') seen.add(n);
        });
      }
      walletMethods = Array.from(seen).sort();
      tts = newTokenService(wallet);
      const seen2 = new Set<string>();
      let q:any = tts;
      for(let i=0;i<5 && q;i++, q=Object.getPrototypeOf(q)){
        Object.getOwnPropertyNames(q).forEach(n=>{
          if(n!=='constructor' && typeof (tts as any)[n]==='function') seen2.add(n);
        });
      }
      ttsMethods = Array.from(seen2).sort();
    }catch(e:any){
      return NextResponse.json({ ok:false, surface, error:String(e?.message||e) }, { status:200 });
    }
    return NextResponse.json({ ok:true, surface, walletMethods, ttsMethods }, { status:200 });
  }catch(e:any){
    return NextResponse.json({ ok:false, error:String(e?.message||e) }, { status:500 });
  }
}
