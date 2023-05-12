import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import { Character } from "@inworld/nodejs-sdk";
import { NpcGameRoomState, NpcState } from "../npcChatState/server-state";
import { CONFIG } from "../rooms/config";
import * as serverStateSpec from "./server-state-spec";


export class Quaternion3State extends Schema implements serverStateSpec.Quaternion3State {

  @type("number")
  x: number;
  @type("number")
  y: number;
  @type("number")
  z: number;
  @type("number")
  w: number;

  constructor(x: number, y: number, z: number, w: number) {
    super()
    this.x = x
    this.y = y
    this.z = z
    this.w = w
  }
  //this wont update entire object state but just the individual properties
  copyFrom(q: serverStateSpec.Quaternion3State) {
    this.x = q.x
    this.y = q.y
    this.z = q.z
    this.w = q.w
  }
}
export class Vector3State extends Schema implements serverStateSpec.Vector3State {

  @type("number")
  x: number;
  @type("number")
  y: number;
  @type("number")
  z: number;

  constructor(x: number, y: number, z: number) {
    super()
    this.x = x
    this.y = y
    this.z = z
  }
  //this wont update entire object state but just the individual properties
  copyFrom(vec3: serverStateSpec.Vector3State) {
    this.x = vec3.x
    this.y = vec3.y
    this.z = vec3.z
  }
}

export class PlayerButtonState extends Schema implements serverStateSpec.PlayerButtonState {
  @type("boolean")
  forward: boolean
  @type("boolean")
  backward: boolean
  @type("boolean")
  left: boolean
  @type("boolean")
  right: boolean
  @type("boolean")
  shoot: boolean

  copyFrom(buttons: serverStateSpec.PlayerButtonState) {
    if (!buttons) return

    if (buttons.forward !== undefined) this.forward = buttons.forward
    if (buttons.backward !== undefined) this.backward = buttons.backward
    if (buttons.shoot !== undefined) this.shoot = buttons.shoot
  }
}



export class PlayerNpcDataState extends Schema implements serverStateSpec.PlayerNpcDataState {
 
  @type(Vector3State)
  worldPosition: Vector3State = new Vector3State(0, 0, 0)
  
  @type(Quaternion3State)
  worldMoveDirection: Quaternion3State = new Quaternion3State(0, 0, 0, 0)

  @type(Quaternion3State)
  shootDirection: Quaternion3State = new Quaternion3State(0, 0, 0, 0)

  @type(Quaternion3State)
  cameraDirection: Quaternion3State = new Quaternion3State(0, 0, 0, 0)

  @type("number")
  endTime: number

  @type("number")
  enrollTime: number

  @type("string")
  teamId: string


  //@type("boolean")
  //isDrifting: boolean

  @type("number")
  serverTime: number = -1

  @type("number")
  racePosition: number

  @type("number")
  lastKnownServerTime: number = -1

  @type("number")
  lastKnownClientTime: number = -1
  
  //used for debugging right now
  _racePositionScoreUsed:number = -1
  _stayedTillTheEnd:boolean = false
  
  //lastKnownLap: number = -1
  //lastKnownSegment: number = -1
  //needed for start of race, racers start off behind 0, need to know when they cross the start line
  //visitedSegment0: boolean = false
  //lastLapStartTime: number

  constructor() {
    super()

    //this.updateServerTime()
  }

  updateServerTime(now:number) {
    this.serverTime = now
  }

  copyFrom(data: serverStateSpec.PlayerNpcDataState,now:number) {
    if (!data) return

   
    if (data.teamId !== undefined) this.teamId = data.teamId
    if (data.worldPosition !== undefined) this.worldPosition = new Vector3State(data.worldPosition.x, data.worldPosition.y, data.worldPosition.z)
    if (data.cameraDirection !== undefined) this.cameraDirection = new Quaternion3State(data.cameraDirection.x, data.cameraDirection.y, data.cameraDirection.z, data.cameraDirection.w)
    if (data.shootDirection !== undefined) this.shootDirection = new Quaternion3State(data.shootDirection.x, data.shootDirection.y, data.shootDirection.z, data.shootDirection.w)
    if (data.worldMoveDirection !== undefined) this.worldMoveDirection = new Quaternion3State(data.worldMoveDirection.x, data.worldMoveDirection.y, data.worldMoveDirection.z, data.worldMoveDirection.w)
    if (data.lastKnownServerTime !== undefined) this.lastKnownServerTime = data.lastKnownServerTime
    if (data.lastKnownClientTime !== undefined) this.lastKnownClientTime = data.lastKnownClientTime
    
    //when lap flips over to race.maxLaps? 
    //computing server side if(data.endTime !== undefined) this.endTime = data.endTime
    //computing server side if(data.racePosition !== undefined) this.racePosition = data.racePosition

    this.updateServerTime(now)
    //console.log("copy from ",data.closestProjectedPoint,this.racingData.closestProjectedPoint.z)
  }

  hasFinishedNpc() {
    return (this.endTime !== undefined && this.endTime > 0)
  }
  /*
  hasStayedTillEnd(): boolean {
    //check if 
    throw new Error("Method not implemented.");
  }*/

}
function vector3CopyFrom(src: serverStateSpec.Vector3State, dest: serverStateSpec.Vector3State) {
  if(src && dest){
    dest.x = src.x
    dest.y = src.y
    dest.z = src.z
  }else if(dest){
    dest.x = undefined
    dest.y = undefined
    dest.z = undefined
  }
}

//data we do not want visible client side
export type PlayerServerSideData = {
  playFabData: {
    id: string
    sessionTicket: string
  }
  //sessionId:string
  //endGameResult?: PlayFabHelper.GameEndResultType
}

export class PlayerUserDataState extends Schema implements serverStateSpec.PlayerUserDataState {

  @type("string")
  name: string = "Anonymous"

  @type("string")
  userId: string


  //@type("string")
  //snapshotFace128:string //use AvatarTexture

  //START non shared vars

  updateName(name: string) {
    this.name = name
  }
  updateUserId(id: string) {
    this.userId = id
  }
}
export class CharacterId extends Schema implements serverStateSpec.CharacterId {
  @type("string")
  resourceName: string;

  @type("boolean")
  confirmed: boolean;
}
export class TriggerId extends Schema implements serverStateSpec.TriggerId {
  @type("string")
  name: string;

  @type("boolean")
  confirmed: boolean;
}
export class InWorldConnectionClientCacheState extends Schema implements serverStateSpec.InWorldConnectionClientCacheState {
  @type(CharacterId)
  currentCharacterId: CharacterId

  @type(TriggerId)
  currentSceneTrigger: TriggerId


  //FIXME not sharable as is, need to make Colyseus state objects
  characterMapById:Map<string,Character>=new Map()
  characterMapByResource:Map<string,Character>=new Map()


  resetRemoteCache() {
    this.characterMapById.clear()
    this.characterMapByResource.clear()
  }

  resetCurrentCache(){
    this.currentCharacterId = undefined
    this.currentSceneTrigger = undefined
  }
}
export class PlayerState extends Schema implements serverStateSpec.PlayerState {
  @type("string")
  id: string

  @type("string")
  type: "combatant"|"spectator"

  @type("string")
  connStatus: serverStateSpec.PlayerConnectionStatus = "unknown"

  @type(PlayerUserDataState)
  userData: PlayerUserDataState = new PlayerUserDataState()

  @type(PlayerNpcDataState)
  npcData: PlayerNpcDataState = new PlayerNpcDataState()

  @type(PlayerButtonState)
  buttons: PlayerButtonState = new PlayerButtonState()

  @type("string")
  sessionId: string //should be safe to share

  @type(InWorldConnectionClientCacheState)
  remoteClientCache: InWorldConnectionClientCacheState = new InWorldConnectionClientCacheState()
  //START non shared vars

  userPrivateData?: PlayerServerSideData


  /**
   * update will do an inplace update and trigger individual updates under raceData
   * @param data 
   */
  updateNpcData(data: serverStateSpec.PlayerNpcDataState,now:number) {
    this.npcData.copyFrom(data,now)
  }
  /**
   * set will replace entire object with new one and trigger a single update on raceData object
   * @param data 
   * @returns 
   */
  setNpcData(data: serverStateSpec.PlayerNpcDataState,now:number) {
    if (!data) return

    const tmp = new PlayerNpcDataState()
    tmp.copyFrom(data,now)

    //preserve things that are server side only
    tmp.endTime = this.npcData.endTime
    tmp.racePosition = this.npcData.racePosition
    tmp.enrollTime = this.npcData.enrollTime

    tmp.teamId = this.npcData.teamId

    tmp.updateServerTime(now)
    this.npcData = tmp
  }

  /**
   * update will do an inplace update and trigger individual updates under buttons
   * @param buttons 
   */
  updateButtons(buttons: serverStateSpec.PlayerButtonState) {
    this.buttons.copyFrom(buttons)
  }
  /**
   * set will replace entire object with new one and trigger a single update on buttons object
   * @param buttons 
   * @returns 
   */
  setButtons(buttons: serverStateSpec.PlayerButtonState) {
    if (!buttons) return

    const tmp = new PlayerButtonState()
    tmp.copyFrom(buttons)

    this.buttons = tmp
  }
}

/*
export class ClockState extends Schema implements serverStateSpec.ClockState{
  @type("number")
  currentTime:number=-1
}*/


export class TrackFeaturePositionState extends Schema implements serverStateSpec.ITrackFeaturePosition {
  @type(Vector3State)
  position?:Vector3State//optional, if set its the exact spot
  @type(Quaternion3State)
  rotation?:Quaternion3State//optional, if set its the exact rotation
  

  constructor(){//(args: serverStateSpec.TrackFeaturePositionConstructorArgs) {
    super()

    //this.copyFrom(args)    
  }
  copyFrom(args: serverStateSpec.TrackFeaturePositionConstructorArgs) {
    if(!args) return
    
    vector3CopyFrom(args.position,this.position)
    //qu
  }
}
export class TrackFeatureState extends Schema implements serverStateSpec.ITrackFeatureState {
  @type("string")
  name: string

  @type(TrackFeaturePositionState)
  position: TrackFeaturePositionState = new TrackFeaturePositionState()
  //triggerSize?:Vector3
  //shape:TrackFeatureShape

  @type("string")
  type: serverStateSpec.TrackFeatureType

  @type("number")
  activateTime?: number

  @type("number")
  lastTouchTime?: number

  @type("number")
  serverTime: number = -1

  //FIXME need colyseus state version of this!
  constructor(args: serverStateSpec.TrackFeatureStateConstructorArgs) {
    super()

    this.name = args.name
    //this.position = args.position
    this.type = args.type
    this.activateTime = args.activateTime
    this.position.copyFrom(args.position)
    //if(args.offset) this.offset = args.offset
  }

  updateServerTime(now:number) {
    this.serverTime = now
  }
}

export class LevelDataState extends Schema implements serverStateSpec.LevelDataState {

  @type("string")
  id: string
  @type("string")
  name: string
  //status:RaceStatus

  //theme:Theme
  //@type([ TrackFeatureState ])
  //trackFeatures = new ArraySchema<TrackFeatureState>();
  @type({ map: TrackFeatureState })
  trackFeatures = new MapSchema<TrackFeatureState>();

  @type("number")
  maxLaps: number //move to track data or is max laps race data?

  //trackPath: serverStateSpec.Vector3State[]

  copyFrom(retval: serverStateSpec.LevelDataState,now:number) {
    this.id = retval.id
    this.name = retval.name
    
    this.trackFeatures.clear()

    if(retval.trackFeatures){
      retval.trackFeatures.forEach( (value:serverStateSpec.ITrackFeatureState)=>{
        const trackFeat = value//retval.localtrackFeatures[p]
        const stateTrackFeat = new TrackFeatureState( trackFeat )
        stateTrackFeat.updateServerTime(now)
        
        console.log("stateTrackFeat.type",stateTrackFeat.type)
        
        stateTrackFeat.position.copyFrom( trackFeat.position )

        //const val:serverStateSpec.ITrackFeatureState=stateTrackFeat

        this.trackFeatures.set( stateTrackFeat.name, stateTrackFeat )
      } )
    }
    if(retval.localTrackFeatures){
      for(const p in retval.localTrackFeatures){
        const trackFeat = retval.localTrackFeatures[p]
        //trackFeat.heatlh
        const args: serverStateSpec.TrackFeatureStateConstructorArgs = {
          name:trackFeat.name,
          position:trackFeat.position,
          type: trackFeat.type,
          activateTime: trackFeat.activateTime,
          serverTime: now
        }
        const stateTrackFeat = new TrackFeatureState( args )
        stateTrackFeat.updateServerTime(now)
        //console.log("stateTrackFeat.type",stateTrackFeat.type)
        
        stateTrackFeat.position.copyFrom( trackFeat.position )
        this.trackFeatures.set( stateTrackFeat.name, stateTrackFeat )
      } 
    }

    this.maxLaps = retval.maxLaps
    //this.trackPath = retval.trackPath
  }

  copyTo(retval: serverStateSpec.LevelDataState) {
    retval.id = this.id
    retval.name = this.name
    //retval.trackFeatures = this.trackFeatures
    retval.maxLaps = this.maxLaps
    //retval.trackPath = this.trackPath
  }
}

export class RobotsLobbyState extends Schema implements serverStateSpec.RobotsLobbyState {

  @type("string")
  id: string = ""


  @type("string")
  name: string = "Untitled Race"

  @type("string")
  status: serverStateSpec.NpcProxyStatus = "not-started"

  @type("number")
  time: number = -1

  @type("number")
  startTime: number = -1

  @type("number")
  timeLimit: number = -1

  @type("number")
  endTime: number = -1

  @type("number")
  endTimeActual: number = -1

  @type("number")
  serverTime: number = -1

  @type("number")
  maxLaps: number = CONFIG.RACE_MAX_LAPS_DEFAULT//FIXME - HARDCODED FOR NOW 

  savedPlayerStats:boolean = false

  constructor() {
    super()

    //this.updateServerTime()
  }

  updateServerTime(now:number) {
    this.serverTime = now
  }
  hasNpcStarted() {
    return this.status !== undefined && this.status === 'started' //(this.startTime !== undefined && this.startTime > 0 && this.startTime <= Date.now())
  }
  isNpcOver() {
    return this.status !== undefined && this.status === 'ended' //(this.startTime !== undefined && this.startTime > 0 && this.startTime <= Date.now())
  }
}


export class EnrollmentState extends Schema implements serverStateSpec.EnrollmentState {

  @type("boolean")
  open: boolean = true

  @type("number")
  startTime: number = -1

  @type("number")
  endTime: number = -1

  @type("number")
  serverTime: number = -1

  @type("number")
  maxPlayers: number = -1

  @type("number")
  minPlayers: number = -1
  

  constructor() {
    super()

    //this.updateServerTime()
  }

  addPlayer(player:PlayerState){
    //TODO add checks to make sure on other teams
    //team.addPlayer(player)
  }

  updateServerTime(now:number) {
    this.serverTime = now
  }

  removePlayer(player:PlayerState){
    
  }
}


export class LobbyGameRoomState extends Schema implements serverStateSpec.LobbyGameRoomState {
  @type({ map: PlayerState })
  players = new MapSchema<PlayerState>();

  @type(RobotsLobbyState)
  lobbyState = new RobotsLobbyState()

  @type(NpcGameRoomState)
  npcState = new NpcGameRoomState()

  @type(LevelDataState)
  levelData = new LevelDataState()

  @type(EnrollmentState)
  enrollment = new EnrollmentState()

  something = "This attribute won't be sent to the client-side";

  createPlayer(sessionId: string): PlayerState {
    const player = new PlayerState()
    player.id = sessionId //syncing these, can we get rid of player id?
    player.sessionId = sessionId
    this.players.set(sessionId, player);

    //FIXME not thread safe, good enough??
    player.npcData.racePosition = this.players.size
    player.npcData.enrollTime = Date.now()

    return player
  }

  getPlayer(sessionId:string){
    return this.players.get(sessionId)
  }
  removePlayer(player:PlayerState):boolean{
    if(player === undefined){
      //warning
      return false
    }
    console.log("NPCRoomRoomState","removePlayer",this.players.size,player.id,this.players.has(player.id))
    const result = this.players.delete(player.id);
    //remove from teams
    this.enrollment.removePlayer(player)

    return result;
  }

}