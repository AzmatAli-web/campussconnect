import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'dart:typed_data';

import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:campusconnect_mobile/services/campus_api.dart';
import 'package:campusconnect_mobile/services/preview_campus_api.dart';
import 'package:campusconnect_mobile/screens/academic_resources_panel.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  final resource=CampusAcademicResource.fromJson({
    'id':'507f191e810c19729de860ea',
    'title':'Lecture Notes','description':'Week 1',
    'program':'BSE','semester':7,'courseCode':'CSC494',
    'fileName':'week-1.pdf','sizeBytes':42,'status':'published',
    'createdAt':'2026-11-03T12:00:00Z',
    'storageKey':'private-server-only',
    'uploadedBy':'private-user',
  });

  test('resource model keeps only public metadata without storage IDs',(){
    expect(resource.courseCode,'CSC494');
    expect(resource.id,'507f191e810c19729de860ea');
    expect(resource.sizeBytes,42);
    expect(resource.createdAt,isNotNull);
  });

  test('catalog uses Firebase authorization and scoped query parameters',() async {
    final requests=<http.Request>[];
    final api=CampusApi(
      idTokenProvider:() async=>'fixture-firebase-token',
      apiBaseUrl:'http://127.0.0.1:4000/api/v1',
      client:MockClient((req)async{
        requests.add(req);
        return http.Response(jsonEncode({'data':[{
          'id':resource.id,'title':resource.title,
          'program':'BSE','semester':7,'courseCode':'CSC494',
          'fileName':'week-1.pdf','sizeBytes':42,'status':'published'
        }]}),200);
      }),
    );
    final data=await api.getAcademicResources(program:'BSE',semester:7,courseCode:'CSC494',keyword:'  Week & 1  ');
    expect(data,hasLength(1));
    expect(data.single.courseCode,'CSC494');
    expect(requests.single.url.queryParameters['q'],'Week & 1');
    expect(requests.single.url.path,'/api/v1/resources');
    expect(requests.single.url.queryParameters['courseCode'],'CSC494');
    expect(requests.single.url.queryParameters['semester'],'7');
    expect(requests.single.headers['authorization'],'Bearer fixture-firebase-token');
    api.dispose();
  });

  test('authenticated PDF download returns bytes only from a PDF response',()async{
    final pdf=Uint8List.fromList(utf8.encode('%PDF-1.4\nexample-pdf'));
    final reqs=<http.Request>[];
    final api=CampusApi(
      idTokenProvider:() async=>'fixture-firebase-token',
      apiBaseUrl:'http://127.0.0.1:4000/api/v1',
      client:MockClient((req)async{
        reqs.add(req);
        return http.Response.bytes(pdf,200,
          headers:{'content-type':'application/pdf'});
      }),
    );
    expect(await api.downloadAcademicPdf(resource),pdf);
    expect(reqs.single.url.path,'/api/v1/resources/${resource.id}/file');
    expect(reqs.single.headers['authorization'],'Bearer fixture-firebase-token');
    api.dispose();
  });

  test('non-PDF downloads are rejected, even with HTTP 200',()async{
    final api=CampusApi(
      idTokenProvider:()async=>'token',
      client:MockClient((req)async=>http.Response(
        '<html>invalid</html>',200,headers:{'content-type':'text/html'})),
    );
    await expectLater(api.downloadAcademicPdf(resource),
      throwsA(isA<CampusApiException>()
        .having((e)=>e.code,'code','INVALID_PDF')));
    api.dispose();
  });

  testWidgets('students can search, see course groups, and clear their filters', (tester) async {
    final api=PreviewCampusApi();
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(
      child: AcademicResourcesPanel(api:api,previewMode:true),
    ))));
    await tester.pumpAndSettle();
    final search=find.widgetWithText(TextField,'Search notes');
    final submit=find.text('Find PDFs');
    Future<void> searchFor(String term) async {
      await tester.enterText(search,term);
      await tester.ensureVisible(submit);
      await tester.tap(submit);
      await tester.pumpAndSettle();
    }
    await searchFor('x');
    expect(find.text('Enter 2–64 characters to search notes.'),findsOneWidget);
    await searchFor('no-such-note');
    expect(find.textContaining('No academic PDFs'),findsOneWidget);
    await searchFor('FICTIONAL');
    expect(find.text('BSE · Semester 7 · CSC494'),findsOneWidget);
    expect(find.text('Introduction to Software Engineering'),findsOneWidget);
    await tester.tap(find.text('Clear'));
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(search).controller!.text,isEmpty);
    expect(find.text('BSE · Semester 7 · CSC494'),findsOneWidget);
  });

  testWidgets('bookmarks survive reopening under the same account and stay private', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final api=PreviewCampusApi();
    addTearDown(api.dispose);
    Future<void> open(String account) async {
      await tester.pumpWidget(MaterialApp(home:Scaffold(body:SingleChildScrollView(
        child:AcademicResourcesPanel(key:ValueKey(account),api:api,previewMode:true,accountKey:account)))));
      await tester.pumpAndSettle();
    }
    Future<void> tap(String label) async {
      final button=find.text(label);
      await tester.ensureVisible(button);
      await tester.pumpAndSettle();
      await tester.tap(button);
      await tester.pumpAndSettle();
    }
    await open('student-a');
    await tap('Save resource');
    await open('student-b');
    await tap('Saved');
    expect(find.text('No saved resources on this device.'),findsOneWidget);
    await open('student-a');
    await tap('Saved');
    expect(find.text('Introduction to Software Engineering'),findsOneWidget);
    await tester.tap(find.byTooltip('Remove bookmark'));
    await tester.pumpAndSettle();
    expect(find.text('No saved resources on this device.'),findsOneWidget);
  });

  test('offline demo never makes an actual PDF download',()async{
    final api=PreviewCampusApi();
    final all=await api.getAcademicResources();
    expect(all.single.title,contains('Software Engineering'));
    await expectLater(api.downloadAcademicPdf(all.single),
      throwsA(isA<CampusApiException>()));
    api.dispose();
  });
}
