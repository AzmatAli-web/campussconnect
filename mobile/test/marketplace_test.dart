import 'package:flutter_test/flutter_test.dart';
import 'package:campusconnect_mobile/models/campus_models.dart';
import 'package:campusconnect_mobile/services/preview_campus_api.dart';

void main(){
  test('Marketplace model uses only public listing fields',(){
    final item=CampusMarketplaceItem.fromJson({
      'id':'abc','title':'Used textbook','description':'Study guide copy',
      'category':'books','condition':'good','pricePkr':1200,
      'status':'published','hasImage':false,'contactAvailable':false,
      'sellerId':'must-not-be-shown',
    });
    expect(item.pricePkr,1200);
    expect(item.contactAvailable,isFalse);
    expect(item.hasImage,isFalse);
  });
  test('offline Marketplace preview creates, edits and archives locally',()async{
    final api=PreviewCampusApi();
    try{
      final original=await api.getMarketplace();
      expect(original,isNotEmpty);
      final created=await api.createMarketplaceItem(
        title:'Sample desk lamp',
        description:'Offline sample listing to verify Marketplace forms.',
        category:'electronics',condition:'good',pricePkr:1000,
        contactConsent:false,
      );
      expect(created.status,'published');
      final mine=await api.getMyMarketplace();
      expect(mine.length,1);
      final edited=await api.updateMarketplaceItem(created.id,{
        'title':'Edited sample desk lamp',
        'pricePkr':500,
      });
      expect(edited.pricePkr,500);
      final sold=await api.setMarketplaceStatus(created.id,'sold');
      expect(sold.status,'sold');
      expect((await api.getMarketplace()).any((x)=>x.id==created.id),false);
      expect((await api.getMyMarketplace()).single.status,'sold');
    }finally{api.dispose();}
  });
}
