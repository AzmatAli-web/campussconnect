import 'package:flutter/material.dart';

import '../models/campus_models.dart';
import '../services/campus_api.dart';

const _ink=Color(0xFF142A3F);
const _teal=Color(0xFF0DAF9C);
const _muted=Color(0xFF73889B);

class MyComplaintsScreen extends StatefulWidget {
  final CampusApi api;
  final bool previewMode;
  const MyComplaintsScreen({
    super.key,required this.api,this.previewMode=false,
  });

  @override
  State<MyComplaintsScreen> createState()=>_MyComplaintsScreenState();
}

class _MyComplaintsScreenState extends State<MyComplaintsScreen>{
  final _formKey=GlobalKey<FormState>();
  final _title=TextEditingController();
  final _details=TextEditingController();
  String _category='academic';
  List<CampusComplaint> _complaints=const [];
  bool _loading=true;
  bool _sending=false;
  String? _error;

  @override
  void initState(){
    super.initState();
    _load();
  }
  @override
  void dispose(){
    _title.dispose();
    _details.dispose();
    super.dispose();
  }

  Future<void> _load()async{
    setState((){
      _loading=true;
      _error=null;
    });
    try{
      final items=await widget.api.getMyComplaints();
      if(mounted)setState(()=>_complaints=items);
    }on CampusApiException catch(e){
      if(mounted)setState(()=>_error=e.message);
    }catch(_){
      if(mounted)setState(()=>_error='Could not load your complaints.');
    }finally{
      if(mounted)setState(()=>_loading=false);
    }
  }

  Future<void> _submit()async{
    if(_sending||!_formKey.currentState!.validate())return;
    setState(()=>_sending=true);
    try{
      await widget.api.submitComplaint(
        category:_category,title:_title.text,description:_details.text);
      if(!mounted)return;
      _title.clear();
      _details.clear();
      _formKey.currentState!.reset();
      setState(()=>_category='academic');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text(widget.previewMode
          ? 'Demo complaint saved locally.'
          : 'Your complaint was submitted privately.')));
      await _load();
    }on CampusApiException catch(e){
      if(mounted)setState(()=>_error=e.message);
    }catch(_){
      if(mounted)setState(()=>_error='Could not submit. Try again.');
    }finally{
      if(mounted)setState(()=>_sending=false);
    }
  }

  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('My complaints')),
    body:RefreshIndicator(
      onRefresh:_load,
      child:ListView(
        padding:const EdgeInsets.fromLTRB(18,12,18,25),
        physics:const AlwaysScrollableScrollPhysics(),
        children:[
          const Text('Private student support',style:TextStyle(
            fontSize:19,fontWeight:FontWeight.w900,color:_ink)),
          const SizedBox(height:6),
          Text(widget.previewMode
            ? 'OFFLINE DEMO — nothing is sent to the university'
            : 'Visible only to you and authorized campus Staff/Admin.',
            style:const TextStyle(color:_muted,fontSize:12)),
          const SizedBox(height:10),
          const Text('For emergencies, contact campus security directly. '
            'This form is not monitored as an emergency channel.',
            style:TextStyle(fontSize:11,height:1.6,color:Color(0xFF946F35))),
          const SizedBox(height:18),
          Card(child:Padding(
            padding:const EdgeInsets.all(17),
            child:Form(
              key:_formKey,
              child:Column(
                crossAxisAlignment:CrossAxisAlignment.stretch,
                children:[
                  const Text('Submit an issue',style:TextStyle(
                    fontWeight:FontWeight.w900,fontSize:16,color:_ink)),
                  const SizedBox(height:13),
                  DropdownButtonFormField<String>(
                    initialValue:_category,
                    decoration:const InputDecoration(labelText:'Category'),
                    items:const [
                      DropdownMenuItem(value:'academic',child:Text('Academic')),
                      DropdownMenuItem(value:'facilities',child:Text('Facilities')),
                      DropdownMenuItem(value:'fees',child:Text('Fees')),
                      DropdownMenuItem(value:'other',child:Text('Other')),
                    ],
                    onChanged:(value){
                      if(value!=null)setState(()=>_category=value);
                    },
                  ),
                  const SizedBox(height:11),
                  TextFormField(
                    controller:_title,maxLength:140,
                    decoration:const InputDecoration(labelText:'Subject'),
                    validator:(v)=>(v?.trim().length??0)<5
                      ? 'Enter at least 5 characters':null,
                  ),
                  const SizedBox(height:11),
                  TextFormField(
                    controller:_details,maxLength:3000,
                    minLines:3,maxLines:5,
                    decoration:const InputDecoration(
                      labelText:'Details',alignLabelWithHint:true),
                    validator:(v)=>(v?.trim().length??0)<15
                      ? 'Enter at least 15 characters':null,
                  ),
                  const SizedBox(height:12),
                  FilledButton.icon(
                    onPressed:_sending?null:_submit,
                    icon:const Icon(Icons.send_outlined),
                    label:Text(_sending?'Submitting…':'Submit privately'),
                  ),
                ],
              ),
            ),
          )),
          const SizedBox(height:16),
          Row(children:[
            const Expanded(child:Text('Tracking history',
              style:TextStyle(color:_ink,fontSize:17,fontWeight:FontWeight.w900))),
            IconButton(onPressed:_loading?null:_load,
              icon:const Icon(Icons.refresh_rounded)),
          ]),
          const SizedBox(height:8),
          if(_error!=null)Card(child:Padding(
            padding:const EdgeInsets.all(16),
            child:Text(_error!,style:const TextStyle(color:Color(0xFFB34052))),
          )),
          if(_loading)
            const Center(child:Padding(
              padding:EdgeInsets.all(26),child:CircularProgressIndicator()))
          else if(_complaints.isEmpty)
            const Card(child:Padding(
              padding:EdgeInsets.all(23),
              child:Text('No complaints submitted yet.',
                style:TextStyle(color:_muted),textAlign:TextAlign.center),
            ))
          else
            for(final c in _complaints)
              Padding(
                padding:const EdgeInsets.only(bottom:10),
                child:Card(child:Padding(
                  padding:const EdgeInsets.all(17),
                  child:Column(
                    crossAxisAlignment:CrossAxisAlignment.start,
                    children:[
                      Row(children:[
                        Expanded(child:Text(c.category.toUpperCase(),
                          style:const TextStyle(
                            color:_teal,fontSize:11,fontWeight:FontWeight.w900))),
                        Text(c.status.replaceAll('_',' ').toUpperCase(),
                          style:const TextStyle(fontSize:10,
                            color:_ink,fontWeight:FontWeight.w800)),
                      ]),
                      const SizedBox(height:9),
                      Text(c.title,style:const TextStyle(
                        color:_ink,fontSize:15,fontWeight:FontWeight.w900)),
                      const SizedBox(height:6),
                      Text(c.description,style:const TextStyle(
                        color:_muted,fontSize:12,height:1.6)),
                      if(c.staffResponse.isNotEmpty)...[
                        const Divider(),
                        const Text('Staff response',style:TextStyle(
                          color:_teal,fontWeight:FontWeight.w800,fontSize:12)),
                        const SizedBox(height:5),
                        Text(c.staffResponse,style:const TextStyle(
                          color:_ink,fontSize:12,height:1.6)),
                      ],
                    ],
                  ),
                )),
              ),
        ],
      ),
    ),
  );
}
