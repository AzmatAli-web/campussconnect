import 'dart:convert';

import 'package:campusconnect_mobile/screens/lost_found_screen.dart';
import 'package:campusconnect_mobile/services/campus_api.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:campusconnect_mobile/services/preview_campus_api.dart';

void main(){
  test('mobile requests matches with a session token and reads the ranked response', () async {
    final api = CampusApi(
      apiBaseUrl: 'https://campus.example/api/v1',
      idTokenProvider: () async => 'fixture-token',
      client: MockClient((req) async {
        expect(req.method, 'GET');
        expect(req.url.path, '/api/v1/me/lost-found-items/report-7/matches');
        expect(req.headers['Authorization'], 'Bearer fixture-token');
        return http.Response(jsonEncode({'data': [
          {'item': {'id':'found-5','title':'Blue notebook','contactPreference':'adminMediated'},
           'reasons':['Item name: notebook','Location: library']}
        ]}), 200);
      }),
    );
    addTearDown(api.dispose);
    final suggestion = (await api.getLostFoundMatches('report-7')).single;
    expect(suggestion.item.id, 'found-5');
    expect(suggestion.item.contactPreference, 'adminMediated');
    expect(suggestion.reasons, ['Item name: notebook', 'Location: library']);
  });

  testWidgets('student opens a personal report match and reads its helpdesk reference', (tester) async {
    final api = PreviewCampusApi();
    addTearDown(api.dispose);
    final report = await api.createLostFoundItem(
      kind:'lost', category:'documents', title:'Missing notebook', locationText:'Library',
      description:'Notebook left in the library.', contactPreference:'helpdesk',
    );
    await tester.pumpWidget(MaterialApp(home: LostFoundScreen(
      api: api, profile: CampusProfile.fromJson({'roles':['student']}), previewMode: true,
    )));
    await tester.pumpAndSettle();
    final action = find.text('View possible matches');
    await tester.scrollUntilVisible(action, 360, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await Scrollable.ensureVisible(tester.element(action), alignment: 0.5);
    await tester.pumpAndSettle();
    await tester.tap(action.hitTestable());
    await tester.pumpAndSettle();
    expect(find.text('Possible matches'), findsOneWidget);
    expect(find.text('Item name: notebook'), findsOneWidget);
    expect(find.text('Quote this reference to the campus helpdesk.'), findsOneWidget);
    expect(find.text('demo-lost-1'), findsOneWidget);
    await api.updateLostFoundItem(report.id, {'status':'resolved'});
    await expectLater(api.getLostFoundMatches(report.id), throwsA(isA<CampusApiException>()));
  });

  test('Lost & Found model uses redacted report fields',(){
    final item=CampusLostFoundItem.fromJson({
      'id':'demo-1','kind':'lost','title':'Missing item',
      'description':'An example of a missing campus item.',
      'category':'keys','locationText':'Library desk',
      'contactPreference':'helpdesk','status':'open',
      'reporterId':'never-expose-this',
    });
    expect(item.kind,'lost');
    expect(item.status,'open');
    expect(item.contactPreference,'helpdesk');
  });
  test('offline Lost & Found report lifecycle is private and local',()async{
    final api=PreviewCampusApi();
    try{
      final initial=await api.getLostFoundItems();
      expect(initial,isNotEmpty);
      final created=await api.createLostFoundItem(
        kind:'lost',title:'A missing demo USB',
        description:'A fictional USB misplaced near the campus lab.',
        category:'electronics',locationText:'CS department lab',
        contactPreference:'adminMediated',
      );
      expect(created.status,'open');
      expect((await api.getMyLostFoundItems()).single.id,created.id);
      final filtered=await api.getLostFoundItems(kind:'lost');
      expect(filtered.any((x)=>x.id==created.id),true);
      final edited=await api.updateLostFoundItem(created.id,{
        'title':'Updated missing demo USB',
      });
      expect(edited.title,'Updated missing demo USB');
      final resolved=await api.updateLostFoundItem(created.id,{'status':'resolved'});
      expect(resolved.status,'resolved');
      expect((await api.getLostFoundItems()).any((x)=>x.id==created.id),false);
      expect((await api.getMyLostFoundItems()).single.status,'resolved');
    }finally{
      api.dispose();
    }
  });
}
