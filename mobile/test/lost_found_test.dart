import 'package:flutter_test/flutter_test.dart';
import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:campusconnect_mobile/services/preview_campus_api.dart';

void main(){
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
