import 'dart:convert';

import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:campusconnect_mobile/services/campus_api.dart';
import 'package:campusconnect_mobile/services/preview_campus_api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main(){
 final example=CampusFeeInvoice.fromJson({
  'id':'507f191e810c19729de860ea',
  'invoiceNo':'FALL-2026-001','title':'Semester tuition',
  'term':'Fall 2026','dueDate':'2026-12-01','currency':'PKR',
  'amountPkr':16000,'paidPkr':6000,'outstandingPkr':10000,
  'status':'partially_recorded','overdue':false,
  'studentId':'should-not-be-retained',
 });
 test('fee model represents read-only server-derived balances',(){
  expect(example.amountPkr,16000);
  expect(example.outstandingPkr,10000);
  expect(example.status,'partially_recorded');
  expect(example.currency,'PKR');
  expect(example.invoiceNo,'FALL-2026-001');
 });
 test('student fee list uses only authenticated /me/fees',()async{
  final seen=<http.Request>[];
  final api=CampusApi(
   idTokenProvider:()async=>'fixture-firebase-token',
   client:MockClient((req)async{
    seen.add(req);
    return http.Response(jsonEncode({'data':[{
      'id':example.id,'invoiceNo':example.invoiceNo,'title':example.title,
      'term':example.term,'dueDate':example.dueDate,'currency':'PKR',
      'amountPkr':16000,'paidPkr':6000,'outstandingPkr':10000,
      'status':'partially_recorded','overdue':false,
    }]}),200);
   }),
  );
  final rows=await api.getMyFees();
  expect(rows,hasLength(1));
  expect(seen.single.method,'GET');
  expect(seen.single.url.path,'/api/v1/me/fees');
  expect(seen.single.headers['authorization'],'Bearer fixture-firebase-token');
  api.dispose();
 });
 test('payment history uses own invoice and never Staff mutation routes',()async{
  final seen=<http.Request>[];
  final api=CampusApi(
   idTokenProvider:()async=>'token',
   client:MockClient((req)async{
    seen.add(req);
    return http.Response(jsonEncode({'data':[{
     'id':'payment-id','invoiceId':example.id,
     'amountPkr':6000,'receiptRef':'OFFICE-2026-001',
     'recordedAt':'2026-11-04T12:00:00Z',
    }]}),200);
   }),
  );
  final rows=await api.getMyFeePayments(example);
  expect(rows,hasLength(1));
  expect(rows.single.amountPkr,6000);
  expect(seen.single.method,'GET');
  expect(seen.single.url.path,'/api/v1/me/fees/'+example.id+'/payments');
  expect(seen.single.headers['authorization'],'Bearer token');
  api.dispose();
 });
 test('offline preview shows fictional fees without network calls',()async{
  final api=PreviewCampusApi();
  final fees=await api.getMyFees();
  expect(fees,hasLength(1));
  expect(fees.single.title,contains('not a real invoice'));
  final history=await api.getMyFeePayments(fees.single);
  expect(history.single.receiptRef,contains('DEMO'));
  api.dispose();
 });
}
