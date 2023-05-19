import { Character, InworldClient, InworldConnectionService, InworldPacket, ServiceError,SessionToken,status } from "@inworld/nodejs-sdk";
import { GenerateSessionTokenFn } from "@inworld/nodejs-sdk/build/src/common/interfaces";
import { ControlEvent, EmotionEvent, InworlControlType } from "@inworld/nodejs-sdk/build/src/entities/inworld_packet.entity";
import { Client, Room } from "colyseus";
import * as serverState from "../npcChatState/server-state";

import * as serverStateSpec from "../npcChatState/server-state-spec";
import { CONFIG } from "./config";
import { PACKET_MAP, initializePacketGC, isPacketGCInitializedAlready } from "./payloadData";
import { ClientUserData } from "../client/client-spec";
import { LogLevel, LoggerFactory } from "../logging/logging";


const CLASSNAME = "NpcChatRoom"
const ENTRY = " ENTRY"

const logger = LoggerFactory.getLogger(CLASSNAME)
logger.setLevel(LogLevel.TRACE)

function logEntry(classname:string,roomName:string,roomId:string,clientId:string,userId:string,method:string,params?:any){
    logger.trace(ENTRY,roomName,roomId,clientId,userId,method,params)
    //console.log(classname,roomName,roomId,clientId,userId,method,ENTRY,params)
}
function logExit(classname:string,roomName:string,roomId:string,clientId:string,userId:string,method:string,params?:any){
    logger.trace( "RETURN",roomName,roomId,clientId,userId,method,params)
    //console.log(classname,roomName,roomId,clientId,userId,method," RETURN",params)
}
function log(classname:string,roomName:string,roomId:string,clientId:string,userId:string,method:string,msg?:string,...args:any[]){
    logger.trace( roomName,roomId,clientId,userId,method,msg,args)
    //console.log(classname,roomName,roomId,clientId,userId,method,msg,...args)
}

interface InworldChatUtils{
    getText(message:serverStateSpec.ChatPacket|serverStateSpec.ChatMessage):string
    createChatMessageFromClient(client:Client, message:string|serverStateSpec.ChatPacket|serverStateSpec.ChatMessage):serverStateSpec.ChatMessage
}

class InworldConnectionServiceHelper{
    
    private conn:InworldConnectionService
    //workaround to be able to store it for future usage
    onMessageFn: (msg: InworldPacket)=>void
    isNewConnection:boolean
    cache:serverState.InWorldConnectionClientCacheState// = new ClientCache()
    key:string

    constructor(key:string,cache:serverState.InWorldConnectionClientCacheState){
        this.key = key
        this.cache = cache
    }
    setConnection(conn:InworldConnectionService){
        this.conn = conn
    }
    /*
    getOrCreateClientCache(){
        let clientCache:ClientCache = this.cache
        
        if(!clientCache){
            this.cache = new ClientCache()
        }
        return this.cache
    }*/

    setCurrentCharacterId(characterId: serverStateSpec.CharacterId) {
        this.cache.currentCharacterId = new serverState.CharacterId().assign(characterId)
    }
    setCurrentSceneTrigger(triggerId: serverStateSpec.TriggerId) {
        this.cache.currentSceneTrigger = new serverState.TriggerId().assign(triggerId)
    }
    setSceneTriggerConfirmed(triggerId: serverStateSpec.TriggerId) {
        this.cache.currentSceneTrigger.confirmed = true
    }
   
    getCurrentCharacterId() {
        return this.cache.currentCharacterId
    }
    getCurrentSceneTrigger() {
        return this.cache.currentSceneTrigger
    }

    getCharacterMapById(){
        const clientCache:serverState.InWorldConnectionClientCacheState = this.cache
        if(clientCache){
            return clientCache.characterMapById
        }else{
            return null
        }
    }

    resetRemoteCache(){
        //clear out current data if session is close can't trust it is persisted or not next time
        this.cache.resetRemoteCache() 
    }
        
    //delegate methods
    open(): Promise<void>{
        return this.conn.open()
    }
    close(): void{
        //clear cache too???, 
        //for now letting cache persist post close, check i connection is active, connect is not fresh
        //this.resetCurrentCache()
        return this.conn.close()
    }
    isActive(): boolean{
        return this.conn.isActive()
    }
    getCharacters(): Promise<Character[]>{
        return this.conn.getCharacters()
    }
    getCurrentCharacter(): Promise<Character>{
        return this.conn.getCurrentCharacter()
    }
    setCurrentCharacter(character: Character): void{
        return this.conn.setCurrentCharacter(character)
    }
    sendText(text: string){//}: Promise<import("..").InworldPacket>{
        return this.conn.sendText(text)
    }
    //sendAudio(chunk: string): Promise<import("..").InworldPacket>;
    sendTrigger(name: string){//}: Promise<import("..").InworldPacket>{
        return this.conn.sendTrigger(name)
    }
    //sendAudioSessionStart(): Promise<import("..").InworldPacket>;
    //sendAudioSessionEnd(): Promise<import("..").InworldPacket>;
    //sendCancelResponse(): Promise<import("..").InworldPacket>;
}

class InWorldChatRoomUtilsInst implements InworldChatUtils {
    room:Room<any>

    constructor(room:Room<any>){
        this.room = room
    }

    getText(message:serverStateSpec.ChatPacket|serverStateSpec.ChatMessage){
        return message.text.text
    }
    getName(client:Client){
        //if share session is enabled (return a common key)
        //TODO lookup client name
        return client.sessionId //client.userData?.userId
    }

    getDateStr(){
        return new Date().toUTCString()
    }
    createChatMessageFromClient(client:Client, message:string|serverStateSpec.ChatPacket|serverStateSpec.ChatMessage){
        if(message instanceof serverStateSpec.ChatPacket || message instanceof serverStateSpec.ChatMessage || (message as any).text ){
            return (message as serverStateSpec.ChatPacket)
        }else{
            const chatMsgProps:serverStateSpec.ChatMessageProps = {
                packetId:undefined,
                date:this.getDateStr(),
                routing:
                    {
                    target:{isCharacter:true,isPlayer:false,name:"current-character",xId:{resourceName:"current-character",confirmed:false}}
                    ,source:{isCharacter:false,isPlayer:true,name:this.getName(client),xId:undefined}
                    
                },
                type: serverStateSpec.ChatPacketType.TEXT,
                text: {text:message,final:true}
            }
            return new serverStateSpec.ChatMessage( chatMsgProps);
        }
    }
}


const DIRECT_MSG = true

export class NpcChatRoomConfig{
    DEBUG_BROADCAST_CHAT_ENABLED = false;
    DEBUG_BROADCAST_CHAT_TALK_ENABLED = false;
    DEBUG_BROADCAST_CHAT_ALL_ENABLED = false;

    INWORLD_KEY="TODO-INIT-ME"
    INWORLD_SECRET="TODO-INIT-ME"

    DIRECT_MSG_DISCONNECT_ON_INTERACTION_END = false
    /*
    TODO make our own timer on our server
    starts from connection time
    5 seconds seems might be too little sometimes for a full resopnse
    10 feels safe threshold
    */
    DISCONNECT_TIMEOUT:number = 10*1000//60*1000 //in milliseconds? //defaults to 1 minute currently if not set. 
    // It should be like workspaces/{WORKSPACE_NAME}/characters/{CHARACTER_NAME}.
    // Or like workspaces/{WORKSPACE_NAME}/scenes/{SCENE_NAME}.
    INWORLD_SCENE="TODO-INIT-ME"
}

function getClientLogInfo(client:Client){
    //TODO cache this?
    //clear out avatar.snapshots

    const lowerUserData:ClientUserData = {
        dclUserData:{
            userId:"tbd",
            publicKey:"tbd",
            displayName:"tbd",
            avatar:undefined,
        }
    }
    
    if(client && client.userData && client.userData.dclUserData){
        const data = (client?.userData as ClientUserData).dclUserData
        lowerUserData.dclUserData = {
            userId:data.userId,
            publicKey:data.publicKey,
            displayName:data.displayName,
            avatar:undefined,
        }
    }

    return {
        id: client?.id,
        sessionId: client?.sessionId,
        state: client?.state,
        userData: lowerUserData
    }
}
function getClientUserDataId(client:Client){
    return (client?.userData as ClientUserData)?.dclUserData?.userId
}
export class NpcChatRoom extends Room<serverState.NpcGameRoomState> {
    room:Room<any>
    // this room supports only 4 clients connected
    maxClients = 4;

    redisClient:Map<string,string> = new Map()

    config:NpcChatRoomConfig

    initAlready:boolean = false

    //track them for clean up at end
    inWorldClients:InworldClient[]=[]

    //inWorldClientBuilder:InworldClient
    //inWorldClient:InworldConnectionService
    //clientCache:Map<string,ClientCache>=new Map()
    
    inWorldClientCache:Map<string,InworldConnectionServiceHelper>=new Map()

    chatUtils:InworldChatUtils

    
    onCreate (options:any) {
        const METHOD_NAME = "onCreate()"
        logEntry(CLASSNAME,this.roomName,this.roomId,undefined,undefined,METHOD_NAME,[options]);

        this.chatUtils = new InWorldChatRoomUtilsInst(this)

        if(this.room === undefined) this.room = this

        this.setState( new serverState.NpcGameRoomState() )
        
        this.init()
        //this.initInWorld()
    }

    init(){
        const METHOD_NAME = "init"
        if(this.initAlready){
            logEntry(CLASSNAME,this.roomName,this.roomId,undefined,undefined,METHOD_NAME,[]);
            return
        }
        this.initAlready = true

        const config = this.config ? this.config : new NpcChatRoomConfig()

        
        //TODO baseclass this 
        //default fallback values
        if(!this.config){
            this.config = config
            
            config.INWORLD_KEY=CONFIG.NPC_ROOM_INWORLD_KEY
            config.INWORLD_SECRET=CONFIG.NPC_ROOM_INWORLD_SECRET
            
            //let room join commands set this??
            config.DEBUG_BROADCAST_CHAT_ENABLED = false;
            config.DEBUG_BROADCAST_CHAT_TALK_ENABLED = false;
            config.DEBUG_BROADCAST_CHAT_ALL_ENABLED = false;    

            // It should be like workspaces/{WORKSPACE_NAME}/characters/{CHARACTER_NAME}.
            // Or like workspaces/{WORKSPACE_NAME}/scenes/{SCENE_NAME}.
            config.INWORLD_SCENE=CONFIG.NPC_ROOM_INWORLD_SCENE
        }

        log(CLASSNAME,this.roomName,this.roomId,undefined,undefined,METHOD_NAME,"config.INWORLD_SCENE",config.INWORLD_SCENE);
    }

    registerListeners(room: Room<any>) {
        const METHOD_NAME = "registerNpcSceneListeners()"
        logEntry(CLASSNAME,this.roomName,this.roomId,undefined,undefined,METHOD_NAME,[]);

        room.onMessage("message", (client:Client, message:string) => {
            log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, "received message from", client.sessionId, ":", message);
            
            //const characterId = "characterId"
            const chatPacket:serverStateSpec.ChatMessage = this.chatUtils.createChatMessageFromClient(client,message)
            // Send your message to a character.
            this.sendMessage(client,chatPacket,DIRECT_MSG)
        });
        room.onMessage("changeCharacter", (client:Client, characterId:serverStateSpec.CharacterId) => {
            log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, "received changeCharacter from", client.sessionId, ":", characterId);
            this.changeCharacter(client,characterId)
        })
        room.onMessage("setSceneTrigger", (client:Client, triggerId:serverStateSpec.TriggerId) => {
            log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, "received setSceneTrigger from", client.sessionId, ":", triggerId);
            
            try{
                this.setSceneTrigger(client,triggerId,DIRECT_MSG)
            }catch(e){
                log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, "setSceneTrigger", "ERROR", e)
            }
        })

    }
    /*
    //init world can tell me what characters are avialable
    initInWorld(){
        const METHOD_NAME = "initInWorld()"
        logEntry(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME);

        const inWorldClient = this.createInWorldClient(undefined,undefined,false)
        inWorldClient.getCharacters().then((chars:Character[])=>{
            for(const c of chars){
                log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, "characters",c)

                this.characterMapById.set( c.getId(), c)
                this.characterMapByResource.set( c.getResourceName(), c)
                
                //dont think we want this anymore unless we lock it to single player rooms
                //const playerState= this.state.createPlayer( c.getId() )

                //playerState.userData.name = c.getDisplayName()
            }
        })
        inWorldClient.close()
    }*/
    changeCharacter(client:Client, characterId:serverStateSpec.CharacterId){
        const METHOD_NAME = "changeCharacter()"
        logEntry(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,[getClientLogInfo(client),characterId]);

        const inWorldClientWrapper = this.createInWorldClient(client,undefined,DIRECT_MSG)

        const inWorldClient = inWorldClientWrapper
        this.changeCharacterForSession(client,inWorldClient,characterId)

        inWorldClient.close()
    }
    async changeCharacterForSession(client:Client,inWorldClient:InworldConnectionServiceHelper, characterId:serverStateSpec.CharacterId){
        const METHOD_NAME = "changeCharacterForSession()"
        logEntry(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,[getClientLogInfo(client),characterId]);

        const clientCache:serverState.InWorldConnectionClientCacheState = inWorldClient.cache
        if(clientCache && clientCache.characterMapById && clientCache.characterMapById.size > 0){
            //try lookup
        }
        
        
        const characterMapById:Map<string,Character>=clientCache.characterMapById
        const characterMapByResource:Map<string,Character>=clientCache.characterMapByResource

        const tryToSetCharacter = (attempt:string)=>{
            const char = characterMapByResource.get(characterId.resourceName)
            if(char !== undefined){
                log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, attempt,"received changeCharacter from", client.sessionId, ":", characterId,"character found",char);
                inWorldClient.setCurrentCharacter(char);
                inWorldClient.setCurrentCharacterId( characterId ) //TODO  push inside setCurrentCharacter
                characterId.id  = char.getId()
                
                log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, attempt, "character changed to",char);
                /*inWorldClient.getCurrentCharacter().then((val:Character)=>{
                    log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,  attempt,"character CONFIRM to",val,"vs",char);
                });*/
                return true
            }else{
                log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, attempt,"received changeCharacter from", client.sessionId, ":", characterId,"character NOT found!!!",characterMapByResource);
                return false
            }
        }

        if(inWorldClient.getCurrentCharacterId()?.resourceName === characterId.resourceName){
            const val = characterMapByResource.get(characterId.resourceName)
            if(val) characterId.id  = val.getId()
            if(!inWorldClient.isNewConnection){
                log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME
                        ,"currentCharacterId same as last time, no need to set again"
                        ,inWorldClient.getCurrentCharacterId() ,characterId, characterMapByResource.get(characterId.resourceName));

                //tryToSetCharacter("set-just-incase")

                logExit(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,characterId);
                return true   
            }else{
                log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME
                        ,"currentCharacterId same as last time, however the session is new, setting session current player to restablish state"
                        ,inWorldClient.getCurrentCharacterId() ,characterId, characterMapByResource.get(characterId.resourceName));
            }
        } 
        

        let foundCharacter = tryToSetCharacter("cache")
         
        if(!foundCharacter){
            log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, "FAILED TO FIND IN CACHE - TRYING AGAIN, FETCHING FROM SERVER THIS TIME", client.sessionId, ":", characterId);
            const chars:Character[] = await inWorldClient.getCharacters()
            log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, "characters recieved", chars.length);
            let counter = 1
            for(const c of chars){
                log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, "fetched-from-server",counter,"/",chars.length,"character",c)

                characterMapById.set( c.getId(), c)
                characterMapByResource.set( c.getResourceName(), c)
                
                //dont think we want this anymore unless we lock it to single player rooms
                //const playerState= this.state.createPlayer( c.getId() )

                //playerState.userData.name = c.getDisplayName()
                counter++
            }
            foundCharacter = tryToSetCharacter("fetched")
        }
        
        logExit(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,foundCharacter);
        return foundCharacter
    }
    
    setSceneTrigger(client:Client, triggerId:serverStateSpec.TriggerId,direct:boolean){
        const METHOD_NAME = "setSceneTrigger()"
        logEntry(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,[getClientLogInfo(client),triggerId]);

        const inWorldClientWrapper = this.createInWorldClient(client,undefined,DIRECT_MSG)
        //const inWorldClient = inWorldClientWrapper

        this.setSceneTriggerForSession(client,inWorldClientWrapper,triggerId)

        //inWorldClient.close()
    }

    async setSceneTriggerForSession(client:Client,inWorldClient:InworldConnectionServiceHelper, triggerId:serverStateSpec.TriggerId){
        const METHOD_NAME = "setSceneTriggerForSession()"
        logEntry(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,[getClientLogInfo(client),triggerId]);
        
        if(triggerId !== undefined && inWorldClient.getCurrentSceneTrigger()?.name == triggerId.name){
            if(!inWorldClient.isNewConnection){
                log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,"trigger id already active",inWorldClient.getCurrentSceneTrigger(),triggerId);
                logExit(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,triggerId);
                return    
            }else{
                log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME
                        ,"trigger id already active, however the session is new, setting session current trigger to restablish state",inWorldClient.getCurrentSceneTrigger(),triggerId)
            }
        }

        inWorldClient.setCurrentSceneTrigger( triggerId )

        if(triggerId !== undefined){
            const message:InworldPacket = await inWorldClient.sendTrigger(triggerId.name)
            //.then((message:InworldPacket)=>{
                log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,"trigger id CONFIRMED set to",triggerId);
                inWorldClient.setSceneTriggerConfirmed( triggerId )
                inWorldClient.onMessageFn(message)
            //})
        }else{
            //FIXME is there a way to reset trigger if pass null?? if so we want that, for now avoiding the error
            log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME
                        ,"WARNING trigger id is null, not able to clear trigger out",inWorldClient.getCurrentSceneTrigger(),triggerId)
        }
        
        logExit(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,triggerId);
        //return foundCharacter
    }
    
    async getCurrentCharacter(client:Client){
        const METHOD_NAME = "getCurrentCharacter()"
        logEntry(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,[getClientLogInfo(client)]);

        //TODO figure out how to say use shared session, does direct = true mean shared?
        const inWorldClient = this.createInWorldClient(client,undefined,DIRECT_MSG)
       
        const currChar = await inWorldClient.getCurrentCharacter()
        inWorldClient.close()

        return currChar
    }
    showInfoMessage(client:Client, msg:serverStateSpec.ShowMessage){
        client.send("inGameMsg",msg)
    }
    showErrorMessage(client:Client, msg:serverStateSpec.ShowMessage){
        msg.isError = true
        client.send("showError",msg)
    }
    async sendMessage(client:Client, message:serverStateSpec.ChatMessage, directMsg:boolean){
        const METHOD_NAME = "sendMessage()"
        logEntry(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,[getClientLogInfo(client),message,"currentTime",this.clock.currentTime]);

        const inWorldClient = this.createInWorldClient(client,undefined,directMsg)
        
        log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,"message","message",message);

        const playerState = this.state.getPlayer(client.sessionId)

        const msgText = this.chatUtils.getText(message)
        
        //is this name, or id or resourceId???
        //TODO if null fall back to cache/session if exists???
        const currentCharacterId = message.routing.target.xId
        //TODO require scene to pass it so state does not need to be held on server
        const currentSceneTrigger = inWorldClient.getCurrentSceneTrigger()
 
        log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,"message","currentCharacterId",currentCharacterId);
        const changedChar = await this.changeCharacterForSession(client,inWorldClient,currentCharacterId)
        if(currentSceneTrigger){
            //might start with no trigger at all
            const setTrigger = await this.setSceneTriggerForSession(client,inWorldClient,currentSceneTrigger)
        }

        log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,"character change DONE, sending message to",changedChar,currentCharacterId,"msgText",msgText);
        if(!changedChar){
            this.showErrorMessage(client,
                {title:"Character Error",message:"could not find"+JSON.stringify(currentCharacterId),isError:true,duration:15})
            return
        }
        //TODO check character target
        /*const curChar = await this.getCurrentCharacter(client)
        if(curChar.)*/
        log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,"sending message to",currentCharacterId,msgText);
        
        //APPENDING the player session id for tracking in logs. workaround for now
        inWorldClient.sendText(client.sessionId+':'+ msgText);
        
        //FOR DEBUGGING ONLY
        if(this.config.DEBUG_BROADCAST_CHAT_ENABLED){
            this.room.broadcast("messages", `(${client.sessionId}) ${msgText}`);
        }
    }

    //TODO make its own class for discoverying key
    //TODO switch to DCL userid
    getKey(client:Client){
        const METHOD_NAME = "getKey()"
        logEntry(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,[getClientLogInfo(client)]);
        //if share session is enabled (return a common key)
        
        let key:string = undefined //client.userData?.userId
        if(client){
            if(client.userData && client.userData.dclUserData){
                key = (client.userData as ClientUserData).dclUserData.userId
            }
            if(key === undefined){
                key = client.sessionId
            }
        }
        if(!client && key === undefined){
            key = "shared-key"
        }

        logExit(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,key);
        return key
    }
    createHandleError(client:Client,originalMsg:string){
        const METHOD_NAME = "createHandleError()"
        logEntry(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,[getClientLogInfo(client),originalMsg]);

        return (err: ServiceError) => {
          logEntry(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,[getClientLogInfo(client)?.sessionId,originalMsg,err.code,err.name,err.message,err.details,"currentTime",this.clock.currentTime]);
          
          switch (err.code) {
            // Skip server and client side disconnect events.
            case status.ABORTED:
            case status.CANCELLED:
                //not clearing inWorldClient.resetCurrentCache() because want to save it should we reconnect
                //again, inworlds connection can be shorter than this room so keep it for the room
                //TODO maybe push to room.player.session that the connect was closed?
              break;
            // It's impossible to reuse provided session id.
            // Try to get new one token.
            case status.FAILED_PRECONDITION:
              this.redisClient.delete(this.getKey(client));
              //sendMessage(message, direct);
              break;
            // Other errors.
            default:
              log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,"UNHANDLED ERROR",getClientLogInfo(client)?.sessionId,originalMsg,err.code,err.name,err.message,err.details);
              console.error(`Error: ${err.message}`);
              break;
          }
        //};
      };
    }
      generateSessionToken (client?:Client): GenerateSessionTokenFn  {
        const METHOD_NAME = "generateSessionToken()"
        logEntry(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,[getClientLogInfo(client)]);

        const host = this
        return async () => {
          logEntry(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,[getClientLogInfo(client)]);
            
          const inworldClient = new InworldClient().setApiKey({
            key: host.config.INWORLD_KEY!,
            secret: host.config.INWORLD_SECRET!,
          });
          const key = this.getKey( client )

          const token = await inworldClient.generateSessionToken();
      
          const sessionId = await this.redisClient.get(key);
          //const sessionId = "abc"
          const actualToken = new SessionToken({
            expirationTime: token.getExpirationTime(),
            token: token.getToken(),
            type: token.getType(),
            sessionId: sessionId ?? token.getSessionId(),
          });
      
          if (!sessionId) {
            this.redisClient.set(key, actualToken.getSessionId());
          }
      
          logExit(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,actualToken);
          return actualToken;
        };
      }      
      createInWorldClient(client:Client|undefined,originatingMsg:string,directMsg:boolean):InworldConnectionServiceHelper{
        const METHOD_NAME = "createInWorldClient()"
        logEntry(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,[getClientLogInfo(client),originatingMsg,directMsg]);

        const key = this.getKey(client);

        //all chats are direct chats?
        const direct = directMsg

        let inWorldClient:InworldConnectionServiceHelper
        //TODO consider cache for direct messages as keep it open?
        if(direct){
            inWorldClient = this.inWorldClientCache.get( key )
        }
        
        //TODO if !inWorldClient.isActive() but with auto connect no need to remake?
        if(!inWorldClient || !inWorldClient.isActive()){
            log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, "inWorldClient undefined?",inWorldClient !== undefined, "inWorldClient?.isActive()",inWorldClient?.isActive());

            inWorldClient = new InworldConnectionServiceHelper(key,this.state.getPlayer(client.sessionId).remoteClientCache)

            const playerState = this.state.getPlayer( client.sessionId )

            const host = this
            const onMessageFn = (msg: InworldPacket) => {
                //console.log("inworldSDK.setOnMessage",msg);
                log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, "setOnMessage","originatingMsg",originatingMsg,"packetId",msg.packetId,"type",this.getMessageTypeAsString(msg),this.getMessageTypeAsInt(msg),"routing",msg.routing,
                    msg.text ? msg.text : undefined, msg.control ? msg.control + "("+this.getControleTypeAsString(msg.control)+")" : undefined,"currChar",inWorldClient.getCurrentCharacterId(),"currentTime",this.clock.currentTime);

                const structuredMessage = this.createStructuredMessage( msg )

                const structuredMessageLogging = this.createStructuredMessage( msg )
                structuredMessageLogging.audio = undefined

                console.log("**RAW**",JSON.stringify(structuredMessageLogging));

                try{
                    const character = inWorldClient.getCharacterMapById().get(msg.routing.source.name)
                    const fromName = character ? character.getDisplayName() : msg.routing.source
                    //msg.
                    if(host.config.DEBUG_BROADCAST_CHAT_ENABLED){
                        if(msg.isText() && (host.config.DEBUG_BROADCAST_CHAT_TALK_ENABLED || host.config.DEBUG_BROADCAST_CHAT_ALL_ENABLED)){
                            this.room.broadcast("messages", fromName +": TALKING: " + JSON.stringify(msg.packetId) + ":" + msg.text.text + "(isFinal:"+msg.text.final+")"); 
                        }
                        if(msg.isEmotion()&& (false || host.config.DEBUG_BROADCAST_CHAT_ALL_ENABLED)){

                            this.room.broadcast("messages", fromName +": EMOTING: "  + JSON.stringify(msg.packetId) + ":"+ JSON.stringify(msg.emotions) ); 
                        }
                        if(msg.isInteractionEnd()&& (false || host.config.DEBUG_BROADCAST_CHAT_ALL_ENABLED)){

                            this.room.broadcast("messages", fromName +": END Interaction: " + JSON.stringify(msg.packetId) + ":" + JSON.stringify(msg) ); 
                        }
                        if(msg.isControl()&& (false || host.config.DEBUG_BROADCAST_CHAT_ALL_ENABLED)){

                            this.room.broadcast("messages", fromName +": CONTROL?: "  + JSON.stringify(msg.packetId) + ":"+ JSON.stringify(msg) ); 
                        }
                        if(msg.isAudio()&& (false || host.config.DEBUG_BROADCAST_CHAT_ALL_ENABLED)){

                            this.room.broadcast("messages", fromName +": AUDIO: "  + JSON.stringify(msg.packetId) + ":"); 
                        }
                    }

                    //FIXME need a timeout for unclaimed TTL
                    //track all message packets, if session terminated, create timer to clear them out?
                    //single thread on timer cleanup would be better
                    //only store audio or all types? for now only need audio
                    if(msg.isAudio()){
                        PACKET_MAP.set( structuredMessage.packetId.packetId ,structuredMessage )
                    }
                    
                    //handle garbage collection
                    if(!isPacketGCInitializedAlready()){
                        initializePacketGC()
                    }

                    if(host.config.DEBUG_BROADCAST_CHAT_ENABLED){
                        this.room.broadcast("structuredMsg", structuredMessage,{
                            except:client
                        }); 
                    }
                    client.send( "structuredMsg", structuredMessage )

                    //consider clearing out
                    if ((!direct && msg.isInteractionEnd()) || this.config.DIRECT_MSG_DISCONNECT_ON_INTERACTION_END) {
                        log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, "setOnMessage", "CLOSING CONNECTION","direct",direct
                            ,"this.config.DIRECT_MSG_DISCONNECT_ON_INTERACTION_END"
                            ,this.config.DIRECT_MSG_DISCONNECT_ON_INTERACTION_END,"currentTime",this.clock.currentTime)
                        inWorldClient.close();
                        return;
                    }
                }catch(e){
                    log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, "setOnMessage", "ERROR", e)
                }
                log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, "setOnMessage","EXIT")
            }

            inWorldClient.onMessageFn = onMessageFn

            let fullName = playerState?.userData?.name
            if(!fullName){
                fullName = 'Player'
            }
            log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, "setConnection","fullName",fullName);


            inWorldClient.setConnection(  new InworldClient()
                // Get key and secret from the integrations page.
                .setApiKey({
                    key: host.config.INWORLD_KEY!,
                    secret: host.config.INWORLD_SECRET!,
                })
                // Setup a user name.
                // It allows character to call you by name.
                .setUser({ fullName: fullName })//need a clientConn per player!?!?!
                // set session missing!!!
                .setGenerateSessionToken( this.generateSessionToken( client ) )
                // Setup required capabilities.
                // In this case you can receive character emotions.
                .setConfiguration({
                    capabilities: { audio: true, emotions: true },
                    connection: { 
                        disconnectTimeout: host.config.DISCONNECT_TIMEOUT
                        //,autoReconnect: host.config.DISCONNECT_TIMEOUT
                     },
                })
                // Use a full character name.
                // It should be like workspaces/{WORKSPACE_NAME}/characters/{CHARACTER_NAME}.
                // Or like workspaces/{WORKSPACE_NAME}/scenes/{SCENE_NAME}.
                .setScene(host.config.INWORLD_SCENE)
                // Attach handlers
                .setOnError(
                    this.createHandleError(client,originatingMsg)
                )
                .setOnMessage(onMessageFn).build()
              ) 
            inWorldClient.isNewConnection = true
                //FIXME put at more global level or add a getting to clear when is new
            if(inWorldClient.isNewConnection){
                log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, "connection is new, clearing out old cache");
                inWorldClient.cache.resetRemoteCache()
            }

            //this.setSceneTriggerForSession(client,inWorldClient,DEFAULT_TRIGGER)

            if (direct) {
            this.inWorldClientCache.set(inWorldClient.key,inWorldClient)
            }
        }else{
            inWorldClient.isNewConnection = false
        } 
        //this.inWorldClientBuilder = inWorldClient
        
        // Finish connection configuration.
        //const inWorldClient = inWorldClientBuilder.build();
        //this.inWorldClient = connection
        //connection.open //
        
        log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, "connection established","new",inWorldClient.isNewConnection,"active",inWorldClient.isActive());

        return inWorldClient
    }
    
    //using a wrapper for reusability
    //TODO move to utils
    createStructuredMessage(msg: InworldPacket):serverStateSpec.ChatPacket{
        const chatPacket = new serverStateSpec.ChatPacket({
            audio: msg.audio,
            control: this.convertControl(msg.control),
            //custom: msg.custom,
            emotions: this.convertEmotion( msg.emotions) ,
            packetId: msg.packetId,
            routing: msg.routing,
            text: msg.text,
            date: msg.date,
            type: this.getMessageTypeAsInt( msg )
        })
        return chatPacket;
    }
    convertControl(control: ControlEvent):serverStateSpec.ControlEvent{
        if(control === undefined){
            return undefined
        }
        let _type = serverStateSpec.ChatControlType.UNKNOWN
        if(control.type === InworlControlType.INTERACTION_END){
            _type = serverStateSpec.ChatControlType.INTERACTION_END
        }
        return {type: _type}
    }
    getControleTypeAsString(control: ControlEvent):string{
        if(control === undefined){
            return undefined
        }
        let _type = "UNKNOWN"
        if(control.type === InworlControlType.INTERACTION_END){
            _type = "INTERACTION_END"
        }
        
        return _type
    }
    convertEmotion(msg: EmotionEvent):serverStateSpec.EmotionEvent{
        const METHOD_NAME = "convertEmotion"
        if(msg === undefined){
            return undefined
        }
        const val:serverStateSpec.EmotionEvent = {behavior:(msg.behavior as any).behavior,strength:(msg.strength as any).strength}
        /*if(msg.behavior.isAffection()){
            val.behavior = serverStateSpec.EmotionEvent.SpaffCode.AFFECTION
        }
        if(msg.isText()){
            return "TEXT"
        }
        if(msg.isEmotion()){
            return "EMOTION"
        }
        if(msg.isControl()){
            return "CONTROL"
        }
        if(msg.isTrigger()){
            return "TRIGGER"
        }*/
        return val
    }
    getMessageTypeAsString(msg: InworldPacket):string{
        const METHOD_NAME = "getMessageTypeAsString"
        if(msg.isAudio()){
            return "AUDIO"
        }
        if(msg.isText()){
            return "TEXT"
        }
        if(msg.isEmotion()){
            return "EMOTION"
        }
        if(msg.isControl()){
            return "CONTROL"
        }
        if(msg.isTrigger()){
            return "TRIGGER"
        }
        /*if(msg.isCustom()){
            return "CUSTOM"
        }*/
        log(CLASSNAME,this.roomName,this.roomId,undefined,undefined,METHOD_NAME, "ERROR UNKNOWN TYPE",msg)
    }

    getMessageTypeAsInt(msg: InworldPacket):number{
        const METHOD_NAME = "getMessageTypeAsInt"
        if(msg.isAudio()){
            return serverStateSpec.ChatPacketType.AUDIO
        }
        if(msg.isText()){
            return serverStateSpec.ChatPacketType.TEXT
        }
        if(msg.isEmotion()){
            return serverStateSpec.ChatPacketType.EMOTION
        }
        if(msg.isControl()){
            return serverStateSpec.ChatPacketType.CONTROL
        }
        if(msg.isTrigger()){
            return serverStateSpec.ChatPacketType.TRIGGER
        }
        /*
        if(msg.isCustom()){
            return serverStateSpec.ChatPacketType.CUSTOM
        }*/
        log(CLASSNAME,this.roomName,this.roomId,undefined,undefined,METHOD_NAME, "ERROR UNKNOWN TYPE",msg)
        return serverStateSpec.ChatPacketType.UNKNOWN
    }

    onJoin (client:Client, options?: any, auth?: any) {
        const METHOD_NAME = "onJoin"
        logEntry(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, [getClientLogInfo(client).sessionId]);
        if(this.config.DEBUG_BROADCAST_CHAT_ENABLED) this.room.broadcast("messages", `${ client.sessionId } joined.`);


    }

    onLeave (client:Client,consented?: boolean) {
        const METHOD_NAME = "onLeave"
        logEntry(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,[getClientLogInfo(client).sessionId,consented]);
        if(this.config.DEBUG_BROADCAST_CHAT_ENABLED) this.room.broadcast("messages", `${ client.sessionId } left.`);
    }

    async onAuth(client:Client, options:any):Promise<any> { 
        const METHOD_NAME = "onAuth()"
        logEntry(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, [getClientLogInfo(client).sessionId,options]);

        const promises:Promise<any>[] = [];

        const retData:serverState.PlayerServerSideData = {playFabData:undefined}

        const userData = options.userData
        const playfabData = options.playFabData

        const userDataForDebug = 
        {
          displayName: userData ? userData.displayName : "",
          publicKey: userData ? userData.publicKey : "",
          hasConnectedWeb3: userData ? userData.hasConnectedWeb3 : "",
          userId: userData ? userData.userId : "",
          version: userData ? userData.version : ""
        }

        
        log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,"PlayFab not enabled.  Not authenticating player",options)    
        const player = this.addPlayer(client,options)
        player.userPrivateData = {
            playFabData:{id:"playfabData.id",sessionTicket:"playfabData.sessionTicket"}
            }
    
        
        const roomId = this.roomId
        const roomName = this.roomName
        return Promise.all( promises ).then(function(result){
            log(CLASSNAME,roomName,roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME,"all promised completed " , result)
            return retData;
        }).catch( (reason:any) =>{
            log(CLASSNAME,roomName,roomId,METHOD_NAME,"all promised FAILED " , reason)
            if(reason instanceof Error){
                throw reason
            }
            return false;
        } )

        //options.userData.displayName ||
        //return true;
    }
    getCurrentTime(){
        return this.clock.currentTime
    }
    addPlayer(client:Client, options:any) { 
        const METHOD_NAME = "addPlayer"
        logEntry(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, [getClientLogInfo(client).sessionId,options]);

        client.send("hello", "world");
        const player = this.state.createPlayer(client.sessionId);

        //update enrollment status?? 
        //workaround, not sure can trust client time is update enrollment servertime
        if(this.state.enrollment.open){
            this.state.enrollment.serverTime = this.getCurrentTime()
        }

        player.connStatus = "connected"
        player.type = (options.playerType !== undefined) ? options.playerType : "spectator"


        if(options.userData){
            log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, "snapshot", [getClientLogInfo(client).sessionId,options.userData.avatar]);
            if(options.userData.displayName) player.userData.name = options.userData.displayName
            if(options.userData.userId) player.userData.userId = options.userData.userId
            /*if(options.userData.avatar && options.userData.avatar.snapshots){
                log(CLASSNAME,this.roomName,this.roomId,client?.sessionId,getClientUserDataId(client),METHOD_NAME, "snapshot", [getClientLogInfo(client).sessionId,options.userData.avatar.snapshots]);
                player.userData.snapshotFace128 = options.userData.avatar.snapshots.face128
            } */
        } 

        //TODO verify on map

        //this.checkEnrollmentMet()

        return player
    }
    

    onDispose () {
        const METHOD_NAME = "onDispose()"
        logEntry(CLASSNAME,this.roomName,this.roomId,undefined,undefined,METHOD_NAME);
        // Close connection.
        //TODO loop through and shutdown any left over clients
        /*if(this.inWorldClient){ 
            console.log("inworldSDK.closingConnection","active",this.inWorldClient.isActive());
            this.inWorldClient.close();
        }*/
    }

}