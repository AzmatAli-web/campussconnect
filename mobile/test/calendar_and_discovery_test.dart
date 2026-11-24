import 'dart:convert';

import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:campusconnect_mobile/services/campus_api.dart';
import 'package:campusconnect_mobile/services/event_calendar.dart';
import 'package:campusconnect_mobile/services/preview_campus_api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('calendar exports UTC times and escaped folded text for future events', () {
    final event = CampusEvent.fromJson({
      'id':'event-1', 'title':'Study, meet;\n${'é' * 80}', 'venue':'Room A',
      'description':'private fixture', 'startsAt':'2027-01-01T13:00:00+05:00',
      'endsAt':'2027-01-01T14:00:00+05:00',
    });
    final file = eventCalendar(event, DateTime.utc(2026))!;
    expect(file, contains('DTSTART:20270101T080000Z'));
    expect(file, contains('DTEND:20270101T090000Z'));
    expect(file, contains(r'SUMMARY:Study\, meet\;\n'));
    expect(file, contains('LOCATION:Room A'));
    expect(file, isNot(contains('private fixture')));
    expect(file.split('\r\n').every((line)=>utf8.encode(line).length<=75), isTrue);
    expect(eventCalendar(event,event.startsAt!),isNull);
  });

  test('browse filters combine with text and are encoded for each endpoint', () async {
    final requests=<Uri>[];
    final api=CampusApi(idTokenProvider:() async=>'test',client:MockClient((request) async {
      requests.add(request.url);
      return http.Response('{"data":[]}',200);
    }));
    addTearDown(api.dispose);
    await api.getMarketplace(query:'lamp',category:'electronics',minPrice:0,maxPrice:500);
    await api.getLostFoundItems(query:'notebook',kind:'found',category:'documents');
    expect(requests.first.queryParameters,{'limit':'100','q':'lamp','category':'electronics','minPrice':'0','maxPrice':'500'});
    expect(requests.last.queryParameters,{'limit':'100','q':'notebook','kind':'found','category':'documents'});
  });

  test('preview includes exact price boundaries and applies lost item category', () async {
    final api=PreviewCampusApi();
    addTearDown(api.dispose);
    final item=(await api.getMarketplace()).first;
    expect(await api.getMarketplace(minPrice:item.pricePkr,maxPrice:item.pricePkr), contains(item));
    expect(await api.getMarketplace(minPrice:item.pricePkr+1),isNot(contains(item)));
    expect(await api.getLostFoundItems(kind:'found',category:'documents'),isNotEmpty);
    expect(await api.getLostFoundItems(kind:'found',category:'clothing'),isEmpty);
  });
}
