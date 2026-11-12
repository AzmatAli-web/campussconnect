import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

import '../models/campus_models.dart';
import '../services/campus_api.dart';

const _ink=Color(0xFF142A3F);
const _teal=Color(0xFF0DAF9C);
const _muted=Color(0xFF73889B);

class NotificationsScreen extends StatefulWidget{
  final CampusApi api;
  final bool previewMode;
  const NotificationsScreen({
    super.key,required this.api,this.previewMode=false,
  });
  @override
  State<NotificationsScreen> createState()=>_NotificationsScreenState();
}
class _NotificationsScreenState extends State<NotificationsScreen>{
  List<CampusNotification> _items=const [];
  String? _cursor,_error;
  bool _loading=true,_paging=false,_hasMore=false,_busyPush=false,_pushOn=false;
  StreamSubscription<String>? _rotation;

  @override
  void initState(){
    super.initState();
    _load();
    if(!widget.previewMode){
      _checkPushStatus();
    }
  }

  @override
  void dispose(){
    _rotation?.cancel();
    super.dispose();
  }

  Future<void> _checkPushStatus() async{
    try{
      final enabled=await widget.api.hasRegisteredPushDevice();
      if(mounted){
        setState(()=>_pushOn=enabled);
        if(enabled){
          _watchRotation();
        }
      }
    }catch(_){
      // An unavailable FCM device endpoint does not prevent reading the inbox.
    }
  }

  void _watchRotation(){
    _rotation ??= FirebaseMessaging.instance.onTokenRefresh.listen((token) async{
      if(!_pushOn){return;}
      try{
        await widget.api.registerPushDevice(token);
      }catch(_){
        // The inbox still works. User can retry consent after backend recovery.
      }
    });
  }

  Future<void> _enablePush() async{
    if(widget.previewMode||_busyPush){return;}
    setState(()=>_busyPush=true);
    try{
      final settings=await FirebaseMessaging.instance.requestPermission(
        alert:true,badge:true,sound:true,
      );
      if(settings.authorizationStatus!=AuthorizationStatus.authorized&&
        settings.authorizationStatus!=AuthorizationStatus.provisional){
        throw const CampusApiException('PUSH_DENIED',
          'Please allow notifications in Android settings.');
      }
      final token=await FirebaseMessaging.instance.getToken();
      if(token==null||token.isEmpty){
        throw const CampusApiException('PUSH_NOT_READY',
          'Firebase Messaging registration is not ready on this device.');
      }
      await widget.api.registerPushDevice(token);
      if(mounted){
        setState(()=>_pushOn=true);
        _watchRotation();
        _notify('Android push notifications enabled.');
      }
    }on CampusApiException catch(error){
      _notify(error.message,error:true);
    }catch(_){
      _notify('Could not enable Firebase notifications. Inbox remains available.',
        error:true);
    }finally{
      if(mounted){setState(()=>_busyPush=false);}
    }
  }

  Future<void> _disablePush() async{
    if(widget.previewMode||_busyPush){return;}
    setState(()=>_busyPush=true);
    try{
      final token=await FirebaseMessaging.instance.getToken();
      if(token!=null&&token.isNotEmpty){
        await widget.api.revokePushDevice(token);
      }
      await FirebaseMessaging.instance.deleteToken();
      await _rotation?.cancel();
      _rotation=null;
      if(mounted){
        setState(()=>_pushOn=false);
        _notify('Push delivery disabled for this device.');
      }
    }on CampusApiException catch(error){
      _notify(error.message,error:true);
    }catch(_){
      _notify('Could not disable this device. Retry while online.',error:true);
    }finally{
      if(mounted){setState(()=>_busyPush=false);}
    }
  }

  void _notify(String text,{bool error=false}){
    if(!mounted){return;}
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content:Text(text),
        backgroundColor:error?const Color(0xFFAA3D4A):_ink,
      ));
  }

  Future<void> _load({bool older=false})async{
    if(older&&(!_hasMore||_paging)){return;}
    if(older){
      setState(()=>_paging=true);
    }else{
      setState(()=>_loading=true);
    }
    try{
      final page=await widget.api.getNotificationPage(
        limit:20,cursor:older?_cursor:null,
      );
      if(!mounted){return;}
      setState((){
        if(older){
          final existing=_items.map((i)=>'${i.kind}:${i.id}').toSet();
          _items=[..._items,...page.items.where(
            (i)=>!existing.contains('${i.kind}:${i.id}'))];
        }else{
          _items=page.items;
        }
        _cursor=page.nextCursor;
        _hasMore=page.hasMore;
        _error=null;
      });
    }on CampusApiException catch(error){
      if(mounted){setState(()=>_error=error.message);}
    }catch(_){
      if(mounted){setState(()=>_error='Could not retrieve campus notifications.');}
    }finally{
      if(mounted){setState((){
        _loading=false;
        _paging=false;
      });}
    }
  }

  Future<void> _markRead(CampusNotification item)async{
    try{
      final at=await widget.api.markNotificationRead(item);
      if(mounted){
        setState(()=>_items=_items.map((n)=>
          n.id==item.id&&n.kind==item.kind?n.markRead(at):n).toList());
      }
    }on CampusApiException catch(error){
      _notify(error.message,error:true);
    }catch(_){
      _notify('Could not mark this notification as read.',error:true);
    }
  }

  Widget _card(CampusNotification item)=>Padding(
    padding:const EdgeInsets.only(bottom:10),
    child:Card(child:Padding(
      padding:const EdgeInsets.all(17),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Row(children:[
          Expanded(child:Text(item.kind=='announcement'?'CAMPUS ANNOUNCEMENT':
            item.type.replaceAll('_',' ').toUpperCase(),
            style:const TextStyle(
              color:_teal,fontSize:11,fontWeight:FontWeight.w800))),
          if(item.readAt==null)
            const Icon(Icons.circle,color:_teal,size:10),
        ]),
        const SizedBox(height:9),
        Text(item.title,style:const TextStyle(
          color:_ink,fontWeight:FontWeight.w800,fontSize:16)),
        const SizedBox(height:6),
        Text(item.body,style:const TextStyle(
          color:_muted,fontSize:12,height:1.5)),
        const SizedBox(height:11),
        if(item.createdAt!=null)Text(item.createdAt!.toLocal().toString().split('.').first,
          style:const TextStyle(color:_muted,fontSize:11)),
        if(item.readAt==null)...[
          const SizedBox(height:12),
          OutlinedButton.icon(
            icon:const Icon(Icons.done,size:17),
            label:const Text('Mark as read'),
            onPressed:()=>_markRead(item),
          ),
        ],
      ]),
    )),
  );

  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Campus notifications')),
    body:RefreshIndicator(
      onRefresh:()=>_load(),
      child:ListView(
        physics:const AlwaysScrollableScrollPhysics(),
        padding:const EdgeInsets.all(17),
        children:[
          Text(widget.previewMode?'OFFLINE NOTIFICATIONS DEMO':'Your private updates',
            style:const TextStyle(color:_ink,fontSize:21,fontWeight:FontWeight.w900)),
          const SizedBox(height:6),
          const Text(
            'Event confirmations, membership decisions and campus announcements. Updates are loaded only when you open this page.',
            style:TextStyle(color:_muted,height:1.5,fontSize:12),
          ),
          const SizedBox(height:14),
          if(!widget.previewMode)Card(child:Padding(
            padding:const EdgeInsets.all(15),
            child:Column(
              crossAxisAlignment:CrossAxisAlignment.start,
              children:[
                const Text('Android push notifications',
                  style:TextStyle(color:_ink,fontWeight:FontWeight.w800)),
                const SizedBox(height:5),
                const Text(
                  'Optional: enable system alerts for personal updates. Campus announcements remain in this inbox. Push requires a configured server dispatcher.',
                  style:TextStyle(fontSize:11,height:1.5,color:_muted),
                ),
                const SizedBox(height:9),
                OutlinedButton.icon(
                  icon:Icon(_pushOn?Icons.notifications_off_outlined:
                    Icons.notifications_active_outlined),
                  onPressed:_busyPush?null:_pushOn?_disablePush:_enablePush,
                  label:Text(_busyPush?'Updating…':
                    _pushOn?'Disable device push':'Enable device push'),
                ),
              ],
            ),
          )),
          const SizedBox(height:15),
          if(_error!=null)Padding(
            padding:const EdgeInsets.all(10),
            child:Text(_error!,style:const TextStyle(color:Colors.red)),
          ),
          if(_loading)
            const Center(child:Padding(
              padding:EdgeInsets.all(24),
              child:CircularProgressIndicator(),
            ))
          else if(_items.isEmpty)
            const Text('No new campus notifications yet.',
              style:TextStyle(color:_muted))
          else for(final item in _items)_card(item),
          if(_hasMore&&!_loading)OutlinedButton(
            onPressed:_paging?null:()=>_load(older:true),
            child:Text(_paging?'Loading older messages…':'Load older notifications'),
          ),
        ],
      ),
    ),
  );
}
