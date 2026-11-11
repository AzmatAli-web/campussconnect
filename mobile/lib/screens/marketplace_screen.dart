import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/campus_models.dart';
import '../services/campus_api.dart';

const _ink=Color(0xFF142A3F);
const _muted=Color(0xFF73889B);
const _teal=Color(0xFF0DAF9C);
const _categories=['books','electronics','furniture','clothing','other'];
const _conditions=['new','like_new','good','fair'];
const _reasons=['spam','scam','prohibited','misleading','other'];

class MarketplaceScreen extends StatefulWidget {
  final CampusApi api;
  final CampusProfile profile;
  final bool previewMode;
  const MarketplaceScreen({
    super.key,required this.api,required this.profile,
    this.previewMode=false,
  });
  @override
  State<MarketplaceScreen> createState()=>_MarketplaceScreenState();
}

class _MarketplaceScreenState extends State<MarketplaceScreen> {
  final _title=TextEditingController();
  final _description=TextEditingController();
  final _price=TextEditingController();
  final _search=TextEditingController();
  final Map<String,Future<Uint8List>> _photoCache={};
  List<CampusMarketplaceItem> _feed=const [],_mine=const [];
  bool _loading=true,_busy=false,_consent=false;
  String _category='books',_condition='good',_categoryFilter='';
  String? _editing,_error;
  XFile? _photo;

  @override
  void initState(){super.initState();_reload();}
  @override
  void dispose(){
    _title.dispose();_description.dispose();_price.dispose();_search.dispose();
    super.dispose();
  }
  void _notify(String message,{bool error=false}){
    if(!mounted)return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content:Text(message),
      backgroundColor:error?const Color(0xFF9C394B):_ink,
    ));
  }
  Future<void> _reload()async{
    setState(()=>_loading=true);
    try{
      final feed=await widget.api.getMarketplace(
        query:_search.text.trim(),category:_categoryFilter,
      );
      final mine=await widget.api.getMyMarketplace();
      if(mounted)setState((){
        _feed=feed;_mine=mine;_error=null;_photoCache.clear();
      });
    }on CampusApiException catch(e){
      if(mounted)setState(()=>_error=e.message);
    }catch(_){
      if(mounted)setState(()=>_error='Unable to load campus Marketplace.');
    }finally{
      if(mounted)setState(()=>_loading=false);
    }
  }
  void _clearForm(){
    _title.clear();_description.clear();_price.clear();
    setState((){
      _category='books';_condition='good';_consent=false;
      _editing=null;_photo=null;
    });
  }
  void _edit(CampusMarketplaceItem item){
    _title.text=item.title;_description.text=item.description;
    _price.text=item.pricePkr.toString();
    setState((){
      _editing=item.id;_category=item.category;
      _condition=item.condition;_consent=item.contactAvailable;_photo=null;
    });
    _notify('Edit the form at the top of this page.');
  }
  Future<void> _pickPhoto()async{
    try{
      final selected=await ImagePicker().pickImage(
        source:ImageSource.gallery,maxWidth:1600,imageQuality:78);
      if(selected!=null && mounted)setState(()=>_photo=selected);
    }catch(_){_notify('Could not open photo picker.',error:true);}
  }
  Future<void> _save()async{
    if(_busy)return;
    final price=int.tryParse(_price.text.trim());
    if(_title.text.trim().length<5||
       _description.text.trim().length<20||
       price==null||price<0||price>5000000){
      _notify('Enter a 5+ character title, 20+ character description and valid PKR price.',
        error:true);return;
    }
    setState(()=>_busy=true);
    try{
      final body=<String,dynamic>{
        'title':_title.text.trim(),'description':_description.text.trim(),
        'category':_category,'condition':_condition,
        'pricePkr':price,'contactConsent':_consent,
      };
      final listing=_editing==null
        ? await widget.api.createMarketplaceItem(
            title:body['title'] as String,description:body['description'] as String,
            category:_category,condition:_condition,
            pricePkr:price,contactConsent:_consent)
        : await widget.api.updateMarketplaceItem(_editing!,body);
      if(_photo!=null&&!widget.previewMode){
        try{
          final bytes=await _photo!.readAsBytes();
          await widget.api.uploadMarketplacePhoto(listing.id,bytes,_photo!.name);
        }on CampusApiException catch(e){
          _notify('Listing saved, but photo upload failed: ${e.message}',error:true);
          _clearForm();await _reload();return;
        }catch(_){
          _notify('Listing saved, but photo could not be uploaded.',error:true);
          _clearForm();await _reload();return;
        }
      }
      _clearForm();
      await _reload();
      _notify(widget.previewMode?'Demo listing saved locally.':
        'Your item was published or updated.');
    }on CampusApiException catch(e){_notify(e.message,error:true);}
    catch(_){_notify('Listing could not be saved.',error:true);}
    finally{if(mounted)setState(()=>_busy=false);}
  }
  Future<void> _change(CampusMarketplaceItem item,String status)async{
    setState(()=>_busy=true);
    try{
      await widget.api.setMarketplaceStatus(item.id,status);
      await _reload();
      _notify(widget.previewMode?'Demo listing updated.':'Listing marked $status.');
    }on CampusApiException catch(e){_notify(e.message,error:true);}
    catch(_){_notify('Could not update listing.',error:true);}
    finally{if(mounted)setState(()=>_busy=false);}
  }
  Future<void> _contact(CampusMarketplaceItem item)async{
    try{
      final email=await widget.api.getMarketplaceContact(item.id);
      if(!mounted)return;
      await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
        title:const Text('Verified campus seller email'),
        content:SelectableText(email),
        actions:[TextButton(onPressed:()=>Navigator.pop(dialogContext),
          child:const Text('Close'))],
      ));
    }on CampusApiException catch(e){_notify(e.message,error:true);}
    catch(_){_notify('Seller email unavailable.',error:true);}
  }
  Future<void> _report(CampusMarketplaceItem item)async{
    String reason='spam';
    final detail=TextEditingController();
    try{
      await showDialog<void>(context:context,builder:(dialogContext)=>
        StatefulBuilder(builder:(context,update)=>AlertDialog(
          title:const Text('Report listing'),
          content:Column(mainAxisSize:MainAxisSize.min,children:[
            DropdownButtonFormField<String>(
              initialValue:reason,
              decoration:const InputDecoration(labelText:'Reason'),
              items:_reasons.map((v)=>DropdownMenuItem(value:v,child:Text(v))).toList(),
              onChanged:(v){if(v!=null)update(()=>reason=v);},
            ),
            TextField(controller:detail,maxLength:1000,maxLines:3,
              decoration:const InputDecoration(labelText:'Details (optional)')),
          ]),
          actions:[
            TextButton(onPressed:()=>Navigator.pop(dialogContext),
              child:const Text('Cancel')),
            FilledButton(onPressed:()async{
              try{
                await widget.api.reportMarketplaceItem(item.id,
                  reason:reason,detail:detail.text);
                if(!dialogContext.mounted)return;
                Navigator.pop(dialogContext);
                _notify(widget.previewMode
                  ? 'Demo report only — nothing sent to campus.'
                  : 'Report submitted to campus administrators.');
              }on CampusApiException catch(e){_notify(e.message,error:true);}
              catch(_){_notify('Report failed.',error:true);}
            },child:const Text('Submit report')),
          ],
        )),
      );
    }finally{detail.dispose();}
  }

  Widget _photoWidget(CampusMarketplaceItem item){
    if(!item.hasImage||widget.previewMode||item.status!='published'){
      return const SizedBox(height:120,
        child:Center(child:Icon(Icons.sell_outlined,size:48,color:_teal)));
    }
    final future=_photoCache.putIfAbsent(item.id,
      ()=>widget.api.downloadMarketplacePhoto(item.id));
    return FutureBuilder<Uint8List>(
      future:future,builder:(context,snapshot){
        if(snapshot.hasError)return const SizedBox(height:120,
          child:Center(child:Icon(Icons.broken_image_outlined)));
        if(!snapshot.hasData)return const SizedBox(height:120,
          child:Center(child:CircularProgressIndicator()));
        return Image.memory(snapshot.data!,height:160,width:double.infinity,
          fit:BoxFit.cover,semanticLabel:'Photo of ${item.title}');
      },
    );
  }
  Widget _itemCard(CampusMarketplaceItem item,{bool owned=false})=>
    Card(child:Padding(padding:const EdgeInsets.all(16),child:Column(
      crossAxisAlignment:CrossAxisAlignment.start,children:[
        _photoWidget(item),
        const SizedBox(height:8),
        Row(children:[
          Expanded(child:Text(item.category.toUpperCase()+' · '+item.condition,
            style:const TextStyle(color:_teal,fontSize:11,fontWeight:FontWeight.w800))),
          Text(item.status.toUpperCase(),style:const TextStyle(
            fontSize:10,color:_muted,fontWeight:FontWeight.bold)),
        ]),
        const SizedBox(height:8),
        Text(item.title,style:const TextStyle(
          fontSize:18,fontWeight:FontWeight.w900,color:_ink)),
        const SizedBox(height:6),
        Text(item.description,style:const TextStyle(color:_muted,height:1.5)),
        const SizedBox(height:12),
        Text(item.pricePkr==0?'Free':'PKR ${item.pricePkr}',
          style:const TextStyle(color:_teal,fontSize:18,fontWeight:FontWeight.w900)),
        const SizedBox(height:10),
        Wrap(spacing:8,runSpacing:8,children:[
          if(owned&&item.status=='published')...[
            OutlinedButton(onPressed:_busy?null:()=>_edit(item),
              child:const Text('Edit')),
            OutlinedButton(onPressed:_busy?null:()=>_change(item,'sold'),
              child:const Text('Mark sold')),
          ],
          if(owned&&['published','sold'].contains(item.status))
            OutlinedButton(onPressed:_busy?null:()=>_change(item,'archived'),
              child:const Text('Archive')),
          if(!owned)...[
            if(item.contactAvailable)
              OutlinedButton(onPressed:()=>_contact(item),
                child:const Text('Seller email'))
            else
              const Text('Email contact not enabled',
                style:TextStyle(fontSize:11,color:_muted)),
            OutlinedButton(onPressed:()=>_report(item),
              child:const Text('Report')),
          ],
        ]),
      ],
    )));
  Widget _form()=>Card(child:Padding(
    padding:const EdgeInsets.all(18),
    child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      Text(_editing==null?'Publish a student listing':'Edit my listing',
        style:const TextStyle(fontSize:18,fontWeight:FontWeight.w900,color:_ink)),
      const SizedBox(height:12),
      TextField(controller:_title,maxLength:160,
        decoration:const InputDecoration(labelText:'Item title')),
      TextField(controller:_description,maxLength:3000,minLines:3,maxLines:5,
        decoration:const InputDecoration(labelText:'Description (20+ characters)')),
      const SizedBox(height:8),
      DropdownButtonFormField<String>(
        initialValue:_category,
        key:ValueKey('cat-${_editing??'new'}-$_category'),
        decoration:const InputDecoration(labelText:'Category'),
        items:_categories.map((c)=>DropdownMenuItem(value:c,child:Text(c))).toList(),
        onChanged:(v){if(v!=null)setState(()=>_category=v);},
      ),
      const SizedBox(height:12),
      DropdownButtonFormField<String>(
        initialValue:_condition,
        key:ValueKey('condition-${_editing??'new'}-$_condition'),
        decoration:const InputDecoration(labelText:'Condition'),
        items:_conditions.map((c)=>DropdownMenuItem(value:c,child:Text(c))).toList(),
        onChanged:(v){if(v!=null)setState(()=>_condition=v);},
      ),
      const SizedBox(height:12),
      TextField(controller:_price,keyboardType:TextInputType.number,
        decoration:const InputDecoration(labelText:'Price in PKR (0 = free)')),
      SwitchListTile(
        contentPadding:EdgeInsets.zero,value:_consent,
        title:const Text('Share my university email when buyers request it'),
        subtitle:const Text('Only verified campus users can request the email'),
        onChanged:(v)=>setState(()=>_consent=v),
      ),
      if(!widget.previewMode)...[
        OutlinedButton.icon(onPressed:_busy?null:_pickPhoto,
          icon:const Icon(Icons.image_outlined),
          label:Text(_photo==null?'Choose optional item photo (up to 2 MB)':_photo!.name)),
        const SizedBox(height:9),
      ],
      FilledButton(onPressed:_busy?null:_save,
        child:Text(_busy?'Saving…':_editing==null?'Publish immediately':'Save listing')),
      if(_editing!=null)TextButton(onPressed:_clearForm,child:const Text('Cancel editing')),
    ]),
  ));
  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Student Marketplace')),
    body:RefreshIndicator(onRefresh:_reload,child:ListView(
      physics:const AlwaysScrollableScrollPhysics(),
      padding:const EdgeInsets.all(17),
      children:[
        Text(widget.previewMode?'OFFLINE MARKETPLACE DEMO':'Campus-only buying and selling',
          style:const TextStyle(fontSize:20,fontWeight:FontWeight.w900,color:_ink)),
        const SizedBox(height:6),
        const Text('Seller contact requires consent. No payment, delivery or buyer protection service is provided.',
          style:TextStyle(color:_muted,fontSize:12,height:1.5)),
        const SizedBox(height:15),
        _form(),
        const SizedBox(height:19),
        const Text('Browse listings',
          style:TextStyle(fontSize:18,fontWeight:FontWeight.w900,color:_ink)),
        const SizedBox(height:8),
        TextField(controller:_search,maxLength:60,
          decoration:InputDecoration(labelText:'Search title or description',
            suffixIcon:IconButton(icon:const Icon(Icons.search),
              onPressed:_reload))),
        DropdownButtonFormField<String>(
          initialValue:_categoryFilter,
          decoration:const InputDecoration(labelText:'Filter category'),
          items:[const DropdownMenuItem(value:'',child:Text('All categories')),
            ..._categories.map((c)=>DropdownMenuItem(value:c,child:Text(c)))],
          onChanged:(v){setState(()=>_categoryFilter=v??'');_reload();},
        ),
        const SizedBox(height:10),
        if(_error!=null)Padding(padding:const EdgeInsets.all(10),
          child:Text(_error!,style:const TextStyle(color:Colors.red))),
        if(_loading)const Padding(padding:EdgeInsets.all(20),
          child:Center(child:CircularProgressIndicator()))
        else if(_feed.isEmpty)const Text('No published Marketplace listings yet.',
          style:TextStyle(color:_muted))
        else for(final item in _feed)Padding(
          padding:const EdgeInsets.only(bottom:8),child:_itemCard(item)),
        const SizedBox(height:23),
        const Text('My listings',style:TextStyle(
          fontSize:18,fontWeight:FontWeight.w900,color:_ink)),
        const SizedBox(height:10),
        if(_mine.isEmpty)const Text('No items posted yet.',
          style:TextStyle(color:_muted))
        else for(final item in _mine)Padding(
          padding:const EdgeInsets.only(bottom:8),
          child:_itemCard(item,owned:true)),
      ],
    )),
  );
}
