import React,{useEffect,useState} from "react";
import {SafeAreaView,ScrollView,View,Text,TextInput,TouchableOpacity,StyleSheet,Alert,Image} from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import {File} from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";
import {createClient} from "@supabase/supabase-js";

const url=process.env.EXPO_PUBLIC_SUPABASE_URL||"";
const key=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY||"";
const supabase=url&&key?createClient(url,key):null;
const events=["login","break_in","break_out","lunch_in","lunch_out","logout"];
type Profile={id:string;full_name:string;employee_code?:string|null;role:"manager"|"team_lead"|"employee";team_id:string|null;active:boolean};
type Team={id:string;name:string;team_lead_id:string|null;geofence_enabled?:boolean;geofence_latitude?:number|null;geofence_longitude?:number|null;geofence_radius_m?:number};

export default function App(){
 const [email,setEmail]=useState("");const [password,setPassword]=useState("");
 const [profile,setProfile]=useState<Profile|null>(null);const [shift,setShift]=useState<any>(null);
 const [rows,setRows]=useState<any[]>([]);const [busy,setBusy]=useState(false);
 const [page,setPage]=useState("home");const [teams,setTeams]=useState<Team[]>([]);
 const [people,setPeople]=useState<Profile[]>([]);const [teamName,setTeamName]=useState("");
 const [selectedTeam,setSelectedTeam]=useState("");const [geoLat,setGeoLat]=useState("");const [geoLng,setGeoLng]=useState("");const [geoRadius,setGeoRadius]=useState("150");const [geoEnabled,setGeoEnabled]=useState(false);const [selectedPerson,setSelectedPerson]=useState("");
 const [newName,setNewName]=useState("");const [newEmail,setNewEmail]=useState("");const [newCode,setNewCode]=useState("");const [newPassword,setNewPassword]=useState("");const [newRole,setNewRole]=useState<"employee"|"team_lead">("employee");
 const [todayCount,setTodayCount]=useState(0);const [attendanceRows,setAttendanceRows]=useState<any[]>([]);const [announcementRows,setAnnouncementRows]=useState<any[]>([]);const [announcementTitle,setAnnouncementTitle]=useState("");const [announcementBody,setAnnouncementBody]=useState("");
 const [leaveStart,setLeaveStart]=useState(new Date().toLocaleDateString("en-CA"));const [leaveEnd,setLeaveEnd]=useState(new Date().toLocaleDateString("en-CA"));const [leaveType,setLeaveType]=useState("personal");const [leaveReason,setLeaveReason]=useState("");const [leaveReviewNote,setLeaveReviewNote]=useState("");const [leaveRows,setLeaveRows]=useState<any[]>([]);const [editShiftGroupId,setEditShiftGroupId]=useState<string|null>(null);
 const [shiftDate,setShiftDate]=useState(new Date().toLocaleDateString("en-CA"));const [shiftStart,setShiftStart]=useState("09:00");const [shiftEnd,setShiftEnd]=useState("18:00");const [shiftLocation,setShiftLocation]=useState("");const [selectedShiftPerson,setSelectedShiftPerson]=useState("");const [selectedShiftPeople,setSelectedShiftPeople]=useState<string[]>([]);const [selectedShiftLeader,setSelectedShiftLeader]=useState("");const [shiftGroupName,setShiftGroupName]=useState("Shift 1");const [teamShifts,setTeamShifts]=useState<any[]>([]);

 useEffect(()=>{(async()=>{if(!supabase)return;const {data}=await supabase.auth.getSession();if(data.session)await loadProfile(data.session.user.id);})();},[]);
 async function loadProfile(id:string){
  const {data,error}=await supabase!.from("profiles").select("*").eq("id",id).single();
  if(error){Alert.alert("Profile error",error.message);return;}
  setProfile(data as Profile);
  const today=new Date().toLocaleDateString("en-CA");
  const {data:s}=await supabase!.from("shifts").select("*").eq("employee_id",id).eq("shift_date",today).maybeSingle();setShift(s);
  const {data:e}=await supabase!.from("attendance_events").select("*").eq("employee_id",id).gte("created_at",today+"T00:00:00").order("created_at");setRows(e||[]);
  await loadAdminData(data as Profile);
 }
 async function loadAttendance(){if(!supabase||!profile)return;let q=supabase.from("attendance_events").select("*").order("created_at",{ascending:false}).limit(200);const {data,error}=await q;if(error){Alert.alert("Attendance",error.message);return;}const rowsWithPhotos=await Promise.all((data||[]).map(async (event:any)=>{if(!event.photo_path)return event;const {data:signed}=await supabase!.storage.from("attendance-photos").createSignedUrl(event.photo_path,3600);return {...event,photo_url:signed?.signedUrl||null};}));setAttendanceRows(rowsWithPhotos);}
 async function exportAttendanceReport(){
  if(!supabase||!profile||busy)return;setBusy(true);
  try{
   const endDate=new Date();const startDate=new Date();startDate.setDate(startDate.getDate()-29);
   const fmt=(d:Date)=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return y+"-"+m+"-"+day;};
   const from=fmt(startDate),to=fmt(endDate);
   const [{data:eventData,error:eventError},{data:shiftData,error:shiftError}]=await Promise.all([
    supabase.from("attendance_events").select("*").gte("created_at",from+"T00:00:00").lte("created_at",to+"T23:59:59").order("created_at"),
    supabase.from("shifts").select("*").gte("shift_date",from).lte("shift_date",to).order("shift_date")
   ]);
   if(eventError)throw eventError;if(shiftError)throw shiftError;
   const personById=new Map(people.map(p=>[p.id,p]));const teamById=new Map(teams.map(t=>[t.id,t.name]));
   const eventsByKey=new Map<string,any[]>();(eventData||[]).forEach((e:any)=>{const key=e.employee_id+"|"+new Date(e.created_at).toLocaleDateString("en-CA");eventsByKey.set(key,[...(eventsByKey.get(key)||[]),e]);});
   const detail:any[][]=[["Date","Employee","Employee code","Role","Team","Shift","Scheduled start","Scheduled end","First login","Last logout","Status","GPS login","GPS logout"]];
   const totals=new Map<string,{name:string;code:string;role:string;team:string;scheduled:number;present:number;late:number;missingLogout:number}>();
   (shiftData||[]).forEach((sh:any)=>{const p=personById.get(sh.employee_id);const key=sh.employee_id+"|"+sh.shift_date;const dayEvents=eventsByKey.get(key)||[];const login=dayEvents.find(e=>e.event_type==="login");const logout=[...dayEvents].reverse().find(e=>e.event_type==="logout");const status=!login?"Absent":!logout?"Missing logout":new Date(login.created_at).toTimeString().slice(0,5)>String(sh.start_time).slice(0,5)?"Late":"Present";const gps=(e:any)=>e&&e.latitude!=null&&e.longitude!=null?Number(e.latitude).toFixed(6)+", "+Number(e.longitude).toFixed(6):"";detail.push([sh.shift_date,p?.full_name||"Unknown",p?.employee_code||"",p?.role||"",teamById.get(p?.team_id||"")||"",sh.shift_name||"",String(sh.start_time).slice(0,5),String(sh.end_time).slice(0,5),login?new Date(login.created_at).toLocaleTimeString():"",logout?new Date(logout.created_at).toLocaleTimeString():"",status,gps(login),gps(logout)]);const t=totals.get(sh.employee_id)||{name:p?.full_name||"Unknown",code:p?.employee_code||"",role:p?.role||"",team:teamById.get(p?.team_id||"")||"",scheduled:0,present:0,late:0,missingLogout:0};t.scheduled++;if(login)t.present++;if(status==="Late")t.late++;if(status==="Missing logout")t.missingLogout++;totals.set(sh.employee_id,t);});
   const summary:any[][]=[["Employee","Employee code","Role","Team","Scheduled shifts","Present","Absent","Late","Missing logout","Attendance %"]];totals.forEach(t=>summary.push([t.name,t.code,t.role,t.team,t.scheduled,t.present,t.scheduled-t.present,t.late,t.missingLogout,t.scheduled?Math.round(t.present/t.scheduled*10000)/100:0]));
   const raw:any[][]=[["Timestamp","Employee","Role","Event","Latitude","Longitude","Photo path","Notes"]];(eventData||[]).forEach((e:any)=>{const p=personById.get(e.employee_id);raw.push([new Date(e.created_at).toLocaleString(),p?.full_name||"Unknown",p?.role||"",e.event_type,e.latitude,e.longitude,e.photo_path||"",e.notes||""]);});
   const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(summary),"Employee Summary");XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(detail),"Shift Attendance");XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(raw),"Raw Events");
   const base64=XLSX.write(wb,{type:"base64",bookType:"xlsx"});const uri=FileSystem.cacheDirectory+"TeamTrack_Attendance_"+from+"_to_"+to+".xlsx";await FileSystem.writeAsStringAsync(uri,base64,{encoding:FileSystem.EncodingType.Base64});
   if(await Sharing.isAvailableAsync())await Sharing.shareAsync(uri,{mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",dialogTitle:"Share TeamTrack attendance report"});else Alert.alert("Report created",uri);
  }catch(error:any){Alert.alert("Report export failed",error?.message||String(error));}
  finally{setBusy(false);}
 }
 async function loadAnnouncements(){if(!supabase)return;const {data,error}=await supabase.from("announcements").select("*").order("created_at",{ascending:false});if(error)Alert.alert("Announcements",error.message);else setAnnouncementRows(data||[]);}
 async function publishAnnouncement(){if(!supabase||!profile)return;if(!announcementTitle.trim()||!announcementBody.trim()){Alert.alert("Missing details","Enter both a title and message.");return;}setBusy(true);const teamId=profile.role==="manager"?(selectedTeam||null):profile.team_id;if(profile.role==="team_lead"&&!teamId){Alert.alert("No team","Your account is not assigned to a team.");setBusy(false);return;}const {error}=await supabase.from("announcements").insert({title:announcementTitle.trim(),body:announcementBody.trim(),team_id:teamId,created_by:profile.id});if(error)Alert.alert("Could not publish",error.message);else{Alert.alert("Published","Announcement is now available to its audience.");setAnnouncementTitle("");setAnnouncementBody("");await loadAnnouncements();}setBusy(false);}
 async function loadLeaveRequests(){if(!supabase)return;const {data,error}=await supabase.from("leave_requests").select("*").order("created_at",{ascending:false});if(error)Alert.alert("Leave requests",error.message);else setLeaveRows(data||[]);}
 async function submitLeave(){if(!supabase||!profile)return;if(!/^\d{4}-\d{2}-\d{2}$/.test(leaveStart)||!/^\d{4}-\d{2}-\d{2}$/.test(leaveEnd)||leaveEnd<leaveStart){Alert.alert("Invalid dates","Check the leave start and end dates.");return;}setBusy(true);const {error}=await supabase.from("leave_requests").insert({employee_id:profile.id,start_date:leaveStart,end_date:leaveEnd,leave_type:leaveType,reason:leaveReason.trim()||null});if(error)Alert.alert("Could not submit leave",error.message);else{Alert.alert("Submitted","Leave request sent for review.");setLeaveReason("");await loadLeaveRequests();}setBusy(false);}
 async function reviewLeave(id:string,status:"approved"|"rejected"){if(!supabase||!profile)return;setBusy(true);const {data,error}=await supabase.from("leave_requests").update({status,reviewed_by:profile.id,reviewed_at:new Date().toISOString(),reviewer_note:leaveReviewNote.trim()||null}).eq("id",id).eq("status","pending").select("id");if(error)Alert.alert("Review failed",error.message);else if(!data?.length)Alert.alert("Not updated","This request may already have been reviewed or is outside your team.");else{Alert.alert("Updated","Leave request "+status+".");setLeaveReviewNote("");await loadLeaveRequests();}setBusy(false);}
 async function loadAdminData(p:Profile){
  if(!supabase||!p)return;
  const [{data:t,error:te},{data:ps,error:pe}]=await Promise.all([
   supabase.from("teams").select("id,name,team_lead_id,geofence_enabled,geofence_latitude,geofence_longitude,geofence_radius_m").order("name"),
   supabase.from("profiles").select("id,full_name,employee_code,role,team_id,active").order("full_name")
  ]);
  if(te)Alert.alert("Teams",te.message);else{setTeams(t||[]);if(!selectedTeam&&t?.[0])setSelectedTeam(t[0].id);}
  if(pe)Alert.alert("People",pe.message);else setPeople((ps||[]) as Profile[]);
  const {count}=await supabase.from("attendance_events").select("id",{count:"exact",head:true}).gte("created_at",new Date().toISOString().slice(0,10)+"T00:00:00");
  setTodayCount(count||0);
 }
 async function signIn(){
  if(!supabase){Alert.alert("Setup needed","Configure the Supabase URL and publishable key in GitHub Actions secrets.");return;}
  setBusy(true);const {data,error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
  if(error)Alert.alert("Sign in failed",error.message);else if(data.user)await loadProfile(data.user.id);setBusy(false);
 }
 function distanceMeters(lat1:number,lon1:number,lat2:number,lon2:number){const rad=(v:number)=>v*Math.PI/180;const dLat=rad(lat2-lat1),dLon=rad(lon2-lon1);const a=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
 async function loadGeoForTeam(id:string){const t=teams.find(x=>x.id===id);setGeoEnabled(!!t?.geofence_enabled);setGeoLat(t?.geofence_latitude==null?"":String(t.geofence_latitude));setGeoLng(t?.geofence_longitude==null?"":String(t.geofence_longitude));setGeoRadius(String(t?.geofence_radius_m||150));}
 async function useCurrentGeoCentre(){try{const p=await Location.requestForegroundPermissionsAsync();if(!p.granted)throw new Error("Allow location permission.");const pos=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});setGeoLat(String(pos.coords.latitude));setGeoLng(String(pos.coords.longitude));}catch(e:any){Alert.alert("Could not get location",e.message||String(e));}}
 async function saveTeamGeofence(){if(!supabase||profile?.role!=="manager"||!selectedTeam)return;const lat=Number(geoLat),lng=Number(geoLng),radius=Number(geoRadius);if(geoEnabled&&(!geoLat.trim()||!geoLng.trim()||!Number.isFinite(lat)||lat < -90||lat>90||!Number.isFinite(lng)||lng < -180||lng>180||!Number.isInteger(radius)||radius<25||radius>5000)){Alert.alert("Invalid geofence","Enter valid coordinates and a whole-number radius from 25 to 5000 metres.");return;}setBusy(true);const {error}=await supabase.from("teams").update({geofence_enabled:geoEnabled,geofence_latitude:geoEnabled?lat:null,geofence_longitude:geoEnabled?lng:null,geofence_radius_m:radius}).eq("id",selectedTeam);if(error)Alert.alert("Save failed",error.message);else{Alert.alert("Saved","Team attendance geofence settings updated.");await loadAdminData(profile);}setBusy(false);}
 async function acknowledge(){if(!supabase||!profile||!shift)return;const {error}=await supabase.from("shift_acknowledgements").upsert({shift_id:shift.id,employee_id:profile.id,acknowledged:true},{onConflict:"shift_id,employee_id"});if(error)Alert.alert("Error",error.message);else Alert.alert("Saved","Shift acknowledged.");}
 async function record(type:string){
  if(!supabase||!profile||busy)return;setBusy(true);let stage="Starting";
  try{
   stage="Location permission";const permission=await Location.requestForegroundPermissionsAsync();if(!permission.granted)throw new Error("Allow location access, then try again.");
   stage="Getting GPS";const pos=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
   let photoBase64:string|undefined;
   if(type==="login"||type==="logout"){
    stage="Camera permission";const perm=await ImagePicker.requestCameraPermissionsAsync();if(!perm.granted)throw new Error("Allow camera access, then try again.");
    stage="Taking photo";const photo=await ImagePicker.launchCameraAsync({quality:.65});if(photo.canceled||!photo.assets[0])return;
    stage="Reading photo";const localFile=new File(photo.assets[0].uri);const buffer=await localFile.arrayBuffer();const bytes=new Uint8Array(buffer);
    const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";let encoded="";
    for(let i=0;i<bytes.length;i+=3){const a=bytes[i],hasB=i+1<bytes.length,hasC=i+2<bytes.length,b=hasB?bytes[i+1]:0,c=hasC?bytes[i+2]:0;encoded+=alphabet[a>>2]+alphabet[((a&3)<<4)|(b>>4)]+(hasB?alphabet[((b&15)<<2)|(c>>6)]:"=")+(hasC?alphabet[c&63]:"=");}
    photoBase64=encoded;
   }
   stage="Server GPS and geofence verification";
   const {data,error}=await supabase.functions.invoke("record-attendance",{body:{event_type:type,latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy_m:pos.coords.accuracy??999,photo_base64:photoBase64}});
   if(error)throw new Error(error.message||"Attendance verification failed.");
   if(data?.error)throw new Error(data.error);
   Alert.alert("Attendance saved",type.replace("_"," ")+ " recorded successfully"+(data.distance_m!=null?" • "+data.distance_m+" m from work centre":"")+".");await loadProfile(profile.id);
  }catch(error:any){Alert.alert("Attendance failed",stage+": "+(error?.message||String(error)));}
  finally{setBusy(false);}
 }
 async function createTeam(){
  if(!supabase||profile?.role!=="manager")return;const name=teamName.trim();if(!name){Alert.alert("Team name required","Enter a name for this team.");return;}
  if(teams.length>=5){Alert.alert("Team limit reached","TeamTrack is configured for a maximum of 5 teams / Team Leaders.");return;}
  setBusy(true);const {data,error}=await supabase.from("teams").insert({name}).select("id,name,team_lead_id").single();
  if(error)Alert.alert("Could not create team",error.message);else{setTeamName("");setSelectedTeam(data.id);await loadAdminData(profile);}setBusy(false);
 }
 async function createAccount(){
  if(!supabase||profile?.role!=="manager"||!selectedTeam)return;
  const full_name=newName.trim(), account_email=newEmail.trim().toLowerCase(), employee_code=newCode.trim(), account_password=newPassword;
  if(!full_name||!account_email||!account_password){Alert.alert("Missing details","Enter full name, email and a temporary password.");return;}
  if(account_password.length<8){Alert.alert("Password too short","Use at least 8 characters.");return;}
  if(newRole==="employee"&&activeEmployees>=25){Alert.alert("Employee limit reached","Maximum 25 active employees are allowed.");return;}
  if(newRole==="team_lead"&&activeLeads>=5){Alert.alert("Team Leader limit reached","Maximum 5 active Team Leaders are allowed.");return;}
  if(newRole==="team_lead"&&selectedTeamData?.team_lead_id){Alert.alert("Team already has a leader","Choose a team without an assigned Team Leader.");return;}
  setBusy(true);
  try{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session?.access_token)throw new Error("Your Manager session has expired. Sign in again.");
   const response=await fetch(url+"/functions/v1/manager-create-account",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token,"apikey":key},body:JSON.stringify({full_name,email:account_email,employee_code:employee_code||null,password:account_password,role:newRole,team_id:selectedTeam})});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||"Account creation failed.");
   setNewName("");setNewEmail("");setNewCode("");setNewPassword("");
   Alert.alert("Account created",full_name+" has been added. Share the temporary password securely and ask them to change it after first sign-in.");
   await loadAdminData(profile);
  }catch(error:any){Alert.alert("Could not add account",error?.message||String(error));}
  finally{setBusy(false);}
 }
 async function assignSelected(kind:"employee"|"team_lead"){
  if(!supabase||profile?.role!=="manager"||!selectedTeam||!selectedPerson)return;
  const person=people.find(p=>p.id===selectedPerson);if(!person){Alert.alert("Select a person","Choose an existing account first.");return;}
  if(kind==="team_lead"&&person.role!=="team_lead"&&people.filter(p=>p.role==="team_lead"&&p.active).length>=5){Alert.alert("Team Leader limit reached","Maximum 5 Team Leaders are allowed.");return;}
  if(kind==="employee"&&person.role!=="employee"){Alert.alert("Choose an employee","Only an employee account can be assigned here.");return;}
  if(kind==="employee"&&person.team_id&&person.team_id!==selectedTeam){Alert.alert("Already assigned","This employee belongs to another team. Reassigning is not enabled in this first release.");return;}
  setBusy(true);
  const {error:profileError}=await supabase.from("profiles").update({role:kind,team_id:selectedTeam}).eq("id",person.id);
  if(profileError){Alert.alert("Assignment failed",profileError.message);setBusy(false);return;}
  if(kind==="team_lead"){
   const {error:teamError}=await supabase.from("teams").update({team_lead_id:person.id}).eq("id",selectedTeam);
   if(teamError){Alert.alert("Leader assignment issue",teamError.message);setBusy(false);return;}
  }
  Alert.alert("Updated",person.full_name+" assigned to "+(kind==="team_lead"?"lead":"")+" team.");await loadAdminData(profile);setBusy(false);
 }
 async function loadTeamShifts(teamId:string){
  if(!supabase||!teamId){setTeamShifts([]);return;}
  const {data:groups,error}=await supabase.from("shift_groups").select("*").eq("team_id",teamId).order("shift_date",{ascending:true}).order("start_time",{ascending:true});
  if(error){Alert.alert("Could not load shift groups",error.message);return;}
  const ids=(groups||[]).map(g=>g.id);
  if(!ids.length){setTeamShifts([]);return;}
  const {data:assignments,error:assignmentError}=await supabase.from("shifts").select("employee_id,shift_group_id").in("shift_group_id",ids);
  if(assignmentError){Alert.alert("Could not load shift members",assignmentError.message);return;}
  setTeamShifts((groups||[]).map(g=>({...g,member_ids:(assignments||[]).filter(x=>x.shift_group_id===g.id).map(x=>x.employee_id)})).filter(g=>g.member_ids.length>0));
 }
 async function assignShift(){
  const teamId=profile?.role==="manager"?selectedTeam:profile?.team_id;
  const leaderId=profile?.role==="team_lead"?profile.id:selectedShiftLeader;
  if(!supabase||!profile||!teamId||!leaderId){Alert.alert("Select a Team Leader","Choose a Team Leader for this shift.");return;}
  const members=[...new Set(selectedShiftPeople)].filter(id=>id!==leaderId);
  const eligible=people.filter(p=>p.team_id===teamId&&p.active);
  if(!eligible.some(p=>p.id===leaderId&&p.role==="team_lead")){Alert.alert("Invalid Team Leader","Choose an active Team Leader from this team.");return;}
  if(!members.length||members.some(id=>!eligible.some(p=>p.id===id&&p.role==="employee"))){Alert.alert("Select employees","Select at least one active employee from this team.");return;}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(shiftDate)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(shiftStart)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(shiftEnd)){Alert.alert("Invalid date or time","Use date YYYY-MM-DD and time HH:MM (24-hour format).");return;}
  if(shiftEnd<=shiftStart){Alert.alert("Invalid shift time","End time must be later than start time.");return;}
  if(!shiftGroupName.trim()){Alert.alert("Shift name required","Enter a shift name.");return;}
  setBusy(true);
  try{
   const targetIds=[leaderId,...members];const {data:existing,error:existingError}=await supabase.from("shifts").select("employee_id").eq("shift_date",shiftDate).in("employee_id",targetIds);if(existingError)throw existingError;if(existing?.length){const names=existing.map(x=>people.find(p=>p.id===x.employee_id)?.full_name||"A selected person");throw new Error(names.join(", ")+ " already have a shift on "+shiftDate+". No new group was created.");}
   const {data:group,error:groupError}=await supabase.from("shift_groups").insert({team_id:teamId,shift_name:shiftGroupName.trim(),shift_date:shiftDate,start_time:shiftStart,end_time:shiftEnd,work_location_name:shiftLocation.trim()||null,team_lead_id:leaderId,created_by:profile.id}).select("*").single();
   if(groupError)throw groupError;
   const assignments=[leaderId,...members].map(employee_id=>({employee_id,shift_date:shiftDate,start_time:shiftStart,end_time:shiftEnd,work_location_name:shiftLocation.trim()||null,created_by:profile.id,shift_group_id:group.id}));
   const {error:insertError}=await supabase.from("shifts").insert(assignments);
   if(insertError){await supabase.from("shift_groups").delete().eq("id",group.id);throw insertError;}
   Alert.alert("Shift group created",shiftGroupName+" assigned to "+assignments.length+" people.");
   setSelectedShiftPeople([]);setShiftGroupName("Shift "+(teamShifts.length+2));await loadTeamShifts(teamId);
  }catch(error:any){Alert.alert("Shift assignment failed",error?.message||String(error));}
  finally{setBusy(false);}
 }
 async function startEditShiftGroup(group:any){setEditShiftGroupId(group.id);setShiftGroupName(group.shift_name);setShiftDate(group.shift_date);setShiftStart(String(group.start_time).slice(0,5));setShiftEnd(String(group.end_time).slice(0,5));setShiftLocation(group.work_location_name||"");Alert.alert("Edit mode","Update the fields in the form, then save.");}
 async function saveShiftGroup(){if(!supabase||!profile||!editShiftGroupId)return;const group=teamShifts.find(g=>g.id===editShiftGroupId);if(!group)return;if(!/^\d{4}-\d{2}-\d{2}$/.test(shiftDate)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(shiftStart)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(shiftEnd)||shiftEnd<=shiftStart){Alert.alert("Invalid shift details","Check date and 24-hour times.");return;}setBusy(true);try{const {data:conflicts,error:ce}=await supabase.from("shifts").select("employee_id").eq("shift_date",shiftDate).neq("shift_group_id",editShiftGroupId).in("employee_id",group.member_ids);if(ce)throw ce;if(conflicts?.length)throw new Error("A member already has another shift on that date.");const values={shift_name:shiftGroupName.trim(),shift_date:shiftDate,start_time:shiftStart,end_time:shiftEnd,work_location_name:shiftLocation.trim()||null};const {error:ge}=await supabase.from("shift_groups").update(values).eq("id",editShiftGroupId);if(ge)throw ge;const {error:se}=await supabase.from("shifts").update({shift_date:shiftDate,start_time:shiftStart,end_time:shiftEnd,work_location_name:shiftLocation.trim()||null}).eq("shift_group_id",editShiftGroupId);if(se)throw se;Alert.alert("Saved","Shift group updated.");setEditShiftGroupId(null);await loadTeamShifts(profile.role==="manager"?selectedTeam:profile.team_id||"");}catch(error:any){Alert.alert("Could not update shift",error?.message||String(error));}finally{setBusy(false);}}
 async function deleteShiftGroup(group:any){if(!supabase||!profile)return;Alert.alert("Delete shift group","Remove this shift for all assigned people?",[{text:"Cancel",style:"cancel"},{text:"Delete",style:"destructive",onPress:async()=>{setBusy(true);const {error}=await supabase!.from("shifts").delete().eq("shift_group_id",group.id);if(error){Alert.alert("Delete failed",error.message);setBusy(false);return;}const {error:ge}=await supabase!.from("shift_groups").delete().eq("id",group.id);if(ge)Alert.alert("Group delete failed",ge.message);await loadTeamShifts(profile!.role==="manager"?selectedTeam:profile!.team_id||"");setBusy(false);}}]);}
 async function signOut(){await supabase?.auth.signOut();setProfile(null);setRows([]);setShift(null);setPage("home");}
 const button=(label:string,fn:()=>void,secondary=false)=><TouchableOpacity style={[s.btn,secondary&&s.secondary,busy&&{opacity:.55}]} onPress={fn} disabled={busy}><Text style={[s.btnText,secondary&&s.secondaryText]}>{busy?"PLEASE WAIT":label}</Text></TouchableOpacity>;
 const selectedTeamData=teams.find(t=>t.id===selectedTeam);
 const selectedPersonData=people.find(p=>p.id===selectedPerson);
 const teamMembers=people.filter(p=>p.team_id===(profile?.role==="team_lead"?profile.team_id:selectedTeam)&&p.active);
 const activeEmployees=people.filter(p=>p.role==="employee"&&p.active).length;
 const activeLeads=people.filter(p=>p.role==="team_lead"&&p.active).length;
 if(!profile)return <SafeAreaView style={s.page}><View style={s.header}><Text style={s.logo}>TeamTrack</Text><Text style={s.sub}>TEAM ATTENDANCE & OPERATIONS</Text></View><View style={s.card}><Text style={s.heading}>Sign in</Text><TextInput style={s.input} placeholder="Work email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail}/><TextInput style={s.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword}/>{button("Sign in",signIn)}{!supabase&&<Text style={s.note}>Backend configuration is required before sign-in.</Text>}</View></SafeAreaView>;
 return <SafeAreaView style={s.page}><ScrollView>
  <View style={s.header}><Text style={s.logo}>TeamTrack</Text><Text style={s.sub}>{profile.full_name}  •  {profile.role.replace("_"," ").toUpperCase()}</Text></View>
  <View style={s.nav}>{button("HOME",()=>setPage("home"),page!=="home")}{(profile.role==="manager"||profile.role==="team_lead")&&button("ATTENDANCE",()=>{setPage("attendance");loadAttendance();},page!=="attendance")}{button("NEWS",()=>{setPage("news");loadAnnouncements();},page!=="news")}{(profile.role==="manager"||profile.role==="team_lead")&&button("TEAM",()=>{setPage("team");loadAdminData(profile);if(profile.role==="manager"&&selectedTeam)loadTeamShifts(selectedTeam);else if(profile.team_id)loadTeamShifts(profile.team_id);},page!=="team")}{button("LEAVE",()=>{setPage("leave");loadLeaveRequests();},page!=="leave")}{profile.role==="manager"&&button("ADMIN",()=>{setPage("admin");loadAdminData(profile);},page!=="admin")}</View>
  {page==="home"&&<><View style={s.card}><Text style={s.heading}>{profile.role==="manager"?"Manager overview":profile.role==="team_lead"?"Team Leader overview":"Today's shift"}</Text>{profile.role==="manager"?<><Text style={s.metric}>{activeEmployees} / 25</Text><Text style={s.note}>Active employees</Text><Text style={s.metric}>{activeLeads} / 5</Text><Text style={s.note}>Active Team Leaders</Text><Text style={s.body}>{teams.length} teams configured</Text><Text style={s.body}>{todayCount} attendance events recorded today</Text></>:profile.role==="team_lead"?<><Text style={s.metric}>{teamMembers.length}</Text><Text style={s.note}>Active people in your assigned team</Text><Text style={s.body}>Team: {teams.find(t=>t.id===profile.team_id)?.name||"Not assigned"}</Text></>:<><Text style={s.body}>{shift?shift.start_time+" – "+shift.end_time:"No shift assigned"}</Text>{shift&&button("Acknowledge shift",acknowledge)}</>}</View>
  {profile.role!=="manager"&&<View style={s.card}><Text style={s.heading}>Attendance actions</Text><Text style={s.note}>GPS is captured for each event. Login and logout require a camera photo.</Text>{events.map(e=><React.Fragment key={e}>{button(e.replace("_"," ").toUpperCase(),()=>record(e))}</React.Fragment>)}</View>}
  {profile.role!=="manager"&&<View style={s.card}><Text style={s.heading}>Today's activity</Text>{rows.length?rows.map(r=><Text key={r.id} style={s.body}>{r.event_type.toUpperCase()} • {new Date(r.created_at).toLocaleTimeString()}</Text>):<Text style={s.note}>No personal attendance events yet.</Text>}</View>}</>}
  {page==="team"&&<><View style={s.card}><Text style={s.heading}>{profile.role==="manager"?"Organisation teams":"Your team"}</Text>
  {profile.role==="manager"?teams.map(t=><TouchableOpacity key={t.id} style={[s.choice,selectedTeam===t.id&&s.choiceActive]} onPress={()=>{setSelectedTeam(t.id);setSelectedShiftPerson("");loadTeamShifts(t.id);}}><Text style={s.body}>{selectedTeam===t.id?"✓ ":""}{t.name}</Text><Text style={s.note}>Leader: {people.find(p=>p.id===t.team_lead_id)?.full_name||"Not assigned"}</Text></TouchableOpacity>):<Text style={s.body}>{teams.find(t=>t.id===profile.team_id)?.name||"No team assigned"}</Text>}
  <Text style={s.note}>Team members and shift schedules</Text>
  {teamMembers.map(p=><TouchableOpacity key={p.id} style={[s.choice,selectedShiftPeople.includes(p.id)&&s.choiceActive]} onPress={()=>setSelectedShiftPeople(old=>old.includes(p.id)?old.filter(id=>id!==p.id):[...old,p.id])}><Text style={s.body}>{selectedShiftPeople.includes(p.id)?"✓ ":"□ "}{p.full_name}</Text><Text style={s.note}>{p.role.replace("_"," ")} {p.employee_code?"• "+p.employee_code:""}</Text></TouchableOpacity>)}
  </View>
  {(profile.role==="manager"||profile.role==="team_lead")&&<View style={s.card}><Text style={s.heading}>Create a shift group</Text><Text style={s.note}>Select multiple employees above. The Team Leader will also receive this shift.</Text>
  <Text style={s.label}>Shift name</Text><TextInput style={s.input} placeholder="Shift 1" value={shiftGroupName} onChangeText={setShiftGroupName}/>
  {profile.role==="manager"?<><Text style={s.label}>Team Leader</Text>{teamMembers.filter(p=>p.role==="team_lead").map(p=><TouchableOpacity key={p.id} style={[s.choice,selectedShiftLeader===p.id&&s.choiceActive]} onPress={()=>setSelectedShiftLeader(p.id)}><Text style={s.body}>{selectedShiftLeader===p.id?"✓ ":""}{p.full_name}</Text></TouchableOpacity>)}</>:<Text style={s.note}>Team Leader: {profile.full_name}</Text>}
  <Text style={s.label}>Shift date (YYYY-MM-DD)</Text><TextInput style={s.input} placeholder="2026-11-05" value={shiftDate} onChangeText={setShiftDate}/>
  <Text style={s.label}>Start time (24-hour HH:MM)</Text><TextInput style={s.input} placeholder="09:00" value={shiftStart} onChangeText={setShiftStart}/>
  <Text style={s.label}>End time (24-hour HH:MM)</Text><TextInput style={s.input} placeholder="18:00" value={shiftEnd} onChangeText={setShiftEnd}/>
  <Text style={s.label}>Work location (optional)</Text><TextInput style={s.input} placeholder="Office / branch / site" value={shiftLocation} onChangeText={setShiftLocation}/>
  <Text style={s.note}>Selected employees: {selectedShiftPeople.filter(id=>id!==(profile.role==="team_lead"?profile.id:selectedShiftLeader)).length}</Text>
  {editShiftGroupId?button("Save shift changes",saveShiftGroup):button("Assign shift to selected group",assignShift,!selectedShiftPeople.length||(profile.role==="manager"&&!selectedShiftLeader))}{editShiftGroupId&&button("Cancel editing",()=>setEditShiftGroupId(null),true)}
  </View>}
  <View style={s.card}><Text style={s.heading}>Scheduled shift groups</Text>{teamShifts.length?teamShifts.map(group=><View key={group.id} style={s.person}><Text style={s.personName}>{group.shift_name} • {group.shift_date}</Text><Text style={s.note}>{String(group.start_time).slice(0,5)}–{String(group.end_time).slice(0,5)}{group.work_location_name?" • "+group.work_location_name:""}</Text><Text style={s.body}>Team Leader: {people.find(p=>p.id===group.team_lead_id)?.full_name||"Unknown"}</Text><Text style={s.note}>Members: {group.member_ids.filter((id:string)=>id!==group.team_lead_id).map((id:string)=>people.find(p=>p.id===id)?.full_name||"Unknown").join(", ")||"No employees"}</Text>{button("Edit shift group",()=>startEditShiftGroup(group),true)}{button("Delete shift group",()=>deleteShiftGroup(group),true)}</View>):<Text style={s.note}>No shift groups yet. Select a team to view its schedule.</Text>}</View></>}
  {page==="attendance"&&(profile.role==="manager"||profile.role==="team_lead")&&<><View style={s.card}><Text style={s.heading}>Attendance overview</Text><Text style={s.note}>Latest 200 events visible to your role. Reports cover the last 30 days.</Text><View style={s.nav}>{button("REFRESH ACTIVITY",loadAttendance,true)}{button("EXPORT EXCEL REPORT",exportAttendanceReport)}</View></View><View style={s.card}><Text style={s.heading}>Login/logout verification</Text>{attendanceRows.map(e=><View key={e.id} style={s.person}><Text style={s.personName}>{people.find(p=>p.id===e.employee_id)?.full_name||"Team member"} • {String(e.event_type).replace("_"," ").toUpperCase()}</Text><Text style={s.note}>{new Date(e.created_at).toLocaleString()}</Text><Text style={s.note}>{e.latitude!=null&&e.longitude!=null?"GPS: "+Number(e.latitude).toFixed(5)+", "+Number(e.longitude).toFixed(5):"GPS unavailable"}{e.photo_path?" • Photo captured":""}</Text>{e.photo_url&&<Image source={{uri:e.photo_url}} style={{width:190,height:190,borderRadius:10,marginTop:8}} resizeMode="cover"/>}</View>)}{!attendanceRows.length&&<Text style={s.note}>No attendance events found.</Text>}</View></>}
  {page==="news"&&<><View style={s.card}><Text style={s.heading}>Publish announcement</Text>{profile.role!=="employee"?<><TextInput style={s.input} value={announcementTitle} onChangeText={setAnnouncementTitle} placeholder="Announcement title"/><TextInput style={s.input} value={announcementBody} onChangeText={setAnnouncementBody} placeholder="Write your message" multiline/>{button("Publish announcement",publishAnnouncement)}</>:<Text style={s.note}>Announcements from your organisation and team appear below.</Text>}</View><View style={s.card}><Text style={s.heading}>Announcements</Text>{announcementRows.map(a=><View key={a.id} style={s.person}><Text style={s.personName}>{a.title}</Text><Text style={s.body}>{a.body}</Text><Text style={s.note}>{new Date(a.created_at).toLocaleString()} • {a.team_id?"Team announcement":"Organisation-wide"}</Text></View>)}{!announcementRows.length&&<Text style={s.note}>No announcements yet.</Text>}</View></>}
  {page==="leave"&&<><View style={s.card}><Text style={s.heading}>Request leave</Text><Text style={s.label}>Start date (YYYY-MM-DD)</Text><TextInput style={s.input} value={leaveStart} onChangeText={setLeaveStart}/><Text style={s.label}>End date (YYYY-MM-DD)</Text><TextInput style={s.input} value={leaveEnd} onChangeText={setLeaveEnd}/><Text style={s.label}>Leave type</Text>{["personal","sick","casual","annual","unpaid"].map(t=><TouchableOpacity key={t} style={[s.choice,leaveType===t&&s.choiceActive]} onPress={()=>setLeaveType(t)}><Text style={s.body}>{t.toUpperCase()}</Text></TouchableOpacity>)}<TextInput style={s.input} value={leaveReason} onChangeText={setLeaveReason} placeholder="Reason (optional)"/>{button("Submit leave request",submitLeave)}</View><View style={s.card}><Text style={s.heading}>Leave requests</Text>{(profile.role==="manager"||profile.role==="team_lead")&&<TextInput style={s.input} value={leaveReviewNote} onChangeText={setLeaveReviewNote} placeholder="Reviewer note (optional)"/>}{leaveRows.map(r=><View key={r.id} style={s.person}><Text style={s.personName}>{people.find(p=>p.id===r.employee_id)?.full_name||"Employee"} • {r.leave_type}</Text><Text style={s.body}>{r.start_date} to {r.end_date}</Text><Text style={s.note}>Status: {r.status.toUpperCase()}{r.reason?" • "+r.reason:""}</Text>{(profile.role==="manager"||profile.role==="team_lead")&&r.status==="pending"&&<View style={s.nav}>{button("APPROVE",()=>reviewLeave(r.id,"approved"))}{button("REJECT",()=>reviewLeave(r.id,"rejected"),true)}</View>}</View>)}{!leaveRows.length&&<Text style={s.note}>No leave requests yet.</Text>}</View></>}
  {page==="admin"&&profile.role==="manager"&&<><View style={s.card}><Text style={s.heading}>Organisation capacity</Text><Text style={s.metric}>{activeEmployees} / 25</Text><Text style={s.note}>Active employees</Text><Text style={s.metric}>{activeLeads} / 5</Text><Text style={s.note}>Active Team Leaders</Text><Text style={s.body}>{teams.length} / 5 teams created</Text></View>
  <View style={s.card}><Text style={s.heading}>Create a team</Text><TextInput style={s.input} placeholder="Example: Sales Team" value={teamName} onChangeText={setTeamName}/>{button("Create team",createTeam)}</View>
  <View style={s.card}><Text style={s.heading}>Attendance geofence</Text><Text style={s.note}>Set the approved location and radius for login/logout photo capture for the selected team.</Text><Text style={s.note}>Selected team: {selectedTeamData?.name||"Choose a team above"}</Text><View style={s.nav}>{button(geoEnabled?"GEOFENCE ON":"GEOFENCE OFF",()=>setGeoEnabled(!geoEnabled),!geoEnabled)}{button("USE CURRENT GPS CENTRE",useCurrentGeoCentre)}</View><Text style={s.label}>Centre latitude</Text><TextInput style={s.input} value={geoLat} onChangeText={setGeoLat} keyboardType="numeric" placeholder="e.g. 17.3456"/><Text style={s.label}>Centre longitude</Text><TextInput style={s.input} value={geoLng} onChangeText={setGeoLng} keyboardType="numeric" placeholder="e.g. 78.4567"/><Text style={s.label}>Allowed radius in metres (25–5000)</Text><TextInput style={s.input} value={geoRadius} onChangeText={setGeoRadius} keyboardType="numeric"/>{button("Save team geofence",saveTeamGeofence,!selectedTeam)}</View>
  <View style={s.card}><Text style={s.heading}>Select a team</Text>{teams.map(t=><TouchableOpacity key={t.id} style={[s.choice,selectedTeam===t.id&&s.choiceActive]} onPress={()=>{setSelectedTeam(t.id);loadGeoForTeam(t.id);}}><Text style={s.body}>{selectedTeam===t.id?"✓ ":""}{t.name}</Text><Text style={s.note}>Leader: {people.find(p=>p.id===t.team_lead_id)?.full_name||"Not assigned"}</Text></TouchableOpacity>)}</View>
  <View style={s.card}><Text style={s.heading}>Add employee or Team Leader</Text><Text style={s.note}>Create a login account and add it directly to the selected team.</Text>
  <Text style={s.label}>Full name</Text><TextInput style={s.input} placeholder="Enter full name" value={newName} onChangeText={setNewName}/>
  <Text style={s.label}>Work email (login ID)</Text><TextInput style={s.input} placeholder="name@company.com" autoCapitalize="none" keyboardType="email-address" value={newEmail} onChangeText={setNewEmail}/>
  <Text style={s.label}>Employee ID / code (optional)</Text><TextInput style={s.input} placeholder="EMP001 or TL001" value={newCode} onChangeText={setNewCode}/>
  <Text style={s.label}>Temporary password (minimum 8 characters)</Text><TextInput style={s.input} placeholder="Enter temporary password" secureTextEntry value={newPassword} onChangeText={setNewPassword}/>
  <View style={s.nav}>{button("EMPLOYEE",()=>setNewRole("employee"),newRole!=="employee")}{button("TEAM LEADER",()=>setNewRole("team_lead"),newRole!=="team_lead")}</View>
  <Text style={s.note}>Selected role: {newRole==="team_lead"?"Team Leader":"Employee"} • Destination: {selectedTeamData?.name||"Select a team above"}</Text>
  {button("Create account and add to team",createAccount,!selectedTeam)}
  </View>
  <View style={s.card}><Text style={s.heading}>Select an existing account</Text><Text style={s.note}>Tap a profile, then assign it as an employee or Team Leader. New login accounts must first be securely created in Supabase Auth.</Text>{people.filter(p=>p.role!=="manager").map(p=><TouchableOpacity key={p.id} style={[s.choice,selectedPerson===p.id&&s.choiceActive]} onPress={()=>setSelectedPerson(p.id)}><Text style={s.body}>{selectedPerson===p.id?"✓ ":""}{p.full_name}</Text><Text style={s.note}>{p.role.replace("_"," ")} • {p.active?"Active":"Inactive"} • {teams.find(t=>t.id===p.team_id)?.name||"Unassigned"}</Text></TouchableOpacity>)}{selectedPersonData&&<Text style={s.note}>Selected: {selectedPersonData.full_name}</Text>}{selectedTeamData&&<Text style={s.note}>Destination: {selectedTeamData.name}</Text>}{button("Assign as employee",()=>assignSelected("employee"))}{button("Assign as Team Leader",()=>assignSelected("team_lead"))}</View>
  <View style={s.card}><Text style={s.heading}>All employees and leaders</Text>{people.map(p=><View key={p.id} style={s.person}><Text style={s.personName}>{p.full_name}</Text><Text style={s.note}>{p.role.replace("_"," ")} • {p.active?"Active":"Inactive"} • {teams.find(t=>t.id===p.team_id)?.name||"No team"}</Text></View>)}</View></>}
  {button("Sign out",signOut,true)}
 </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:"#F2F5FA",padding:16},header:{backgroundColor:"#14233B",padding:24,borderRadius:18,marginBottom:14},logo:{fontSize:30,fontWeight:"800",color:"#fff"},sub:{fontSize:12,color:"#D1DCEB",marginTop:6},nav:{flexDirection:"row",gap:7,marginBottom:12},card:{backgroundColor:"#fff",padding:16,borderRadius:16,marginBottom:14},heading:{fontSize:19,fontWeight:"700",color:"#17263D",marginBottom:10},body:{fontSize:15,color:"#34445C",marginVertical:5},metric:{fontSize:26,fontWeight:"800",color:"#2468D2",marginTop:8},input:{borderWidth:1,borderColor:"#D7DFE9",borderRadius:10,padding:13,marginVertical:6},btn:{backgroundColor:"#2468D2",padding:13,borderRadius:11,alignItems:"center",marginTop:8,flex:1},btnText:{color:"#fff",fontWeight:"700",fontSize:12},secondary:{backgroundColor:"#E7EDF6"},secondaryText:{color:"#24364F"},note:{fontSize:12,color:"#718096",lineHeight:18,marginTop:5},choice:{padding:11,borderWidth:1,borderColor:"#E0E6EF",borderRadius:10,marginTop:8},choiceActive:{borderColor:"#2468D2",backgroundColor:"#EEF4FF"},person:{paddingVertical:10,borderBottomWidth:1,borderBottomColor:"#E8EDF3"},personName:{fontSize:15,fontWeight:"700",color:"#26364D"},label:{fontSize:13,fontWeight:"600",color:"#34445C",marginTop:8}});
