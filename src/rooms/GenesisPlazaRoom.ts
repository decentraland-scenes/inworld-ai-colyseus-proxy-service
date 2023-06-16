import { Schema, type } from "@colyseus/schema";
import { Client, LobbyRoom, Room } from "colyseus";
import { LobbyGameRoomState } from "../robotsLobbyState/server-state";
import { NpcChatRoom, NpcChatRoomConfig } from "./NpcChatRoom";
import { CONFIG } from "./config";
import { ClientUserData } from "../client/client-spec";
import { LogLevel, LoggerFactory } from "../logging/logging";


const CLASSNAME = "GenesisPlazaRoom"
const ENTRY = " ENTRY"


const DIRECT_MSG = true


const logger = LoggerFactory.getLogger(CLASSNAME)
logger.setLevel(LogLevel.TRACE)


function logEntry(classname:string,roomName:string,roomId:string,method:string,params?:any){
    logger.trace(ENTRY,roomName,roomId/*,clientId,userId*/,method,params)
}
function logExit(classname:string,roomName:string,roomId:string,method:string,params?:any){
    logger.trace( "RETURN",roomName,roomId/*,clientId,userId*/,method,params)
}
function log(classname:string,roomName:string,roomId:string,method:string,msg?:string,...args:any[]){
    logger.trace( roomName,roomId/*,clientId,userId*/,method,msg,args)
}


export class GenesisPlazaRoom extends Room<LobbyGameRoomState> {//extends LobbyRoom {
    //robotsGrid:RobotsGrid
    npcRoom:NpcChatRoom

    //state:LobbyGameRoomState
    async onCreate(options: any) {
        const METHOD_NAME = "onCreate()"
        logEntry(CLASSNAME,this.roomName,this.roomId,METHOD_NAME,[options]);

        //await super.onCreate(options);

        this.npcRoom = new NpcChatRoom()
        
        //only clean up when this is cleaned up
        this.npcRoom.autoDispose = false

        //disable the child room broadcasting, main room will handle it
        //i think this was causing race conditions
        this.npcRoom.broadcastPatch = () => {
            //log(CLASSNAME, this.roomId, "this.delegateRoom.broadcastPatch", "OVERRIDEN/DISBABLED");
            return false
        }
        
        //default fallback values
        
        const config = this.npcRoom.config = new NpcChatRoomConfig()
        
        config.INWORLD_KEY=CONFIG.GENESIS_CITY_NPC_ROOM_INWORLD_KEY
        config.INWORLD_SECRET=CONFIG.GENESIS_CITY_NPC_ROOM_INWORLD_SECRET
        
        config.DEBUG_BROADCAST_CHAT_ENABLED = false;
        config.DEBUG_BROADCAST_CHAT_TALK_ENABLED = false;
        config.DEBUG_BROADCAST_CHAT_ALL_ENABLED = false;    

        // It should be like workspaces/{WORKSPACE_NAME}/characters/{CHARACTER_NAME}.
        // Or like workspaces/{WORKSPACE_NAME}/scenes/{SCENE_NAME}.
        config.INWORLD_SCENE=CONFIG.GENESIS_CITY_NPC_ROOM_INWORLD_SCENE
    
        this.npcRoom.room = this
        //this.robotsGrid.room = this

        //this.robotsGrid.roomId = this.roomId
        this.npcRoom.roomId = this.roomId
        this.npcRoom.roomName = this.roomName
        
        this.npcRoom.onCreate(options)
        //this.robotsGrid.onCreate(options)

        this.npcRoom.addPlayer = this.addPlayer
        //this.npcRoom.addPlayer = this.addPlayer

        //this.setState(this.infectionMap.state);

        //this.onCreateSetClientMaxMin();

        //this.onCreateSetupListeners(options);

        this.setState(new LobbyGameRoomState());
        
        this.npcRoom.state = this.state.npcState
        
        //how can we share player data
        //this.infectionMapRoom.state.players = this.state.players
        //this.npcRoom.state.players = this.state.players

        this.npcRoom.registerListeners(this)

        this.setSimulationInterval((deltaTime) => this.update(deltaTime));
    }
    update (deltaTime:number) {

    }
    getState(){
        return this.state as LobbyGameRoomState
    }
    
    /*
    onJoin(client: Client, options: any) {
        super.onJoin(client, options);
        console.log("joined lobby",client.sessionId)
       // this.state.custom = client.sessionId;
    }

    onLeave(client:Client) {
        console.log("left lobby",client.sessionId)
        super.onLeave(client);
    }
    */
    async onAuth(client: Client, options: any): Promise<any> {
        const METHOD_NAME = "onAuth()";
        logEntry(CLASSNAME,this.roomName, this.roomId, METHOD_NAME, [client.sessionId, options]);

        //TODO implement own
        return this.npcRoom.onAuth(client, options); //super.onAuth(client, options);
    }

    onJoin(client: Client, options?: any, auth?: any) {
        const METHOD_NAME = "onJoin()";
        logEntry(CLASSNAME, this.roomName,this.roomId, METHOD_NAME, [client.sessionId, options]);
        //super.onJoin(client, options);
        //this.npcRoom.onJoin(client, options, auth);
        //TODO wrap it with something so can put more in there
        //TODO sanitize the data
        const clientUserData:ClientUserData = {dclUserData:options?.userData}
        client.userData = clientUserData

        log(CLASSNAME,this.roomName,this.roomId,METHOD_NAME, "client.userData", client.userData);
    }

    getCurrentTime(){
        return this.clock.currentTime
    }

    addPlayer(client:Client, options:any) { 
        const METHOD_NAME = "addPlayer"
        logEntry(CLASSNAME,this.roomName,this.roomId,METHOD_NAME, [client.sessionId,options]);

        client.send("hello", "world");
        const player = this.state.createPlayer(client.sessionId);

        //update enrollment status?? 
        //workaround, not sure can trust client time is update enrollment servertime
        if(this.state.enrollment.open){
            this.state.enrollment.serverTime = this.getCurrentTime()
        }

        player.connStatus = "connected"
        //player.type = (options.playerType !== undefined) ? options.playerType : "spectator"


        if(options.userData){
            log(CLASSNAME,this.roomName,this.roomId,METHOD_NAME, "snapshot", [client.sessionId,options.userData.avatar]);
            if(options.userData.displayName) player.userData.name = options.userData.displayName
            if(options.userData.userId) player.userData.userId = options.userData.userId
            /*if(options.userData.avatar && options.userData.avatar.snapshots){
                log(CLASSNAME,this.roomId,METHOD_NAME, "snapshot", [client.sessionId,options.userData.avatar.snapshots]);
                player.userData.snapshotFace128 = options.userData.avatar.snapshots.face128
            } */
        } 

        //TODO verify on map

        //this.checkEnrollmentMet()

        return player
    }

    /*
    async onLeave(client: Client, consented: boolean) {
        console.log("left lobby", client.sessionId);
        await super.onLeave(client,consented);
    }*/
    async onLeave(client: Client, consented?: boolean) {
        const METHOD_NAME = "onLeave"
        logEntry(CLASSNAME,this.roomName,this.roomId,METHOD_NAME, [client.sessionId,consented]);
        //await super.onLeave(client); //,consented);
    }
}