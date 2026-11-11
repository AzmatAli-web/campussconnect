import 'package:flutter/material.dart';

import '../models/campus_models.dart';
import '../services/campus_api.dart';

const _ink=Color(0xFF142A3F);
const _teal=Color(0xFF0DAF9C);
const _muted=Color(0xFF73889B);

class SocietiesScreen extends StatefulWidget {
  final CampusApi api;
  final bool previewMode;
  const SocietiesScreen({super.key,required this.api,this.previewMode=false});

  @override
  State<SocietiesScreen> createState()=>_SocietiesScreenState();
}

class _SocietiesScreenState extends State<SocietiesScreen>{
  List<CampusSociety> _societies=const [];
  List<CampusSocietyMembership> _mine=const [];
  bool _loading=true,_busy=false;
  String? _error;

  @override
  void initState(){
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(()=>_loading=true);
    try {
      final societies=await widget.api.getSocieties();
      final mine=await widget.api.getMySocietyMemberships();
      if(mounted){
        setState((){
          _societies=societies;
          _mine=mine;
          _error=null;
        });
      }
    } on CampusApiException catch(error) {
      if(mounted){
        setState(()=>_error=error.message);
      }
    } catch(_) {
      if(mounted){
        setState(()=>_error='Cannot load society memberships.');
      }
    } finally {
      if(mounted){
        setState(()=>_loading=false);
      }
    }
  }

  void _message(String message,{bool error=false}){
    if(!mounted){return;}
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content:Text(message),
        backgroundColor:error?const Color(0xFFAB4554):_ink,
      ));
  }

  Future<void> _join(CampusSociety society) async {
    if(_busy){return;}
    setState(()=>_busy=true);
    try{
      await widget.api.requestSocietyMembership(society.id);
      await _load();
      _message(widget.previewMode
        ?'Offline demo membership request saved locally.'
        :'Request submitted. A Society Manager must approve it.');
    } on CampusApiException catch(error) {
      _message(error.message,error:true);
    } catch(_) {
      _message('Could not submit membership request.',error:true);
    } finally {
      if(mounted){
        setState(()=>_busy=false);
      }
    }
  }

  Future<void> _withdraw(CampusSocietyMembership membership) async {
    if(_busy){return;}
    setState(()=>_busy=true);
    try{
      await widget.api.withdrawSocietyMembership(membership.id);
      await _load();
      _message(membership.status=='pending'
        ?'Membership request cancelled.'
        :'You left the society.');
    } on CampusApiException catch(error) {
      _message(error.message,error:true);
    } catch(_) {
      _message('Unable to update membership.',error:true);
    } finally {
      if(mounted){
        setState(()=>_busy=false);
      }
    }
  }

  String _status(String value)=>switch(value){
    'pending'=>'Waiting for approval',
    'active'=>'Approved member',
    'rejected'=>'Not approved',
    'cancelled'=>'Request cancelled',
    'left'=>'Left society',
    'removed'=>'Removed by manager',
    _=>value,
  };

  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Campus societies')),
    body:RefreshIndicator(
      onRefresh:_load,
      child:ListView(
        physics:const AlwaysScrollableScrollPhysics(),
        padding:const EdgeInsets.fromLTRB(18,14,18,28),
        children:[
          Text(widget.previewMode?'OFFLINE SOCIETY DEMO':'Societies & membership',
            style:const TextStyle(fontSize:22,fontWeight:FontWeight.w900,color:_ink)),
          const SizedBox(height:7),
          const Text(
            'Browse approved societies and request membership. Your details are shared only with assigned society managers. Joining does not grant privileged roles.',
            style:TextStyle(fontSize:12,color:_muted,height:1.5),
          ),
          const SizedBox(height:17),
          if(_error!=null)Padding(
            padding:const EdgeInsets.symmetric(vertical:10),
            child:Text(_error!,style:const TextStyle(color:Colors.red)),
          ),
          if(_loading)const Center(child:Padding(
            padding:EdgeInsets.all(24),child:CircularProgressIndicator(),
          ))
          else if(_societies.isEmpty)
            const Card(child:Padding(
              padding:EdgeInsets.all(22),
              child:Text('No campus societies available yet.'),
            ))
          else for(final society in _societies)_societyCard(society),
          const SizedBox(height:21),
          const Text('My membership history',
            style:TextStyle(fontSize:18,fontWeight:FontWeight.w900,color:_ink)),
          const SizedBox(height:10),
          if(_mine.isEmpty)
            const Text('You have not requested any memberships.',
              style:TextStyle(color:_muted))
          else for(final membership in _mine)
            Padding(
              padding:const EdgeInsets.only(bottom:11),
              child:Card(child:Padding(
                padding:const EdgeInsets.all(15),
                child:Column(
                  crossAxisAlignment:CrossAxisAlignment.start,
                  children:[
                    Text(_societies.where((s)=>s.id==membership.societyId).firstOrNull?.name
                      ??'Society no longer listed',
                      style:const TextStyle(fontWeight:FontWeight.bold,color:_ink)),
                    const SizedBox(height:7),
                    Text(_status(membership.status),
                      style:const TextStyle(color:_teal,fontSize:12)),
                    if(membership.reviewNote.isNotEmpty)...[
                      const SizedBox(height:8),
                      Text('Manager note: ${membership.reviewNote}',
                        style:const TextStyle(fontSize:11,color:_muted)),
                    ],
                  ],
                ),
              )),
            ),
        ],
      ),
    ),
  );

  Widget _societyCard(CampusSociety society){
    CampusSocietyMembership? membership;
    for(final item in _mine){
      if(item.societyId==society.id){
        membership=item;
        break;
      }
    }
    final canRequest=membership==null ||
      ['cancelled','rejected','left'].contains(membership.status);
    final canWithdraw=membership!=null &&
      ['pending','active'].contains(membership.status);
    return Padding(
      padding:const EdgeInsets.only(bottom:12),
      child:Card(child:Padding(
        padding:const EdgeInsets.all(18),
        child:Column(
          crossAxisAlignment:CrossAxisAlignment.start,
          children:[
            Text(society.name,style:const TextStyle(
              color:_ink,fontSize:18,fontWeight:FontWeight.w900)),
            const SizedBox(height:7),
            Text(society.description,
              style:const TextStyle(color:_muted,height:1.5,fontSize:12)),
            const SizedBox(height:10),
            if(membership!=null)
              Text('My status: ${_status(membership.status)}',
                style:const TextStyle(color:_teal,fontSize:12)),
            const SizedBox(height:13),
            Wrap(spacing:9,runSpacing:7,children:[
              FilledButton(
                onPressed:_busy||!canRequest?null:()=>_join(society),
                child:Text(canRequest?'Request to join':
                  membership?.status=='removed'?'Contact campus administration':'Already requested'),
              ),
              if(canWithdraw)OutlinedButton(
                onPressed:_busy?null:()=>_withdraw(membership!),
                child:Text(membership!.status=='pending'?'Cancel request':'Leave society'),
              ),
            ]),
          ],
        ),
      )),
    );
  }
}
