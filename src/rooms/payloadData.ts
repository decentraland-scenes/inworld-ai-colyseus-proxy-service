import { Character, InworldClient, InworldConnectionService, InworldPacket } from "@inworld/nodejs-sdk";
import { Client, Room } from "colyseus";

import * as serverStateSpec from "../npcChatState/server-state-spec";

//store packages for reference later
export const PACKET_MAP = new Map<string,serverStateSpec.ChatPacket>()

const CLASSNAME = "PayloadData"
const ENTRY = " ENTRY"


function logEntry(classname:string,roomName:string,roomId:string,method:string,params?:any){
    console.log(classname,roomName,roomId,method,ENTRY,params)
}
function logExit(classname:string,roomName:string,roomId:string,method:string,params?:any){
    console.log(classname,roomName,roomId,method," RETURN",params)
}
function log(classname:string,roomName:string,roomId:string,method:string,msg?:string,...args:any[]){
    console.log(classname,roomName,roomId,method,msg,...args)
}


const PACKET_GARBAGE_COLLECT_INTERVAL = 1000 * 60 * 1
const MAX_PACKET_AGE = 1000 * 60 * 5//5 min max
export async function executePacketGC() {
    //scan for possible expired packets to clear out
    const METHOD_NAME = "executePacketGC"
    logEntry(CLASSNAME,undefined,undefined,METHOD_NAME)
    const total = PACKET_MAP.size
    log(CLASSNAME,undefined,undefined,METHOD_NAME,"checking PACKET_MAP item count:",total);

    let evictionCount = 0

    const evictionKeys:string[] = []
    PACKET_MAP.forEach( (value:serverStateSpec.ChatPacket,key: string) =>{
        const age = Date.now() - value.createTime
        const left = MAX_PACKET_AGE - age
        const evict = left < 0
        //`log(CLASSNAME,undefined,undefined,METHOD_NAME,"age of packet",age,"left",left,"evict",evict,value.packetId);

        if(evict){
            evictionKeys.push(key)
            evictionCount++
        }
    } )

    evictionKeys.forEach((key:string)=>{
        PACKET_MAP.delete( key )
    })

    log(CLASSNAME,undefined,undefined,METHOD_NAME,"evicted:",evictionCount,total),"evictionKeys",evictionKeys;

    logExit(CLASSNAME,undefined,undefined,METHOD_NAME)    
}

function runAndSchedulePacketGC() {
    const METHOD_NAME = "runAndScheduleTick"
    executePacketGC().catch((err)=>{
        log(CLASSNAME,undefined,undefined,METHOD_NAME,"error",err);
    }).then((result) =>{
        log(CLASSNAME,undefined,undefined,METHOD_NAME,"executePacketGC completed",result);
    }).finally(()=>{
        log(CLASSNAME,undefined,undefined,METHOD_NAME,"scheduling next run in ",PACKET_GARBAGE_COLLECT_INTERVAL);
        setTimeout(() => runAndSchedulePacketGC(), PACKET_GARBAGE_COLLECT_INTERVAL)
    })
}

let initlizedAlready = false
export  function isPacketGCInitializedAlready() {
    return initlizedAlready
}
export async function initializePacketGC() {
    const METHOD_NAME = "initializePacketGC"
    if(initlizedAlready){
        log(CLASSNAME,undefined,undefined,METHOD_NAME,"already initialized,skipping ");
        return
    }
    runAndSchedulePacketGC()
    initlizedAlready = true
}
