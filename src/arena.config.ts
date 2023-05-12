import Arena from "@colyseus/arena";
import { monitor } from "@colyseus/monitor";
import { matchMaker } from 'colyseus'
import basicAuth from "express-basic-auth";
import express from 'express';
import path from 'path';

//import  { initializeApp, applicationDefault, cert } from '../node_modules/firebase-admin/lib/app'
import { LobbyRoom } from 'colyseus';
//import serveIndex from 'serve-index';

import cors from "cors";

/**
 * Import your Room files
 */
import { NpcChatRoom } from "./rooms/NpcChatRoom";
import { PACKET_MAP } from "./rooms/payloadData";
import { GenesisPlazaRoom } from "./rooms/GenesisPlazaRoom";
import { CONFIG } from "./rooms/config";

export default Arena({
    getId: () => "Your Colyseus App",

    initializeGameServer: (gameServer) => {
        /**
         * Define your room handlers:
         */
        

        // Define "lobby" room
        gameServer.define("lobby", LobbyRoom);

        // Define "genesis_plaza" room
        //filter by realm to match DCL realms so we can sync states scene side
        gameServer.define("genesis_plaza", GenesisPlazaRoom)
            .filterBy(['env',"realm",'titleId'])
        ;

        gameServer
        .define('chat_npc', NpcChatRoom)
    },

    initializeExpress: (app) => {
        app.use(cors({
          origin: true //TODO pass a config to control this
        }));
        
        /**
         * Bind your custom express routes here:
         */
         app.get("/", (req, res) => {
            res.send("It's time to kick ass and chew bubblegum!");
        });
        //health check 
        app.get("/health/live", (req, res) => {
            res.send("It's time to kick ass and chew bubblegum!");
        });

        //health check 
        app.get("/env", (req, res) => {
            const whiteList:Record<string,string> = {}
            whiteList["stackName"]="y"
            whiteList["environment"]="y"
            whiteList["cors.origin"]="y"
            whiteList["info_deploy_time"]="y"
            whiteList["info_deploy_timeGMT"]="y"
            
            
          
            const outputMap:Record<string,string> = {}
          
            for(const p in process.env){
              const val = process.env[p]
              outputMap[p] = val !== undefined ? "****" : ""
              
              if(whiteList[p] !== undefined && val !== undefined){
                outputMap[p] = val
              }
            }
          
            res.send(
              {
                body: {
                  config: outputMap
                }
              }
            );
        });
        

        //app.use('/', serveIndex( path.join(__dirname, "static"), {'icons': true} ))
        //app.use('/', express.static(path.join(__dirname, "static")));

        //console.log("INIT!!")
        //console.log(serveIndex(path.join(__dirname, "static")))
        
        //serveIndex prevents POST
        //app.use(serveIndex(path.join(__dirname, "static"), {'icons': true}))
        app.use(express.static(path.join(__dirname, "static")));


        const basicAuthMiddleware = basicAuth({
            // list of users and passwords
            users: {
                "admin": process.env.ACL_ADMIN_PW !== undefined ? process.env.ACL_ADMIN_PW : "admin",//YWRtaW46YWRtaW4=
                "metastudio": "admin",//bWV0YXN0dWRpbzphZG1pbg==
            },
            // sends WWW-Authenticate header, which will prompt the user to fill
            // credentials in
            challenge: true
        });
            
        
        app.use("/maintenance", basicAuthMiddleware);
        app.use("/announce", basicAuthMiddleware);

        app.get('/cache/packet_map', (req, res) => {
          res.send(JSON.stringify({
            id:'PACKET_MAP'
            ,size: PACKET_MAP.size
          }))
        })
        app.get('/audio-base64-binary', (req, res) => {
          let jsonContents = req.body
          
          console.log("audio-base64-binary base64:",req.query.payload)
          if (req.query.payload && req.query.payload.length !== 0) {
            jsonContents = req.query.payload
          }
          if (req.query.payloadId && req.query.payloadId.length !== 0) {
            console.log("audio-base64-binary payloadId",req.query.payloadId)
            const payloadId = req.query.payloadId
            const packetKey = payloadId.toString()
            const payload = PACKET_MAP.get(packetKey)
            if(payload){
              jsonContents = payload.audio.chunk

              //remove from cache once used to clear up memory
              PACKET_MAP.delete(packetKey)
            }else{ 
              //nullify it
              jsonContents = undefined
            }
            
            

            console.log("audio-base64-binary payloadId","payloadId",payloadId,"!payloadFound",payload===undefined,"!jsonContents",jsonContents===undefined)
          }

          if(!jsonContents){
            res.status(404).send('Not found');
            return
          }
          const b64string = jsonContents

          const filename = "npc-audio.wav"
          const buf:Buffer = Buffer.from(b64string, 'base64')
          
          res.writeHead(200, {
              'Content-Type': "mimetype",
              'Content-disposition': 'attachment;filename=' + filename,
              'Content-Length': buf.length
          });
          res.end(buf);
        })

        app.get('/audio-binary', (req, res) => {
          const b64string = "UklGRhwMAABXQVZFZm10IBAAAAABAAEAgD4AAIA+AAABAAgAZGF0Ya4LAACAgICAgICAgICAgICAgICAgICAgICAgICAf3hxeH+AfXZ1eHx6dnR5fYGFgoOKi42aloubq6GOjI2Op7ythXJ0eYF5aV1AOFFib32HmZSHhpCalIiYi4SRkZaLfnhxaWptb21qaWBea2BRYmZTVmFgWFNXVVVhaGdbYGhZbXh1gXZ1goeIlot1k6yxtKaOkaWhq7KonKCZoaCjoKWuqqmurK6ztrO7tbTAvru/vb68vbW6vLGqsLOfm5yal5KKhoyBeHt2dXBnbmljVlJWUEBBPDw9Mi4zKRwhIBYaGRQcHBURGB0XFxwhGxocJSstMjg6PTc6PUxVV1lWV2JqaXN0coCHhIyPjpOenqWppK6xu72yxMu9us7Pw83Wy9nY29ve6OPr6uvs6ezu6ejk6erm3uPj3dbT1sjBzdDFuMHAt7m1r7W6qaCupJOTkpWPgHqAd3JrbGlnY1peX1hTUk9PTFRKR0RFQkRBRUVEQkdBPjs9Pzo6NT04Njs+PTxAPzo/Ojk6PEA5PUJAQD04PkRCREZLUk1KT1BRUVdXU1VRV1tZV1xgXltcXF9hXl9eY2VmZmlna3J0b3F3eHyBfX+JgIWJiouTlZCTmpybnqSgnqyrqrO3srK2uL2/u7jAwMLFxsfEv8XLzcrIy83JzcrP0s3M0dTP0drY1dPR1dzc19za19XX2dnU1NjU0dXPzdHQy8rMysfGxMLBvLu3ta+sraeioJ2YlI+MioeFfX55cnJsaWVjXVlbVE5RTktHRUVAPDw3NC8uLyknKSIiJiUdHiEeGx4eHRwZHB8cHiAfHh8eHSEhISMoJyMnKisrLCszNy8yOTg9QEJFRUVITVFOTlJVWltaXmNfX2ZqZ21xb3R3eHqAhoeJkZKTlZmhpJ6kqKeur6yxtLW1trW4t6+us7axrbK2tLa6ury7u7u9u7vCwb+/vr7Ev7y9v8G8vby6vru4uLq+tri8ubi5t7W4uLW5uLKxs7G0tLGwt7Wvs7avr7O0tLW4trS4uLO1trW1trm1tLm0r7Kyr66wramsqaKlp52bmpeWl5KQkImEhIB8fXh3eHJrbW5mYGNcWFhUUE1LRENDQUI9ODcxLy8vMCsqLCgoKCgpKScoKCYoKygpKyssLi0sLi0uMDIwMTIuLzQ0Njg4Njc8ODlBQ0A/RUdGSU5RUVFUV1pdXWFjZGdpbG1vcXJ2eXh6fICAgIWIio2OkJGSlJWanJqbnZ2cn6Kkp6enq62srbCysrO1uLy4uL+/vL7CwMHAvb/Cvbq9vLm5uba2t7Sysq+urqyqqaalpqShoJ+enZuamZqXlZWTkpGSkpCNjpCMioqLioiHhoeGhYSGg4GDhoKDg4GBg4GBgoGBgoOChISChISChIWDg4WEgoSEgYODgYGCgYGAgICAgX99f398fX18e3p6e3t7enp7fHx4e3x6e3x7fHx9fX59fn1+fX19fH19fnx9fn19fX18fHx7fHx6fH18fXx8fHx7fH1+fXx+f319fn19fn1+gH9+f4B/fn+AgICAgH+AgICAgIGAgICAgH9+f4B+f35+fn58e3t8e3p5eXh4d3Z1dHRzcXBvb21sbmxqaWhlZmVjYmFfX2BfXV1cXFxaWVlaWVlYV1hYV1hYWVhZWFlaWllbXFpbXV5fX15fYWJhYmNiYWJhYWJjZGVmZ2hqbG1ub3Fxc3V3dnd6e3t8e3x+f3+AgICAgoGBgoKDhISFh4aHiYqKi4uMjYyOj4+QkZKUlZWXmJmbm52enqCioqSlpqeoqaqrrK2ur7CxsrGys7O0tbW2tba3t7i3uLe4t7a3t7i3tre2tba1tLSzsrKysbCvrq2sq6qop6alo6OioJ+dnJqZmJeWlJKSkI+OjoyLioiIh4WEg4GBgH9+fXt6eXh3d3V0c3JxcG9ubWxsamppaWhnZmVlZGRjYmNiYWBhYGBfYF9fXl5fXl1dXVxdXF1dXF1cXF1cXF1dXV5dXV5fXl9eX19gYGFgYWJhYmFiY2NiY2RjZGNkZWRlZGVmZmVmZmVmZ2dmZ2hnaGhnaGloZ2hpaWhpamlqaWpqa2pra2xtbGxtbm1ubm5vcG9wcXBxcnFycnN0c3N0dXV2d3d4eHh5ent6e3x9fn5/f4CAgIGCg4SEhYaGh4iIiYqLi4uMjY2Oj5CQkZGSk5OUlJWWlpeYl5iZmZqbm5ybnJ2cnZ6en56fn6ChoKChoqGio6KjpKOko6SjpKWkpaSkpKSlpKWkpaSlpKSlpKOkpKOko6KioaKhoaCfoJ+enp2dnJybmpmZmJeXlpWUk5STkZGQj4+OjYyLioqJh4eGhYSEgoKBgIB/fn59fHt7enl5eHd3dnZ1dHRzc3JycXBxcG9vbm5tbWxrbGxraWppaWhpaGdnZ2dmZ2ZlZmVmZWRlZGVkY2RjZGNkZGRkZGRkZGRkZGRjZGRkY2RjZGNkZWRlZGVmZWZmZ2ZnZ2doaWhpaWpra2xsbW5tbm9ub29wcXFycnNzdHV1dXZ2d3d4eXl6enp7fHx9fX5+f4CAgIGAgYGCgoOEhISFhoWGhoeIh4iJiImKiYqLiouLjI2MjI2OjY6Pj46PkI+QkZCRkJGQkZGSkZKRkpGSkZGRkZKRkpKRkpGSkZKRkpGSkZKRkpGSkZCRkZCRkI+Qj5CPkI+Pjo+OjY6Njo2MjYyLjIuMi4qLioqJiomJiImIh4iHh4aHhoaFhoWFhIWEg4SDg4KDgoKBgoGAgYCBgICAgICAf4CAf39+f35/fn1+fX59fHx9fH18e3x7fHt6e3p7ent6e3p5enl6enl6eXp5eXl4eXh5eHl4eXh5eHl4eXh5eHh3eHh4d3h4d3h3d3h4d3l4eHd4d3h3eHd4d3h3eHh4eXh5eHl4eHl4eXh5enl6eXp5enl6eXp5ent6ent6e3x7fHx9fH18fX19fn1+fX5/fn9+f4B/gH+Af4CAgICAgIGAgYCBgoGCgYKCgoKDgoOEg4OEg4SFhIWEhYSFhoWGhYaHhoeHhoeGh4iHiIiHiImIiImKiYqJiYqJiouKi4qLiouKi4qLiouKi4qLiouKi4qLi4qLiouKi4qLiomJiomIiYiJiImIh4iIh4iHhoeGhYWGhYaFhIWEg4OEg4KDgoOCgYKBgIGAgICAgH+Af39+f359fn18fX19fHx8e3t6e3p7enl6eXp5enl6enl5eXh5eHh5eHl4eXh5eHl4eHd5eHd3eHl4d3h3eHd4d3h3eHh4d3h4d3h3d3h5eHl4eXh5eHl5eXp5enl6eXp7ent6e3p7e3t7fHt8e3x8fHx9fH1+fX59fn9+f35/gH+AgICAgICAgYGAgYKBgoGCgoKDgoOEg4SEhIWFhIWFhoWGhYaGhoaHhoeGh4aHhoeIh4iHiIeHiIeIh4iHiIeIiIiHiIeIh4iHiIiHiIeIh4iHiIeIh4eIh4eIh4aHh4aHhoeGh4aHhoWGhYaFhoWFhIWEhYSFhIWEhISDhIOEg4OCg4OCg4KDgYKCgYKCgYCBgIGAgYCBgICAgICAgICAf4B/f4B/gH+Af35/fn9+f35/fn1+fn19fn1+fX59fn19fX19fH18fXx9fH18fXx9fH18fXx8fHt8e3x7fHt8e3x7fHt8e3x7fHt8e3x7fHt8e3x7fHt8e3x8e3x7fHt8e3x7fHx8fXx9fH18fX5+fX59fn9+f35+f35/gH+Af4B/gICAgICAgICAgICAgYCBgIGAgIGAgYGBgoGCgYKBgoGCgYKBgoGCgoKDgoOCg4KDgoOCg4KDgoOCg4KDgoOCg4KDgoOCg4KDgoOCg4KDgoOCg4KDgoOCg4KDgoOCg4KDgoOCg4KCgoGCgYKBgoGCgYKBgoGCgYKBgoGCgYKBgoGCgYKBgoGCgYKBgoGCgYKBgoGBgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCAgICBgIGAgYCBgIGAgYCBgIGAgYCBgExJU1RCAAAASU5GT0lDUkQMAAAAMjAwOC0wOS0yMQAASUVORwMAAAAgAAABSVNGVBYAAABTb255IFNvdW5kIEZvcmdlIDguMAAA"
          const filename = "test.wav"
          const buf:Buffer = Buffer.from(b64string, 'base64')
          res.writeHead(200, {
              'Content-Type': "mimetype",
              'Content-disposition': 'attachment;filename=' + filename,
              'Content-Length': buf.length
          });
          res.end(buf);
        })

        app.post('/maintenance', (req, res) => {
            let jsonContents: {msg:string} = req.body
            console.log("XX",req.query.payload)
            if (req.query.payload && req.query.payload.length !== 0) {
              jsonContents = JSON.parse(req.query.payload as any)
            }
            if (!jsonContents || !jsonContents.msg || jsonContents.msg.length === 0) {
              console.log('maintenance msg incomplete ', jsonContents)
              res.send('maintenance msg incomplete ')
              return
            }
      
            console.log('sending maintenance to rooms ', 
              jsonContents
            )
      
            matchMaker.presence.publish('maintenance', jsonContents)
            res.send('sent maintenance:'+JSON.stringify(jsonContents))
          })
        app.post('/announce', (req, res) => {
            let jsonContents: {msg:string} = req.body
            console.log("XX",req.query.payload)
            if (req.query.payload && req.query.payload.length !== 0) {
              jsonContents = JSON.parse(req.query.payload as any)
            }
            if (!jsonContents || !jsonContents.msg || jsonContents.msg.length === 0) {
              console.log('announce msg incomplete ', jsonContents)
              res.send('announce msg incomplete ')
              return
            }
      
            console.log('sending announcement to rooms ', 
              jsonContents
            )
      
            matchMaker.presence.publish('announce', jsonContents)
            res.send('sent announcement:'+JSON.stringify(jsonContents))
          })

        
        /**
         * Bind @colyseus/monitor
         * It is recommended to protect this route with a password.
         * Read more: https://docs.colyseus.io/tools/monitor/
         */
        app.use("/colyseus", basicAuthMiddleware, monitor());
    },


    beforeListen: () => {
        /**
         * Before before gameServer.listen() is called.
         */
    }
});