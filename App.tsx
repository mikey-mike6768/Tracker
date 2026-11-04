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
 const [todayCount,setTodayCount]=useState(0);

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
  {profile.role==="employee"&&<View style={s.card}><Text style={s.heading}>Attendance actions</Text><Text style={s.note}>GPS is captured for each event. Login and logout require a camera photo.</Text>{events.map(e=><React.Fragment key={e}>{button(e.replace("_"," ").toUpperCase(),()=>record(e))}</React.Fragment>)}</View>}
  <View style={s.card}><Text style={s.heading}>Today's activity</Text>{rows.length?rows.map(r=><Text key={r.id} style={s.body}>{r.event_type.toUpperCase()} • {new Date(r.created_at).toLocaleTimeString()}</Text>):<Text style={s.note}>No personal attendance events yet.</Text>}</View></>}
  {page==="team"&&<View style={s.card}><Text style={s.heading}>Your team</Text><Text style={s.body}>{teams.find(t=>t.id===profile.team_id)?.name||"No team assigned"}</Text><Text style={s.note}>Team access is limited by your signed-in team assignment. Operational tools such as approvals, GPS review and team exports are being implemented in later modules.</Text>{teamMembers.map(p=><View key={p.id} style={s.person}><Text style={s.personName}>{p.full_name}</Text><Text style={s.note}>{p.role.replace("_"," ")} {p.employee_code?"• "+p.employee_code:""}</Text></View>)}</View>}
  {page==="admin"&&profile.role==="manager"&&<><View style={s.card}><Text style={s.heading}>Organisation capacity</Text><Text style={s.metric}>{activeEmployees} / 25</Text><Text style={s.note}>Active employees</Text><Text style={s.metric}>{activeLeads} / 5</Text><Text style={s.note}>Active Team Leaders</Text><Text style={s.body}>{teams.length} / 5 teams created</Text></View>
  <View style={s.card}><Text style={s.heading}>Create a team</Text><TextInput style={s.input} placeholder="Example: Sales Team" value={teamName} onChangeText={setTeamName}/>{button("Create team",createTeam)}</View>
  <View style={s.card}><Text style={s.heading}>Select a team</Text>{teams.map(t=><TouchableOpacity key={t.id} style={[s.choice,selectedTeam===t.id&&s.choiceActive]} onPress={()=>setSelectedTeam(t.id)}><Text style={s.body}>{selectedTeam===t.id?"✓ ":""}{t.name}</Text><Text style={s.note}>Leader: {people.find(p=>p.id===t.team_lead_id)?.full_name||"Not assigned"}</Text></TouchableOpacity>)}</View>
  <View style={s.card}><Text style={s.heading}>Select an existing account</Text><Text style={s.note}>Tap a profile, then assign it as an employee or Team Leader. New login accounts must first be securely created in Supabase Auth.</Text>{people.filter(p=>p.role!=="manager").map(p=><TouchableOpacity key={p.id} style={[s.choice,selectedPerson===p.id&&s.choiceActive]} onPress={()=>setSelectedPerson(p.id)}><Text style={s.body}>{selectedPerson===p.id?"✓ ":""}{p.full_name}</Text><Text style={s.note}>{p.role.replace("_"," ")} • {p.active?"Active":"Inactive"} • {teams.find(t=>t.id===p.team_id)?.name||"Unassigned"}</Text></TouchableOpacity>)}{selectedPersonData&&<Text style={s.note}>Selected: {selectedPersonData.full_name}</Text>}{selectedTeamData&&<Text style={s.note}>Destination: {selectedTeamData.name}</Text>}{button("Assign as employee",()=>assignSelected("employee"))}{button("Assign as Team Leader",()=>assignSelected("team_lead"))}</View>
  <View style={s.card}><Text style={s.heading}>All employees and leaders</Text>{people.map(p=><View key={p.id} style={s.person}><Text style={s.personName}>{p.full_name}</Text><Text style={s.note}>{p.role.replace("_"," ")} • {p.active?"Active":"Inactive"} • {teams.find(t=>t.id===p.team_id)?.name||"No team"}</Text></View>)}</View></>}
  {button("Sign out",signOut,true)}
 </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:"#F2F5FA",padding:16},header:{backgroundColor:"#14233B",padding:24,borderRadius:18,marginBottom:14},logo:{fontSize:30,fontWeight:"800",color:"#fff"},sub:{fontSize:12,color:"#D1DCEB",marginTop:6},nav:{flexDirection:"row",gap:7,marginBottom:12},card:{backgroundColor:"#fff",padding:16,borderRadius:16,marginBottom:14},heading:{fontSize:19,fontWeight:"700",color:"#17263D",marginBottom:10},body:{fontSize:15,color:"#34445C",marginVertical:5},metric:{fontSize:26,fontWeight:"800",color:"#2468D2",marginTop:8},input:{borderWidth:1,borderColor:"#D7DFE9",borderRadius:10,padding:13,marginVertical:6},btn:{backgroundColor:"#2468D2",padding:13,borderRadius:11,alignItems:"center",marginTop:8,flex:1},btnText:{color:"#fff",fontWeight:"700",fontSize:12},secondary:{backgroundColor:"#E7EDF6"},secondaryText:{color:"#24364F"},note:{fontSize:12,color:"#718096",lineHeight:18,marginTop:5},choice:{padding:11,borderWidth:1,borderColor:"#E0E6EF",borderRadius:10,marginTop:8},choiceActive:{borderColor:"#2468D2",backgroundColor:"#EEF4FF"},person:{paddingVertical:10,borderBottomWidth:1,borderBottomColor:"#E8EDF3"},personName:{fontSize:15,fontWeight:"700",color:"#26364D"}});
