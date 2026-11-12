import 'dart:io';

import 'package:material_ui/material_ui.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../models/campus_models.dart';
import '../services/campus_api.dart';

const _ink=Color(0xFF142A3F);
const _teal=Color(0xFF0DAF9C);
const _muted=Color(0xFF73889B);

class AcademicResourcesPanel extends StatefulWidget {
  final CampusApi api;
  final bool previewMode;
  const AcademicResourcesPanel({
    super.key, required this.api, this.previewMode=false,
  });

  @override
  State<AcademicResourcesPanel> createState()=>_AcademicResourcesPanelState();
}

class _AcademicResourcesPanelState extends State<AcademicResourcesPanel> {
  final _program=TextEditingController();
  final _course=TextEditingController();
  final _semester=TextEditingController();
  List<CampusAcademicResource> _resources=const [];
  bool _loading=true;
  String? _error;
  String? _downloadingId;

  @override
  void initState(){
    super.initState();
    _load();
  }

  @override
  void dispose(){
    _program.dispose();
    _course.dispose();
    _semester.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final semesterText=_semester.text.trim();
    final semester=semesterText.isEmpty?null:int.tryParse(semesterText);
    if(semesterText.isNotEmpty &&
        (semester==null || semester<1 || semester>12)){
      setState(()=>_error='Semester must be between 1 and 12.');
      return;
    }
    setState((){
      _loading=true;
      _error=null;
    });
    try {
      final records=await widget.api.getAcademicResources(
        program:_program.text,
        courseCode:_course.text,
        semester:semester,
      );
      if(mounted)setState(()=>_resources=records);
    } on CampusApiException catch(e){
      if(mounted)setState(()=>_error=e.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error=
          'Unable to fetch notes. Check the backend connection.');
      }
    } finally {
      if(mounted)setState(()=>_loading=false);
    }
  }

  Future<void> _openPdf(CampusAcademicResource resource) async {
    if(_downloadingId!=null||widget.previewMode)return;
    setState((){
      _downloadingId=resource.id;
      _error=null;
    });
    try {
      final bytes=await widget.api.downloadAcademicPdf(resource);
      final temp=await getTemporaryDirectory();
      if(!RegExp(r'^[0-9a-f]{24}$').hasMatch(resource.id)){
        throw const CampusApiException(
          'INVALID_RESOURCE','Invalid PDF identifier.');
      }
      final file=File('${temp.path}/campus-notes-${resource.id}.pdf');
      await file.writeAsBytes(bytes,flush:true);
      final result=await OpenFilex.open(file.path,type:'application/pdf');
      if(result.type!=ResultType.done && mounted){
        _message('PDF was downloaded, but no PDF viewer opened. '
          'Install or enable a PDF viewer.');
      }
    } on CampusApiException catch(e){
      if(mounted)_message(e.message);
    } catch (_) {
      if(mounted)_message('Unable to open the PDF on this phone.');
    } finally {
      if(mounted)setState(()=>_downloadingId=null);
    }
  }

  void _message(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content:Text(message)));
  }

  String _size(int bytes) {
    if(bytes<1024*1024)return '${(bytes/1024).round()} KB';
    return '${(bytes/1024/1024).toStringAsFixed(1)} MB';
  }

  @override
  Widget build(BuildContext context)=>Column(
    crossAxisAlignment:CrossAxisAlignment.stretch,
    children:[
      const Text('Course notes & learning materials',
        style:TextStyle(fontSize:20,fontWeight:FontWeight.w900,color:_ink)),
      const SizedBox(height:6),
      Text(widget.previewMode
        ? 'OFFLINE DEMO — fictional resource listing, downloads disabled'
        : 'Only verified campus accounts can download Faculty PDFs.',
        style:const TextStyle(fontSize:12,color:_muted,height:1.5)),
      const SizedBox(height:16),
      Card(child:Padding(
        padding:const EdgeInsets.all(16),
        child:Column(
          crossAxisAlignment:CrossAxisAlignment.stretch,
          children:[
            TextField(controller:_program,
              textCapitalization:TextCapitalization.characters,
              decoration:const InputDecoration(
                labelText:'Program (optional)',
                hintText:'BSE',
                prefixIcon:Icon(Icons.school_outlined),
              )),
            const SizedBox(height:10),
            Row(children:[
              Expanded(child:TextField(controller:_semester,
                keyboardType:TextInputType.number,
                decoration:const InputDecoration(
                  labelText:'Semester',
                  hintText:'7',
                ))),
              const SizedBox(width:10),
              Expanded(flex:2,child:TextField(controller:_course,
                textCapitalization:TextCapitalization.characters,
                decoration:const InputDecoration(
                  labelText:'Course code',
                  hintText:'CSC494',
                ))),
            ]),
            const SizedBox(height:13),
            Row(children:[
              Expanded(child:FilledButton.icon(
                onPressed:_loading?null:_load,
                icon:const Icon(Icons.search_rounded),
                label:const Text('Find PDFs'),
              )),
              const SizedBox(width:10),
              OutlinedButton(
                onPressed:_loading?null:(){
                  _program.clear();
                  _course.clear();
                  _semester.clear();
                  _load();
                },
                child:const Text('Clear'),
              ),
            ]),
          ],
        ),
      )),
      const SizedBox(height:16),
      if(_error!=null)
        Card(child:Padding(
          padding:const EdgeInsets.all(15),
          child:Text(_error!,style:const TextStyle(color:Color(0xFF9D3B4A))),
        )),
      if(_loading)
        const Center(child:Padding(padding:EdgeInsets.all(22),
          child:CircularProgressIndicator()))
      else if(_resources.isEmpty)
        const Card(child:Padding(
          padding:EdgeInsets.symmetric(vertical:30,horizontal:20),
          child:Text(
            'No academic PDFs published for these filters. '
            'Verified Faculty can publish notes from the web portal.',
            textAlign:TextAlign.center,
            style:TextStyle(color:_muted,height:1.6),
          ),
        ))
      else
        for(final resource in _resources)
          Padding(
            padding:const EdgeInsets.only(bottom:12),
            child:Card(child:Padding(
              padding:const EdgeInsets.all(18),
              child:Column(
                crossAxisAlignment:CrossAxisAlignment.start,
                children:[
                  Row(children:[
                    Container(
                      padding:const EdgeInsets.all(10),
                      decoration:BoxDecoration(
                        borderRadius:BorderRadius.circular(10),
                        color:const Color(0xFFE2F8F3),
                      ),
                      child:const Icon(Icons.picture_as_pdf_outlined,
                        color:_teal),
                    ),
                    const SizedBox(width:10),
                    Expanded(child:Text(
                      '${resource.program} · Sem ${resource.semester} · ${resource.courseCode}',
                      style:const TextStyle(
                        fontWeight:FontWeight.w800,fontSize:12,color:_teal),
                    )),
                    Text(_size(resource.sizeBytes),
                      style:const TextStyle(color:_muted,fontSize:11)),
                  ]),
                  const SizedBox(height:15),
                  Text(resource.title,style:const TextStyle(
                    color:_ink,fontSize:16,fontWeight:FontWeight.w900)),
                  const SizedBox(height:7),
                  if(resource.description.isNotEmpty)
                    Text(resource.description,style:const TextStyle(
                      color:_muted,fontSize:12,height:1.6)),
                  const SizedBox(height:9),
                  Text(resource.fileName,
                    style:const TextStyle(fontSize:11,color:_muted)),
                  const SizedBox(height:13),
                  SizedBox(width:double.infinity,child:FilledButton.tonalIcon(
                    onPressed:widget.previewMode||_downloadingId!=null
                      ? null : ()=>_openPdf(resource),
                    icon:const Icon(Icons.file_download_outlined),
                    label:Text(widget.previewMode?'Demo PDF unavailable':
                      _downloadingId==resource.id?'Downloading…':'Open PDF'),
                  )),
                ],
              ),
            )),
          ),
    ],
  );
}
