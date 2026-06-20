import { writeFileSync } from "node:fs";
// TV-app OAuth client creds (device-code flow), as used by the youtube tv client
const CLIENT_ID="861556708454-d6dlm3lh05idd8npek18k6be8ba3oc68.apps.googleusercontent.com";
const SCOPES="http://gdata.youtube.com https://www.googleapis.com/auth/youtube";
const r=await fetch("https://oauth2.googleapis.com/device/code",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({client_id:CLIENT_ID,scope:SCOPES})
});
const j=await r.json();
console.log("HTTP",r.status);
console.log(JSON.stringify(j,null,2));
if(j.device_code){ writeFileSync("oauth_dev.json",JSON.stringify({...j,client_id:CLIENT_ID})); 
  console.log("\n>>> GO TO:", j.verification_url, "  AND ENTER CODE:", j.user_code);
}
