import 'package:material_ui/material_ui.dart';

import '../models/campus_models.dart';
import '../services/campus_api.dart';

const _ink=Color(0xFF142A3F);
const _teal=Color(0xFF0DAF9C);
const _muted=Color(0xFF73889B);

class MyFeesScreen extends StatefulWidget {
  final CampusApi api;
  final bool previewMode;
  const MyFeesScreen({super.key,required this.api,this.previewMode=false});
  @override
  State<MyFeesScreen> createState()=>_MyFeesScreenState();
}

class _MyFeesScreenState extends State<MyFeesScreen>{
  List<CampusFeeInvoice> _invoices=const [];
  final Map<String,List<CampusFeePayment>> _history={};
  final Set<String> _loadingHistory={};
  bool _loading=true;
  String? _error;

  @override
  void initState(){
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState((){
      _loading=true;
      _error=null;
    });
    try{
      final items=await widget.api.getMyFees();
      if(mounted){
        setState((){
          _invoices=items;
          _history.clear();
        });
      }
    } on CampusApiException catch(e){
      if(mounted){
        setState(()=>_error=e.message);
      }
    } catch(_){
      if(mounted){
        setState(()=>_error='Could not load your fee records.');
      }
    } finally{
      if(mounted){
        setState(()=>_loading=false);
      }
    }
  }

  Future<void> _payments(CampusFeeInvoice invoice) async {
    if(_history.containsKey(invoice.id)||_loadingHistory.contains(invoice.id)){
      return;
    }
    setState(()=>_loadingHistory.add(invoice.id));
    try{
      final rows=await widget.api.getMyFeePayments(invoice);
      if(mounted){
        setState(()=>_history[invoice.id]=rows);
      }
    } on CampusApiException catch(e){
      if(mounted){
        setState(()=>_error=e.message);
      }
    } catch(_){
      if(mounted){
        setState(()=>_error='Could not load recorded payments.');
      }
    } finally{
      if(mounted){
        setState(()=>_loadingHistory.remove(invoice.id));
      }
    }
  }

  String _money(int n)=>'PKR $n';
  String _status(CampusFeeInvoice invoice){
    if(invoice.status=='paid'){
      return 'FULLY RECORDED';
    }
    if(invoice.status=='partially_recorded'){
      return 'PARTIALLY RECORDED';
    }
    return 'UNPAID';
  }

  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('My fees & dues')),
    body:RefreshIndicator(
      onRefresh:_load,
      child:ListView(
        padding:const EdgeInsets.fromLTRB(18,12,18,28),
        physics:const AlwaysScrollableScrollPhysics(),
        children:[
          const Text('Fee invoices & recorded payments',
            style:TextStyle(fontWeight:FontWeight.w900,
              color:_ink,fontSize:18)),
          const SizedBox(height:7),
          Text(widget.previewMode
            ? 'OFFLINE DEMO — fictional fee records only'
            : 'Read-only invoices issued by your authorized campus finance office.',
            style:const TextStyle(color:_muted,fontSize:12,height:1.5)),
          const SizedBox(height:11),
          const Card(child:Padding(
            padding:EdgeInsets.all(15),
            child:Text(
              'This screen does not accept payments or verify bank transfers. '
              'For payment questions, confirm directly with the college finance office.',
              style:TextStyle(color:Color(0xFF8B6531),
                fontSize:12,height:1.6),
            ),
          )),
          const SizedBox(height:14),
          if(_error!=null)
            Card(child:Padding(
              padding:const EdgeInsets.all(15),
              child:Text(_error!,
                style:const TextStyle(color:Color(0xFFAE4051))),
            )),
          if(_loading)
            const Center(child:Padding(
              padding:EdgeInsets.all(30),
              child:CircularProgressIndicator(),
            ))
          else if(_invoices.isEmpty)
            const Card(child:Padding(
              padding:EdgeInsets.all(22),
              child:Text(
                'No fee invoices have been issued for your account.',
                style:TextStyle(color:_muted,height:1.5),
                textAlign:TextAlign.center,
              ),
            ))
          else
            for(final invoice in _invoices)
              Padding(
                padding:const EdgeInsets.only(bottom:11),
                child:Card(
                  child:ExpansionTile(
                    onExpansionChanged:(open){
                      if(open){
                        _payments(invoice);
                      }
                    },
                    tilePadding:const EdgeInsets.symmetric(
                      horizontal:17,vertical:6),
                    childrenPadding:const EdgeInsets.fromLTRB(17,0,17,16),
                    title:Text(invoice.title,
                      style:const TextStyle(
                        fontSize:15,color:_ink,fontWeight:FontWeight.w900)),
                    subtitle:Padding(
                      padding:const EdgeInsets.only(top:8),
                      child:Column(
                        crossAxisAlignment:CrossAxisAlignment.start,
                        children:[
                          Text(invoice.invoiceNo,
                            style:const TextStyle(fontSize:11,color:_muted)),
                          const SizedBox(height:7),
                          Text('${_money(invoice.outstandingPkr)} outstanding',
                            style:const TextStyle(
                              color:_teal,fontWeight:FontWeight.w900,
                              fontSize:13)),
                          const SizedBox(height:5),
                          Text(invoice.overdue
                              ? 'OVERDUE · ${_status(invoice)}'
                              : _status(invoice),
                            style:TextStyle(
                              fontSize:11,fontWeight:FontWeight.w800,
                              color:invoice.overdue
                                ? const Color(0xFFB35B48):_muted)),
                        ],
                      ),
                    ),
                    children:[
                      const Divider(),
                      _pair('Term',invoice.term),
                      _pair('Due date',invoice.dueDate),
                      _pair('Total',_money(invoice.amountPkr)),
                      _pair('Recorded',_money(invoice.paidPkr)),
                      _pair('Outstanding',_money(invoice.outstandingPkr)),
                      const SizedBox(height:9),
                      const Align(
                        alignment:Alignment.centerLeft,
                        child:Text('Recorded payment entries',
                          style:TextStyle(fontSize:12,color:_ink,
                            fontWeight:FontWeight.w900)),
                      ),
                      const SizedBox(height:6),
                      if(_loadingHistory.contains(invoice.id))
                        const LinearProgressIndicator()
                      else if(_history.containsKey(invoice.id))
                        if(_history[invoice.id]!.isEmpty)
                          const Align(
                            alignment:Alignment.centerLeft,
                            child:Text('No payment records yet.',
                              style:TextStyle(color:_muted,fontSize:12)),
                          )
                        else
                          for(final receipt in _history[invoice.id]!)
                            Padding(
                              padding:const EdgeInsets.symmetric(vertical:5),
                              child:_pair(receipt.receiptRef,
                                _money(receipt.amountPkr)),
                            ),
                    ],
                  ),
                ),
              ),
        ],
      ),
    ),
  );

  Widget _pair(String label,String value)=>Padding(
    padding:const EdgeInsets.symmetric(vertical:5),
    child:Row(
      crossAxisAlignment:CrossAxisAlignment.start,
      children:[
        Expanded(child:Text(label,style:const TextStyle(
          fontSize:12,color:_muted))),
        Expanded(child:Text(value,textAlign:TextAlign.end,
          style:const TextStyle(
            color:_ink,fontSize:12,fontWeight:FontWeight.w800))),
      ],
    ),
  );
}
