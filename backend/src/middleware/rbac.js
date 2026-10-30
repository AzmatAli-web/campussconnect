import {HttpError} from '../lib/http-error.js';
import {effectiveRoles} from '../services/identity.js';
export const requireRoles=(...allowed)=>(req,_res,next)=>{
 const roles=effectiveRoles(req.currentUser);
 if (!roles.some(role=>allowed.includes(role))) return next(new HttpError(403,'FORBIDDEN','Insufficient permissions'));
 next();
};
