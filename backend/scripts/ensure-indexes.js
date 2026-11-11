import 'dotenv/config';
import mongoose from 'mongoose';
import {parseEnvironment} from '../src/config/environment.js';
import {connectDatabase} from '../src/config/database.js';
import {User} from '../src/models/user.js';
import {AdminBootstrap,AuditLog,StaffInvitation} from '../src/models/governance.js';
import {Event,EventRegistration,Announcement,Society,SocietyManagerAssignment,IdempotencyKey} from '../src/models/campus-content.js';
import {TimetableSlot} from '../src/models/timetable.js';
import {AcademicResource} from '../src/models/academic-resource.js';
import {StudentComplaint} from '../src/models/complaint.js';
import {FeeInvoice,FeePaymentRecord} from '../src/models/fees.js';
import {MarketplaceListing,MarketplaceReport} from '../src/models/marketplace.js';
import {LostFoundItem} from '../src/models/lost-found.js';

async function main(){
 const config=parseEnvironment();
 if(!config.mongoUri||!config.universityId) throw new Error('Database and university must be configured first');
 await connectDatabase(config);
 try{
  for(const model of [User,AdminBootstrap,AuditLog,StaffInvitation,Event,EventRegistration,Announcement,Society,SocietyManagerAssignment,IdempotencyKey,TimetableSlot,AcademicResource,StudentComplaint,FeeInvoice,FeePaymentRecord,MarketplaceListing,MarketplaceReport,LostFoundItem]){
   await model.createIndexes();
   console.log('Checked indexes:',model.collection.name);
  }
  console.log('Index setup completed; no existing indexes were removed.');
 }finally{await mongoose.disconnect();}
}
main().catch(error=>{
 console.error('Index setup failed:',error?.code||error?.name||'Error');
 process.exitCode=1;
});
