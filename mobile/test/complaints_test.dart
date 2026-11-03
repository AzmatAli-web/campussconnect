import 'dart:convert';

import 'package:campusconnect_mobile/services/campus_api.dart';
import 'package:campusconnect_mobile/services/preview_campus_api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main(){
 test('student complaint create only sends permitted fields with Firebase authentication',()async{
  final seen=<http.Request>[];
  final api=CampusApi(
   idTokenProvider:()async=>'fixture-token',
   apiBaseUrl:'http://127.0.0.1:4000/api/v1',
   client:MockClient((req)async{
    seen.add(req);
    return http.Response(jsonEncode({'data':{
     'id':'c1','category':'academic','title':'Class schedule change',
     'description':'The class was moved without notice.',
     'status':'submitted','staffResponse':''
    }}),201);
   }),
  );
  final result=await api.submitComplaint(
    category:'academic',title:'Class schedule change',
    description:'The class was moved without notice.');
  expect(result.status,'submitted');
  expect(seen.single.method,'POST');
  expect(seen.single.url.path,'/api/v1/complaints');
  expect(seen.single.headers['authorization'],'Bearer fixture-token');
  final payload=jsonDecode(seen.single.body) as Map<String,dynamic>;
  expect(payload.keys.toSet(),{'category','title','description'});
  expect(payload.containsKey('studentId'),false);
  expect(payload.containsKey('status'),false);
  api.dispose();
 });

 test('private complaint list uses only /me/complaints',()async{
  final seen=<http.Request>[];
  final api=CampusApi(
   idTokenProvider:()async=>'fixture-token',
   client:MockClient((req)async{
    seen.add(req);
    return http.Response(jsonEncode({'data':[{
     'id':'c1','category':'facilities','title':'Broken lab lighting',
     'description':'The lighting is not working in the lab.',
     'status':'in_review','staffResponse':'Under review.'
    }]}),200);
   }),
  );
  final items=await api.getMyComplaints();
  expect(items,hasLength(1));
  expect(items.single.staffResponse,'Under review.');
  expect(seen.single.url.path,'/api/v1/me/complaints');
  expect(seen.single.headers['authorization'],'Bearer fixture-token');
  api.dispose();
 });

 test('offline preview tracks simulated complaints without HTTP',()async{
  final api=PreviewCampusApi();
  expect(await api.getMyComplaints(),isEmpty);
  final item=await api.submitComplaint(
    category:'other',title:'Demo student feedback',
    description:'This exists only in the preview memory.');
  expect(item.status,'submitted');
  expect((await api.getMyComplaints()).single.id,item.id);
  api.dispose();
 });
}
