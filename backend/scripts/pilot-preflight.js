import 'dotenv/config';
import {inspectPilotEnvironment} from '../src/services/pilot-readiness.js';

const result=inspectPilotEnvironment(process.env);
// Deliberately emit check identifiers only. Never print URI, credentials,
// connection strings, API keys, email addresses, or role/user details.
console.log('CampusConnect staging configuration: '+(result.ok?'VALID':'BLOCKED'));
console.log('Checks:',JSON.stringify(result.checks));
for(const code of result.failures)console.error('BLOCKER: '+code);
for(const code of result.warnings)console.log('REQUIRES HUMAN REVIEW: '+code);
if(!result.ok)process.exitCode=1;
