const B="https://1click.chaindefuser.com/v0";
const dl=()=>new Date(Date.now()+10*60e3).toISOString();
const base={swapType:"EXACT_INPUT",slippageTolerance:100,depositType:"ORIGIN_CHAIN",recipientType:"DESTINATION_CHAIN",refundType:"ORIGIN_CHAIN"};
const USDC="nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", ZEC="nep141:zec.omft.near";
async function q(label,b){const r=await fetch(B+"/quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...base,...b,deadline:dl()})});const j=await r.json();
 const d=j.quote?.depositAddress; console.log(label,"HTTP",r.status, d?("depositAddress="+d+" (prefix "+d.slice(0,3)+", len "+d.length+")"):JSON.stringify(j).slice(0,300), j.quote?("timeEstimate="+j.quote.timeEstimate+"s depositMode="+j.quoteRequest?.depositMode):"");
 if(d){const s=await (await fetch(B+"/status?depositAddress="+encodeURIComponent(d))).json();console.log("  status:",JSON.stringify(s).slice(0,200));}}
await q("ZEC->USDC non-dry:",{dry:false,originAsset:ZEC,destinationAsset:USDC,amount:"10000000",recipient:"0xdccb95d631482bcd55b0af8607ab49d744a6f679",refundTo:"u1a2q6425943l3vhsk8h8rf2lcwvl3h0x6lv9s4xkvnzgtwxuw8lapfqylt33p3v4nyzetdlyv6srxz7v9cr8s2mmqr87rdce75zxn7t45r6kzhhhnvwex77c5z4ezjafuqgs3tem8ee57rt5wrqcz866tnpld9q5dpr2kj7scukmevly9yjnd58g05mch6kafxfgpf45hjg6q2uarxts"});
await q("USDC->ZEC non-dry:",{dry:false,originAsset:USDC,destinationAsset:ZEC,amount:"20000000",recipient:"u1a2q6425943l3vhsk8h8rf2lcwvl3h0x6lv9s4xkvnzgtwxuw8lapfqylt33p3v4nyzetdlyv6srxz7v9cr8s2mmqr87rdce75zxn7t45r6kzhhhnvwex77c5z4ezjafuqgs3tem8ee57rt5wrqcz866tnpld9q5dpr2kj7scukmevly9yjnd58g05mch6kafxfgpf45hjg6q2uarxts",refundTo:"0xdccb95d631482bcd55b0af8607ab49d744a6f679"});
