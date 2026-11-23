import 'package:campusconnect_mobile/screens/societies_screen.dart';
import 'package:campusconnect_mobile/services/campus_api.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:campusconnect_mobile/services/preview_campus_api.dart';

void main(){
  test('directory sends an encoded search and history requests society names', () async {
    final requests = <http.Request>[];
    final api = CampusApi(idTokenProvider: () async => 'fixture',
      client: MockClient((request) async {
        requests.add(request);
        return http.Response('{"data":[]}',200);
      }));
    addTearDown(api.dispose);
    await api.getSocieties(query:'  Arts & Crafts  ');
    await api.getMySocietyMemberships();
    expect(requests.first.url.queryParameters['q'],'Arts & Crafts');
    expect(requests.first.headers['authorization'],'Bearer fixture');
    expect(requests.last.url.queryParameters['includeSociety'],'1');
    expect(requests.last.url.queryParameters.containsKey('q'),isFalse);
  });

  testWidgets('activity search preserves history and clear restores the directory', (tester) async {
    tester.view.physicalSize = const Size(700, 1700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = PreviewCampusApi();
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:SocietiesScreen(api:api,previewMode:true)));
    await tester.pumpAndSettle();
    final field=find.byType(TextField);
    Future<void> search(String term) async {
      await tester.enterText(field,term);
      await tester.tap(find.widgetWithText(FilledButton,'Search'));
      await tester.pumpAndSettle();
    }
    await search('CREATIVE');
    expect(find.text('Campus Arts Society'),findsOneWidget);
    expect(find.text('Campus Coding Society'),findsOneWidget); // Private history row.
    await search('nonexistent');
    expect(find.text('No societies match your search.'),findsOneWidget);
    expect(find.text('Approved member'),findsOneWidget);
    await tester.tap(find.text('Clear search'));
    await tester.pumpAndSettle();
    expect(find.text('Campus Coding Society'),findsNWidgets(2));
    expect(find.text('Campus Arts Society'),findsOneWidget);
  });

  test('student membership response contains only safe fields',(){
    final membership=CampusSocietyMembership.fromJson({
      'id':'demo-member','societyId':'demo-group','status':'pending',
      'reviewNote':'','studentId':'must-not-be-used',
      'firebaseUid':'private-identity',
    });
    expect(membership.status,'pending');
    expect(membership.reviewNote,'');
    expect(membership.societyId,'demo-group');
  });
  test('society offline preview: request, cancel, reapply and leave',()async{
    final api=PreviewCampusApi();
    try{
      final societies=await api.getSocieties();
      expect(societies.length,greaterThanOrEqualTo(2));
      final first=societies.first;
      final last=societies.last;
      final before=await api.getMySocietyMemberships();
      expect(before.any((m)=>m.societyId==first.id),true);
      final created=await api.requestSocietyMembership(last.id);
      expect(created.status,'pending');
      expect((await api.getMySocietyMemberships())
        .any((m)=>m.societyId==last.id&&m.status=='pending'),true);
      final cancelled=await api.withdrawSocietyMembership(created.id);
      expect(cancelled.status,'cancelled');
      final rejoined=await api.requestSocietyMembership(last.id);
      expect(rejoined.id,created.id);
      expect(rejoined.status,'pending');
      final departed=await api.withdrawSocietyMembership(before.first.id);
      expect(departed.status,'left');
      expect((await api.getMySocietyMemberships())
        .any((m)=>m.societyId==first.id&&m.status=='left'),true);
    }finally{
      api.dispose();
    }
  });
}
