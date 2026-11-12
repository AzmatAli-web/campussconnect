import 'package:flutter_test/flutter_test.dart';
import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:campusconnect_mobile/services/preview_campus_api.dart';
import 'package:campusconnect_mobile/services/campus_api.dart';

void main(){
  test('notification response model never exposes backend delivery fields',(){
    final note=CampusNotification.fromJson({
      'id':'demo','kind':'personal','type':'event_registration',
      'title':'Confirmed','body':'Open events','sourceId':'event',
      'pushState':'sending','token':'private','recipientId':'private',
    });
    expect(note.readAt,isNull);
    expect(note.kind,'personal');
    expect(note.title,'Confirmed');
  });
  test('offline inbox reads and pagination stay local',()async{
    final api=PreviewCampusApi();
    try{
      final first=await api.getNotificationPage(limit:1);
      expect(first.items.length,1);
      expect(first.hasMore,true);
      final second=await api.getNotificationPage(
        limit:1,cursor:first.nextCursor);
      expect(second.items.length,1);
      expect(second.items.first.id,isNot(first.items.first.id));
      final when=await api.markNotificationRead(first.items.first);
      expect(when,isA<DateTime>());
      final fresh=await api.getNotificationPage(limit:2);
      expect(fresh.unreadOnPage,1);
      expect(fresh.items.first.readAt,isNotNull);
      expect(await api.hasRegisteredPushDevice(),false);
      await expectLater(api.registerPushDevice('fake-token'),
        throwsA(isA<CampusApiException>()));
    }finally{
      api.dispose();
    }
  });
}
