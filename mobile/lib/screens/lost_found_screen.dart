import 'package:material_ui/material_ui.dart';

import '../models/campus_models.dart';
import '../services/campus_api.dart';

const _ink=Color(0xFF142A3F);
const _muted=Color(0xFF73889B);
const _teal=Color(0xFF0DAF9C);
const _categories=['electronics','documents','keys','clothing','accessories','other'];

class LostFoundScreen extends StatefulWidget {
  final CampusApi api;
  final CampusProfile profile;
  final bool previewMode;
  const LostFoundScreen({
    super.key,required this.api,required this.profile,
    this.previewMode=false,
  });
  @override
  State<LostFoundScreen> createState()=>_LostFoundScreenState();
}

class _LostFoundScreenState extends State<LostFoundScreen> {
  final _title=TextEditingController();
  final _description=TextEditingController();
  final _location=TextEditingController();
  final _query=TextEditingController();
  List<CampusLostFoundItem> _reports=const [];
  List<CampusLostFoundItem> _mine=const [];
  String _kind='lost',_category='electronics';
  String _contact='helpdesk',_kindFilter='', _categoryFilter='';
  int _revision=0;
  String? _editing,_error;
  bool _loading=true,_busy=false;

  @override
  void initState(){
    super.initState();
    _load();
  }
  @override
  void dispose(){
    _title.dispose();
    _description.dispose();
    _location.dispose();
    _query.dispose();
    super.dispose();
  }
  Future<void> _load() async {
    final revision=++_revision;
    setState(()=>_loading=true);
    try{
      final reports=await widget.api.getLostFoundItems(
        query:_query.text.trim(),kind:_kindFilter,category:_categoryFilter,
      );
      final mine=await widget.api.getMyLostFoundItems();
      if(mounted && revision==_revision){
        setState((){
          _reports=reports;
          _mine=mine;
          _error=null;
        });
      }
    }on CampusApiException catch(error){
      if(mounted && revision==_revision){
        setState(()=>_error=error.message);
      }
    }catch(_){
      if(mounted && revision==_revision){
        setState(()=>_error='Unable to retrieve campus reports.');
      }
    }finally{
      if(mounted && revision==_revision){
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
        backgroundColor:error?const Color(0xFFAC4053):_ink,
      ));
  }
  void _reset(){
    _title.clear();
    _description.clear();
    _location.clear();
    setState((){
      _editing=null;
      _kind='lost';
      _category='electronics';
      _contact='helpdesk';
    });
  }
  void _startEdit(CampusLostFoundItem item){
    _title.text=item.title;
    _description.text=item.description;
    _location.text=item.locationText;
    setState((){
      _editing=item.id;
      _kind=item.kind;
      _category=item.category;
      _contact=item.contactPreference;
    });
    _message('Edit the form above and save your report.');
  }
  Future<void> _save() async {
    if(_busy){return;}
    if(_title.text.trim().length<5||
      _description.text.trim().length<20||
      _location.text.trim().length<5){
      _message('Enter title (5+), details (20+) and location (5+ characters).',
        error:true);
      return;
    }
    setState(()=>_busy=true);
    try{
      if(_editing==null){
        await widget.api.createLostFoundItem(
          kind:_kind,title:_title.text,description:_description.text,
          category:_category,locationText:_location.text,
          contactPreference:_contact,
        );
      }else{
        await widget.api.updateLostFoundItem(_editing!,{
          'title':_title.text.trim(),
          'description':_description.text.trim(),
          'locationText':_location.text.trim(),
        });
      }
      if(!mounted){return;}
      _reset();
      await _load();
      _message(widget.previewMode
        ?'Offline demo report saved locally.'
        :'Lost & Found report saved to your campus.');
    }on CampusApiException catch(error){
      _message(error.message,error:true);
    }catch(_){
      _message('Report could not be saved.',error:true);
    }finally{
      if(mounted){
        setState(()=>_busy=false);
      }
    }
  }
  Future<void> _resolve(CampusLostFoundItem item) async {
    if(_busy){return;}
    setState(()=>_busy=true);
    try{
      await widget.api.updateLostFoundItem(item.id,{'status':'resolved'});
      await _load();
      _message('Report resolved. It is no longer shown in public results.');
    }on CampusApiException catch(error){
      _message(error.message,error:true);
    }catch(_){
      _message('Could not resolve the report.',error:true);
    }finally{
      if(mounted){
        setState(()=>_busy=false);
      }
    }
  }
  Widget _item(CampusLostFoundItem item,{required bool owner})=>
    Padding(
      padding:const EdgeInsets.only(bottom:9),
      child:Card(child:Padding(
        padding:const EdgeInsets.all(17),
        child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Row(children:[
            Expanded(child:Text('${item.kind.toUpperCase()} · ${item.category}',
              style:const TextStyle(color:_teal,fontSize:11,fontWeight:FontWeight.w800))),
            Text(item.status.toUpperCase(),
              style:const TextStyle(color:_muted,fontSize:10,fontWeight:FontWeight.bold)),
          ]),
          const SizedBox(height:9),
          Text(item.title,style:const TextStyle(
            fontSize:17,fontWeight:FontWeight.w900,color:_ink)),
          const SizedBox(height:6),
          Text(item.description,
            style:const TextStyle(color:_muted,fontSize:12,height:1.5)),
          const SizedBox(height:9),
          Text('Last seen or found: ${item.locationText}',
            style:const TextStyle(color:_ink,fontSize:12)),
          const SizedBox(height:6),
          Text(item.contactPreference=='helpdesk'
            ?'Ask the campus helpdesk for assistance.'
            :'Ask campus administration for assistance.',
            style:const TextStyle(color:_teal,fontSize:11)),
          const SizedBox(height:6),
          SelectableText('Reference ID: ${item.id}',
            style:const TextStyle(fontSize:10,color:_muted)),
          if(owner&&item.status=='open')...[
            const SizedBox(height:11),
            Wrap(spacing:10,children:[
              OutlinedButton(
                onPressed: _busy ? null : () => Navigator.of(context).push<void>(
                  MaterialPageRoute(builder: (_) => _MatchesScreen(api: widget.api, report: item)),
                ),
                child: const Text('View possible matches'),
              ),
              OutlinedButton(onPressed:_busy?null:()=>_startEdit(item),
                child:const Text('Edit')),
              OutlinedButton(onPressed:_busy?null:()=>_resolve(item),
                child:const Text('Mark resolved')),
            ]),
          ],
        ]),
      )),
    );
  Widget _publishForm()=>Card(child:Padding(
    padding:const EdgeInsets.all(17),
    child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      Text(_editing==null?'Report a lost/found item':'Edit my report',
        style:const TextStyle(fontWeight:FontWeight.w900,fontSize:18,color:_ink)),
      const SizedBox(height:9),
      const Text('Do not include personal phone numbers, student IDs or identity document photos.',
        style:TextStyle(color:_muted,fontSize:11,height:1.4)),
      const SizedBox(height:14),
      if(_editing==null)...[
        DropdownButtonFormField<String>(
          initialValue:_kind,
          decoration:const InputDecoration(labelText:'Lost or found'),
          items:const [
            DropdownMenuItem(value:'lost',child:Text('I lost an item')),
            DropdownMenuItem(value:'found',child:Text('I found an item')),
          ],
          onChanged:(v){if(v!=null){setState(()=>_kind=v);}},
        ),
        const SizedBox(height:12),
        DropdownButtonFormField<String>(
          initialValue:_category,
          decoration:const InputDecoration(labelText:'Category'),
          items:_categories.map((c)=>DropdownMenuItem(
            value:c,child:Text(c))).toList(),
          onChanged:(v){if(v!=null){setState(()=>_category=v);}},
        ),
        const SizedBox(height:12),
      ],
      TextField(controller:_title,maxLength:160,
        decoration:const InputDecoration(labelText:'Item title')),
      const SizedBox(height:7),
      TextField(controller:_description,maxLength:3000,minLines:3,maxLines:5,
        decoration:const InputDecoration(labelText:'Useful description')),
      const SizedBox(height:7),
      TextField(controller:_location,maxLength:250,
        decoration:const InputDecoration(labelText:'Location')),
      if(_editing==null)...[
        const SizedBox(height:11),
        DropdownButtonFormField<String>(
          initialValue:_contact,
          decoration:const InputDecoration(labelText:'Contact handling'),
          items:const [
            DropdownMenuItem(value:'helpdesk',child:Text('University helpdesk')),
            DropdownMenuItem(value:'adminMediated',child:Text('Campus administration')),
          ],
          onChanged:(v){if(v!=null){setState(()=>_contact=v);}},
        ),
      ],
      const SizedBox(height:18),
      FilledButton(onPressed:_busy?null:_save,
        child:Text(_busy?'Saving…':_editing==null?'Publish report':'Save report')),
      if(_editing!=null)TextButton(onPressed:_reset,child:const Text('Cancel editing')),
    ]),
  ));
  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Lost & Found')),
    body:RefreshIndicator(onRefresh:_load,child:ListView(
      physics:const AlwaysScrollableScrollPhysics(),
      padding:const EdgeInsets.all(18),
      children:[
        Text(widget.previewMode
          ?'OFFLINE LOST & FOUND DEMO'
          :'Find or report items on campus',
          style:const TextStyle(fontSize:19,fontWeight:FontWeight.w900,color:_ink)),
        const SizedBox(height:8),
        const Text('Contact is handled by the helpdesk or campus administration; no student identities are publicly revealed.',
          style:TextStyle(fontSize:12,color:_muted,height:1.5)),
        const SizedBox(height:18),
        _publishForm(),
        const SizedBox(height:19),
        const Text('Browse open reports',
          style:TextStyle(fontWeight:FontWeight.w900,color:_ink,fontSize:17)),
        const SizedBox(height:8),
        TextField(controller:_query,maxLength:60,
          decoration:InputDecoration(
            labelText:'Search items and locations',
            suffixIcon:IconButton(icon:const Icon(Icons.search),
              onPressed:_load),
          )),
        DropdownButtonFormField<String>(
          initialValue:_categoryFilter,decoration:const InputDecoration(labelText:'Filter by item category'),
          items:[const DropdownMenuItem(value:'',child:Text('All categories')),
            ..._categories.map((c)=>DropdownMenuItem(value:c,child:Text(c)))],
          onChanged:(v){setState(()=>_categoryFilter=v??'');_load();},
        ),
        DropdownButtonFormField<String>(
          initialValue:_kindFilter,
          decoration:const InputDecoration(labelText:'Report type'),
          items:const [
            DropdownMenuItem(value:'',child:Text('All reports')),
            DropdownMenuItem(value:'lost',child:Text('Lost')),
            DropdownMenuItem(value:'found',child:Text('Found')),
          ],
          onChanged:(v){setState(()=>_kindFilter=v??'');_load();},
        ),
        const SizedBox(height:12),
        if(_error!=null)Padding(padding:const EdgeInsets.all(10),
          child:Text(_error!,style:const TextStyle(color:Colors.red))),
        if(_loading)const Center(child:Padding(
          padding:EdgeInsets.all(20),child:CircularProgressIndicator()))
        else if(_reports.isEmpty)const Text('No matching open reports.',
          style:TextStyle(color:_muted))
        else for(final item in _reports)_item(item,owner:false),
        const SizedBox(height:22),
        const Text('My reports',style:TextStyle(
          fontSize:17,fontWeight:FontWeight.w900,color:_ink)),
        const SizedBox(height:10),
        if(_mine.isEmpty)const Text('You have not submitted any reports.',
          style:TextStyle(color:_muted))
        else for(final item in _mine)_item(item,owner:true),
      ],
    )),
  );
}

class _MatchesScreen extends StatefulWidget {
  final CampusApi api;
  final CampusLostFoundItem report;
  const _MatchesScreen({required this.api, required this.report});

  @override
  State<_MatchesScreen> createState() => _MatchesScreenState();
}

class _MatchesScreenState extends State<_MatchesScreen> {
  late Future<List<CampusLostFoundMatch>> matches;

  @override
  void initState() {
    super.initState();
    matches = widget.api.getLostFoundMatches(widget.report.id);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Possible matches')),
    body: FutureBuilder<List<CampusLostFoundMatch>>(
      future: matches,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator(semanticsLabel: 'Checking campus reports'));
        }
        return ListView(padding: const EdgeInsets.all(18), children: [
          Text(widget.report.title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          if (snapshot.hasError) ...[
            Text(snapshot.error is CampusApiException
                ? (snapshot.error as CampusApiException).message
                : 'Possible matches could not be loaded.'),
            TextButton(onPressed: () => setState(() {
              matches = widget.api.getLostFoundMatches(widget.report.id);
            }), child: const Text('Retry')),
          ] else if (snapshot.requireData.isEmpty)
            const Text('No possible matches found.')
          else ...[
            const Text('Up to five suggestions from the latest 100 opposite-type reports in this category.'),
            for (final match in snapshot.requireData)
              Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(match.item.title, style: Theme.of(context).textTheme.titleMedium),
                  for (final reason in match.reasons) Text(reason),
                  const SizedBox(height: 8),
                  Text(match.item.contactPreference == 'adminMediated'
                      ? 'Quote this reference to campus administration.'
                      : 'Quote this reference to the campus helpdesk.'),
                  SelectableText(match.item.id),
                ],
              ))),
          ],
        ]);
      },
    ),
  );
}
