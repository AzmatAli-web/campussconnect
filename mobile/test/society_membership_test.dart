import 'package:flutter_test/flutter_test.dart';
import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:campusconnect_mobile/services/preview_campus_api.dart';

void main(){
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
