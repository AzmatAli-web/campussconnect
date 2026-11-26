import {Server} from 'socket.io';
import {campusUserMiddleware} from '../middleware/campus-user.js';

export function attachMessaging(server,app,deps){
 const io=new Server(server,{cors:{origin:deps.config.corsOrigin},transports:['websocket'],maxHttpBufferSize:16384});
 io.use(async(socket,next)=>{
  const token=socket.handshake.auth?.token;
  const req={get:()=>typeof token==='string'?'Bearer '+token:''};
  try{
   for(const middleware of campusUserMiddleware(deps)){
    await new Promise((resolve,reject)=>middleware(req,null,error=>error?reject(error):resolve()));
   }
   socket.data.userId=String(req.currentUser._id);
   socket.data.expires=req.firebaseClaims.exp*1000;
   next();
  }catch{next(new Error('Campus session required'));}
 });
 io.on('connection',socket=>{
  socket.join(socket.data.userId);
  const expiry=setTimeout(()=>socket.disconnect(true),Math.max(1,socket.data.expires-Date.now()));
  socket.once('disconnect',()=>clearTimeout(expiry));
 });
 // Only an invalidation is pushed. Each content fetch checks the current campus session.
 app.on('conversationChanged',ids=>io.to(ids.map(String)).emit('inbox:update'));
 return io;
}
