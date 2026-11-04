import React,{useEffect,useState} from "react";
import {SafeAreaView,ScrollView,View,Text,TextInput,TouchableOpacity,StyleSheet,Alert} from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import {File} from "expo-file-system";
import {createClient} from "@supabase/supabase-js";

const url=process.env.EXPO_PUBLIC_SUPABASE_URL||"";
const key=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY||"";
const supabase=url&&key?createClient(url,key):null;
const events=["login","break_in","break_out","lunch_in","lunch_out","logout"];
type Profile={id:string;full_name:string;employee_code?:string|null;role:"manager"|"team_lead"|"employee";team_id:string|null;active:boolean};
type Team={id:string;name:string;team_lead_id:string|null};

export default function App(){
 const [email,setEmail]=useState("");const [password,setPassword]=useState("");
 const [profile,setProfile]=useState<Profile|null>(null);const [shift,setShift]=useState<any>(null);
 const [rows,setRows]=useState<any[]>([]);const [busy,setBusy]=useState(false);
 const [page,setPage]=useState("home");const [teams,setTeams]=useState<Team[]>([]);
 const [people,setPeople]=useState<Profile[]>([]);const [teamName,setTeamName]=useState("");
 const [selectedTeam,setSelectedTeam]=useState("");const [selectedPerson,setSelectedPerson]=useState("");
 const [newName,setNewName]=useState("");const [newEmail,setNewEmail]=useState("");const [newCode,setNewCode]=useState("");const [newPassword,setNewPassword]=useState("");const [newRole,setNewRole]=useState<"employee"|"team_lead">("employee");
 const [todayCount,setTodayCount]=useState(0);\n const [shiftDate,setShiftDate]=useState(new Date().toLocaleDateString("en-CA"));const [shiftStart,setShiftStart]=useState("09:00");const [shiftEnd,setShiftEnd]=useState("18:00");const [shiftLocation,setShiftLocation]=useState("");const [selectedShiftPerson,setSelectedShiftPerson]=useState("");const [teamShifts,setTeamShifts]=useState<any[]>([]);

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
 async function loadAdminData(p:Profile){
  if(!supabase||!p)return;
  const [{data:t,error:te},{data:ps,error:pe}]=await Promise.all([
   supabase.from("teams").select("id,name,team_lead_id").order("name"),
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
 async function acknowledge(){if(!supabase||!profile||!shift)return;const {error}=await supabase.from("shift_acknowledgements").upsert({shift_id:shift.id,employee_id:profile.id,acknowledged:true},{onConflict:"shift_id,employee_id"});if(error)Alert.alert("Error",error.message);else Alert.alert("Saved","Shift acknowledged.");}
 async function record(type:string){
  if(!supabase||!profile||busy)return;setBusy(true);let stage="Starting";let photoPath:string|null=null;
  try{
   if(type==="login"||type==="logout"){
    stage="Camera permission";const perm=await ImagePicker.requestCameraPermissionsAsync();if(!perm.granted){Alert.alert("Camera permission required","Allow camera access, then try again.");return;}
    stage="Taking photo";const photo=await ImagePicker.launchCameraAsync({quality:.7});if(photo.canceled||!photo.assets[0])return;
    stage="Reading photo";const localFile=new File(photo.assets[0].uri);const photoData=await localFile.arrayBuffer();
    photoPath=profile.id+"/"+Date.now()+".jpg";stage="Uploading photo";
    const {error:uploadError}=await supabase.storage.from("attendance-photos").upload(photoPath,photoData,{contentType:"image/jpeg",upsert:false});if(uploadError)throw new Error(uploadError.message);
   }
   stage="Location permission";const permission=await Location.requestForegroundPermissionsAsync();if(!permission.granted){Alert.alert("Location permission required","Allow location access, then try again.");return;}
   stage="Getting GPS";const pos=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
   stage="Saving attendance";const {error}=await supabase.from("attendance_events").insert({employee_id:profile.id,event_type:type,latitude:pos.coords.latitude,longitude:pos.coords.longitude,photo_path:photoPath,client_recorded_at:new Date().toISOString()});
   if(error)throw new Error(error.message);Alert.alert("Attendance saved",type.replace("_"," ")+" recorded.");await loadProfile(profile.id);
  }catch(error:any){Alert.alert("Attendance failed",stage+": "+(error?.message||String(error))+"\n\nCheck your internet connection and permissions.");}
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
  const ids=people.filter(p=>p.team_id===teamId&&p.active).map(p=>p.id);
  if(!ids.length){setTeamShifts([]);return;}
  const {data,error}=await supabase.from("shifts").select("*").in("employee_id",ids).order("shift_date",{ascending:true});
  if(error)Alert.alert("Could not load shifts",error.message);else setTeamShifts(data||[]);
 }
 async function assignShift(){
  const teamId=profile?.role==="manager"?selectedTeam:profile?.team_id;
  if(!supabase||!profile||!teamId||!selectedShiftPerson){Alert.alert("Select employee","Choose a team member first.");return;}
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(shiftDate)||!/^\\d{2}:\\d{2}$/.test(shiftStart)||!/^\\d{2}:\\d{2}$/.test(shiftEnd)){Alert.alert("Invalid date or time","Use date YYYY-MM-DD and time HH:MM (24-hour format).");return;}
  if(shiftEnd<=shiftStart){Alert.alert("Invalid shift time","End time must be later than start time on the same day.");return;}
  setBusy(true);
  const {error}=await supabase.from("shifts").insert({employee_id:selectedShiftPerson,shift_date:shiftDate,start_time:shiftStart,end_time:shiftEnd,work_location_name:shiftLocation.trim()||null,created_by:profile.id});
  if(error)Alert.alert("Shift assignment failed",error.message);else{Alert.alert("Shift assigned","The team member can now see and acknowledge this shift.");await loadTeamShifts(teamId);}
  setBusy(false);
 }
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
  <View style={s.nav}>{button("HOME",()=>setPage("home"),page!=="home")}{(profile.role==="manager"||profile.role==="team_lead")&&button("TEAM",()=>{setPage("team");loadAdminData(profile);},page!=="team")}{profile.role==="manager"&&button("ADMIN",()=>{setPage("admin");loadAdminData(profile);},page!=="admin")}</View>
  {page==="home"&&<><View style={s.card}><Text style={s.heading}>{profile.role==="manager"?"Manager overview":profile.role==="team_lead"?"Team Leader overview":"Today's shift"}</Text>{profile.role==="manager"?<><Text style={s.metric}>{activeEmployees} / 25</Text><Text style={s.note}>Active employees</Text><Text style={s.metric}>{activeLeads} / 5</Text><Text style={s.note}>Active Team Leaders</Text><Text style={s.body}>{teams.length} teams configured</Text><Text style={s.body}>{todayCount} attendance events recorded today</Text></>:profile.role==="team_lead"?<><Text style={s.metric}>{teamMembers.length}</Text><Text style={s.note}>Active people in your assigned team</Text><Text style={s.body}>Team: {teams.find(t=>t.id===profile.team_id)?.name||"Not assigned"}</Text></>:<><Text style={s.body}>{shift?shift.start_time+" – "+shift.end_time:"No shift assigned"}</Text>{shift&&button("Acknowledge shift",acknowledge)}</>}</View>
  {profile.role!=="manager"&&<View style={s.card}><Text style={s.heading}>Attendance actions</Text><Text style={s.note}>GPS is captured for each event. Login and logout require a camera photo.</Text>{events.map(e=><React.Fragment key={e}>{button(e.replace("_"," ").toUpperCase(),()=>record(e))}</React.Fragment>)}</View>}
  {profile.role!=="manager"&&<View style={s.card}><Text style={s.heading}>Today's activity</Text>{rows.length?rows.map(r=><Text key={r.id} style={s.body}>{r.event_type.toUpperCase()} • {new Date(r.created_at).toLocaleTimeString()}</Text>):<Text style={s.note}>No personal attendance events yet.</Text>}</View>}</>}
  {page==="team"&&<><View style={s.card}><Text style={s.heading}>{profile.role==="manager"?"Organisation teams":"Your team"}</Text>
  {profile.role==="manager"?teams.map(t=><TouchableOpacity key={t.id} style={[s.choice,selectedTeam===t.id&&s.choiceActive]} onPress={()=>{setSelectedTeam(t.id);setSelectedShiftPerson("");loadTeamShifts(t.id);}}><Text style={s.body}>{selectedTeam===t.id?"✓ ":""}{t.name}</Text><Text style={s.note}>Leader: {people.find(p=>p.id===t.team_lead_id)?.full_name||"Not assigned"}</Text></TouchableOpacity>):<Text style={s.body}>{teams.find(t=>t.id===profile.team_id)?.name||"No team assigned"}</Text>}
  <Text style={s.note}>Team members and shift schedules</Text>
  {teamMembers.map(p=><TouchableOpacity key={p.id} style={[s.choice,selectedShiftPerson===p.id&&s.choiceActive]} onPress={()=>setSelectedShiftPerson(p.id)}><Text style={s.body}>{selectedShiftPerson===p.id?"✓ ":""}{p.full_name}</Text><Text style={s.note}>{p.role.replace("_"," ")} {p.employee_code?"• "+p.employee_code:""}</Text></TouchableOpacity>)}
  </View>
  {(profile.role==="manager"||profile.role==="team_lead")&&<View style={s.card}><Text style={s.heading}>Assign a shift</Text><Text style={s.note}>Select a team member above, then enter their shift details.</Text>
  <Text style={s.label}>Shift date (YYYY-MM-DD)</Text><TextInput style={s.input} placeholder="2026-11-05" value={shiftDate} onChangeText={setShiftDate}/>
  <Text style={s.label}>Start time (24-hour HH:MM)</Text><TextInput style={s.input} placeholder="09:00" value={shiftStart} onChangeText={setShiftStart}/>
  <Text style={s.label}>End time (24-hour HH:MM)</Text><TextInput style={s.input} placeholder="18:00" value={shiftEnd} onChangeText={setShiftEnd}/>
  <Text style={s.label}>Work location (optional)</Text><TextInput style={s.input} placeholder="Office / branch / site" value={shiftLocation} onChangeText={setShiftLocation}/>
  {button("Assign shift to selected member",assignShift,!selectedShiftPerson||!(profile.role==="manager"?selectedTeam:profile.team_id))}
  </View>}
  <View style={s.card}><Text style={s.heading}>Scheduled shifts</Text>{teamShifts.length?teamShifts.map(sh=><View key={sh.id} style={s.person}><Text style={s.personName}>{people.find(p=>p.id===sh.employee_id)?.full_name||"Team member"}</Text><Text style={s.note}>{sh.shift_date} • {String(sh.start_time).slice(0,5)}–{String(sh.end_time).slice(0,5)}{sh.work_location_name?" • "+sh.work_location_name:""}</Text></View>):<Text style={s.note}>No shifts loaded yet. Select a team to view its schedule.</Text>}</View></>}
  {page==="admin"&&profile.role==="manager"&&<><View style={s.card}><Text style={s.heading}>Organisation capacity</Text><Text style={s.metric}>{activeEmployees} / 25</Text><Text style={s.note}>Active employees</Text><Text style={s.metric}>{activeLeads} / 5</Text><Text style={s.note}>Active Team Leaders</Text><Text style={s.body}>{teams.length} / 5 teams created</Text></View>
  <View style={s.card}><Text style={s.heading}>Create a team</Text><TextInput style={s.input} placeholder="Example: Sales Team" value={teamName} onChangeText={setTeamName}/>{button("Create team",createTeam)}</View>
  <View style={s.card}><Text style={s.heading}>Select a team</Text>{teams.map(t=><TouchableOpacity key={t.id} style={[s.choice,selectedTeam===t.id&&s.choiceActive]} onPress={()=>setSelectedTeam(t.id)}><Text style={s.body}>{selectedTeam===t.id?"✓ ":""}{t.name}</Text><Text style={s.note}>Leader: {people.find(p=>p.id===t.team_lead_id)?.full_name||"Not assigned"}</Text></TouchableOpacity>)}</View>
  <View style={s.card}><Text style={s.heading}>Add employee or Team Leader</Text><Text style={s.note}>Create a login account and add it directly to the selected team.</Text>
  <TextInput style={s.input} placeholder="Full name" value={newName} onChangeText={setNewName}/>
  <TextInput style={s.input} placeholder="Work email (login ID)" autoCapitalize="none" keyboardType="email-address" value={newEmail} onChangeText={setNewEmail}/>
  <TextInput style={s.input} placeholder="Employee ID / code (optional)" value={newCode} onChangeText={setNewCode}/>
  <TextInput style={s.input} placeholder="Temporary password (min. 8 characters)" secureTextEntry value={newPassword} onChangeText={setNewPassword}/>
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
